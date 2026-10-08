import { safeDivide } from './campaignMetricsBridge'
import { GTB2C_PLAYER_ID, isIncentiveTransaction } from './crmIncentiveEconomics'

/** Depósito mínimo do B2C. R$ 10 conta. Abaixo disso não é depósito. */
export const MIN_DEPOSIT_AMOUNT = 10

type ChipMovement = {
  amount?: number | null
  chipsSendOut?: number | null
  chipsClaimback?: number | null
}

function movementDirection(row: ChipMovement): 'send' | 'withdraw' | 'other' {
  const send = Number(row.chipsSendOut) || 0
  const claim = Number(row.chipsClaimback) || 0
  if (send > 0 && claim === 0) return 'send'
  if (claim !== 0 && send === 0) return 'withdraw'
  return 'other'
}

/** Envio e retirada seguidos, do mesmo valor, abaixo do depósito mínimo: validação de ID. */
export function isIdValidationPair(current: ChipMovement, neighbor: ChipMovement): boolean {
  const amount = Math.abs(Number(current.amount) || 0)
  const other = Math.abs(Number(neighbor.amount) || 0)
  if (amount <= 0 || amount >= MIN_DEPOSIT_AMOUNT || amount !== other) return false
  const a = movementDirection(current)
  const b = movementDirection(neighbor)
  return (a === 'send' && b === 'withdraw') || (a === 'withdraw' && b === 'send')
}

/** Depósito da segmentação: movimentação de depósito única, de pelo menos R$ 10. */
export function countsAsPlayerDeposit(
  row: ChipMovement & {
    isDeposit: boolean
    neighbors?: ChipMovement[]
  },
): boolean {
  if (!row.isDeposit) return false
  if ((row.neighbors ?? []).some((neighbor) => isIdValidationPair(row, neighbor))) return false
  return Math.abs(Number(row.amount) || 0) >= MIN_DEPOSIT_AMOUNT
}

export type DepositTxn = {
  receiverPlayerId: string
  agentId: string | null
  amount: number
  periodStart: string
  periodEnd: string
  occurredAt: string | null
  isDeposit: boolean
  isBonus: boolean
  senderPlayerId?: string | null
}

