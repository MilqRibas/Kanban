import { describe, expect, it } from 'vitest'
import {
  calculateRecoveryRate,
  calculateEconomicStatus,
  calculateWeeklyPaybackAgainstTotal,
  resolveTotalInvestment,
  hasCampaignInvestment,
  toLeagueFee,
  toLiquidRake,
  LEAGUE_FEE_RATE,
} from './campaignEconomics'
import { classifyTransactionFlags, resolveHistoricalAgentId } from './campaignDepositMetrics'
import { buildCampaignWeeklyMetrics } from './campaignWeeklyMetrics'

describe('league fee / liquid rake', () => {
  it('uses 18% league fee', () => {
    expect(LEAGUE_FEE_RATE).toBe(0.18)
    expect(toLeagueFee(1300)).toBeCloseTo(234, 5)
    expect(toLiquidRake(1300)).toBeCloseTo(1066, 5)
  })

  it('prompt example: Inv 1000 + Act 200, Bruto 1300 → recuperação ~88,83%', () => {
    const rate = calculateRecoveryRate({
      acquisitionNature: 'PAID',
      campaignInvestment: 1000,
      activationInvestment: 200,
      accumulatedRake: 1300,
    })
    expect(rate).toBeCloseTo((1066 / 1200) * 100, 5)
    expect(
      calculateEconomicStatus({
        isArchived: false,
        acquisitionNature: 'PAID',
        campaignInvestment: 1000,
        activationInvestment: 200,
        accumulatedRake: 1300,
        hasImportedPeriods: true,
      }),
    ).toBe('recovering')
  })

  it('payback when liquid crosses cost', () => {
    // Custo 1200; líquido precisa ≥ 1200 → bruto ≥ 1200/0.82 ≈ 1463.41
    const bruto = 1200 / 0.82
    expect(
      calculateEconomicStatus({
        isArchived: false,
        acquisitionNature: 'PAID',
        campaignInvestment: 1000,
        activationInvestment: 200,
        accumulatedRake: bruto,
        hasImportedPeriods: true,
      }),
    ).toBe('payback')
    expect(
      calculateRecoveryRate({
        acquisitionNature: 'PAID',
        campaignInvestment: 1000,
        activationInvestment: 200,
        accumulatedRake: bruto,
      }),
    ).toBeCloseTo(100, 5)
  })
})

describe('payback with activation investment (liquid)', () => {
  it('PAID: liquid(5220)/5800 ≈ 73,8% recovering', () => {
    const rate = calculateRecoveryRate({
      acquisitionNature: 'PAID',
      campaignInvestment: 5000,
      activationInvestment: 800,
      accumulatedRake: 5220,
    })
    expect(rate).toBeCloseTo((5220 * 0.82) / 5800 * 100, 5)
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

  it('PAID: bruto 5800 → liquid 4756 / 5800 ≈ 82% still recovering', () => {
    const rate = calculateRecoveryRate({
      acquisitionNature: 'PAID',
      campaignInvestment: 5000,
      activationInvestment: 800,
      accumulatedRake: 5800,
    })
    expect(rate).toBeCloseTo((5800 * 0.82) / 5800 * 100, 5)
    expect(
      calculateEconomicStatus({
        isArchived: false,
        acquisitionNature: 'PAID',
        campaignInvestment: 5000,
        activationInvestment: 800,
        accumulatedRake: 5800,
        hasImportedPeriods: true,
      }),
    ).toBe('recovering')
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

  it('ORGANIC with investment uses liquid / total', () => {
    const rate = calculateRecoveryRate({
      acquisitionNature: 'ORGANIC',
      campaignInvestment: 1000,
      activationInvestment: 200,
      accumulatedRake: 600,
    })
    expect(rate).toBeCloseTo((600 * 0.82) / 1200 * 100, 5)
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

describe('weekly payback liquid crossing', () => {
  it('crosses on week where liquid sum ≥ cost', () => {
    // Weeks bruto 500+700+300+600=2100; liquid ≈ 1722; cost 1600 → should reach
    const pb = calculateWeeklyPaybackAgainstTotal(1600, [
      { periodStart: '2026-07-06', periodEnd: '2026-07-12', weeklyRake: 500 },
      { periodStart: '2026-07-13', periodEnd: '2026-07-19', weeklyRake: 700 },
      { periodStart: '2026-07-20', periodEnd: '2026-07-26', weeklyRake: 300 },
      { periodStart: '2026-07-27', periodEnd: '2026-08-02', weeklyRake: 600 },
    ])
    expect(pb.reached).toBe(true)
    expect(pb.periodsToPayback).toBe(4)
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
      origin: '-',
      sxType: 'Bônus',
    })
    expect(flags.isBonus).toBe(true)
    expect(flags.isDeposit).toBe(false)
  })

  it('keeps historical agent for player migration weeks', () => {
    const week1 = resolveHistoricalAgentId({
      reportAgentId: 'A',
      receiverPlayerId: '123',
      eventDate: '2026-08-05',
      playerPeriodLinks: [],
    })
    const week2 = resolveHistoricalAgentId({
      reportAgentId: null,
      receiverPlayerId: '123',
      eventDate: '2026-08-12',
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
  it('exposes bruto/taxa/líquido and liquid recovery', () => {
    const m = buildCampaignWeeklyMetrics({
      campaign: {
        investment: 1000,
        capturedPlayers: 100,
        isArchived: false,
        acquisitionNature: 'PAID',
        clubFichasConversions: 40,
      },
      agentPeriods: [
        { periodStart: '2026-07-06', periodEnd: '2026-07-12', weeklyRake: 1300 },
      ],
      uniqueActivePlayers: 20,
      activationInvestment: 200,
    })
    expect(m.totalInvestment).toBe(1200)
    expect(m.accumulatedRake).toBe(1300)
    expect(m.leagueFee).toBeCloseTo(234, 5)
    expect(m.accumulatedRakeLiquid).toBeCloseTo(1066, 5)
    expect(m.recoveryRate).toBeCloseTo((1066 / 1200) * 100, 5)
    expect(m.status).toBe('recovering')
    expect(m.costPerPlayerFunnel).toBeCloseTo(1200 / 40, 5)
  })

  it('adds ATIVAÇÃO on top of campaign investment, not into it', () => {
    expect(
      resolveTotalInvestment({
        acquisitionNature: 'PAID',
        campaignInvestment: 2779.96,
        activationInvestment: 833,
      }),
    ).toBeCloseTo(3612.96)
    expect(
      calculateRecoveryRate({
        acquisitionNature: 'PAID',
        campaignInvestment: 2779.96,
        activationInvestment: 833,
        accumulatedRake: 1800,
      }),
    ).toBeCloseTo(((1800 * 0.82) / 3612.96) * 100, 5)
  })
})
