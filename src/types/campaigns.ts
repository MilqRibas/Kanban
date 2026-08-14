export const CAMPAIGN_TYPE_OPTIONS = [
  'Agência padrão',
  'Ticket',
  'VIP',
  'All-in',
  'Satélite',
  'Reativação',
  'Comunidade',
  'Outro',
] as const

export type CampaignTypeOption = (typeof CAMPAIGN_TYPE_OPTIONS)[number]

export const ACQUISITION_NATURE_OPTIONS = ['PAID', 'ORGANIC'] as const
export type AcquisitionNature = (typeof ACQUISITION_NATURE_OPTIONS)[number]

export const ACQUISITION_NATURE_LABELS: Record<AcquisitionNature, string> = {
  PAID: 'Campanha Paga',
  ORGANIC: 'Captação Orgânica',
}

export const ACTIVATION_RULE_OPTIONS = [
  'rake_gt_zero',
  'rake_gt_050',
  'custom_minimum',
  'manual_count',
  'custom_rule',
] as const

export type ActivationRuleType = (typeof ACTIVATION_RULE_OPTIONS)[number]

export const ACTIVATION_RULE_LABELS: Record<ActivationRuleType, string> = {
  rake_gt_zero: 'Rake maior que zero',
  rake_gt_050: 'Rake maior que R$ 0,50',
  custom_minimum: 'Valor mínimo personalizado',
  manual_count: 'Quantidade manual de ativos',
  custom_rule: 'Regra personalizada',
}

export type CampaignComputedStatus =
  | 'payback'
  | 'recovering'
  | 'no_return'
  | 'no_data'
  | 'archived'

export const CAMPAIGN_STATUS_LABELS: Record<CampaignComputedStatus, string> = {
  payback: 'Payback',
  recovering: 'Em recuperação',
  no_return: 'Sem retorno',
  no_data: 'Sem dados importados',
  archived: 'Arquivada',
}

export const CAMPAIGN_STATUS_STYLES: Record<CampaignComputedStatus, string> = {
  payback: 'bg-emerald-500/20 text-emerald-300',
  recovering: 'bg-amber-500/20 text-amber-200',
  no_return: 'bg-danger/25 text-danger',
  no_data: 'bg-white/10 text-text-muted',
  archived: 'bg-white/10 text-text-secondary',
}

export type CampaignHistoryAction =
  | 'created'
  | 'updated'
  | 'monthly_created'
  | 'monthly_updated'
  | 'investment_changed'
  | 'players_changed'
  | 'archived'
  | 'restored'
  | 'duplicated'
  | 'deleted'
  | 'report_imported'
  | 'report_replaced'
  | 'report_reprocessed'
  | 'agency_linked'
  | 'agency_unlinked'
  | 'nature_changed'
  | 'funnel_changed'
  | 'transactions_imported'
  | 'transactions_replaced'
  | 'transactions_deleted'

