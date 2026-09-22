import { BOARD_ID, supabase } from '../lib/supabase'
import { crmOriginLabel } from '../utils/crmPlayerIdentity'
import {
  INCENTIVE_CLASSIFICATIONS,
  computeIncentiveEconomics,
  incentiveDetection,
  type IncentiveClassification,
} from '../utils/crmIncentiveEconomics'
import type {
  CrmDataFreshness,
  CrmIncentiveClassificationUpdate,
  CrmIncentiveEconomics,
  CrmIncentiveHistoryItem,
  CrmListQuery,
  CrmPlayer360,
  CrmPlayerListItem,
  CrmPlayerListResult,
} from '../types/crm'

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s ? s : null
}

function asClassification(value: unknown): IncentiveClassification | null {
  const s = asString(value)
  if (!s) return null
  return (INCENTIVE_CLASSIFICATIONS as readonly string[]).includes(s)
    ? (s as IncentiveClassification)
    : null
}

function mapIncentiveEconomics(raw: Record<string, unknown> | null | undefined): CrmIncentiveEconomics {
  if (!raw) {
    return computeIncentiveEconomics({ rakeBrutoHistorico: 0, incentivoEnviado: 0 })
  }
  return {
    rakeBrutoHistorico: asNumber(raw.rakeBrutoHistorico),
    taxaLiga: asNumber(raw.taxaLiga),
    rakeLiquidoHistorico: asNumber(raw.rakeLiquidoHistorico),
    percentualLimite: asNumber(raw.percentualLimite, 0.25),
    limiteIncentivo: asNumber(raw.limiteIncentivo),
    incentivoEnviado: asNumber(raw.incentivoEnviado),
    incentivoDisponivel: asNumber(raw.incentivoDisponivel),
  }
}

function mapIncentiveHistoryItem(raw: Record<string, unknown>): CrmIncentiveHistoryItem {
  const senderPlayerId = asString(raw.senderPlayerId)
  const isBonus =
    typeof raw.isBonus === 'boolean'
      ? raw.isBonus
      : raw.isBonus == null
        ? null
        : Boolean(raw.isBonus)
  const detectionRaw = asString(raw.detection)
  const detection =
    detectionRaw ??
    incentiveDetection({ senderPlayerId, isBonus }) ??
    null

  return {
    externalTransactionId: String(raw.externalTransactionId ?? ''),
    occurredAt: asString(raw.occurredAt),
    amount: asNumber(raw.amount),
    agentId: asString(raw.agentId),
    classification: asClassification(raw.classification),
    product: asString(raw.product),
    purpose: asString(raw.purpose),
    notes: asString(raw.notes),
    classifiedBy: asString(raw.classifiedBy),
    classifiedAt: asString(raw.classifiedAt),
    senderPlayerId,
    senderNickname: asString(raw.senderNickname),
    receiverNickname: asString(raw.receiverNickname),
    sxType: asString(raw.sxType),
    clubCode: asString(raw.clubCode),
    clubName: asString(raw.clubName),
    isBonus,
    detection,
  }
}

function mapListItem(raw: Record<string, unknown>): CrmPlayerListItem {
  const campaigns = Array.isArray(raw.campaigns)
    ? (raw.campaigns as Record<string, unknown>[]).map((c) => ({
        campaignId: String(c.campaignId ?? ''),
        campaignName: asString(c.campaignName),
        agentId: asString(c.agentId),
        acquiredAt: asString(c.acquiredAt),
      }))
    : []

  return {
    playerId: String(raw.playerId ?? ''),
    name: asString(raw.name),
    nickname: asString(raw.nickname),
    currentAgentId: asString(raw.currentAgentId),
    currentAgentName: asString(raw.currentAgentName),
    accumulatedRake: asNumber(raw.accumulatedRake),
    lastRakePeriodStart: asString(raw.lastRakePeriodStart),
    lastRakePeriodEnd: asString(raw.lastRakePeriodEnd),
    lastActivityDate: asString(raw.lastActivityDate),
    hasCampaign: Boolean(raw.hasCampaign),
    campaignCount: asNumber(raw.campaignCount),
    campaigns,
    originLabel:
      asString(raw.originLabel) ??
      crmOriginLabel(Boolean(raw.hasCampaign), campaigns[0]?.campaignName),
    limiteIncentivo: asNumber(raw.limiteIncentivo),
    incentivoEnviado: asNumber(raw.incentivoEnviado),
    incentivoDisponivel: asNumber(raw.incentivoDisponivel),
    hasMktGtIncentive: Boolean(raw.hasMktGtIncentive),
    hasPendingClassification: Boolean(raw.hasPendingClassification),
  }
}

export async function fetchCrmPlayerList(
  query: CrmListQuery = {},
): Promise<CrmPlayerListResult> {
  const limit = query.limit ?? 50
  const offset = query.offset ?? 0
  const { data, error } = await supabase.rpc('crm_list_players', {
    p_board_id: BOARD_ID,
    p_search: query.search?.trim() || null,
    p_campaign_filter: query.campaignFilter ?? 'all',
    p_sort: query.sort ?? 'last_activity_desc',
    p_limit: limit,
    p_offset: offset,
    p_incentive_available_filter: query.incentiveAvailableFilter ?? 'all',
    p_incentive_received_filter: query.incentiveReceivedFilter ?? 'all',
    p_club: !query.club || query.club === 'all' ? null : query.club,
  })
  if (error) throw new Error(error.message)

  const payload = (data ?? {}) as Record<string, unknown>
  const rowsRaw = Array.isArray(payload.rows) ? payload.rows : []
  return {
    total: asNumber(payload.total),
    limit: asNumber(payload.limit, limit),
    offset: asNumber(payload.offset, offset),
    rows: rowsRaw.map((row) => mapListItem(row as Record<string, unknown>)),
  }
}

