import { describe, expect, it } from 'vitest'
import {
  calculateRecoveryRate,
  calculateEconomicStatus,
  resolveTotalInvestment,
  hasCampaignInvestment,
} from './campaignEconomics'
import { classifyTransactionFlags, resolveHistoricalAgentId } from './campaignDepositMetrics'
import { buildCampaignWeeklyMetrics } from './campaignWeeklyMetrics'

describe('payback with activation investment', () => {
  it('PAID: 5220 / (5000+800) = 90%', () => {
    const rate = calculateRecoveryRate({
      acquisitionNature: 'PAID',
      campaignInvestment: 5000,
      activationInvestment: 800,
      accumulatedRake: 5220,
    })
    expect(rate).toBeCloseTo(90, 5)
    expect(
      calculateEconomicStatus({
        isArchived: false,
        acquisitionNature: 'PAID',
        campaignInvestment: 5000,
        activationInvestment: 800,
        accumulatedRake: 5220,
        hasImportedPeriods: true,
      }),
    ).toBe('recovering')
  })

  it('PAID: 5800 / 5800 = 100% payback', () => {
    const rate = calculateRecoveryRate({
      acquisitionNature: 'PAID',
      campaignInvestment: 5000,
      activationInvestment: 800,
      accumulatedRake: 5800,
    })
    expect(rate).toBeCloseTo(100, 5)
    expect(
      calculateEconomicStatus({
        isArchived: false,
        acquisitionNature: 'PAID',
        campaignInvestment: 5000,
        activationInvestment: 800,
        accumulatedRake: 5800,
        hasImportedPeriods: true,
      }),
    ).toBe('payback')
  })

  it('ORGANIC without investment → fixed 100% even with rake', () => {
    expect(hasCampaignInvestment(null)).toBe(false)
    const rate = calculateRecoveryRate({
      acquisitionNature: 'ORGANIC',
      campaignInvestment: null,
      activationInvestment: 0,
      accumulatedRake: 9999,
    })
    expect(rate).toBe(100)
    expect(
      calculateEconomicStatus({
        isArchived: false,
        acquisitionNature: 'ORGANIC',
        campaignInvestment: null,
        activationInvestment: 0,
        accumulatedRake: 9999,
        hasImportedPeriods: true,
      }),
    ).toBe('payback')
  })

  it('ORGANIC without investment + bonuses still 100% fixed', () => {
    expect(
      resolveTotalInvestment({
        acquisitionNature: 'ORGANIC',
        campaignInvestment: null,
        activationInvestment: 500,
      }),
    ).toBeNull()
    const rate = calculateRecoveryRate({
      acquisitionNature: 'ORGANIC',
      campaignInvestment: null,
      activationInvestment: 500,
      accumulatedRake: 2000,
    })
    expect(rate).toBe(100)
  })

  it('ORGANIC with investment uses total', () => {
    const rate = calculateRecoveryRate({
      acquisitionNature: 'ORGANIC',
      campaignInvestment: 1000,
      activationInvestment: 200,
      accumulatedRake: 600,
    })
    expect(rate).toBeCloseTo(50, 5)
  })

  it('never returns Infinity/NaN without denominator', () => {
    const rate = calculateRecoveryRate({
      acquisitionNature: 'PAID',
      campaignInvestment: null,
      activationInvestment: 0,
      accumulatedRake: 100,
    })
    expect(rate).toBeNull()
    expect(Number.isFinite(rate as number) || rate === null).toBe(true)
  })
})

describe('transaction classification', () => {
  it('classifies SX 24 Horas as deposit', () => {
    expect(
      classifyTransactionFlags({
        origin: 'SX 24 Horas',
        transactionType: 'Transfer',
        orderStatus: 'Completed',
      }).isDeposit,
    ).toBe(true)
  })

  it('bonus never counts as deposit', () => {
    const flags = classifyTransactionFlags({
      origin: 'Bônus',
      transactionType: 'Bonus',
    })
    expect(flags.isBonus).toBe(true)
    expect(flags.isDeposit).toBe(false)
  })

  it('keeps historical agent for player migration weeks', () => {
    const week1 = resolveHistoricalAgentId({
      reportAgentId: 'A',
      receiverPlayerId: '123',
      periodStart: '2026-08-03',
      periodEnd: '2026-08-09',
      playerPeriodLinks: [],
    })
    const week2 = resolveHistoricalAgentId({
      reportAgentId: null,
      receiverPlayerId: '123',
      periodStart: '2026-08-10',
      periodEnd: '2026-08-16',
      playerPeriodLinks: [
        {
          playerId: '123',
          agentId: 'B',
          periodStart: '2026-08-10',
          periodEnd: '2026-08-16',
        },
      ],
    })
    expect(week1).toBe('A')
    expect(week2).toBe('B')
  })
})

describe('weekly metrics integration', () => {
  it('uses total investment in recovery', () => {
    const m = buildCampaignWeeklyMetrics({
      campaign: {
        investment: 5000,
        capturedPlayers: 100,
        isArchived: false,
        acquisitionNature: 'PAID',
        clubFichasConversions: 40,
      },
      agentPeriods: [
        { periodStart: '2026-07-06', periodEnd: '2026-07-12', weeklyRake: 5220 },
      ],
      uniqueActivePlayers: 20,
      activationInvestment: 800,
    })
    expect(m.totalInvestment).toBe(5800)
    expect(m.recoveryRate).toBeCloseTo(90, 5)
    expect(m.status).toBe('recovering')
    expect(m.costPerPlayerFunnel).toBeCloseTo(5800 / 40, 5)
  })
})
