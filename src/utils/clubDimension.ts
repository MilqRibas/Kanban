/**
 * Dimensão Clube desta fase: SX Club e Xtreme Pro.
 * Player ID continua global. Clube não entra na identidade.
 * Códigos canônicos — não comparar strings livres fora deste módulo.
 */

import {
  LEAGUE_FEE_RATE,
  INCENTIVE_LIMIT_RATE,
  computeIncentiveEconomics,
  isIncentiveTransaction,
  sumIncentiveSent,
  type IncentiveEconomics,
} from './crmIncentiveEconomics'

export const CLUB_CODES = ['sx_club', 'xtreme_pro'] as const
export type ClubCode = (typeof CLUB_CODES)[number]
export type ClubFilter = 'all' | ClubCode

export const CLUB_LABELS: Record<ClubCode, string> = {
  sx_club: 'SX Club',
  xtreme_pro: 'Xtreme Pro',
}

export const CLUB_FILTER_OPTIONS: Array<{ value: ClubFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'sx_club', label: 'SX Club' },
  { value: 'xtreme_pro', label: 'Xtreme Pro' },
]

const NAME_TO_CODE: Record<string, ClubCode> = {
  'sx club': 'sx_club',
  sxclub: 'sx_club',
  'xtreme pro': 'xtreme_pro',
  xtremepro: 'xtreme_pro',
  'xtreme-pro': 'xtreme_pro',
  // Slot / Nome do clube real Suprema
  'sx | xtreme pro': 'xtreme_pro',
  'sx|xtreme pro': 'xtreme_pro',
}

export function normalizeClubLabel(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Só nomes conhecidos. ID numérico (ex. 57906 / 32443) não vira clube. */
export function resolveClubCode(value: unknown): ClubCode | null {
  const key = normalizeClubLabel(value)
  if (!key) return null
  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key]
  // "SX | XTREME PRO", "Clube Xtreme Pro", etc. — xtreme tem prioridade sobre "sx"
  if (/\bxtreme\b/.test(key)) return 'xtreme_pro'
  return null
}

export function isClubCode(value: unknown): value is ClubCode {
  return value === 'sx_club' || value === 'xtreme_pro'
}

export function clubLabel(code: ClubCode | null | undefined): string {
  if (!code) return 'Clube desconhecido'
  return CLUB_LABELS[code]
}

/**
 * Nome do clube no XLSX tem prioridade.
 * Se a célula não resolver, usa o clube escolhido no import (mesmo parser).
 */
export function resolveImportClub(params: {
  fileClubName?: unknown
  importClub?: ClubCode | null
}): ClubCode | null {
  return resolveClubCode(params.fileClubName) ?? params.importClub ?? null
}

export type ClubActivityPeriod = {
  playerId: string
  clubCode: ClubCode | null
  periodStart: string
  periodEnd: string
  weeklyRake: number
}

export type ClubActivitySlice = {
  clubCode: ClubCode
  firstActivity: string | null
  lastActivity: string | null
  rake: number
}

export function crossClubActivity(periods: ClubActivityPeriod[]): {
  playerIds: string[]
  byPlayer: Map<
    string,
    {
      clubs: ClubCode[]
      byClub: ClubActivitySlice[]
      consolidatedRake: number
      lastGlobalActivity: string | null
    }
  >
} {
  const grouped = new Map<string, ClubActivityPeriod[]>()
  for (const row of periods) {
    const list = grouped.get(row.playerId) ?? []
    list.push(row)
    grouped.set(row.playerId, list)
  }

  const byPlayer = new Map<
    string,
    {
      clubs: ClubCode[]
      byClub: ClubActivitySlice[]
      consolidatedRake: number
      lastGlobalActivity: string | null
    }
  >()

  for (const [playerId, rows] of grouped) {
    const clubs = new Set<ClubCode>()
    const byClub: ClubActivitySlice[] = []
    for (const code of CLUB_CODES) {
      const mine = rows.filter((r) => r.clubCode === code && r.weeklyRake > 0)
      if (mine.length === 0) continue
      clubs.add(code)
      const starts = mine.map((r) => r.periodStart).sort()
      const ends = mine.map((r) => r.periodEnd || r.periodStart).sort()
      byClub.push({
        clubCode: code,
        firstActivity: starts[0] ?? null,
        lastActivity: ends[ends.length - 1] ?? null,
        rake: mine.reduce((s, r) => s + r.weeklyRake, 0),
      })
    }
    const activeEnds = rows
      .filter((r) => r.weeklyRake > 0)
      .map((r) => r.periodEnd || r.periodStart)
      .sort()
    byPlayer.set(playerId, {
      clubs: [...clubs],
      byClub,
      consolidatedRake: byClub.reduce((s, c) => s + c.rake, 0),
      lastGlobalActivity: activeEnds[activeEnds.length - 1] ?? null,
    })
  }

  return { playerIds: [...byPlayer.keys()], byPlayer }
}