export interface Campaign {
  id: string
  boardId: string
  name: string
  acquisitionMonth: number
  acquisitionYear: number
  startDate: string | null
  endDate: string | null
  agency: string | null
  /** Agent ID vinculado (chave da agência). */
  agentId: string | null
  /** Natureza da aquisição — default PAID para legado. */
  acquisitionNature: AcquisitionNature
  campaignType: string | null
  campaignTypeOther: string | null
  objective: string | null
  audience: string | null
  channel: string | null
  origin: string | null
  campaignUrl: string | null
  notes: string | null
  /** Investimento da Campanha (null = não preenchido). */
  investment: number | null
  impressions: number | null
  reach: number | null
  metaConversations: number | null
  serviceConversations: number | null
  clubConversions: number | null
  clubFichasConversions: number | null
  /** Jogadores na agência (manual). */
  capturedPlayers: number
  /** Legado / cache — ativos únicos vêm dos imports. */
  activePlayers: number
  activationRuleType: ActivationRuleType
  activationMinimumRake: number | null
  activationRuleNotes: string | null
  rakeGoal: number | null
  activePlayersGoal: number | null
  isArchived: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CampaignAgent {
  boardId: string
  agentId: string
  name: string
  firstSeenStart: string | null
  lastSeenStart: string | null
  periodsCount: number
  accumulatedRake: number
  createdAt: string
  updatedAt: string
}

export interface CampaignReportImport {
  id: string
  boardId: string
  originalFilename: string
  periodStart: string
  periodEnd: string
  importedAt: string
  importedBy: string | null
  status: string
  agentsCount: number
  playersCount: number
  tableRowsCount: number
  warnings: unknown
  summary: Record<string, unknown> | null
  replacedImportId: string | null
  createdAt: string
  /** Sempre rake — tipagem para união na UI de Imports. */
  kind?: 'rake'
}

export interface CampaignTransactionImport {
  id: string
  boardId: string
  originalFilename: string
  periodStart: string
  periodEnd: string
  importedAt: string
  importedBy: string | null
  status: string
  transactionsCount: number
  depositsCount: number
  bonusesCount: number
  agentsCount: number
  playersCount: number
  warnings: unknown
  summary: Record<string, unknown> | null
  replacedImportId: string | null
  createdAt: string
  kind?: 'transactions'
}

export interface CampaignTransaction {
  id: string
  boardId: string
  importId: string
  externalTransactionId: string
  receiverPlayerId: string
  receiverNickname: string | null
  agentId: string | null
  agentNickname: string | null
  occurredAt: string | null
  periodStart: string
  periodEnd: string
  origin: string | null
  transactionType: string | null
  amount: number
  chipsSendOut: number | null
  chipsClaimback: number | null
  systemStatus: string | null
  orderStatus: string | null
  isDeposit: boolean
  isBonus: boolean
  raw: Record<string, unknown> | null
  createdAt: string
}

export interface CampaignAgentPeriod {
  id: string
  boardId: string
  importId: string
  agentId: string
  agentName: string
  periodStart: string
  periodEnd: string
  weeklyRake: number
  gains: number
  hands: number
  playersRakeSum: number
  uniquePlayers: number
  reconciliationDiff: number
  createdAt: string
}

export interface CampaignPlayerPeriod {
  id: string
  boardId: string
  importId: string
  agentId: string
  playerId: string
  playerName: string
  nickname: string
  periodStart: string
  periodEnd: string
  weeklyRake: number
  gains: number
  hands: number
  createdAt: string
}

export interface CampaignTableDetail {
  id: string
  boardId: string
  importId: string
  agentId: string
  playerId: string
  periodStart: string
  periodEnd: string
  tableId: string
  gameType: string
  tableName: string
  hands: number
  buyIn: number
  gains: number
  rake: number
  adminFee: number
  createdAt: string
}

/** @deprecated Prefer weekly agent periods. Kept for legacy rows. */
export interface CampaignMonthlyResult {
  id: string
  campaignId: string
  referenceMonth: number
  referenceYear: number
  monthlyRake: number
  monthlyActivePlayers: number | null
  topPlayerRake: number | null
  topThreePlayersRake: number | null
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CampaignHistoryEntry {
  id: string
  campaignId: string
  actionType: CampaignHistoryAction | string
  description: string
  metadata: Record<string, unknown> | null
  createdBy: string | null
  createdAt: string
}

export type CampaignCreateInput = {
  name: string
  acquisitionMonth: number
  acquisitionYear: number
  startDate: string
  /** null = não informado (orgânico sem investimento). */
  investment: number | null
  /** Jogadores na agência */
  capturedPlayers: number
  acquisitionNature?: AcquisitionNature
  impressions?: number | null
  reach?: number | null
  metaConversations?: number | null
  serviceConversations?: number | null
  clubConversions?: number | null
  clubFichasConversions?: number | null
  activationRuleType?: ActivationRuleType
  agentId?: string | null
  endDate?: string | null
  agency?: string | null
  campaignType?: string | null
  campaignTypeOther?: string | null
  objective?: string | null
  audience?: string | null
  channel?: string | null
  origin?: string | null
  campaignUrl?: string | null
  notes?: string | null
  activationMinimumRake?: number | null
  activationRuleNotes?: string | null
  rakeGoal?: number | null
  activePlayersGoal?: number | null
  /** @deprecated ativos são calculados pelos imports */
  activePlayers?: number
}

export type CampaignUpdateInput = Partial<CampaignCreateInput> & {
  isArchived?: boolean
}

export type CampaignMonthlyResultInput = {
  referenceMonth: number
  referenceYear: number
  monthlyRake: number
  monthlyActivePlayers?: number | null
  topPlayerRake?: number | null
  topThreePlayersRake?: number | null
  notes?: string | null
}

export type ImportConflict = {
  periodStart: string
  periodEnd: string
  existingImportIds: string[]
  affectedAgentIds: string[]
}
