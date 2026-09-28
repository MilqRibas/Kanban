import { describe, expect, it } from 'vitest'
import { findTransactionImportConflicts } from './transactionImportConflict'

const xtreme = {
  id: 'cti-xtreme',
  status: 'completed',
  periodStart: '2026-09-21',
  periodEnd: '2026-09-27',
  transactionsCount: 530,
  agentsCount: 31,
  clubCode: 'xtreme_pro',
}

describe('transaction import conflict', () => {
  it('SX Club não conflita com Xtreme Pro no mesmo período', () => {
    expect(
      findTransactionImportConflicts({
        periodStart: '2026-09-21',
        periodEnd: '2026-09-27',
        incomingClub: 'sx_club',
        existingImports: [xtreme],
      }),
    ).toEqual([])
  })

  it('mesmo clube e período conflita', () => {
    expect(
      findTransactionImportConflicts({
        periodStart: '2026-09-21',
        periodEnd: '2026-09-27',
        incomingClub: 'xtreme_pro',
        existingImports: [xtreme],
      }).map((row) => row.id),
    ).toEqual(['cti-xtreme'])
  })

  it('import inválido só bloqueia o próprio clube', () => {
    const brokenSx = {
      id: 'cti-broken',
      status: 'completed',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-07',
      transactionsCount: 10,
      agentsCount: 0,
      clubCode: 'sx_club',
    }
    expect(
      findTransactionImportConflicts({
        periodStart: '2026-09-21',
        periodEnd: '2026-09-27',
        incomingClub: 'xtreme_pro',
        existingImports: [brokenSx],
      }),
    ).toEqual([])
    expect(
      findTransactionImportConflicts({
        periodStart: '2026-09-21',
        periodEnd: '2026-09-27',
        incomingClub: 'sx_club',
        existingImports: [brokenSx],
      }).map((row) => row.id),
    ).toEqual(['cti-broken'])
  })
})