/** Alerta global só se a última atividade em QUALQUER clube estiver inativa. */
export function isGloballyInactive(params: {
  lastActivitySx: string | null
  lastActivityXtreme: string | null
  referenceEnd: string
  minInactiveDays: number
}): boolean {
  const last = [params.lastActivitySx, params.lastActivityXtreme]
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1)
  if (!last) return true
  const end = Date.parse(`${params.referenceEnd}T00:00:00Z`)
  const seen = Date.parse(`${last}T00:00:00Z`)
  if (!Number.isFinite(end) || !Number.isFinite(seen)) return false
  const days = Math.round((end - seen) / 86_400_000)
  return days >= params.minInactiveDays
}

export type IncentiveTx = {
  externalTransactionId: string
  receiverPlayerId: string
  senderPlayerId?: string | null
  isBonus?: boolean | null
  amount: number
  clubCode: ClubCode | null
}

export function incentiveSentByClub(
  rows: IncentiveTx[],
  receiverPlayerId: string,
): { sx_club: number; xtreme_pro: number; all: number; unknown: number } {
  const mine = rows.filter(
    (r) =>
      r.receiverPlayerId === receiverPlayerId &&
      isIncentiveTransaction({
        senderPlayerId: r.senderPlayerId,
        isBonus: r.isBonus,
      }),
  )
  const of = (code: ClubCode | null) =>
    sumIncentiveSent(mine.filter((r) => r.clubCode === code))
  const sx = of('sx_club')
  const xt = of('xtreme_pro')
  const unknown = of(null)
  return {
    sx_club: sx,
    xtreme_pro: xt,
    unknown,
    all: sumIncentiveSent(mine),
  }
}

export function rakeLimitByClub(params: {
  rakeSx: number
  rakeXtreme: number
  sentSx: number
  sentXtreme: number
}): {
  sx: IncentiveEconomics
  xtreme: IncentiveEconomics
  all: IncentiveEconomics
} {
  const sx = computeIncentiveEconomics({
    rakeBrutoHistorico: params.rakeSx,
    incentivoEnviado: params.sentSx,
  })
  const xtreme = computeIncentiveEconomics({
    rakeBrutoHistorico: params.rakeXtreme,
    incentivoEnviado: params.sentXtreme,
  })
  const all = computeIncentiveEconomics({
    rakeBrutoHistorico: params.rakeSx + params.rakeXtreme,
    incentivoEnviado: params.sentSx + params.sentXtreme,
  })
  return { sx, xtreme, all }
}

export type XtremeAgencyFact = {
  agentId: string
  agentName: string
  weeklyRake: number
  players: number
  activePlayers: number
  deposits: number
}

/** Visão principal: um agregado XTREME PRO. Agências permanecem no fato. */
export function consolidateXtremeCase(params: {
  agencies: XtremeAgencyFact[]
  investment: number
  activation: number
}): {
  label: 'XTREME PRO'
  agencyCount: number
  agencies: XtremeAgencyFact[]
  players: number
  activePlayers: number
  deposits: number
  investment: number
  activation: number
  /** Custo total na UI = investimento salvo (não inclui ativação). */
  totalCost: number
  /** Investimento + ativação (base de recuperação/payback). */
  spendTotal: number
  rakeBruto: number
  leagueFeeRate: number
  /** Rake bruto − investimento − ativação. */
  rakeLiquido: number
  recovery: number | null
  payback: boolean
} {
  const investment = Math.max(0, Number(params.investment) || 0)
  const activation = Math.max(0, Number(params.activation) || 0)
  const rakeBruto = params.agencies.reduce((s, a) => s + a.weeklyRake, 0)
  const spendTotal = investment + activation
  const rakeLiquido = rakeBruto - investment - activation
  return {
    label: 'XTREME PRO',
    agencyCount: params.agencies.length,
    agencies: params.agencies,
    players: params.agencies.reduce((s, a) => s + a.players, 0),
    activePlayers: params.agencies.reduce((s, a) => s + a.activePlayers, 0),
    deposits: params.agencies.reduce((s, a) => s + a.deposits, 0),
    investment,
    activation,
    totalCost: investment,
    spendTotal,
    rakeBruto,
    leagueFeeRate: LEAGUE_FEE_RATE,
    rakeLiquido,
    recovery: spendTotal > 0 ? rakeBruto / spendTotal : null,
    payback: spendTotal > 0 && rakeBruto >= spendTotal,
  }
}

export { INCENTIVE_LIMIT_RATE, LEAGUE_FEE_RATE }
