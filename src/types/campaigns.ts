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
  | 'archived'

export const CAMPAIGN_STATUS_LABELS: Record<CampaignComputedStatus, string> = {
  payback: 'Payback concluído',
  recovering: 'Em recuperação',
  no_return: 'Sem retorno',
  archived: 'Arquivada',
}

export const CAMPAIGN_STATUS_STYLES: Record<CampaignComputedStatus, string> = {
  payback: 'bg-emerald-500/20 text-emerald-300',
  recovering: 'bg-amber-500/20 text-amber-200',
  no_return: 'bg-danger/25 text-danger',
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

export interface Campaign {
  id: string
  boardId: string
  name: string
  acquisitionMonth: number
  acquisitionYear: number
  startDate: string | null
  endDate: string | null
  agency: string | null
  campaignType: string | null
  campaignTypeOther: string | null
  objective: string | null
  audience: string | null
  channel: string | null
  origin: string | null
  campaignUrl: string | null
  notes: string | null
  investment: number
  capturedPlayers: number
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
  capturedPlayers: number
  activePlayers: number
  activationRuleType: ActivationRuleType
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
