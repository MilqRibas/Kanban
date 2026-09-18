import { describe, expect, it } from 'vitest'
import {
  LEAGUE_FEE_RATE,
  toLeagueFee,
  toLiquidRake,
  calculateRecoveryRate,
} from './campaignEconomics'

describe('usability consolidation — campaign liquid economics', () => {
  it('keeps league fee aligned with CRM (18%)', () => {
    expect(LEAGUE_FEE_RATE).toBe(0.18)
    expect(toLeagueFee(1300)).toBe(234)
    expect(toLiquidRake(1300)).toBe(1066)
  })

  it('recovery uses liquid rake against investment+activation', () => {
    const rate = calculateRecoveryRate({
      acquisitionNature: 'PAID',
      campaignInvestment: 1000,
      activationInvestment: 200,
      accumulatedRake: 1300,
    })
    expect(rate).toBeCloseTo(88.8333, 3)
  })
})
