import { describe, expect, it } from 'vitest'
import {
  aggregatePlayersById,
  extractAgentIdFromBlockHeader,
  parsePeriodLabel,
} from './campaignReportParser'

describe('agent report format', () => {
  it('parses week labels with à', () => {
    const period = parsePeriodLabel('Semana: 13/07/2026 à 19/07/2026')
    expect(period?.start).toBe('2026-07-13')
    expect(period?.end).toBe('2026-07-19')
  })

  it('reads Agent ID from the Liga/Slot/Agente header row', () => {
    const id = extractAgentIdFromBlockHeader(
      'Liga: 128 - Suprema Union Slot: 57906 - SX Club Agente: 1641800 - CPP01',
    )
    expect(id).toBe('1641800')
  })

  it('aggregates the same player id in the same week', () => {
    const period = parsePeriodLabel('13/07/2026 à 19/07/2026')!
    const rows = aggregatePlayersById([
      {
        agentId: '1641800',
        playerId: '1291336',
        playerName: 'D0cinh0',
        nickname: '',
        period,
        gains: 10,
        weeklyRake: 3.08,
        hands: 20,
      },
      {
        agentId: '1641800',
        playerId: '1291336',
        playerName: 'D0cinh0',
        nickname: '',
        period,
        gains: -5,
        weeklyRake: 1.5,
        hands: 8,
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].weeklyRake).toBeCloseTo(4.58)
    expect(rows[0].hands).toBe(28)
  })
})
