import { describe, expect, it } from 'vitest'
import { extractPlayerIdHypothesis, normalizePhoneE164 } from './phoneNormalize'

describe('normalizePhoneE164', () => {
  it('normaliza celular BR com DDD', () => {
    expect(normalizePhoneE164('15 99999-1234')).toBe('+5515999991234')
  })

  it('mantém E.164', () => {
    expect(normalizePhoneE164('+5515999991234')).toBe('+5515999991234')
  })

  it('rejeita curto', () => {
    expect(normalizePhoneE164('123')).toBeNull()
  })
})

describe('extractPlayerIdHypothesis', () => {
  it('extrai de nome com hífen', () => {
    expect(extractPlayerIdHypothesis('Zico - 123456')).toBe('123456')
  })

  it('extrai caso Davi - 1737455', () => {
    expect(extractPlayerIdHypothesis('Davi - 1737455')).toBe('1737455')
  })

  it('não inventa ID', () => {
    expect(extractPlayerIdHypothesis('Zico')).toBeNull()
  })

  it('não pega número no meio do nome', () => {
    expect(extractPlayerIdHypothesis('Sala 12 Poker')).toBeNull()
  })
})
