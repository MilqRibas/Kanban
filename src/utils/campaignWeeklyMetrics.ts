import type { AcquisitionNature, Campaign } from '../types/campaigns'
import {
  GAME_PROFILE,
  RAKE_BANDS,
  RAKE_HEALTH,
} from './campaignThresholds'
import { GAME_TYPE_LABELS, safeDivide } from './campaignMetricsBridge'
import {
  applicableAcquisitionCost,
  calculateEconomicStatus,
  calculateRecoveryRate,
  calculateWeeklyPaybackAgainstTotal,
  hasCampaignInvestment,
  resolveTotalInvestment,
} from './campaignEconomics'

export type WeeklyPeriodPoint = {
  periodStart: string
  periodEnd: string
  weeklyRake: number
  uniquePlayers?: number
  newPlayers?: number
}

export type WeeklyPaybackResult = {
  reached: boolean
  periodStart: string | null
  periodEnd: string | null
  periodsToPayback: number | null
  accumulatedAtPayback: number | null
  surplus: number | null
}

export type CampaignComputedStatusV2 =
  | 'payback'
  | 'recovering'
  | 'no_return'
  | 'no_data'
  | 'archived'

/** Soma de snapshots semanais — fonte de verdade do acumulado. */
export function sumWeeklyRake(
  periods: Pick<WeeklyPeriodPoint, 'weeklyRake'>[],
): number {
  return periods.reduce((sum, p) => sum + (Number(p.weeklyRake) || 0), 0)
}

export function sortPeriodsChronologically<T extends { periodStart: string }>(
  periods: T[],
): T[] {
  return [...periods].sort((a, b) => a.periodStart.localeCompare(b.periodStart))
}

export function buildCumulativeSeries(
  periods: WeeklyPeriodPoint[],
): Array<WeeklyPeriodPoint & { accumulatedRake: number; recoveryRate: number | null }> {
  const sorted = sortPeriodsChronologically(periods)
  let acc = 0
  return sorted.map((p) => {
    acc += Number(p.weeklyRake) || 0
    return {
      ...p,
      accumulatedRake: acc,
      recoveryRate: null as number | null,
    }
  })
}

export function calculateWeeklyPayback(
  investment: number,
  periods: WeeklyPeriodPoint[],
): WeeklyPaybackResult {
  return calculateWeeklyPaybackAgainstTotal(
    investment > 0 ? investment : null,
    periods,
  )
}

export function calculateCampaignStatusV2(params: {
  isArchived: boolean
  investment: number | null | undefined
  accumulatedRake: number
  hasImportedPeriods: boolean
  acquisitionNature?: AcquisitionNature
  activationInvestment?: number
}): CampaignComputedStatusV2 {
  return calculateEconomicStatus({
    isArchived: params.isArchived,
    acquisitionNature: params.acquisitionNature ?? 'PAID',
    campaignInvestment: params.investment,
    activationInvestment: params.activationInvestment ?? 0,
    accumulatedRake: params.accumulatedRake,
    hasImportedPeriods: params.hasImportedPeriods,
  })
}

export type PlayerRakeRow = {
  playerId: string
  name?: string
  nickname?: string
  rake: number
}

