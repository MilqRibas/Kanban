import { describe, expect, it } from 'vitest'
import { consolidatedRake } from './campaignEconomics'
import {
  aggregatePlayersById,
  extractAgentIdFromBlockHeader,
  isValidAgentId,
  parseAgentReportWorkbook,
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

  it('ignores dummy Agent ID 0 / None from the spreadsheet', () => {
    expect(isValidAgentId('0')).toBe(false)
    expect(isValidAgentId('None')).toBe(false)
    expect(isValidAgentId('1641800')).toBe(true)
    expect(
      extractAgentIdFromBlockHeader(
        'Liga: 128 Slot: 1 Agente: 0 - None',
      ),
    ).toBeNull()
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
        spinStake: 0,
        spinGains: 0,
        spinProfit: 0,
        spinFee: 1,
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
        spinStake: 0,
        spinGains: 0,
        spinProfit: 0,
        spinFee: 2,
        hands: 8,
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].weeklyRake).toBeCloseTo(4.58)
    expect(rows[0].spinFee).toBeCloseTo(3)
    expect(rows[0].hands).toBe(28)
  })
})

function reportSheets(options: {
  agentSpin?: boolean
  playerSpin?: boolean
  taxaTotal?: number
  taxaSpin?: number
}): Map<string, unknown[][]> {
  const taxaTotal = options.taxaTotal ?? 78.65
  const taxaSpin = options.taxaSpin ?? 7.2
  const agentHeader = [
    'Agent ID',
    'Agent name',
    'Semana',
    'Ganhos',
    'Taxa total',
    'Hands',
  ]
  const agentRow: unknown[] = ['1641800', 'CPP01', '28/09/2026 à 04/10/2026', 10, taxaTotal, 4]
  if (options.agentSpin) {
    agentHeader.push('Stake Spin', 'Ganhos Spin', 'Profit Spin', 'Taxa Spin')
    agentRow.push(20, 5, -2, taxaSpin)
  }
  const playerHeader = ['Player ID', 'Player Name', 'Nickname', 'Ganhos', 'Taxa Total', 'Hands']
  const playerRow: unknown[] = ['99', 'Jogador', 'nick', 1, taxaTotal, 4]
  if (options.playerSpin) {
    playerHeader.push('Stake Spin', 'Ganhos Spin', 'Profit Spin', 'Taxa Spin')
    playerRow.push(20, 5, -2, taxaSpin)
  }
  return new Map([
    ['Agentes', [agentHeader, agentRow]],
    [
      'Jogadores',
      [
        ['Semana: 28/09/2026 à 04/10/2026'],
        ['Liga: 128 Slot: 57906 Agente: 1641800 - CPP01'],
        playerHeader,
        playerRow,
      ],
    ],
    [
      'Detalhes de mesa',
      [
        ['Semana: 28/09/2026 à 04/10/2026'],
        ['Liga: 128 Slot: 57906 Agente: 1641800 - CPP01'],
        ['Player ID', 'Tipo', 'Taxa Total'],
        ['99', 'RG', 1],
      ],
    ],
  ])
}

describe('spin columns', () => {
  it('keeps taxa total distinct and reads taxa spin', () => {
    const parsed = parseAgentReportWorkbook(
      reportSheets({ agentSpin: true, playerSpin: true }),
    )
    expect(parsed.agents[0]?.weeklyRake).toBeCloseTo(78.65)
    expect(parsed.agents[0]?.spinFee).toBeCloseTo(7.2)
    expect(parsed.players[0]?.weeklyRake).toBeCloseTo(78.65)
    expect(parsed.players[0]?.spinFee).toBeCloseTo(7.2)
    expect(parsed.players[0]?.spinStake).toBeCloseTo(20)
    expect(
      consolidatedRake(parsed.players[0]?.weeklyRake, parsed.players[0]?.spinFee),
    ).toBeCloseTo(85.85)
  })

  it('accepts an old report without spin columns as taxa spin zero', () => {
    const parsed = parseAgentReportWorkbook(
      reportSheets({ agentSpin: false, playerSpin: false, taxaTotal: 10 }),
    )
    expect(parsed.agents[0]?.weeklyRake).toBe(10)
    expect(parsed.agents[0]?.spinFee).toBe(0)
    expect(parsed.players[0]?.spinFee).toBe(0)
    expect(consolidatedRake(parsed.agents[0]?.weeklyRake, parsed.agents[0]?.spinFee)).toBe(10)
  })
})
