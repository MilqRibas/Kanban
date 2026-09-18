import { describe, expect, it } from 'vitest'
import {
  createDefaultDefinition,
  createEmptyCondition,
  createEmptyGroup,
  isEmptyDefinition,
  sanitizeDefinition,
} from './segmentDefinition'

describe('segmentDefinition', () => {
  it('builds a default definition with one group and one condition', () => {
    const def = createDefaultDefinition()
    expect(def.groupLogic).toBe('or')
    expect(def.groups).toHaveLength(1)
    expect(def.groups[0].logic).toBe('and')
    expect(def.groups[0].conditions).toHaveLength(1)
    expect(def.groups[0].conditions[0].field).toBe('accumulated_rake')
  })

  it('detects empty groups / empty definition', () => {
    expect(isEmptyDefinition({ groupLogic: 'or', groups: [] })).toBe(true)
    expect(isEmptyDefinition({ groupLogic: 'and', groups: [{ logic: 'and', conditions: [] }] })).toBe(
      true,
    )
    expect(isEmptyDefinition(createDefaultDefinition())).toBe(false)
    expect(isEmptyDefinition(null)).toBe(true)
  })

  it('sanitize drops empty groups and keeps valid conditions', () => {
    const cleaned = sanitizeDefinition({
      groupLogic: 'and',
      groups: [
        { logic: 'or', conditions: [] },
        {
          logic: 'and',
          conditions: [
            createEmptyCondition('nickname'),
            { field: '', op: 'eq', value: '' },
          ],
        },
      ],
    })
    expect(cleaned.groupLogic).toBe('and')
    expect(cleaned.groups).toHaveLength(1)
    expect(cleaned.groups[0].conditions).toHaveLength(1)
    expect(cleaned.groups[0].conditions[0].field).toBe('nickname')
  })

  it('createEmptyGroup starts with one condition', () => {
    const group = createEmptyGroup()
    expect(group.conditions).toHaveLength(1)
  })
})
