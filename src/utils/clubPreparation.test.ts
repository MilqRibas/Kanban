import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import { parseTransactionReportBuffer } from './campaignTransactionParser'
import {
  consolidateXtremeCase,
  crossClubActivity,
  incentiveSentByClub,
  isGloballyInactive,
  rakeLimitByClub,
  resolveClubCode,
  resolveImportClub,
} from './clubDimension'
import { buildCampaignPlayerAlerts } from './campaignPlayerAlerts'

async function xlsx(headers: string[], rows: unknown[][]) {
  const result = await writeXlsxFile([headers, ...rows] as (string | number)[][])
  const buf = await result.toBuffer()
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const HEADERS = [
  'ID',
  'Sender player ID',
  'Sender player nickname',
  'Receiver player ID',
  'Receiver nickname',
  'SX tipo',
  'Chips Send Out',
  'Nome do clube',
  'Dia',
  'Hora',
]

describe('preparação Xtreme — mesmo parser', () => {
  it('SX e Xtreme passam pelo mesmo parser; só muda o clube', async () => {
    const row = (club: string, id: string) => [
      id,
      '1092502',
      'MKT GT',
      '123',
      'Nick',
      'Bônus',
      40,
      club,
      '2024-01-01',
      '10:00',
    ]
    const sx = await parseTransactionReportBuffer(
      await xlsx(HEADERS, [row('SX Club', 'tx-sx')]),
      'sx.xlsx',
    )
    const xt = await parseTransactionReportBuffer(
      await xlsx(HEADERS, [row('Xtreme Pro', 'tx-xt')]),
      'xt.xlsx',
    )
    expect(sx.transactions[0]?.clubCode).toBe('sx_club')
    expect(xt.transactions[0]?.clubCode).toBe('xtreme_pro')
    expect(sx.transactions[0]?.senderPlayerId).toBe(xt.transactions[0]?.senderPlayerId)
    expect(sx.transactions[0]?.amount).toBe(40)
    expect(xt.transactions[0]?.amount).toBe(40)
  })

  it('ID numérico de clube não vira código', () => {
    expect(resolveClubCode('57906')).toBeNull()
    expect(resolveClubCode('SX Club')).toBe('sx_club')
    expect(resolveImportClub({ fileClubName: 'Xtreme Pro', importClub: 'sx_club' })).toBe(
      'xtreme_pro',
    )
    expect(resolveImportClub({ fileClubName: null, importClub: 'sx_club' })).toBe('sx_club')
  })
})

describe('cross-club e alertas (fixtures)', () => {
  it('Xtreme antigo + SX recente: um jogador, rake soma, última atividade SX, sem alerta', () => {
    const periods = [
      {
        playerId: '123',
        clubCode: 'xtreme_pro' as const,
        periodStart: '2023-01-02',
        periodEnd: '2023-01-08',
        weeklyRake: 1000,
      },
      {
        playerId: '123',
        clubCode: 'sx_club' as const,
        periodStart: '2026-01-05',
        periodEnd: '2026-01-11',
        weeklyRake: 2000,
      },
    ]
    const cross = crossClubActivity(periods).byPlayer.get('123')
    expect(cross?.clubs.sort()).toEqual(['sx_club', 'xtreme_pro'])
    expect(cross?.consolidatedRake).toBe(3000)
    expect(cross?.lastGlobalActivity).toBe('2026-01-11')
    expect(
      isGloballyInactive({
        lastActivitySx: '2026-01-11',
        lastActivityXtreme: '2023-01-08',
        referenceEnd: '2026-01-18',
        minInactiveDays: 14,
      }),
    ).toBe(false)

    const alerts = buildCampaignPlayerAlerts({
      periods: periods.map((p) => ({
        playerId: p.playerId,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        weeklyRake: p.weeklyRake,
      })),
      members: [{ playerId: '123', acquiredAt: '2023-01-02' }],
      referencePeriodEnd: '2026-01-11',
    })
    expect(alerts.some((a) => a.kind === 'relevant_inactive')).toBe(false)
  })

  it('inverte os clubes e continua sem alerta global', () => {
    expect(
      isGloballyInactive({
        lastActivitySx: '2023-01-08',
        lastActivityXtreme: '2026-01-11',
        referenceEnd: '2026-01-18',
        minInactiveDays: 14,
      }),
    ).toBe(false)
  })

  it('os dois antigos podem gerar inatividade', () => {
    expect(
      isGloballyInactive({
        lastActivitySx: '2023-01-08',
        lastActivityXtreme: '2023-02-01',
        referenceEnd: '2026-01-18',
        minInactiveDays: 14,
      }),
    ).toBe(true)
  })
})

describe('incentivo e limite por clube (fixtures)', () => {
  it('Xtreme 20+30 e SX 40 = 50 / 40 / 90', () => {
    const sent = incentiveSentByClub(
      [
        {
          externalTransactionId: 'a',
          receiverPlayerId: '123',
          senderPlayerId: '1092502',
          isBonus: false,
          amount: 20,
          clubCode: 'xtreme_pro',
        },
        {
          externalTransactionId: 'b',
          receiverPlayerId: '123',
          senderPlayerId: '999',
          isBonus: true,
          amount: 30,
          clubCode: 'xtreme_pro',
        },
        {
          externalTransactionId: 'c',
          receiverPlayerId: '123',
          senderPlayerId: '1092502',
          isBonus: true,
          amount: 40,
          clubCode: 'sx_club',
        },
      ],
      '123',
    )
    expect(sent.xtreme_pro).toBe(50)
    expect(sent.sx_club).toBe(40)
    expect(sent.all).toBe(90)
  })

  it('rake 1000/2000 gera limites 205 / 410 / 615', () => {
    const econ = rakeLimitByClub({
      rakeSx: 2000,
      rakeXtreme: 1000,
      sentSx: 40,
      sentXtreme: 50,
    })
    expect(econ.xtreme.rakeLiquidoHistorico).toBe(820)
    expect(econ.xtreme.limiteIncentivo).toBe(205)
    expect(econ.xtreme.incentivoDisponivel).toBe(155)
    expect(econ.sx.rakeLiquidoHistorico).toBe(1640)
    expect(econ.sx.limiteIncentivo).toBe(410)
    expect(econ.sx.incentivoDisponivel).toBe(370)
    expect(econ.all.rakeBrutoHistorico).toBe(3000)
    expect(econ.all.rakeLiquidoHistorico).toBe(2460)
    expect(econ.all.limiteIncentivo).toBe(615)
    expect(econ.all.incentivoDisponivel).toBe(525)
  })
})

describe('case Xtreme consolidado', () => {
  it('agências A+B+C viram um agregado e payback usa rake líquido', () => {
    const result = consolidateXtremeCase({
      investment: 1000,
      activation: 200,
      agencies: [
        { agentId: 'A', agentName: 'Agência A', weeklyRake: 500, players: 10, activePlayers: 4, deposits: 100 },
        { agentId: 'B', agentName: 'Agência B', weeklyRake: 500, players: 8, activePlayers: 3, deposits: 80 },
        { agentId: 'C', agentName: 'Agência C', weeklyRake: 500, players: 6, activePlayers: 2, deposits: 40 },
      ],
    })
    expect(result.label).toBe('XTREME PRO')
    expect(result.agencyCount).toBe(3)
    expect(result.agencies).toHaveLength(3)
    expect(result.rakeBruto).toBe(1500)
    expect(result.rakeLiquido).toBeCloseTo(1230)
    expect(result.totalCost).toBe(1200)
    expect(result.payback).toBe(true)
    expect(result.recovery).toBeCloseTo(1230 / 1200)
  })
})