export type PurchasePowerMetrics = {
  depositedVolume: number
  uniqueDepositors: number
  depositCount: number
  avgTicket: number | null
  avgPerDepositor: number | null
  medianPerDepositor: number | null
  maxDeposit: number | null
  firstDepositAt: string | null
  lastDepositAt: string | null
  weeksWithDeposit: number
  top1Share: number | null
  top3Share: number | null
  top10Share: number | null
  weekly: Array<{
    periodStart: string
    periodEnd: string
    volume: number
    depositors: number
    deposits: number
  }>
  activationCross: {
    depositedAndActive: number
    depositedNotActive: number
    activeAndDeposited: number
    activeWithoutDeposit: number
  }
  rakeToDepositRatio: number | null
  activationInvestment: number
  bonusCount: number
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

function topShare(sortedDesc: number[], total: number, n: number): number | null {
  if (total <= 0 || sortedDesc.length === 0) return null
  return sortedDesc.slice(0, n).reduce((a, b) => a + b, 0) / total
}

export function classifyTransactionFlags(params: {
  origin: string | null | undefined
  /** Coluna real do relatório: SX tipo */
  sxType?: string | null | undefined
  transactionType?: string | null | undefined
  systemStatus?: string | null
  orderStatus?: string | null
  senderPlayerId?: string | null
  chipsSendOut?: number | null
  chipsClaimback?: number | null
  grantSendOut?: number | null
  grantClaimback?: number | null
}): { isDeposit: boolean; isBonus: boolean } {
  const norm = (value: string | null | undefined) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()

  const origin = norm(params.origin)
  const sxType = norm(params.sxType)
  const type = norm(params.transactionType)

  const statusBlob = `${params.systemStatus ?? ''} ${params.orderStatus ?? ''}`
  const status = norm(statusBlob)

  const failed =
    /cancel|fail|erro|rejeit|negad|pendente|pending/.test(status) &&
    !/conclu|complet|success|aprov|ok|pago|finaliz/.test(status)

  const sxTypeBonus = sxType === 'bonus' || sxType.includes('bonus')
  const sendOut = Number(params.chipsSendOut) || 0
  const grantOut = Number(params.grantSendOut) || 0
  const claimback = Number(params.chipsClaimback) || 0
  const grantClaim = Number(params.grantClaimback) || 0
  const credit = sendOut > 0 || grantOut > 0
  const reversalOnly = !credit && (claimback !== 0 || grantClaim !== 0)
  const fromGtb2c = String(params.senderPlayerId ?? '').trim() === GTB2C_PLAYER_ID
  const depositOrigin = origin === 'sx 24 horas' || origin.includes('sx 24 horas')
  // Crédito da GTB2C vira cortesia. Estorno, sem crédito ou depósito SX 24 Horas não.
  const gtb2cCourtesy = fromGtb2c && !failed && credit && !reversalOnly && !(depositOrigin && !sxTypeBonus)

  // BÔNUS = SX tipo == Bônus, ou crédito elegível da GTB2C.
  const isBonus = sxTypeBonus || gtb2cCourtesy

  // DEPÓSITO = Origem == SX 24 Horas (nunca misturar com bônus)
  const isDeposit =
    !isBonus &&
    !failed &&
    (origin === 'sx 24 horas' || origin.includes('sx 24 horas'))

  // type leftover unused intentionally (kept for callers) — avoid deposit via SX tipo
  void type

  return { isDeposit, isBonus }
}

export function sumActivationInvestment(
  rows: Pick<DepositTxn, 'isBonus' | 'amount' | 'agentId' | 'senderPlayerId'>[],
  agentId: string | null | undefined,
): number {
  if (!agentId) return 0
  return rows
    .filter(
      (r) =>
        r.agentId === agentId &&
        isIncentiveTransaction({
          senderPlayerId: r.senderPlayerId,
          isBonus: r.isBonus,
        }),
    )
    .reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
}

export function buildPurchasePowerMetrics(params: {
  /** Transações já atribuídas à campanha (coorte de jogadores adquiridos). */
  rows: DepositTxn[]
  /** Bônus atribuídos à coorte de aquisição (sem recorte da janela da campanha). */
  bonusRows?: DepositTxn[]
  activePlayerIds: Set<string>
  accumulatedRake: number
}): PurchasePowerMetrics {
  const { activePlayerIds, accumulatedRake } = params

  const deposits = params.rows.filter((r) => r.isDeposit)
  const bonuses = (params.bonusRows ?? params.rows).filter((r) =>
    isIncentiveTransaction({
      senderPlayerId: r.senderPlayerId,
      isBonus: r.isBonus,
    }),
  )

  const depositedVolume = deposits.reduce(
    (s, r) => s + Math.abs(Number(r.amount) || 0),
    0,
  )
  const depositCount = deposits.length
  const byPlayer = new Map<string, number>()
  for (const d of deposits) {
    byPlayer.set(
      d.receiverPlayerId,
      (byPlayer.get(d.receiverPlayerId) ?? 0) + Math.abs(Number(d.amount) || 0),
    )
  }
  const perDepositor = [...byPlayer.values()]
  const uniqueDepositors = byPlayer.size
  const sortedDesc = [...perDepositor].sort((a, b) => b - a)

  const dates = deposits
    .map((d) => d.occurredAt || d.periodStart)
    .filter(Boolean)
    .sort()

  const individualAmounts = deposits.map((d) => Math.abs(Number(d.amount) || 0))

  const weekMap = new Map<
    string,
    { periodStart: string; periodEnd: string; volume: number; players: Set<string>; deposits: number }
  >()
  for (const d of deposits) {
    const eventDate = (d.occurredAt || d.periodStart || '').slice(0, 10)
    const key = eventDate || d.periodStart
    if (!key) continue
    // Semana = segunda–domingo da data do evento (não do lote)
    const day = new Date(`${key}T12:00:00Z`)
    const dow = day.getUTCDay()
    const diffToMon = dow === 0 ? -6 : 1 - dow
    const mon = new Date(day)
    mon.setUTCDate(day.getUTCDate() + diffToMon)
    const sun = new Date(mon)
    sun.setUTCDate(mon.getUTCDate() + 6)
    const periodStart = mon.toISOString().slice(0, 10)
    const periodEnd = sun.toISOString().slice(0, 10)
    const weekKey = periodStart
    const bucket =
      weekMap.get(weekKey) ??
      {
        periodStart,
        periodEnd,
        volume: 0,
        players: new Set<string>(),
        deposits: 0,
      }
    bucket.volume += Math.abs(Number(d.amount) || 0)
    bucket.players.add(d.receiverPlayerId)
    bucket.deposits += 1
    weekMap.set(weekKey, bucket)
  }

  const depositors = new Set(byPlayer.keys())
  let depositedAndActive = 0
  let depositedNotActive = 0
  for (const id of depositors) {
    if (activePlayerIds.has(id)) depositedAndActive += 1
    else depositedNotActive += 1
  }
  let activeAndDeposited = 0
  let activeWithoutDeposit = 0
  for (const id of activePlayerIds) {
    if (depositors.has(id)) activeAndDeposited += 1
    else activeWithoutDeposit += 1
  }

  return {
    depositedVolume,
    uniqueDepositors,
    depositCount,
    avgTicket: safeDivide(depositedVolume, depositCount),
    avgPerDepositor: safeDivide(depositedVolume, uniqueDepositors),
    medianPerDepositor: median(perDepositor),
    maxDeposit:
      individualAmounts.length > 0 ? Math.max(...individualAmounts) : null,
    firstDepositAt: dates[0] ?? null,
    lastDepositAt: dates[dates.length - 1] ?? null,
    weeksWithDeposit: weekMap.size,
    top1Share: topShare(sortedDesc, depositedVolume, 1),
    top3Share: topShare(sortedDesc, depositedVolume, 3),
    top10Share: topShare(sortedDesc, depositedVolume, 10),
    weekly: [...weekMap.values()]
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
      .map((w) => ({
        periodStart: w.periodStart,
        periodEnd: w.periodEnd,
        volume: w.volume,
        depositors: w.players.size,
        deposits: w.deposits,
      })),
    activationCross: {
      depositedAndActive,
      depositedNotActive,
      activeAndDeposited,
      activeWithoutDeposit,
    },
    rakeToDepositRatio: safeDivide(accumulatedRake, depositedVolume),
    activationInvestment: bonuses.reduce(
      (s, r) => s + Math.abs(Number(r.amount) || 0),
      0,
    ),
    bonusCount: bonuses.length,
  }
}

/**
 * Resolve Agent ID histórico: prioriza o do relatório (Agente player ID);
 * fallback no vínculo Player↔Agent do fechamento de rake da semana do evento.
 */
export function resolveHistoricalAgentId(params: {
  reportAgentId: string | null | undefined
  receiverPlayerId: string
  /** Data do evento (YYYY-MM-DD), não o período do lote. */
  eventDate?: string | null
  periodStart?: string
  periodEnd?: string
  playerPeriodLinks: Array<{
    playerId: string
    agentId: string
    periodStart: string
    periodEnd: string
  }>
}): string | null {
  const fromReport = String(params.reportAgentId ?? '').trim()
  if (fromReport) return fromReport

  const eventDate =
    params.eventDate?.slice(0, 10) ||
    params.periodStart?.slice(0, 10) ||
    null
  if (!eventDate) return null

  const link = params.playerPeriodLinks.find(
    (p) =>
      p.playerId === params.receiverPlayerId &&
      p.periodStart <= eventDate &&
      p.periodEnd >= eventDate,
  )
  return link?.agentId ?? null
}
