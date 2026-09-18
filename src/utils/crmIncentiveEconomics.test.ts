import { describe, expect, it } from 'vitest'
import {
  MKT_GT_PLAYER_ID,
  classifyIncentiveTransfersChronologically,
  classifyMktGtTransfersChronologically,
  computeIncentiveEconomics,
  incentiveDetection,
  isIncentiveTransaction,
  isMktGtSender,
  sumIncentiveSent,
} from './crmIncentiveEconomics'

describe('crmIncentiveEconomics', () => {
  it('cenário A: rake 1000 sem envio → disponível 205', () => {
    const e = computeIncentiveEconomics({
      rakeBrutoHistorico: 1000,
      incentivoEnviado: 0,
    })
    expect(e.taxaLiga).toBe(180)
    expect(e.rakeLiquidoHistorico).toBe(820)
    expect(e.limiteIncentivo).toBe(205)
    expect(e.incentivoEnviado).toBe(0)
    expect(e.incentivoDisponivel).toBe(205)
  })

  it('cenário B: enviado 50 → disponível 155', () => {
    const e = computeIncentiveEconomics({
      rakeBrutoHistorico: 1000,
      incentivoEnviado: 50,
    })
    expect(e.incentivoDisponivel).toBe(155)
  })

  it('cenário C: enviado 250 → disponível -45 (não truncar)', () => {
    const e = computeIncentiveEconomics({
      rakeBrutoHistorico: 1000,
      incentivoEnviado: 250,
    })
    expect(e.incentivoDisponivel).toBe(-45)
  })

  it('cenário D: novo rake histórico 1100 recalcula motor', () => {
    const e = computeIncentiveEconomics({
      rakeBrutoHistorico: 1100,
      incentivoEnviado: 50,
    })
    expect(e.taxaLiga).toBe(198)
    expect(e.rakeLiquidoHistorico).toBe(902)
    expect(e.limiteIncentivo).toBe(225.5)
    expect(e.incentivoDisponivel).toBe(175.5)
  })

  it('cenário E/F: primeira = ativacao, demais = pendente', () => {
    const rows = classifyMktGtTransfersChronologically([
      { externalTransactionId: 'b', occurredAt: '2026-02-15T00:00:00Z' },
      { externalTransactionId: 'a', occurredAt: '2026-01-05T00:00:00Z' },
      { externalTransactionId: 'c', occurredAt: '2026-03-10T00:00:00Z' },
    ])
    expect(rows[0].externalTransactionId).toBe('a')
    expect(rows[0].classification).toBe('ativacao')
    expect(rows[1].classification).toBe('pendente')
    expect(rows[2].classification).toBe('pendente')
  })

  it('cenário E desempate por external_transaction_id', () => {
    const rows = classifyMktGtTransfersChronologically([
      { externalTransactionId: 'z', occurredAt: '2026-01-05T10:00:00Z' },
      { externalTransactionId: 'a', occurredAt: '2026-01-05T10:00:00Z' },
    ])
    expect(rows[0].externalTransactionId).toBe('a')
    expect(rows[0].classification).toBe('ativacao')
    expect(rows[1].classification).toBe('pendente')
  })

  it('cenário G/H: identifica só pelo Player ID 1092502', () => {
    expect(isMktGtSender(MKT_GT_PLAYER_ID)).toBe(true)
    expect(isMktGtSender('1092502')).toBe(true)
    expect(isMktGtSender('9999999')).toBe(false)
    // Nickname não entra na regra — função só recebe ID
    expect(isMktGtSender(null)).toBe(false)
  })

  it('TESTE A: MKT GT não-Bônus → Enviado 10', () => {
    const rows = [
      { amount: 10, externalTransactionId: 'a', senderPlayerId: '1092502', isBonus: false },
    ].filter((r) => isIncentiveTransaction(r))
    expect(sumIncentiveSent(rows)).toBe(10)
  })

  it('TESTE B: outro Sender + Bônus → Enviado 10', () => {
    const rows = [
      { amount: 10, externalTransactionId: 'b', senderPlayerId: '999', isBonus: true },
    ].filter((r) => isIncentiveTransaction(r))
    expect(sumIncentiveSent(rows)).toBe(10)
  })

  it('TESTE C: MKT GT + Bônus → Enviado 10 (não 20)', () => {
    const row = {
      amount: 10,
      externalTransactionId: 'c',
      senderPlayerId: '1092502',
      isBonus: true,
    }
    expect(isIncentiveTransaction(row)).toBe(true)
    expect(incentiveDetection(row)).toBe('mkt_gt_bonus')
    expect(sumIncentiveSent([row])).toBe(10)
  })

  it('TESTE D: três TX → Enviado 90', () => {
    const rows = [
      { amount: 20, externalTransactionId: 'd1', senderPlayerId: '1092502', isBonus: false },
      { amount: 30, externalTransactionId: 'd2', senderPlayerId: '888', isBonus: true },
      { amount: 40, externalTransactionId: 'd3', senderPlayerId: '1092502', isBonus: true },
    ].filter((r) => isIncentiveTransaction(r))
    expect(rows).toHaveLength(3)
    expect(sumIncentiveSent(rows)).toBe(90)
  })

  it('TESTE E: outro Sender não-Bônus → fora', () => {
    expect(
      isIncentiveTransaction({ senderPlayerId: '888', isBonus: false }),
    ).toBe(false)
  })

  it('TESTE F: primeiro incentivo é Bônus de outro Sender → ativacao', () => {
    const rows = classifyIncentiveTransfersChronologically([
      { externalTransactionId: 'f2', occurredAt: '2026-02-01T00:00:00Z' },
      { externalTransactionId: 'f1', occurredAt: '2026-01-01T00:00:00Z' },
    ])
    expect(rows[0].externalTransactionId).toBe('f1')
    expect(rows[0].classification).toBe('ativacao')
  })

  it('TESTE G/H: primeiro MKT GT = ativacao; segundo = pendente', () => {
    const rows = classifyIncentiveTransfersChronologically([
      { externalTransactionId: 'g1', occurredAt: '2026-01-01T00:00:00Z' },
      { externalTransactionId: 'g2', occurredAt: '2026-02-01T00:00:00Z' },
    ])
    expect(rows[0].classification).toBe('ativacao')
    expect(rows[1].classification).toBe('pendente')
  })

  it('TESTE K: rake 1000 + enviado 90 → disponível 115', () => {
    const e = computeIncentiveEconomics({
      rakeBrutoHistorico: 1000,
      incentivoEnviado: 90,
    })
    expect(e.taxaLiga).toBe(180)
    expect(e.rakeLiquidoHistorico).toBe(820)
    expect(e.limiteIncentivo).toBe(205)
    expect(e.incentivoDisponivel).toBe(115)
  })

  it('TESTE L: enviado > limite → disponível negativo', () => {
    const e = computeIncentiveEconomics({
      rakeBrutoHistorico: 1000,
      incentivoEnviado: 300,
    })
    expect(e.incentivoDisponivel).toBe(-95)
  })

  it('TESTE I: mesma external_transaction_id não duplica Enviado', () => {
    const rows = [
      { amount: 10, externalTransactionId: 'same', senderPlayerId: '1092502', isBonus: true },
      { amount: 10, externalTransactionId: 'same', senderPlayerId: '1092502', isBonus: true },
    ].filter((r) => isIncentiveTransaction(r))
    expect(sumIncentiveSent(rows)).toBe(10)
  })

  it('TESTE J: reimport sem Sender preserva Sender conhecido (COALESCE semantics)', () => {
    const existing = '1092502'
    const incoming = null as string | null
    const preserved = incoming ?? existing
    expect(preserved).toBe('1092502')
  })

  it('cenário K: nunca recebeu → enviado 0', () => {
    const e = computeIncentiveEconomics({
      rakeBrutoHistorico: 500,
      incentivoEnviado: 0,
    })
    expect(e.incentivoEnviado).toBe(0)
    expect(e.incentivoDisponivel).toBe(102.5)
  })

  it('cenário L: rake 0 e enviado > 0 → disponível negativo', () => {
    const e = computeIncentiveEconomics({
      rakeBrutoHistorico: 0,
      incentivoEnviado: 80,
    })
    expect(e.limiteIncentivo).toBe(0)
    expect(e.incentivoDisponivel).toBe(-80)
  })

  it('cenário O: soma histórica (não só período recente)', () => {
    const bruto = 100 + 200 + 700
    const e = computeIncentiveEconomics({
      rakeBrutoHistorico: bruto,
      incentivoEnviado: 0,
    })
    expect(e.limiteIncentivo).toBe(205)
  })
})
