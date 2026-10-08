import { describe, expect, it } from 'vitest'
import {
  compareLeadsByNextContact,
  formatIsoDay,
  leadMovesToPersist,
  nextContactRank,
} from './pipelineLeads'

const today = '2026-10-06'

describe('pipeline next contact order', () => {
  it('puts overdue leads before missing dates and future dates', () => {
    const leads = [
      { id: 'future', nextContactAt: '2026-10-20' },
      { id: 'none', nextContactAt: null },
      { id: 'late', nextContactAt: '2026-10-01' },
      { id: 'today', nextContactAt: '2026-10-06' },
      { id: 'older', nextContactAt: '2026-09-01' },
    ]
    const ordered = [...leads].sort((a, b) =>
      compareLeadsByNextContact(a, b, today),
    )
    expect(ordered.map((lead) => lead.id)).toEqual([
      'older',
      'late',
      'none',
      'today',
      'future',
    ])
  })

  it('treats a missing date as waiting, and today as scheduled', () => {
    expect(nextContactRank(null, today)).toBe(1)
    expect(nextContactRank('2026-10-05', today)).toBe(0)
    expect(nextContactRank('2026-10-06', today)).toBe(2)
  })

  it('formats a calendar day without shifting the date', () => {
    expect(formatIsoDay('2026-10-06')).toBe('06/10/2026')
  })
})

describe('pipeline column moves to persist', () => {
  it('keeps the stage the card had before the column list was rewritten', () => {
    const moves = leadMovesToPersist(
      [
        { id: 'stay', stageId: 'contato' },
        { id: 'moved', stageId: 'novo' },
        { id: 'moved', stageId: 'novo' },
      ],
      'contato',
    )
    expect(moves).toEqual([{ id: 'moved', fromStageId: 'novo' }])
  })
})
