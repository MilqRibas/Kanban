import { describe, expect, it } from 'vitest'
import {
  accumulatePlayerRake,
  activationRakeThreshold,
  buildCampaignWeeklyMetrics,
  buildCumulativeSeries,
  calculateWeeklyPayback,
  countActivePlayers,
  sumWeeklyRake,
} from './campaignWeeklyMetrics'

describe('weekly rake accumulation', () => {
  it('sums agency weekly snapshots without replacing', () => {
    const weeks = [
      { periodStart: '2026-07-06', periodEnd: '2026-07-12', weeklyRake: 500 },
      { periodStart: '2026-07-13', periodEnd: '2026-07-19', weeklyRake: 700 },
      { periodStart: '2026-07-20', periodEnd: '2026-07-26', weeklyRake: 300 },
      { periodStart: '2026-07-27', periodEnd: '2026-08-02', weeklyRake: 600 },
      { periodStart: '2026-08-03', periodEnd: '2026-08-09', weeklyRake: 400 },
    ]

    expect(sumWeeklyRake(weeks.slice(0, 1))).toBe(500)
    expect(sumWeeklyRake(weeks.slice(0, 2))).toBe(1200)
    expect(sumWeeklyRake(weeks.slice(0, 3))).toBe(1500)
    expect(sumWeeklyRake(weeks.slice(0, 4))).toBe(2100)
    expect(sumWeeklyRake(weeks)).toBe(2500)

    const series = buildCumulativeSeries(weeks)
    expect(series.map((s) => s.accumulatedRake)).toEqual([
      500, 1200, 1500, 2100, 2500,
    ])
  })

  it('records payback on the first week that crosses investment and keeps it', () => {
    const weeks = [
      { periodStart: '2026-07-06', periodEnd: '2026-07-12', weeklyRake: 500 },
      { periodStart: '2026-07-13', periodEnd: '2026-07-19', weeklyRake: 700 },
      { periodStart: '2026-07-20', periodEnd: '2026-07-26', weeklyRake: 300 },
      { periodStart: '2026-07-27', periodEnd: '2026-08-02', weeklyRake: 600 },
      { periodStart: '2026-08-03', periodEnd: '2026-08-09', weeklyRake: 400 },
    ]

    const at4 = calculateWeeklyPayback(2000, weeks.slice(0, 4))
    expect(at4.reached).toBe(true)
    expect(at4.periodStart).toBe('2026-07-27')
    expect(at4.periodsToPayback).toBe(4)
    expect(at4.accumulatedAtPayback).toBe(2100)

    const at5 = calculateWeeklyPayback(2000, weeks)
    expect(at5.reached).toBe(true)
    expect(at5.periodStart).toBe('2026-07-27')
    expect(at5.periodsToPayback).toBe(4)
    expect(sumWeeklyRake(weeks)).toBe(2500)
  })

  it('accumulates player rake across weeks', () => {
    const rows = [
      { playerId: '12345', weeklyRake: 100 },
      { playerId: '12345', weeklyRake: 50 },
      { playerId: '12345', weeklyRake: 80 },
    ]
    const acc = accumulatePlayerRake(rows)
    expect(acc).toHaveLength(1)
    expect(acc[0].rake).toBe(230)
  })

  it('builds recovery from accumulated rake', () => {
    const metrics = buildCampaignWeeklyMetrics({
      campaign: {
        investment: 2000,
        capturedPlayers: 100,
        isArchived: false,
        acquisitionNature: 'PAID',
        clubFichasConversions: null,
      },
      agentPeriods: [
        { periodStart: '2026-07-06', periodEnd: '2026-07-12', weeklyRake: 500 },
        { periodStart: '2026-07-13', periodEnd: '2026-07-19', weeklyRake: 700 },
        { periodStart: '2026-07-20', periodEnd: '2026-07-26', weeklyRake: 300 },
      ],
      uniqueActivePlayers: 47,
      activationInvestment: 0,
    })
    expect(metrics.accumulatedRake).toBe(1500)
    expect(metrics.recoveryRate).toBe(75)
    expect(metrics.status).toBe('recovering')
    expect(metrics.activationRate).toBe(47)
  })

  it('recalculates correctly after replacing a week (no double count)', () => {
    const before = [
      { periodStart: '2026-07-06', periodEnd: '2026-07-12', weeklyRake: 500 },
      { periodStart: '2026-07-13', periodEnd: '2026-07-19', weeklyRake: 700 },
    ]
    const afterReplace = [
      { periodStart: '2026-07-06', periodEnd: '2026-07-12', weeklyRake: 550 },
      { periodStart: '2026-07-13', periodEnd: '2026-07-19', weeklyRake: 700 },
    ]
    expect(sumWeeklyRake(before)).toBe(1200)
    expect(sumWeeklyRake(afterReplace)).toBe(1250)
    // Never 1200 + 550
    expect(sumWeeklyRake(afterReplace)).not.toBe(1750)
  })

  it('counts actives by activation rule threshold', () => {
    const periods = [
      { playerId: 'a', weeklyRake: 0 },
      { playerId: 'b', weeklyRake: 0.3 },
      { playerId: 'c', weeklyRake: 1.2 },
    ]
    expect(countActivePlayers(periods, 0)).toBe(2)
    expect(countActivePlayers(periods, 0.5)).toBe(1)
    expect(countActivePlayers(periods, null)).toBe(3)
    expect(
      activationRakeThreshold({
        activationRuleType: 'rake_gt_050',
        activationMinimumRake: null,
      }),
    ).toBe(0.5)
    expect(
      activationRakeThreshold({
        activationRuleType: 'manual_count',
        activationMinimumRake: null,
      }),
    ).toBeNull()
  })
})
