/** Tipos do domínio CRM. Independentes de regras de Campanhas. */

import type { IncentiveClassification, IncentiveEconomics } from '../utils/crmIncentiveEconomics'

export type { IncentiveClassification }
export type CrmIncentiveEconomics = IncentiveEconomics

export type CrmCampaignFilter = 'all' | 'with_campaign' | 'without_campaign'

export type CrmIncentiveAvailableFilter = 'all' | 'positive' | 'zero' | 'negative'

export type CrmIncentiveReceivedFilter =
  | 'all'
  | 'received'
  | 'never'
  | 'pending_classification'

export type CrmPlayerSort =
  | 'last_activity_desc'
  | 'last_activity_asc'
  | 'rake_desc'
  | 'rake_asc'
  | 'player_id_asc'
  | 'player_id_desc'
  | 'limite_desc'
  | 'limite_asc'
  | 'disponivel_desc'
  | 'disponivel_asc'
  | 'enviado_desc'
  | 'enviado_asc'

export type CrmCampaignRef = {
  campaignId: string
  campaignName: string | null
  agentId: string | null
  acquiredAt: string | null
}

export type CrmPlayerListItem = {
  playerId: string
  name: string | null
  nickname: string | null
  currentAgentId: string | null
  currentAgentName: string | null
  accumulatedRake: number
  lastRakePeriodStart: string | null
  lastRakePeriodEnd: string | null
  lastActivityDate: string | null
  hasCampaign: boolean
  campaignCount: number
  campaigns: CrmCampaignRef[]
  originLabel: string
  limiteIncentivo: number
  incentivoEnviado: number
  incentivoDisponivel: number
  hasMktGtIncentive: boolean
  hasPendingClassification: boolean
}

export type CrmPlayerListResult = {
  total: number
  limit: number
  offset: number
  rows: CrmPlayerListItem[]
}

export type CrmDataFreshness = {
  boardId: string
  rakeUpdatedThrough: string | null
  transactionsUpdatedThrough: string | null
}

export type CrmPlayer360Campaign = {
  campaignId: string
  campaignName: string | null
  agentId: string | null
  agency: string | null
  acquiredAt: string | null
  sourceAgentId: string | null
  currentAgentId: string | null
  firstSeenWeek: string | null
  lastSeenWeek: string | null
}

export type CrmPlayer360Week = {
  periodStart: string
  periodEnd: string
  agentId: string
  weeklyRake: number
  hands: number
  gains: number
}

export type CrmPlayer360GameSlice = {
  gameType: string
  rake: number
  hands: number
  rows: number
}

export type CrmPlayer360Tx = {
  id: string
  externalTransactionId: string
  occurredAt: string | null
  periodStart: string | null
  periodEnd: string | null
  agentId: string | null
  amount: number
  isDeposit: boolean
  isBonus: boolean
  origin: string | null
  transactionType: string | null
}

export type CrmIncentiveHistoryItem = {
  externalTransactionId: string
  occurredAt: string | null
  amount: number
  agentId: string | null
  classification: IncentiveClassification | null
  product: string | null
  purpose: string | null
  notes: string | null
  classifiedBy: string | null
  classifiedAt: string | null
  senderPlayerId: string | null
  senderNickname?: string | null
  receiverNickname?: string | null
  sxType?: string | null
  clubCode?: string | null
  clubName?: string | null
  isBonus?: boolean | null
  /** Derivado: mkt_gt | bonus | mkt_gt_bonus */
  detection?: 'mkt_gt' | 'bonus' | 'mkt_gt_bonus' | string | null
}

export type CrmPlayer360 = {
  playerId: string
  boardId: string
  name: string | null
  nickname: string | null
  currentAgentId: string | null
  currentAgentName: string | null
  rake: {
    accumulatedRake: number
    periodsCount: number
    firstPeriodStart: string | null
    lastPeriodStart: string | null
    lastPeriodEnd: string | null
  }
  weeklyRake: CrmPlayer360Week[]
  gameProfile: CrmPlayer360GameSlice[]
  transactions: {
    depositCount: number
    bonusCount: number
    depositedVolume: number
    bonusVolume: number
    recent: CrmPlayer360Tx[]
  }
  campaigns: CrmPlayer360Campaign[]
  hasCampaign: boolean
  incentives: CrmIncentiveEconomics
  incentiveHistory: CrmIncentiveHistoryItem[]
  freshness: CrmDataFreshness
}

export type CrmListQuery = {
  search?: string
  campaignFilter?: CrmCampaignFilter
  incentiveAvailableFilter?: CrmIncentiveAvailableFilter
  incentiveReceivedFilter?: CrmIncentiveReceivedFilter
  sort?: CrmPlayerSort
  club?: 'all' | 'sx_club' | 'xtreme_pro'
  limit?: number
  offset?: number
}

export type CrmIncentiveClassificationUpdate = {
  classification: IncentiveClassification
  product?: string | null
  purpose?: string | null
  notes?: string | null
}