export async function fetchCrmDataFreshness(): Promise<CrmDataFreshness> {
  const { data, error } = await supabase.rpc('crm_data_freshness', {
    p_board_id: BOARD_ID,
  })
  if (error) throw new Error(error.message)
  const payload = (data ?? {}) as Record<string, unknown>
  return {
    boardId: asString(payload.boardId) ?? BOARD_ID,
    rakeUpdatedThrough: asString(payload.rakeUpdatedThrough),
    transactionsUpdatedThrough: asString(payload.transactionsUpdatedThrough),
  }
}

export async function fetchCrmPlayer360(
  playerId: string,
): Promise<CrmPlayer360 | null> {
  const id = playerId.trim()
  if (!id) return null
  const { data, error } = await supabase.rpc('crm_get_player_360', {
    p_board_id: BOARD_ID,
    p_player_id: id,
  })
  if (error) throw new Error(error.message)
  if (data == null) return null

  const raw = data as Record<string, unknown>
  const rake = (raw.rake ?? {}) as Record<string, unknown>
  const tx = (raw.transactions ?? {}) as Record<string, unknown>
  const freshness = (raw.freshness ?? {}) as Record<string, unknown>
  const incentivesRaw = (raw.incentives ?? null) as Record<string, unknown> | null

  return {
    playerId: String(raw.playerId ?? id),
    boardId: String(raw.boardId ?? BOARD_ID),
    name: asString(raw.name),
    nickname: asString(raw.nickname),
    currentAgentId: asString(raw.currentAgentId),
    currentAgentName: asString(raw.currentAgentName),
    rake: {
      accumulatedRake: asNumber(rake.accumulatedRake),
      periodsCount: asNumber(rake.periodsCount),
      firstPeriodStart: asString(rake.firstPeriodStart),
      lastPeriodStart: asString(rake.lastPeriodStart),
      lastPeriodEnd: asString(rake.lastPeriodEnd),
    },
    weeklyRake: Array.isArray(raw.weeklyRake)
      ? (raw.weeklyRake as Record<string, unknown>[]).map((w) => ({
          periodStart: String(w.periodStart ?? ''),
          periodEnd: String(w.periodEnd ?? ''),
          agentId: String(w.agentId ?? ''),
          weeklyRake: asNumber(w.weeklyRake),
          hands: asNumber(w.hands),
          gains: asNumber(w.gains),
        }))
      : [],
    gameProfile: Array.isArray(raw.gameProfile)
      ? (raw.gameProfile as Record<string, unknown>[]).map((g) => ({
          gameType: String(g.gameType ?? 'OUTRO'),
          rake: asNumber(g.rake),
          hands: asNumber(g.hands),
          rows: asNumber(g.rows),
        }))
      : [],
    transactions: {
      depositCount: asNumber(tx.depositCount),
      bonusCount: asNumber(tx.bonusCount),
      depositedVolume: asNumber(tx.depositedVolume),
      bonusVolume: asNumber(tx.bonusVolume),
      recent: Array.isArray(tx.recent)
        ? (tx.recent as Record<string, unknown>[]).map((t) => ({
            id: String(t.id ?? ''),
            externalTransactionId: String(t.externalTransactionId ?? ''),
            occurredAt: asString(t.occurredAt),
            periodStart: asString(t.periodStart),
            periodEnd: asString(t.periodEnd),
            agentId: asString(t.agentId),
            amount: asNumber(t.amount),
            isDeposit: Boolean(t.isDeposit),
            isBonus: Boolean(t.isBonus),
            origin: asString(t.origin),
            transactionType: asString(t.transactionType),
          }))
        : [],
    },
    campaigns: Array.isArray(raw.campaigns)
      ? (raw.campaigns as Record<string, unknown>[]).map((c) => ({
          campaignId: String(c.campaignId ?? ''),
          campaignName: asString(c.campaignName),
          agentId: asString(c.agentId),
          agency: asString(c.agency),
          acquiredAt: asString(c.acquiredAt),
          sourceAgentId: asString(c.sourceAgentId),
          currentAgentId: asString(c.currentAgentId),
          firstSeenWeek: asString(c.firstSeenWeek),
          lastSeenWeek: asString(c.lastSeenWeek),
        }))
      : [],
    hasCampaign: Boolean(raw.hasCampaign),
    incentives: mapIncentiveEconomics(incentivesRaw),
    incentiveHistory: Array.isArray(raw.incentiveHistory)
      ? (raw.incentiveHistory as Record<string, unknown>[]).map(mapIncentiveHistoryItem)
      : [],
    freshness: {
      boardId: asString(freshness.boardId) ?? BOARD_ID,
      rakeUpdatedThrough: asString(freshness.rakeUpdatedThrough),
      transactionsUpdatedThrough: asString(freshness.transactionsUpdatedThrough),
    },
  }
}

export async function updateIncentiveClassification(
  externalTransactionId: string,
  update: CrmIncentiveClassificationUpdate,
  changedBy: string | null = null,
): Promise<void> {
  const txId = externalTransactionId.trim()
  if (!txId) throw new Error('external_transaction_id required')

  const { error } = await supabase.rpc('crm_update_incentive_classification', {
    p_board_id: BOARD_ID,
    p_external_transaction_id: txId,
    p_classification: update.classification,
    p_product: update.product ?? null,
    p_purpose: update.purpose ?? null,
    p_notes: update.notes ?? null,
    p_changed_by: changedBy,
  })
  if (error) throw new Error(error.message)
}
