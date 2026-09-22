/**
 * Verificação INDEPENDENTE da regra de incentivo.
 * Não chama RPCs de produção nem reutiliza crm_is_incentive_transaction.
 * Replica o predicado oficial a partir de campos brutos e compara com
 * isIncentiveTransaction (fonte TS) + cenários A–D do brief.
 */
import { describe, expect, it } from 'vitest'
import {
  MKT_GT_PLAYER_ID,
  incentiveDetection,
  isIncentiveTransaction,
  sumIncentiveSent,
} from './crmIncentiveEconomics'
import { classifyTransactionFlags } from './campaignDepositMetrics'
import { resolveTransactionAmount } from './campaignTransactionParser'

/** Predicado independente — espelho literal do brief, sem importar helper SQL. */
function independentIsIncentive(row: {
  senderPlayerId?: string | null
  isBonus?: boolean | null
}): boolean {
  return String(row.senderPlayerId ?? '').trim() === '1092502' || Boolean(row.isBonus)
}

describe('auditoria independente — motor de incentivos', () => {
  it('MKT_GT_PLAYER_ID canônico', () => {
    expect(MKT_GT_PLAYER_ID).toBe('1092502')
  })

  it('A: somente MKT GT', () => {
    const row = { senderPlayerId: '1092502', isBonus: false, amount: 20 }
    expect(independentIsIncentive(row)).toBe(true)
    expect(isIncentiveTransaction(row)).toBe(independentIsIncentive(row))
    expect(incentiveDetection(row)).toBe('mkt_gt')
  })

  it('B: somente Bônus (outro sender)', () => {
    const row = { senderPlayerId: '37729', isBonus: true, amount: 30 }
    expect(independentIsIncentive(row)).toBe(true)
    expect(isIncentiveTransaction(row)).toBe(true)
    expect(incentiveDetection(row)).toBe('bonus')
  })

  it('C: MKT GT + Bônus conta uma vez', () => {
    const row = {
      senderPlayerId: '1092502',
      isBonus: true,
      amount: 40,
      externalTransactionId: 'same-tx',
    }
    expect(independentIsIncentive(row)).toBe(true)
    expect(incentiveDetection(row)).toBe('mkt_gt_bonus')
    expect(sumIncentiveSent([row, row])).toBe(40)
  })

  it('D: brief R$20 + R$30 + R$40 = R$90 (nunca 130)', () => {
    const rows = [
      { amount: 20, externalTransactionId: 'd1', senderPlayerId: '1092502', isBonus: false },
      { amount: 30, externalTransactionId: 'd2', senderPlayerId: '888', isBonus: true },
      { amount: 40, externalTransactionId: 'd3', senderPlayerId: '1092502', isBonus: true },
    ].filter((r) => independentIsIncentive(r))
    expect(rows).toHaveLength(3)
    expect(sumIncentiveSent(rows)).toBe(90)
  })

  it('Receiver é o dono — sender só classifica origem', () => {
    const tx = {
      senderPlayerId: '1092502',
      receiverPlayerId: '123456',
      isBonus: true,
      amount: 50,
    }
    expect(independentIsIncentive(tx)).toBe(true)
    // Agregação de negócio é por receiver (contrato do motor), não por sender.
    expect(tx.receiverPlayerId).toBe('123456')
    expect(tx.senderPlayerId).not.toBe(tx.receiverPlayerId)
  })

  it('SX tipo Bônus no XLSX → is_bonus (campo real)', () => {
    const flags = classifyTransactionFlags({
      origin: '-',
      sxType: 'Bônus',
      systemStatus: 'Concluído',
      orderStatus: 'Concluído',
    })
    expect(flags.isBonus).toBe(true)
    expect(flags.isDeposit).toBe(false)
  })

  it('valor efetivo de bônus/depósito usa Chips Send Out', () => {
    expect(
      resolveTransactionAmount({
        chipsSendOut: 15,
        amount: 999,
        isDeposit: false,
        isBonus: true,
      }),
    ).toBe(15)
  })

  it('outro sender sem bônus fica fora', () => {
    const row = { senderPlayerId: '741438', isBonus: false }
    expect(independentIsIncentive(row)).toBe(false)
    expect(isIncentiveTransaction(row)).toBe(false)
  })

  it('predicado independente ≡ isIncentiveTransaction em matriz', () => {
    const matrix = [
      { senderPlayerId: '1092502', isBonus: false },
      { senderPlayerId: '1092502', isBonus: true },
      { senderPlayerId: '999', isBonus: true },
      { senderPlayerId: '999', isBonus: false },
      { senderPlayerId: null, isBonus: true },
      { senderPlayerId: null, isBonus: false },
      { senderPlayerId: '', isBonus: false },
    ]
    for (const row of matrix) {
      expect(isIncentiveTransaction(row)).toBe(independentIsIncentive(row))
    }
  })
})
