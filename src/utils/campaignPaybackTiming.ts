import {
  inclusiveDayCount,
  type WeeklyPaybackResult,
  type WeeklyPeriodPoint,
} from './campaignWeeklyMetrics'

export type PaybackTimingResult = {
  /** Dias até o cruzamento real do payback (realizado). */
  daysToPayback: number | null
  /** Projeção de dias restantes até o payback. */
  expectedDaysToPayback: number | null
  /** Texto neutro quando a projeção não pode ser calculada. */
  projectionUnavailable: boolean
}

const MIN_ELAPSED_DAYS_FOR_PROJECTION = 7

/**
 * Tempo de payback a partir da regra canônica já usada pelo sistema:
 * `payback.reached` = primeira semana em que rake acumulado ≥ investimento total.
 *
 * Precisão: granularidade semanal. Para o realizado, usa o `periodEnd` da semana
 * em que o total foi cruzado (limite superior da semana do cruzamento).
 *
 * Campanhas com `organicFixedPayback` não entram (payback fixo sem cruzamento).
 */
export function computePaybackTiming(params: {
  startDate: string | null | undefined
  totalInvestment: number | null | undefined
  accumulatedRake: number
  payback: WeeklyPaybackResult
  organicFixedPayback: boolean
  periods: WeeklyPeriodPoint[]
}): PaybackTimingResult {
  if (params.organicFixedPayback) {
    return {
      daysToPayback: null,
      expectedDaysToPayback: null,
      projectionUnavailable: true,
    }
  }

  if (
    params.payback.reached &&
    params.payback.periodEnd &&
    params.startDate
  ) {
    const days = inclusiveDayCount(params.startDate, params.payback.periodEnd)
    return {
      daysToPayback: days != null && days > 0 ? days : null,
      expectedDaysToPayback: null,
      projectionUnavailable: false,
    }
  }

  const total = Number(params.totalInvestment)
  const rake = Number(params.accumulatedRake) || 0
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    rake <= 0 ||
    !params.startDate ||
    params.periods.length === 0
  ) {
    return {
      daysToPayback: null,
      expectedDaysToPayback: null,
      projectionUnavailable: true,
    }
  }

  const remaining = total - rake
  if (remaining <= 0) {
    // Status pode ainda não refletir; não inventar projeção.
    return {
      daysToPayback: null,
      expectedDaysToPayback: null,
      projectionUnavailable: true,
    }
  }

  const sortedPeriods = [...params.periods].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  )
  const last = sortedPeriods[sortedPeriods.length - 1]
  const lastEnd = last?.periodEnd || last?.periodStart
  const elapsedDays = inclusiveDayCount(params.startDate, lastEnd)
  if (
    elapsedDays == null ||
    elapsedDays < MIN_ELAPSED_DAYS_FOR_PROJECTION
  ) {
    return {
      daysToPayback: null,
      expectedDaysToPayback: null,
      projectionUnavailable: true,
    }
  }

  const weeksWithRake = params.periods.filter((p) => Number(p.weeklyRake) > 0)
  if (weeksWithRake.length < 1) {
    return {
      daysToPayback: null,
      expectedDaysToPayback: null,
      projectionUnavailable: true,
    }
  }

  const dailyRate = rake / elapsedDays
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
    return {
      daysToPayback: null,
      expectedDaysToPayback: null,
      projectionUnavailable: true,
    }
  }

  const expectedDays = Math.ceil(remaining / dailyRate)
  if (!Number.isFinite(expectedDays) || expectedDays <= 0) {
    return {
      daysToPayback: null,
      expectedDaysToPayback: null,
      projectionUnavailable: true,
    }
  }

  return {
    daysToPayback: null,
    expectedDaysToPayback: expectedDays,
    projectionUnavailable: false,
  }
}

/** Média de dias até payback — só campanhas com cruzamento real. */
export function averagePaybackDays(
  samples: Array<{ daysToPayback: number | null }>,
): number | null {
  const values = samples
    .map((s) => s.daysToPayback)
    .filter((d): d is number => d != null && Number.isFinite(d) && d > 0)
  if (values.length === 0) return null
  const sum = values.reduce((acc, n) => acc + n, 0)
  return Math.round(sum / values.length)
}
