import { describe, expect, it } from 'vitest'
import {
  calculateRecoveryRate,
  calculateWeeklyPaybackAgainstTotal,
  toLeagueFee,
  toLiquidRake,
  LEAGUE_FEE_RATE,
} from './campaignEconomics'
import {
  createDefaultDefinition,
  SEGMENT_FIELDS,
} from './segmentDefinition'
import {
  isIncentiveTransaction,
  computeIncentiveEconomics,
  MKT_GT_PLAYER_ID,
} from './crmIncentiveEconomics'

describe('usabilidade B2C — economia líquida campanhas', () => {
  it('exemplo controlado: 1000+200 / rake bruto 1300', () => {
    const bruto = 1300
    expect(LEAGUE_FEE_RATE).toBe(0.18)
    expect(toLeagueFee(bruto)).toBeCloseTo(234, 5)
    expect(toLiquidRake(bruto)).toBeCloseTo(1066, 5)

    const recovery = calculateRecoveryRate({
      acquisitionNature: 'PAID',
      campaignInvestment: 1000,
      activationInvestment: 200,
      accumulatedRake: bruto,
    })
    expect(recovery).toBeCloseTo(88.8333, 2)

    const payback = calculateWeeklyPaybackAgainstTotal(1200, [
      { periodStart: '2026-01-01', periodEnd: '2026-01-07', weeklyRake: 1300 },
    ])
    expect(payback.reached).toBe(false)
  })

  it('payback líquido: bruto suficiente para líquido >= custo', () => {
    const brutoNeeded = 1200 / 0.82
    const payback = calculateWeeklyPaybackAgainstTotal(1200, [
      { periodStart: '2026-01-01', periodEnd: '2026-01-07', weeklyRake: brutoNeeded },
    ])
    expect(payback.reached).toBe(true)
    expect(payback.periodsToPayback).toBe(1)
  })
})

describe('usabilidade B2C — incentivos OR + dedupe mental', () => {
  it('A MKT GT', () => {
    expect(isIncentiveTransaction({ senderPlayerId: MKT_GT_PLAYER_ID, isBonus: false })).toBe(true)
  })
  it('B outro + bônus', () => {
    expect(isIncentiveTransaction({ senderPlayerId: '999', isBonus: true })).toBe(true)
  })
  it('C MKT + bônus conta uma vez (mesma TX)', () => {
    expect(isIncentiveTransaction({ senderPlayerId: MKT_GT_PLAYER_ID, isBonus: true })).toBe(true)
  })
  it('E outro não bônus', () => {
    expect(isIncentiveTransaction({ senderPlayerId: '999', isBonus: false })).toBe(false)
  })
  it('H disponível negativo', () => {
    const e = computeIncentiveEconomics({ rakeBrutoHistorico: 1000, incentivoEnviado: 500 })
    expect(e.limiteIncentivo).toBeCloseTo(205, 5)
    expect(e.incentivoDisponivel).toBeCloseTo(205 - 500, 5)
    expect(e.incentivoDisponivel).toBeLessThan(0)
  })
})

describe('usabilidade B2C — segmentações', () => {
  it('definição vazia inicial tem 1 grupo AND', () => {
    const def = createDefaultDefinition()
    expect(def.groupLogic).toBe('or')
    expect(def.groups).toHaveLength(1)
    expect(def.groups[0].logic).toBe('and')
    expect(def.groups[0].conditions.length).toBeGreaterThan(0)
  })

  it('campos inventariados cobrem identidade/rake/incentivo', () => {
    const fields = new Set(SEGMENT_FIELDS.map((f) => f.value))
    expect(fields.has('player_id')).toBe(true)
    expect(fields.has('rake_30d')).toBe(true)
    expect(fields.has('incentive_available')).toBe(true)
    expect(fields.has('has_campaign')).toBe(true)
  })
})
