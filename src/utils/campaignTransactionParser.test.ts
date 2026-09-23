import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import {
  classifyTransactionFlags,
  resolveHistoricalAgentId,
  sumActivationInvestment,
  buildPurchasePowerMetrics,
} from './campaignDepositMetrics'
import {
  parseTransactionReportBuffer,
  resolveTransactionAmount,
} from './campaignTransactionParser'
import {
  buildFunnelSteps,
  buildJourneyEdges,
  stepConversionRate,
} from './campaignFunnelMetrics'
import { calculateRecoveryRate } from './campaignEconomics'

async function buildWorkbookBuffer(headers: string[], rows: unknown[][]): Promise<ArrayBuffer> {
  const result = await writeXlsxFile([headers, ...rows] as (string | number)[][])
  const buf = await result.toBuffer()
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const REAL_HEADERS = [
  'ID',
  'Receiver player ID',
  'Receiver nickname',
  'Agente player ID',
  'Dia',
  'Hora',
  'Origem',
  'SX tipo',
  'Chips Send Out',
  'Order Status',
]

describe('transaction parser — real Suprema headers', () => {
  it('recognizes Agente player ID and does not swap with Receiver', async () => {
    const buffer = await buildWorkbookBuffer(REAL_HEADERS, [
      [1001, 555001, 'nickA', 1730032, '03/08/2026', '10:15:00', 'SX 24 Horas', '-', 150, 'Completed'],
      [1002, 555002, 'nickB', 1730032, '03/08/2026', '11:00:00', '-', 'Bônus', 50, 'Completed'],
      [1003, 555001, 'nickA', 999888, '12/08/2026', '09:00:00', 'SX 24 Horas', '', 200, 'Completed'],
    ])
    const parsed = await parseTransactionReportBuffer(
      buffer,
      'Relatório de transações suprema 13-08-2026-16-21-09.xlsx',
    )
    expect(parsed.uniqueAgentIds.sort()).toEqual(['1730032', '999888'])
    expect(parsed.uniquePlayerIds.sort()).toEqual(['555001', '555002'])
    expect(parsed.depositsCount).toBe(2)
    expect(parsed.bonusesCount).toBe(1)
    expect(parsed.transactions[0].agentId).toBe('1730032')
    expect(parsed.transactions[0].receiverPlayerId).toBe('555001')
    expect(parsed.recognizedHeaders.agentId.toLowerCase()).toContain('agente')
  })

  it('maps Sender player ID and Sender player nickname from real Suprema headers', async () => {
    const headers = [
      'ID',
      'Sender player ID',
      'Sender player nickname',
      'Receiver player ID',
      'Receiver nickname',
      'Agente player ID',
      'Dia',
      'Hora',
      'Origem',
      'SX tipo',
      'Chips Send Out',
      'Chips Claimback',
      'Status sistema',
      'Order status',
    ]
    const buffer = await buildWorkbookBuffer(headers, [
      [
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        1092502,
        'MKT GT',
        555001,
        'playerNick',
        1730032,
        '16/09/2026',
        '15:57:38',
        '-',
        'Bônus',
        50,
        0,
        'Concluído',
        'Concluído',
      ],
      [
        'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        1092502,
        'MKT GT',
        555002,
        'otherNick',
        1708406,
        '16/09/2026',
        '16:01:00',
        '-',
        'Bônus',
        30,
        0,
        'Concluído',
        'Concluído',
      ],
      [
        'c3d4e5f6-a7b8-9012-cdef-123456789012',
        9999999,
        'Other Account',
        555003,
        'third',
        1730032,
        '16/09/2026',
        '16:05:00',
        'SX 24 Horas',
        'Envio de Fichas Jogador',
        100,
        0,
        'Concluído',
        'Concluído',
      ],
    ])
    const parsed = await parseTransactionReportBuffer(
      buffer,
      'Relatório de transações suprema 16-09-2026-15-57-38.xlsx',
    )
    expect(parsed.recognizedHeaders.senderPlayerId).toBe('Sender player ID')
    expect(parsed.recognizedHeaders.senderNickname).toBe('Sender player nickname')
    expect(parsed.warnings.some((w) => w.code === 'sender_column_ok')).toBe(true)
    expect(parsed.warnings.some((w) => w.code === 'missing_sender_column')).toBe(false)

    const mkt = parsed.transactions.filter((t) => t.senderPlayerId === '1092502')
    expect(mkt).toHaveLength(2)
    expect(mkt[0].senderNickname).toBe('MKT GT')
    expect(mkt.map((t) => t.receiverPlayerId).sort()).toEqual(['555001', '555002'])
    expect(mkt.reduce((s, t) => s + t.amount, 0)).toBe(80)

    // Non-MKT sender must not be treated as MKT GT by the parser itself
    expect(parsed.transactions[2].senderPlayerId).toBe('9999999')
    expect(parsed.transactions[2].isDeposit).toBe(true)
  })

  it('maps bare Player ID as sender when Receiver player ID also exists', async () => {
    const headers = [
      'ID',
      'Player ID',
      'Receiver player ID',
      'Agente player ID',
      'Dia',
      'Hora',
      'Origem',
      'SX tipo',
      'Chips Send Out',
      'Order Status',
    ]
    const buffer = await buildWorkbookBuffer(headers, [
      [9001, 1092502, 555001, 1730032, '03/08/2026', '10:15:00', '-', 'Bônus', 50, 'Completed'],
    ])
    const parsed = await parseTransactionReportBuffer(buffer, 'mkt-sample.xlsx')
    expect(parsed.transactions[0].senderPlayerId).toBe('1092502')
    expect(parsed.transactions[0].receiverPlayerId).toBe('555001')
    expect(parsed.transactions[0].agentId).toBe('1730032')
    expect(parsed.recognizedHeaders.senderPlayerId.toLowerCase()).toContain('player')
  })

  it('preserves unmapped columns in raw and warns', async () => {
    const headers = [
      'ID',
      'Receiver player ID',
      'Agente player ID',
      'Dia',
      'Hora',
      'Origem',
      'SX tipo',
      'Chips Send Out',
      'Order Status',
      'Conta misteriosa',
    ]
    const buffer = await buildWorkbookBuffer(headers, [
      [1, 10, 20, '03/08/2026', '10:00:00', 'SX 24 Horas', '-', 100, 'Completed', 'ABC'],
    ])
    const parsed = await parseTransactionReportBuffer(buffer, 'file.xlsx')
    expect(parsed.transactions[0].raw).toBeNull()
    expect(parsed.warnings.some((w) => w.code === 'unmapped_headers')).toBe(true)
    expect(parsed.warnings.some((w) => w.code === 'missing_sender_column')).toBe(true)
  })

  it('uses Dia/Hora for occurredAt, not batch period', async () => {
    const buffer = await buildWorkbookBuffer(REAL_HEADERS, [
      [1, 10, 'n', 20, '03/08/2026', '14:30:00', 'SX 24 Horas', '-', 100, 'Completed'],
    ])
    const parsed = await parseTransactionReportBuffer(buffer, 'file.xlsx')
    expect(parsed.transactions[0].occurredAt).toContain('2026-08-03')
    expect(parsed.transactions[0].occurredAt).toContain('14:30')
  })

  it('uses Chips Send Out as deposit/bonus amount', () => {
    expect(
      resolveTransactionAmount({
        chipsSendOut: 80,
        amount: 1,
        isDeposit: true,
        isBonus: false,
      }),
    ).toBe(80)
    expect(
      resolveTransactionAmount({
        chipsSendOut: 25,
        amount: null,
        isDeposit: false,
        isBonus: true,
      }),
    ).toBe(25)
  })
})

describe('deposit vs bonus classification', () => {
  it('deposit = Origem SX 24 Horas', () => {
    expect(
      classifyTransactionFlags({ origin: 'SX 24 Horas', sxType: '-' }).isDeposit,
    ).toBe(true)
  })

  it('bonus = SX tipo Bônus even when Origem is -', () => {
    const flags = classifyTransactionFlags({ origin: '-', sxType: 'Bônus' })
    expect(flags.isBonus).toBe(true)
    expect(flags.isDeposit).toBe(false)
  })

  it('bonus never enters deposited volume', () => {
    const metrics = buildPurchasePowerMetrics({
      rows: [
        {
          receiverPlayerId: '1',
          agentId: 'A',
          amount: 100,
          periodStart: '2026-08-03',
          periodEnd: '2026-08-09',
          occurredAt: '2026-08-03T10:00:00.000Z',
          isDeposit: true,
          isBonus: false,
        },
        {
          receiverPlayerId: '2',
          agentId: 'A',
          amount: 50,
          periodStart: '2026-08-03',
          periodEnd: '2026-08-09',
          occurredAt: '2026-08-03T11:00:00.000Z',
          isDeposit: false,
          isBonus: true,
        },
      ],
      activePlayerIds: new Set(['1']),
      accumulatedRake: 10,
    })
    expect(metrics.depositedVolume).toBe(100)
    expect(metrics.depositCount).toBe(1)
    expect(metrics.activationInvestment).toBe(50)
    expect(metrics.bonusCount).toBe(1)
  })

  it('separates cohort deposits from agent-window bonuses', () => {
    const metrics = buildPurchasePowerMetrics({
      rows: [
        {
          receiverPlayerId: '1',
          agentId: 'B',
          amount: 300,
          periodStart: '2026-08-17',
          periodEnd: '2026-08-23',
          occurredAt: '2026-08-18T10:00:00.000Z',
          isDeposit: true,
          isBonus: false,
        },
      ],
      bonusRows: [
        {
          receiverPlayerId: '1',
          agentId: 'A',
          amount: 25,
          periodStart: '2026-08-03',
          periodEnd: '2026-08-09',
          occurredAt: '2026-08-03T11:00:00.000Z',
          isDeposit: false,
          isBonus: true,
        },
      ],
      activePlayerIds: new Set(['1']),
      accumulatedRake: 10,
    })
    expect(metrics.depositedVolume).toBe(300)
    expect(metrics.activationInvestment).toBe(25)
  })
})

describe('historical agent attribution', () => {
  it('keeps week X on Agent A when player later moves to B', () => {
    const week1 = resolveHistoricalAgentId({
      reportAgentId: 'A',
      receiverPlayerId: '123',
      eventDate: '2026-08-05',
      playerPeriodLinks: [],
    })
    const week2Fallback = resolveHistoricalAgentId({
      reportAgentId: null,
      receiverPlayerId: '123',
      eventDate: '2026-08-12',
      playerPeriodLinks: [
        {
          playerId: '123',
          agentId: 'B',
          periodStart: '2026-08-10',
          periodEnd: '2026-08-16',
        },
      ],
    })
    expect(week1).toBe('A')
    expect(week2Fallback).toBe('B')
  })

  it('sums activation investment by agent', () => {
    expect(
      sumActivationInvestment(
        [
          { agentId: 'A', isBonus: true, amount: 50 },
          { agentId: 'A', isBonus: true, amount: 100 },
          { agentId: 'B', isBonus: true, amount: 25 },
          { agentId: 'A', isBonus: false, amount: 999 },
        ],
        'A',
      ),
    ).toBe(150)
  })
})

describe('payback + funnel regression', () => {
  it('bonus changes total investment payback', () => {
    expect(
      calculateRecoveryRate({
        acquisitionNature: 'PAID',
        campaignInvestment: 5000,
        activationInvestment: 800,
        accumulatedRake: 5220,
      }),
    ).toBeCloseTo((5220 * 0.82) / 5800 * 100, 5)
  })

  it('organic without investment stays 100%', () => {
    expect(
      calculateRecoveryRate({
        acquisitionNature: 'ORGANIC',
        campaignInvestment: null,
        activationInvestment: 800,
        accumulatedRake: 9999,
      }),
    ).toBe(100)
  })

  it('never treats investment as a funnel conversion stage', () => {
    const steps = buildFunnelSteps(
      {
        acquisitionNature: 'PAID',
        impressions: 203376,
        reach: 55092,
        metaConversations: 254,
        serviceConversations: 185,
        clubConversions: 31,
        clubFichasConversions: 18,
      },
      12,
    )
    expect(steps.some((s) => (s as { key: string }).key === 'investment')).toBe(
      false,
    )
    const edges = buildJourneyEdges(steps)
    expect(edges[0].from.key).toBe('impressions')
    expect(edges[0].to.key).toBe('reach')
    expect(stepConversionRate(203376, 2779.96)).not.toBeNull()
    // UI must not call stepConversionRate(impressions, investment)
    expect(steps[0].key).toBe('impressions')
  })

  it('safeDivide style: null not Infinity', () => {
    expect(stepConversionRate(10, 0)).toBeNull()
    expect(stepConversionRate(null, 10)).toBeNull()
  })
})
