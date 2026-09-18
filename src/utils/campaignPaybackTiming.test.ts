import { describe, expect, it } from 'vitest'
import {
  averagePaybackDays,
  computePaybackTiming,
} from './campaignPaybackTiming'
import type { WeeklyPaybackResult } from './campaignWeeklyMetrics'

const reachedPayback: WeeklyPaybackResult = {
  reached: true,
  periodStart: '2026-07-06',
  periodEnd: '2026-07-12',
  periodsToPayback: 2,
  accumulatedAtPayback: 3000,
  surplus: 200,
}

const notReached: WeeklyPaybackResult = {
  reached: false,
  periodStart: null,
  periodEnd: null,
  periodsToPayback: null,
  accumulatedAtPayback: null,
  surplus: null,
}

describe('computePaybackTiming', () => {
  it('returns days from startDate to payback week end when reached', () => {
    const result = computePaybackTiming({
      startDate: '2026-07-01',
      totalInvestment: 2800,
      accumulatedRake: 3000,
      payback: reachedPayback,
      organicFixedPayback: false,
      periods: [
        {
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          weeklyRake: 1000,
        },
        {
          periodStart: '2026-07-06',
          periodEnd: '2026-07-12',
          weeklyRake: 2000,
        },
      ],
    })
    // 2026-07-01 .. 2026-07-12 inclusive = 12 days
    expect(result.daysToPayback).toBe(12)
    expect(result.expectedDaysToPayback).toBeNull()
    expect(result.projectionUnavailable).toBe(false)
  })

  it('skips organic fixed payback', () => {
    const result = computePaybackTiming({
      startDate: '2026-07-01',
      totalInvestment: null,
      accumulatedRake: 100,
      payback: { ...reachedPayback, reached: true },
      organicFixedPayback: true,
      periods: [],
    })
    expect(result.daysToPayback).toBeNull()
    expect(result.expectedDaysToPayback).toBeNull()
    expect(result.projectionUnavailable).toBe(true)
  })

  it('projects remaining days from observed daily rate', () => {
    const result = computePaybackTiming({
      startDate: '2026-07-01',
      totalInvestment: 1000,
      accumulatedRake: 200,
      payback: notReached,
      organicFixedPayback: false,
      periods: [
        {
          periodStart: '2026-07-06',
          periodEnd: '2026-07-12',
          weeklyRake: 100,
        },
        {
          periodStart: '2026-07-13',
          periodEnd: '2026-07-19',
          weeklyRake: 100,
        },
      ],
    })
    // líquido 200*0.82=164; elapsed 19d; remaining 1000-164=836 → ceil(836/(164/19))=97
    expect(result.daysToPayback).toBeNull()
    expect(result.expectedDaysToPayback).toBe(97)
    expect(result.projectionUnavailable).toBe(false)
  })

  it('marks projection unavailable without rake or short history', () => {
    expect(
      computePaybackTiming({
        startDate: '2026-07-01',
        totalInvestment: 1000,
        accumulatedRake: 0,
        payback: notReached,
        organicFixedPayback: false,
        periods: [
          {
            periodStart: '2026-07-06',
            periodEnd: '2026-07-12',
            weeklyRake: 0,
          },
        ],
      }).projectionUnavailable,
    ).toBe(true)

    expect(
      computePaybackTiming({
        startDate: '2026-07-15',
        totalInvestment: 1000,
        accumulatedRake: 50,
        payback: notReached,
        organicFixedPayback: false,
        periods: [
          {
            periodStart: '2026-07-13',
            periodEnd: '2026-07-19',
            weeklyRake: 50,
          },
        ],
      }).projectionUnavailable,
    ).toBe(true)
  })
})

describe('averagePaybackDays', () => {
  it('averages only real samples and ignores nulls', () => {
    expect(
      averagePaybackDays([
        { daysToPayback: 10 },
        { daysToPayback: 20 },
        { daysToPayback: null },
      ]),
    ).toBe(15)
  })

  it('returns null when no completed paybacks', () => {
    expect(averagePaybackDays([{ daysToPayback: null }])).toBeNull()
    expect(averagePaybackDays([])).toBeNull()
  })
})