export type RakeHealthMetrics = {
  totalRake: number
  uniquePlayers: number
  averageRake: number | null
  medianRake: number | null
  top1Share: number | null
  top3Share: number | null
  top10Share: number | null
  playersFor80: number | null
  playersFor80Pct: number | null
  classification: 'distributed' | 'attention' | 'concentrated'
  classificationLabel: string
  classificationReason: string
  ranking: Array<PlayerRakeRow & { share: number; cumulativeShare: number; rank: number }>
  bands: Array<{ min: number; count: number }>
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function topShare(sortedDesc: number[], total: number, n: number): number | null {
  if (total <= 0 || sortedDesc.length === 0) return null
  const sum = sortedDesc.slice(0, n).reduce((a, b) => a + b, 0)
  return sum / total
}

export function buildRakeHealth(players: PlayerRakeRow[]): RakeHealthMetrics {
  const withRake = players.filter((p) => Number.isFinite(p.rake))
  const totalRake = withRake.reduce((s, p) => s + p.rake, 0)
  const rakes = withRake.map((p) => p.rake)
  const sortedDesc = [...withRake].sort((a, b) => b.rake - a.rake)
  const uniquePlayers = withRake.length

  const ranking = sortedDesc.map((p, idx) => {
    const share = totalRake > 0 ? p.rake / totalRake : 0
    const cumulativeShare =
      totalRake > 0
        ? sortedDesc.slice(0, idx + 1).reduce((s, x) => s + x.rake, 0) / totalRake
        : 0
    return { ...p, share, cumulativeShare, rank: idx + 1 }
  })

  let playersFor80: number | null = null
  if (totalRake > 0) {
    let acc = 0
    for (let i = 0; i < sortedDesc.length; i += 1) {
      acc += sortedDesc[i].rake
      if (acc / totalRake >= 0.8) {
        playersFor80 = i + 1
        break
      }
    }
    if (playersFor80 === null) playersFor80 = sortedDesc.length
  }

  const top1 = topShare(
    sortedDesc.map((p) => p.rake),
    totalRake,
    1,
  )
  const top3 = topShare(
    sortedDesc.map((p) => p.rake),
    totalRake,
    3,
  )
  const top10 = topShare(
    sortedDesc.map((p) => p.rake),
    totalRake,
    10,
  )
  const playersFor80Pct =
    playersFor80 !== null && uniquePlayers > 0
      ? playersFor80 / uniquePlayers
      : null

  let classification: RakeHealthMetrics['classification'] = 'distributed'
  let reason = 'O rake está relativamente bem distribuído entre os jogadores.'

  const concentrated =
    (top1 !== null && top1 >= RAKE_HEALTH.top1Concentrated) ||
    (top3 !== null && top3 >= RAKE_HEALTH.top3Concentrated) ||
    (top10 !== null && top10 >= RAKE_HEALTH.top10Concentrated) ||
    (playersFor80Pct !== null &&
      playersFor80Pct <= RAKE_HEALTH.playersFor80Concentrated)

  const attention =
    (top1 !== null && top1 >= RAKE_HEALTH.top1Attention) ||
    (top3 !== null && top3 >= RAKE_HEALTH.top3Attention) ||
    (playersFor80Pct !== null &&
      playersFor80Pct <= RAKE_HEALTH.playersFor80Attention)

  if (uniquePlayers === 0 || totalRake <= 0) {
    classification = 'distributed'
    reason = 'Ainda não há dados suficientes para analisar a distribuição do rake.'
  } else if (concentrated) {
    classification = 'concentrated'
    reason =
      top3 !== null
        ? `Concentrado — os 3 maiores jogadores representam ${(top3 * 100).toFixed(0)}% do rake.`
        : 'O rake apresenta alta concentração em poucos jogadores.'
  } else if (attention) {
    classification = 'attention'
    reason =
      top3 !== null
        ? `Atenção — os 3 maiores jogadores representam ${(top3 * 100).toFixed(0)}% do rake.`
        : 'Há sinais de concentração moderada no rake.'
  }

  const labelMap = {
    distributed: 'Distribuído',
    attention: 'Atenção',
    concentrated: 'Concentrado',
  } as const

  const bands = RAKE_BANDS.map((min) => ({
    min,
    count: withRake.filter((p) => p.rake > min).length,
  }))

  return {
    totalRake,
    uniquePlayers,
    averageRake: safeDivide(totalRake, uniquePlayers),
    medianRake: median(rakes),
    top1Share: top1,
    top3Share: top3,
    top10Share: top10,
    playersFor80,
    playersFor80Pct,
    classification,
    classificationLabel: labelMap[classification],
    classificationReason: reason,
    ranking,
    bands,
  }
}

export type GameProfileSlice = {
  code: string
  label: string
  rake: number
  rakeShare: number | null
  uniquePlayers: number
}

export type GameProfileResult = {
  slices: GameProfileSlice[]
  predominant: { code: string; label: string; rakeShare: number } | null
  predominantLabel: string
  totalRake: number
}

export function buildGameProfile(
  rows: Array<{ gameType: string; playerId: string; rake: number }>,
): GameProfileResult {
  const byType = new Map<string, { rake: number; players: Set<string> }>()
  for (const row of rows) {
    const code = (row.gameType || 'OUTRO').toUpperCase()
    const bucket = byType.get(code) ?? { rake: 0, players: new Set<string>() }
    bucket.rake += Number(row.rake) || 0
    bucket.players.add(row.playerId)
    byType.set(code, bucket)
  }

  const totalRake = [...byType.values()].reduce((s, b) => s + b.rake, 0)
  const order = ['RG', 'MTT', 'SNG', 'RODEO']
  const codes = [
    ...order.filter((c) => byType.has(c)),
    ...[...byType.keys()].filter((c) => !order.includes(c)).sort(),
  ]

  const slices: GameProfileSlice[] = codes.map((code) => {
    const bucket = byType.get(code)!
    return {
      code,
      label: GAME_TYPE_LABELS[code] ?? code,
      rake: bucket.rake,
      rakeShare: totalRake > 0 ? bucket.rake / totalRake : null,
      uniquePlayers: bucket.players.size,
    }
  })

  const top = [...slices].sort((a, b) => b.rake - a.rake)[0]
  const predominant =
    top &&
    top.rakeShare !== null &&
    top.rakeShare >= GAME_PROFILE.predominantMinShare
      ? { code: top.code, label: top.label, rakeShare: top.rakeShare }
      : null

  return {
    slices,
    predominant,
    predominantLabel: predominant
      ? `${predominant.label} — ${(predominant.rakeShare * 100).toFixed(0)}% do rake`
      : slices.length > 0
        ? 'Perfil misto'
        : 'Sem dados',
    totalRake,
  }
}

export type CampaignWeeklyMetrics = {
  agencyPlayers: number
  uniqueActivePlayers: number
  inactivePlayers: number
  activationRate: number | null
  costPerAgencyPlayer: number | null
  costPerActive: number | null
  costPerPlayerFunnel: number | null
  accumulatedRake: number
  averageRakePerActive: number | null
  recoveryRate: number | null
  investmentDifference: number | null
  campaignInvestment: number | null
  activationInvestment: number
  totalInvestment: number | null
  payback: WeeklyPaybackResult
  status: CampaignComputedStatusV2
  weeksTracked: number
  lastPeriodStart: string | null
  lastPeriodEnd: string | null
  organicFixedPayback: boolean
}

export function buildCampaignWeeklyMetrics(params: {
  campaign: Pick<
    Campaign,
    | 'investment'
    | 'capturedPlayers'
    | 'isArchived'
    | 'acquisitionNature'
    | 'clubFichasConversions'
  >
  agentPeriods: WeeklyPeriodPoint[]
  uniqueActivePlayers: number
  activationInvestment?: number
}): CampaignWeeklyMetrics {
  const { campaign, agentPeriods, uniqueActivePlayers } = params
  const activationInvestment = Number(params.activationInvestment) || 0
  const agencyPlayers = campaign.capturedPlayers
  const accumulatedRake = sumWeeklyRake(agentPeriods)
  const sorted = sortPeriodsChronologically(agentPeriods)
  const last = sorted[sorted.length - 1] ?? null
  const nature = campaign.acquisitionNature ?? 'PAID'
  const organicFixedPayback =
    nature === 'ORGANIC' && !hasCampaignInvestment(campaign.investment)

  const totalInvestment = resolveTotalInvestment({
    acquisitionNature: nature,
    campaignInvestment: campaign.investment,
    activationInvestment,
  })
  const applicableCost = applicableAcquisitionCost({
    acquisitionNature: nature,
    campaignInvestment: campaign.investment,
    activationInvestment,
  })

  const recoveryRate = calculateRecoveryRate({
    acquisitionNature: nature,
    campaignInvestment: campaign.investment,
    activationInvestment,
    accumulatedRake,
  })

  const payback = organicFixedPayback
    ? {
        reached: true,
        periodStart: last?.periodStart ?? null,
        periodEnd: last?.periodEnd ?? null,
        periodsToPayback: agentPeriods.length || null,
        accumulatedAtPayback: accumulatedRake,
        surplus: null,
      }
    : calculateWeeklyPaybackAgainstTotal(totalInvestment, agentPeriods)

  return {
    agencyPlayers,
    uniqueActivePlayers,
    inactivePlayers: Math.max(0, agencyPlayers - uniqueActivePlayers),
    activationRate: (() => {
      const rate = safeDivide(uniqueActivePlayers, agencyPlayers)
      return rate === null ? null : rate * 100
    })(),
    costPerAgencyPlayer: safeDivide(applicableCost ?? NaN, agencyPlayers),
    costPerActive: safeDivide(applicableCost ?? NaN, uniqueActivePlayers),
    costPerPlayerFunnel: safeDivide(
      applicableCost ?? NaN,
      campaign.clubFichasConversions ?? 0,
    ),
    accumulatedRake,
    averageRakePerActive: safeDivide(accumulatedRake, uniqueActivePlayers),
    recoveryRate,
    investmentDifference:
      totalInvestment != null ? accumulatedRake - totalInvestment : null,
    campaignInvestment: hasCampaignInvestment(campaign.investment)
      ? Number(campaign.investment)
      : null,
    activationInvestment,
    totalInvestment,
    payback,
    status: calculateCampaignStatusV2({
      isArchived: campaign.isArchived,
      investment: campaign.investment,
      accumulatedRake,
      hasImportedPeriods: agentPeriods.length > 0,
      acquisitionNature: nature,
      activationInvestment,
    }),
    weeksTracked: agentPeriods.length,
    lastPeriodStart: last?.periodStart ?? null,
    lastPeriodEnd: last?.periodEnd ?? null,
    organicFixedPayback,
  }
}

/** Acumula rake por player a partir de snapshots semanais (nunca sobrescreve). */
export function accumulatePlayerRake(
  periods: Array<{ playerId: string; weeklyRake: number; name?: string; nickname?: string }>,
): PlayerRakeRow[] {
  const map = new Map<string, PlayerRakeRow>()
  for (const row of periods) {
    const prev = map.get(row.playerId)
    if (prev) {
      prev.rake += Number(row.weeklyRake) || 0
      if (row.name) prev.name = row.name
      if (row.nickname) prev.nickname = row.nickname
    } else {
      map.set(row.playerId, {
        playerId: row.playerId,
        name: row.name,
        nickname: row.nickname,
        rake: Number(row.weeklyRake) || 0,
      })
    }
  }
  return [...map.values()]
}

export function uniquePlayerIds(
  periods: Array<{ playerId: string }>,
): string[] {
  return [...new Set(periods.map((p) => p.playerId))]
}

/** `null` = não filtra por rake (contagem manual de IDs únicos). */
export function activationRakeThreshold(
  campaign: Pick<Campaign, 'activationRuleType' | 'activationMinimumRake'>,
): number | null {
  switch (campaign.activationRuleType) {
    case 'rake_gt_zero':
      return 0
    case 'rake_gt_050':
      return 0.5
    case 'custom_minimum':
    case 'custom_rule':
      return campaign.activationMinimumRake ?? 0
    case 'manual_count':
      return null
    default:
      return 0
  }
}

export function countActivePlayers(
  periods: Array<{ playerId: string; weeklyRake: number }>,
  threshold: number | null,
): number {
  if (threshold === null) return uniquePlayerIds(periods).length
  return accumulatePlayerRake(periods).filter((p) => p.rake > threshold).length
}

export function formatPeriodLabel(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }
  return `${fmt(start)} a ${fmt(end)}`
}
