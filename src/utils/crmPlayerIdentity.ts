import type { CrmPlayerListItem } from '../types/crm'

/** Pure helpers used by CRM mapping — kept testable without Supabase. */
export function crmOriginLabel(hasCampaign: boolean, campaignName?: string | null): string {
  if (!hasCampaign) return 'Base Geral'
  return campaignName?.trim() || 'Campanha'
}

export function crmDisplayName(row: {
  name: string | null
  nickname: string | null
  playerId: string
}): string {
  return row.nickname || row.name || row.playerId
}

export function mergeLogicalPlayerIds(sources: string[][]): string[] {
  return [...new Set(sources.flat().map((id) => id.trim()).filter(Boolean))].sort()
}

export function assertNoInventedRake(row: Pick<CrmPlayerListItem, 'accumulatedRake'>): number {
  const n = Number(row.accumulatedRake)
  return Number.isFinite(n) ? n : 0
}
