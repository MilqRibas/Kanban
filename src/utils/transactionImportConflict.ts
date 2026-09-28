/**
 * Conflito de transações = mesmo período + mesmo clube.
 * NULL no histórico conta como SX (legado). Xtreme não casa com SX.
 */

import type { ClubCode } from './clubDimension'
import { rakeClubsMatch } from './rakeImportConflict'

export function resolveTransactionImportClub(params: {
  rowClubCodes: Array<string | null | undefined>
  importClub?: ClubCode | null
}): string | null {
  const fromRows = [
    ...new Set(
      params.rowClubCodes.filter((code): code is string => Boolean(code)),
    ),
  ]
  if (fromRows.length === 1) return fromRows[0]!
  return params.importClub ?? null
}

export type TransactionImportConflictRow = {
  id: string
  status: string
  periodStart: string
  periodEnd: string
  transactionsCount: number
  agentsCount: number
  clubCode?: string | null
}

export function findTransactionImportConflicts(params: {
  periodStart: string
  periodEnd: string
  incomingClub: string | null
  existingImports: TransactionImportConflictRow[]
}): TransactionImportConflictRow[] {
  return params.existingImports.filter((item) => {
    if (item.status !== 'completed') return false
    if (!rakeClubsMatch(item.clubCode, params.incomingClub)) return false
    const samePeriod =
      item.periodStart === params.periodStart &&
      item.periodEnd === params.periodEnd
    const broken =
      item.transactionsCount > 0 && item.agentsCount === 0
    return samePeriod || broken
  })
}
