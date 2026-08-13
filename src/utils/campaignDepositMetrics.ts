import { safeDivide } from './campaignMetricsBridge'

export type DepositTxn = {
  receiverPlayerId: string
  agentId: string | null
  amount: number
  periodStart: string
  periodEnd: string
  occurredAt: string | null
  isDeposit: boolean
  isBonus: boolean
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
  bands: Array<{ label: string; min: number; max: number | null; count: number; volume: number }>
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

const DEFAULT_BANDS = [
  { label: 'Até R$ 50', min: 0, max: 50 },
  { label: 'R$ 50–200', min: 50, max: 200 },
  { label: 'R$ 200–500', min: 200, max: 500 },
  { label: 'R$ 500–1.000', min: 500, max: 1000 },
  { label: 'Acima de R$ 1.000', min: 1000, max: null },
]

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

  // BÔNUS = SX tipo == Bônus (independente da Origem; Origem pode ser "-" ou vazia)
  const isBonus = sxType === 'bonus' || sxType.includes('bonus')

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
  rows: Pick<DepositTxn, 'isBonus' | 'amount' | 'agentId'>[],
  agentId: string | null | undefined,
): number {
  if (!agentId) return 0
  return rows
    .filter((r) => r.isBonus && r.agentId === agentId)
    .reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
}

export function buildPurchasePowerMetrics(params: {
  rows: DepositTxn[]
  agentId: string | null | undefined
  activePlayerIds: Set<string>
  accumulatedRake: number
}): PurchasePowerMetrics {
  const { agentId, activePlayerIds, accumulatedRake } = params
  const scoped = agentId
    ? params.rows.filter((r) => r.agentId === agentId)
    : []

  const deposits = scoped.filter((r) => r.isDeposit)
  const bonuses = scoped.filter((r) => r.isBonus)

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

  const bands = DEFAULT_BANDS.map((b) => {
    const matching = perDepositor.filter((v) =>
      b.max == null ? v >= b.min : v >= b.min && v < b.max,
    )
    return {
      label: b.label,
      min: b.min,
      max: b.max,
      count: matching.length,
      volume: matching.reduce((s, v) => s + v, 0),
    }
  })

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
    bands,
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
