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
  payback: 'Payback concluído',
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
  campaignType: string | null
  campaignTypeOther: string | null
  objective: string | null
  audience: string | null
  channel: string | null
  origin: string | null
  campaignUrl: string | null
  notes: string | null
  investment: number
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
  investment: number
  /** Jogadores na agência */
  capturedPlayers: number
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
