import { describe, expect, it } from 'vitest'
import {
  assertNoInventedRake,
  crmDisplayName,
  crmOriginLabel,
  mergeLogicalPlayerIds,
} from './crmPlayerIdentity'

describe('crmPlayerIdentity', () => {
  it('cenário A/B: origem com e sem campanha', () => {
    expect(crmOriginLabel(true, 'Campanha X')).toBe('Campanha X')
    expect(crmOriginLabel(true, null)).toBe('Campanha')
    expect(crmOriginLabel(false, 'não deve usar')).toBe('Base Geral')
  })

  it('cenário C: rake não inventado', () => {
    expect(assertNoInventedRake({ accumulatedRake: 0 })).toBe(0)
    expect(assertNoInventedRake({ accumulatedRake: Number.NaN })).toBe(0)
  })

  it('cenário D: mesmo Player ID em fontes distintas vira um só', () => {
    const ids = mergeLogicalPlayerIds([
      ['100', '200'],
      ['200', '300'],
      ['100'],
    ])
    expect(ids).toEqual(['100', '200', '300'])
  })

  it('cenário E: identidade canônica é Player ID, nunca nickname', () => {
    expect(
      crmDisplayName({ playerId: '999', nickname: 'nick', name: 'Nome' }),
    ).toBe('nick')
    expect(
      crmDisplayName({ playerId: '999', nickname: null, name: null }),
    ).toBe('999')
  })
})
