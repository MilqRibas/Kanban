import { describe, expect, it } from 'vitest'
import {
  findRakeImportConflicts,
  normalizeSlotName,
  rakeClubsMatch,
  rakeSlotsMatch,
} from './rakeImportConflict'
import { aggregateAgentsById, type ParsedAgentRow } from './campaignReportParser'

describe('rake import conflict', () => {
  it('normaliza slot name', () => {
    expect(normalizeSlotName('  CPP 02 ')).toBe('cpp 02')
    expect(normalizeSlotName(null)).toBe('')
  })

  it('clube: SX não conflita com Xtreme; NULL casa com SX legado', () => {
    expect(rakeClubsMatch('sx_club', 'sx_club')).toBe(true)
    expect(rakeClubsMatch('sx_club', 'xtreme_pro')).toBe(false)
    expect(rakeClubsMatch(null, 'xtreme_pro')).toBe(false)
    expect(rakeClubsMatch(null, 'sx_club')).toBe(true)
    expect(rakeClubsMatch(null, null)).toBe(true)
  })

  it('slot name diferente não casa', () => {
    expect(rakeSlotsMatch('CPP01', 'CPP02')).toBe(false)
    expect(rakeSlotsMatch('CPP01', 'cpp01')).toBe(true)
    expect(rakeSlotsMatch(null, null)).toBe(true)
  })

  it('conflito só no mesmo período + clube + slot', () => {
    const existing = [
      {
        agentId: '1',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-07',
        importId: 'imp-sx',
        clubCode: 'sx_club',
        slotName: 'CPP01',
      },
      {
        agentId: '1',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-07',
        importId: 'imp-xt',
        clubCode: 'xtreme_pro',
        slotName: 'CPP01',
      },
    ]
    const incoming = [
      {
        agentId: '1',
        period: { start: '2026-01-01', end: '2026-01-07' },
        slotName: 'CPP01',
      },
    ]

    const vsSx = findRakeImportConflicts({
      incomingAgents: incoming,
      existingPeriods: existing,
      incomingClub: 'sx_club',
    })
    expect(vsSx.map((r) => r.importId)).toEqual(['imp-sx'])

    const vsXt = findRakeImportConflicts({
      incomingAgents: incoming,
      existingPeriods: existing,
      incomingClub: 'xtreme_pro',
    })
    expect(vsXt.map((r) => r.importId)).toEqual(['imp-xt'])

    const otherSlot = findRakeImportConflicts({
      incomingAgents: [{ ...incoming[0]!, slotName: 'CPP02' }],
      existingPeriods: existing,
      incomingClub: 'sx_club',
    })
    expect(otherSlot).toHaveLength(0)
  })
})

describe('aggregateAgentsById com slot', () => {
  it('não mistura o mesmo agent com slots diferentes', () => {
    const period = { start: '2026-01-01', end: '2026-01-07', label: 'w' }
    const rows: ParsedAgentRow[] = [
      {
        agentId: '10',
        agentName: 'A',
        league: null,
        slot: '1',
        slotName: 'CPP01',
        client: null,
        period,
        gains: 0,
        weeklyRake: 100,
        hands: 1,
      },
      {
        agentId: '10',
        agentName: 'A',
        league: null,
        slot: '2',
        slotName: 'CPP02',
        client: null,
        period,
        gains: 0,
        weeklyRake: 50,
        hands: 1,
      },
    ]
    const aggregated = aggregateAgentsById(rows)
    expect(aggregated).toHaveLength(2)
    expect(aggregated.map((a) => a.weeklyRake).sort((a, b) => a - b)).toEqual([50, 100])
  })
})
