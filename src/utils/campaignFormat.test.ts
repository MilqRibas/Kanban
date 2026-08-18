import { describe, expect, it } from 'vitest'
import { coerceBrazilianCount, parseCountInput } from './campaignFormat'

describe('brazilian count parsing', () => {
  it('keeps already-correct integers', () => {
    expect(coerceBrazilianCount(198442)).toBe(198442)
    expect(coerceBrazilianCount(1053)).toBe(1053)
    expect(parseCountInput('65411')).toBe(65411)
  })

  it('expands thousand-separator dots used as decimals', () => {
    expect(coerceBrazilianCount(64.301)).toBe(64301)
    expect(coerceBrazilianCount(29.35)).toBe(29350)
    expect(coerceBrazilianCount(19.764)).toBe(19764)
    expect(coerceBrazilianCount(4.931)).toBe(4931)
    expect(parseCountInput('64.301')).toBe(64301)
    expect(parseCountInput('30.812')).toBe(30812)
  })

  it('accepts 1.234.567 and 64,301', () => {
    expect(parseCountInput('1.234.567')).toBe(1234567)
    expect(parseCountInput('64,301')).toBe(64301)
  })
})
