import { LEAGUE_FEE_RATE } from './crmIncentiveEconomics'
import { safeDivide } from './campaignMetricsBridge'
import type { AcquisitionNature } from '../types/campaigns'

/** Espelho da taxa da liga usada no CRM (fonte única: crmIncentiveEconomics). */
export { LEAGUE_FEE_RATE }

/** Taxa da liga sobre rake bruto confirmado. */
export function toLeagueFee(rakeBruto: number): number {
  const n = Number(rakeBruto) || 0
  return n * LEAGUE_FEE_RATE
}

/** Rake líquido = bruto × (1 − taxa da liga). */
export function toLiquidRake(rakeBruto: number): number {
  const n = Number(rakeBruto) || 0
  return n * (1 - LEAGUE_FEE_RATE)
}

/** Investimento da Campanha informado manualmente (null = não preenchido). */
export function hasCampaignInvestment(
  investment: number | null | undefined,
): boolean {
  return investment != null && Number.isFinite(investment)
}

/**
 * Investimento Total = Campanha + Ativação, só quando a campanha tem
 * investimento manual preenchido. Orgânica sem investimento → null
 * (payback fixo 100%, não usar ativação no denominador).
 */
export function resolveTotalInvestment(params: {
  acquisitionNature: AcquisitionNature
  campaignInvestment: number | null | undefined
  activationInvestment: number
}): number | null {
  if (!hasCampaignInvestment(params.campaignInvestment)) return null
  return Number(params.campaignInvestment) + (Number(params.activationInvestment) || 0)
}

/**
 * Recuperação oficial = Rake Líquido ÷ (Investimento + Ativação).
 * `accumulatedRake` / períodos entram como RAKE BRUTO; a conversão 18% é interna.
 * ORGANIC + investment null → 100% fixo.
 */
export function calculateRecoveryRate(params: {
  acquisitionNature: AcquisitionNature
  campaignInvestment: number | null | undefined
  activationInvestment: number
  /** Rake bruto acumulado (fato importado). */
  accumulatedRake: number
}): number | null {
  if (
    params.acquisitionNature === 'ORGANIC' &&
    !hasCampaignInvestment(params.campaignInvestment)
  ) {
    return 100
  }
  const total = resolveTotalInvestment(params)
  if (total === null || total <= 0) return null
  const liquid = toLiquidRake(params.accumulatedRake)
  const rate = safeDivide(liquid, total)
  return rate === null ? null : rate * 100
}

/**
 * Payback oficial: primeira semana em que Σ rake líquido ≥ investimento total.
 * `weeklyRake` nos períodos é bruto; a conversão é aplicada no acumulado.
 */
export function calculateWeeklyPaybackAgainstTotal(
  totalInvestment: number | null,
  periods: Array<{ periodStart: string; periodEnd: string; weeklyRake: number }>,
): {
  reached: boolean
  periodStart: string | null
  periodEnd: string | null
  periodsToPayback: number | null
  accumulatedAtPayback: number | null
  surplus: number | null
} {
  if (totalInvestment === null || totalInvestment <= 0) {
    return {
      reached: false,
      periodStart: null,
      periodEnd: null,
      periodsToPayback: null,
      accumulatedAtPayback: null,
      surplus: null,
    }
  }
  const sorted = [...periods].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  )
  let accumulatedLiquid = 0
  for (let i = 0; i < sorted.length; i += 1) {
    accumulatedLiquid += toLiquidRake(Number(sorted[i].weeklyRake) || 0)
    if (accumulatedLiquid >= totalInvestment) {
      return {
        reached: true,
        periodStart: sorted[i].periodStart,
        periodEnd: sorted[i].periodEnd,
        periodsToPayback: i + 1,
        accumulatedAtPayback: accumulatedLiquid,
        surplus: accumulatedLiquid - totalInvestment,
      }
    }
  }
  return {
    reached: false,
    periodStart: null,
    periodEnd: null,
    periodsToPayback: null,
    accumulatedAtPayback: null,
    surplus: null,
  }
}

export type EconomicStatus =
  | 'payback'
  | 'recovering'
  | 'no_return'
  | 'no_data'
  | 'archived'

export function calculateEconomicStatus(params: {
  isArchived: boolean
  acquisitionNature: AcquisitionNature
  campaignInvestment: number | null | undefined
  activationInvestment: number
  /** Rake bruto acumulado. */
  accumulatedRake: number
  hasImportedPeriods: boolean
}): EconomicStatus {
  if (params.isArchived) return 'archived'
  if (!params.hasImportedPeriods) return 'no_data'

  const organicFixed =
    params.acquisitionNature === 'ORGANIC' &&
    !hasCampaignInvestment(params.campaignInvestment)

  if (organicFixed) {
    return 'payback'
  }

  const total = resolveTotalInvestment(params)
  if (total === null || total <= 0) {
    return 'no_return'
  }
  const liquid = toLiquidRake(params.accumulatedRake)
  if (liquid >= total) return 'payback'
  if (liquid > 0 && liquid < total) {
    return 'recovering'
  }
  return 'no_return'
}

/** Custo aplicável para KPIs de aquisição (null → —). */
export function applicableAcquisitionCost(params: {
  acquisitionNature: AcquisitionNature
  campaignInvestment: number | null | undefined
  activationInvestment: number
}): number | null {
  return resolveTotalInvestment(params)
}
