import { describe, expect, it } from 'vitest'
import { parseMoneyInput } from './clubCaseApi'

describe('parseMoneyInput', () => {
  it('aceita ponto e vírgula', () => {
    expect(parseMoneyInput('101774.73')).toBe(101774.73)
    expect(parseMoneyInput('101774,73')).toBe(101774.73)
    expect(parseMoneyInput('101.774,73')).toBe(101774.73)
    expect(parseMoneyInput(100)).toBe(100)
    expect(parseMoneyInput('0')).toBe(0)
  })

  it('rejeita inválidos', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('abc')).toBeNull()
  })
})
