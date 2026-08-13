import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  classifyTransactionFlags,
  resolveHistoricalAgentId,
  sumActivationInvestment,
  buildPurchasePowerMetrics,
} from './campaignDepositMetrics'
import {
  normalizeEntityId,
  parseTransactionReportBuffer,
  resolveTransactionAmount,
} from './campaignTransactionParser'
import {
  buildFunnelSteps,
  buildJourneyEdges,
  stepConversionRate,
} from './campaignFunnelMetrics'
import { calculateRecoveryRate } from './campaignEconomics'

function buildWorkbookBuffer(headers: string[], rows: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Transações')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
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
  it('recognizes Agente player ID and does not swap with Receiver', () => {
    const buffer = buildWorkbookBuffer(REAL_HEADERS, [
      [1001, 555001, 'nickA', 1730032, '03/08/2026', '10:15:00', 'SX 24 Horas', '-', 150, 'Completed'],
      [1002, 555002, 'nickB', 1730032, '03/08/2026', '11:00:00', '-', 'Bônus', 50, 'Completed'],
      [1003, 555001, 'nickA', 999888, '12/08/2026', '09:00:00', 'SX 24 Horas', '', 200, 'Completed'],
    ])
    const parsed = parseTransactionReportBuffer(
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

  it('normalizes numeric and string IDs the same way', () => {
    expect(normalizeEntityId(1730032)).toBe('1730032')
    expect(normalizeEntityId('1730032')).toBe('1730032')
    expect(normalizeEntityId('1730032.0')).toBe('1730032')
  })

  it('uses Dia/Hora for occurredAt, not batch period', () => {
    const buffer = buildWorkbookBuffer(REAL_HEADERS, [
      [1, 10, 'n', 20, '03/08/2026', '14:30:00', 'SX 24 Horas', '-', 100, 'Completed'],
    ])
    const parsed = parseTransactionReportBuffer(buffer, 'file.xlsx')
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
      agentId: 'A',
      activePlayerIds: new Set(['1']),
      accumulatedRake: 10,
    })
    expect(metrics.depositedVolume).toBe(100)
    expect(metrics.depositCount).toBe(1)
    expect(metrics.activationInvestment).toBe(50)
    expect(metrics.bonusCount).toBe(1)
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
    ).toBeCloseTo(90, 5)
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
