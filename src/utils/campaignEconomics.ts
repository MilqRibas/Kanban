import { safeDivide } from './campaignMetricsBridge'
import type { AcquisitionNature } from '../types/campaigns'

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
 * Payback / recuperação oficial.
 * ORGANIC + investment null → 100% fixo (mesmo com bônus).
 * Caso contrário → rake / Investimento Total (quando denominador válido).
 */
export function calculateRecoveryRate(params: {
  acquisitionNature: AcquisitionNature
  campaignInvestment: number | null | undefined
  activationInvestment: number
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
  const rate = safeDivide(params.accumulatedRake, total)
  return rate === null ? null : rate * 100
}

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
  let accumulated = 0
  for (let i = 0; i < sorted.length; i += 1) {
    accumulated += Number(sorted[i].weeklyRake) || 0
    if (accumulated >= totalInvestment) {
      return {
        reached: true,
        periodStart: sorted[i].periodStart,
        periodEnd: sorted[i].periodEnd,
        periodsToPayback: i + 1,
        accumulatedAtPayback: accumulated,
        surplus: accumulated - totalInvestment,
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
  accumulatedRake: number
  hasImportedPeriods: boolean
}): EconomicStatus {
  if (params.isArchived) return 'archived'
  if (!params.hasImportedPeriods) return 'no_data'

  const organicFixed =
    params.acquisitionNature === 'ORGANIC' &&
    !hasCampaignInvestment(params.campaignInvestment)

  if (organicFixed) {
    // Payback fixo 100% — não marcar "em recuperação" só porque há rake.
    return 'payback'
  }

  const total = resolveTotalInvestment(params)
  if (total === null || total <= 0) {
    return params.accumulatedRake > 0 ? 'no_return' : 'no_return'
  }
  if (params.accumulatedRake >= total) return 'payback'
  if (params.accumulatedRake > 0 && params.accumulatedRake < total) {
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
