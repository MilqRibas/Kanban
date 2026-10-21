import { describe, expect, it } from 'vitest'
import { computeRakeOverDeposits } from './rakeOverDeposits'

describe('computeRakeOverDeposits', () => {
  it('fica pendente sem validação de cobertura', () => {
    const r = computeRakeOverDeposits({
      rakeBruto: 100,
      depositsValid: 50,
      depositsCoverageValidated: false,
    })
    expect(r.status).toBe('unavailable_pending_validation')
    expect(r.percent).toBeNull()
  })

  it('calcula quando validado', () => {
    const r = computeRakeOverDeposits({
      rakeBruto: 100,
      depositsValid: 50,
      depositsCoverageValidated: true,
    })
    expect(r.status).toBe('ready')
    expect(r.percent).toBe(200)
  })

  it('não divide por zero', () => {
    const r = computeRakeOverDeposits({
      rakeBruto: 100,
      depositsValid: 0,
      depositsCoverageValidated: true,
    })
    expect(r.status).toBe('unavailable_zero_deposits')
    expect(r.percent).toBeNull()
  })
})
