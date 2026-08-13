import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  AcquisitionNature,
  ActivationRuleType,
  Campaign,
  CampaignAgent,
  CampaignAgentPeriod,
  CampaignCreateInput,
  CampaignHistoryAction,
  CampaignHistoryEntry,
  CampaignMonthlyResult,
  CampaignMonthlyResultInput,
  CampaignPlayerPeriod,
  CampaignReportImport,
  CampaignTableDetail,
  CampaignTransaction,
  CampaignTransactionImport,
  CampaignUpdateInput,
  ImportConflict,
} from '../types/campaigns'
import { BOARD_ID, supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import {
  aggregateAgentsById,
  aggregatePlayersById,
  buildAgentReconciliations,
  parseAgentReportFile,
  type ParsedReport,
} from '../utils/campaignReportParser'
import {
  buildCampaignWeeklyMetrics,
  buildGameProfile,
  buildRakeHealth,
  accumulatePlayerRake,
  activationRakeThreshold,
  countActivePlayers,
  formatPeriodLabel,
  sumWeeklyRake,
  uniquePlayerIds,
  type CampaignWeeklyMetrics,
} from '../utils/campaignWeeklyMetrics'
import {
  buildOverviewKpis as buildLegacyOverview,
  type OverviewKpis,
} from '../utils/campaignMetrics'
import {
  buildPurchasePowerMetrics,
  resolveHistoricalAgentId,
  sumActivationInvestment,
  type PurchasePowerMetrics,
} from '../utils/campaignDepositMetrics'
import {
  buildFunnelKpis,
  buildFunnelSteps,
  diagnoseFunnel,
  funnelWarnings,
  type FunnelDiagnosis,
  type FunnelKpis,
  type FunnelStep,
  type FunnelWarnings,
} from '../utils/campaignFunnelMetrics'
import { applicableAcquisitionCost } from '../utils/campaignEconomics'
import {
  parseTransactionReportFile,
  mondaySundayContaining,
  type ParsedTransactionReport,
} from '../utils/campaignTransactionParser'

function createCampaignId() {
  return `campaign-${crypto.randomUUID().slice(0, 8)}`
}
function createMonthlyId() {
  return `cmr-${crypto.randomUUID().slice(0, 8)}`
}
function createHistoryId() {
  return `ch-${crypto.randomUUID().slice(0, 8)}`
}
function createImportId() {
  return `cri-${crypto.randomUUID().slice(0, 8)}`
}
function createTransactionImportId() {
  return `cti-${crypto.randomUUID().slice(0, 8)}`
}
function createTransactionId() {
  return `ctx-${crypto.randomUUID().slice(0, 8)}`
}
function createAgentPeriodId() {
  return `cap-${crypto.randomUUID().slice(0, 8)}`
}
function createPlayerPeriodId() {
  return `cpp-${crypto.randomUUID().slice(0, 8)}`
}
function createTableDetailId() {
  return `ctd-${crypto.randomUUID().slice(0, 8)}`
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function collapseParsedReport(parsed: ParsedReport): ParsedReport {
  const agents = aggregateAgentsById(parsed.agents)
  const players = aggregatePlayersById(parsed.players)
  return {
    ...parsed,
    agents,
    players,
    uniqueAgentIds: [...new Set(agents.map((a) => a.agentId))].sort(),
    uniquePlayerIds: [...new Set(players.map((p) => p.playerId))].sort(),
  }
}

function mapCampaign(row: Record<string, unknown>): Campaign {
  const rule = String(row.activation_rule_type ?? 'rake_gt_zero')
  const natureRaw = String(row.acquisition_nature ?? 'PAID').toUpperCase()
  const acquisitionNature: AcquisitionNature =
    natureRaw === 'ORGANIC' ? 'ORGANIC' : 'PAID'
  return {
    id: String(row.id),
    boardId: String(row.board_id ?? BOARD_ID),
    name: String(row.name ?? ''),
    acquisitionMonth: toNumber(row.acquisition_month, 1),
    acquisitionYear: toNumber(row.acquisition_year, new Date().getFullYear()),
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    agency: (row.agency as string | null) ?? null,
    agentId: (row.agent_id as string | null) ?? null,
    acquisitionNature,
    campaignType: (row.campaign_type as string | null) ?? null,
    campaignTypeOther: (row.campaign_type_other as string | null) ?? null,
    objective: (row.objective as string | null) ?? null,
    audience: (row.audience as string | null) ?? null,
    channel: (row.channel as string | null) ?? null,
    origin: (row.origin as string | null) ?? null,
    campaignUrl: (row.campaign_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    investment: toNullableNumber(row.investment),
    impressions: toNullableNumber(row.impressions),
    reach: toNullableNumber(row.reach),
    metaConversations: toNullableNumber(row.meta_conversations),
    serviceConversations: toNullableNumber(row.service_conversations),
    clubConversions: toNullableNumber(row.club_conversions),
    clubFichasConversions: toNullableNumber(row.club_fichas_conversions),
    capturedPlayers: toNumber(row.captured_players),
    activePlayers: toNumber(row.active_players),
    activationRuleType: rule as ActivationRuleType,
    activationMinimumRake: toNullableNumber(row.activation_minimum_rake),
    activationRuleNotes: (row.activation_rule_notes as string | null) ?? null,
    rakeGoal: toNullableNumber(row.rake_goal),
    activePlayersGoal: toNullableNumber(row.active_players_goal),
    isArchived: Boolean(row.is_archived),
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapMonthly(row: Record<string, unknown>): CampaignMonthlyResult {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    referenceMonth: toNumber(row.reference_month, 1),
    referenceYear: toNumber(row.reference_year, new Date().getFullYear()),
    monthlyRake: toNumber(row.monthly_rake),
    monthlyActivePlayers: toNullableNumber(row.monthly_active_players),
    topPlayerRake: toNullableNumber(row.top_player_rake),
    topThreePlayersRake: toNullableNumber(row.top_three_players_rake),
    notes: (row.notes as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapHistory(row: Record<string, unknown>): CampaignHistoryEntry {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    actionType: String(row.action_type),
    description: String(row.description ?? ''),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: String(row.created_at),
  }
}

function mapAgent(row: Record<string, unknown>): CampaignAgent {
  return {
    boardId: String(row.board_id),
    agentId: String(row.agent_id),
    name: String(row.name ?? ''),
    firstSeenStart: (row.first_seen_start as string | null) ?? null,
    lastSeenStart: (row.last_seen_start as string | null) ?? null,
    periodsCount: toNumber(row.periods_count),
    accumulatedRake: toNumber(row.accumulated_rake),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapImport(row: Record<string, unknown>): CampaignReportImport {
  return {
    id: String(row.id),
    boardId: String(row.board_id),
    originalFilename: String(row.original_filename ?? ''),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    importedAt: String(row.imported_at),
    importedBy: (row.imported_by as string | null) ?? null,
    status: String(row.status ?? 'completed'),
    agentsCount: toNumber(row.agents_count),
    playersCount: toNumber(row.players_count),
    tableRowsCount: toNumber(row.table_rows_count),
    warnings: row.warnings ?? null,
    summary: (row.summary as Record<string, unknown> | null) ?? null,
    replacedImportId: (row.replaced_import_id as string | null) ?? null,
    createdAt: String(row.created_at),
    kind: 'rake',
  }
}

function mapTransactionImport(row: Record<string, unknown>): CampaignTransactionImport {
  return {
    id: String(row.id),
    boardId: String(row.board_id),
    originalFilename: String(row.original_filename ?? ''),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    importedAt: String(row.imported_at),
    importedBy: (row.imported_by as string | null) ?? null,
    status: String(row.status ?? 'completed'),
    transactionsCount: toNumber(row.transactions_count),
    depositsCount: toNumber(row.deposits_count),
    bonusesCount: toNumber(row.bonuses_count),
    agentsCount: toNumber(row.agents_count),
    playersCount: toNumber(row.players_count),
    warnings: row.warnings ?? null,
    summary: (row.summary as Record<string, unknown> | null) ?? null,
    replacedImportId: (row.replaced_import_id as string | null) ?? null,
    createdAt: String(row.created_at),
    kind: 'transactions',
  }
}

function mapTransaction(row: Record<string, unknown>): CampaignTransaction {
  return {
    id: String(row.id),
    boardId: String(row.board_id),
    importId: String(row.import_id),
    externalTransactionId: String(row.external_transaction_id ?? ''),
    receiverPlayerId: String(row.receiver_player_id ?? ''),
    receiverNickname: (row.receiver_nickname as string | null) ?? null,
    agentId: (row.agent_id as string | null) ?? null,
    agentNickname: (row.agent_nickname as string | null) ?? null,
    occurredAt: (row.occurred_at as string | null) ?? null,
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    origin: (row.origin as string | null) ?? null,
    transactionType: (row.transaction_type as string | null) ?? null,
    amount: toNumber(row.amount),
    chipsSendOut: toNullableNumber(row.chips_send_out),
    chipsClaimback: toNullableNumber(row.chips_claimback),
    systemStatus: (row.system_status as string | null) ?? null,
    orderStatus: (row.order_status as string | null) ?? null,
    isDeposit: Boolean(row.is_deposit),
    isBonus: Boolean(row.is_bonus),
    raw: (row.raw as Record<string, unknown> | null) ?? null,
    createdAt: String(row.created_at),
  }
}

function mapAgentPeriod(row: Record<string, unknown>): CampaignAgentPeriod {
  return {
    id: String(row.id),
    boardId: String(row.board_id),
    importId: String(row.import_id),
    agentId: String(row.agent_id),
    agentName: String(row.agent_name ?? ''),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    weeklyRake: toNumber(row.weekly_rake),
    gains: toNumber(row.gains),
    hands: toNumber(row.hands),
    playersRakeSum: toNumber(row.players_rake_sum),
    uniquePlayers: toNumber(row.unique_players),
    reconciliationDiff: toNumber(row.reconciliation_diff),
    createdAt: String(row.created_at),
  }
}

function mapPlayerPeriod(row: Record<string, unknown>): CampaignPlayerPeriod {
  return {
    id: String(row.id),
    boardId: String(row.board_id),
    importId: String(row.import_id),
    agentId: String(row.agent_id),
    playerId: String(row.player_id),
    playerName: String(row.player_name ?? ''),
    nickname: String(row.nickname ?? ''),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    weeklyRake: toNumber(row.weekly_rake),
    gains: toNumber(row.gains),
    hands: toNumber(row.hands),
    createdAt: String(row.created_at),
  }
}

function mapTableDetail(row: Record<string, unknown>): CampaignTableDetail {
  return {
    id: String(row.id),
    boardId: String(row.board_id),
    importId: String(row.import_id),
    agentId: String(row.agent_id),
    playerId: String(row.player_id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    tableId: String(row.table_id ?? ''),
    gameType: String(row.game_type ?? ''),
    tableName: String(row.table_name ?? ''),
    hands: toNumber(row.hands),
    buyIn: toNumber(row.buy_in),
    gains: toNumber(row.gains),
    rake: toNumber(row.rake),
    adminFee: toNumber(row.admin_fee),
    createdAt: String(row.created_at),
  }
}

function validateCampaignInput(
  input: CampaignCreateInput | CampaignUpdateInput,
  opts?: { nature?: AcquisitionNature; requirePaidInvestment?: boolean },
) {
  if (input.name !== undefined && !String(input.name).trim()) {
    return 'Nome da campanha é obrigatório.'
  }
  if (input.acquisitionMonth !== undefined) {
    const m = Number(input.acquisitionMonth)
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return 'Mês de aquisição deve estar entre 1 e 12.'
    }
  }
  if (input.acquisitionYear !== undefined) {
    const y = Number(input.acquisitionYear)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      return 'Ano de aquisição inválido.'
    }
  }
  if (input.investment !== undefined && input.investment !== null) {
    if (Number(input.investment) < 0) {
      return 'Investimento não pode ser negativo.'
    }
  }
  const nature = opts?.nature ?? input.acquisitionNature
  if (
    opts?.requirePaidInvestment &&
    nature === 'PAID' &&
    (input.investment === null ||
      input.investment === undefined ||
      !Number.isFinite(Number(input.investment)))
  ) {
    return 'Investimento é obrigatório para campanhas pagas.'
  }
  if (input.capturedPlayers !== undefined && Number(input.capturedPlayers) < 0) {
    return 'Jogadores na agência não pode ser negativo.'
  }
  return null
}

export type ReportPreview = {
  parsed: ParsedReport
  filename: string
  reconciliations: ReturnType<typeof buildAgentReconciliations>
  conflict: ImportConflict | null
  conciliatedCount: number
  divergenceCount: number
}

export type CommitReportResult = {
  importId: string
  periodLabel: string
  agentsCount: number
  playersCount: number
  tableRowsCount: number
  conciliatedCount: number
  divergenceCount: number
  replaced: boolean
  campaignUpdates: Array<{
    campaignId: string
    name: string
    rakeAdded: number
    rakeBefore: number
    rakeAfter: number
    recoveryBefore: number | null
    recoveryAfter: number | null
  }>
}

export type TransactionReportPreview = {
  parsed: ParsedTransactionReport
  filename: string
  conflict: ImportConflict | null
}

export type CommitTransactionResult = {
  importId: string
  periodLabel: string
  transactionsCount: number
  depositsCount: number
  bonusesCount: number
  agentsCount: number
  playersCount: number
  agentsLinkedToCampaigns: number
  agentsWithoutCampaign: number
  agentsWithoutCampaignIds: string[]
  transactionsWithoutAgent: number
  replaced: boolean
  affectedCampaignIds: string[]
  recognizedHeaders: Record<string, string>
}

export const useCampaignsStore = defineStore('campaigns', () => {
  const campaigns = ref<Campaign[]>([])
  const monthlyResults = ref<CampaignMonthlyResult[]>([])
  const history = ref<CampaignHistoryEntry[]>([])
  const agents = ref<CampaignAgent[]>([])
  const imports = ref<CampaignReportImport[]>([])
  const transactionImports = ref<CampaignTransactionImport[]>([])
  const transactions = ref<CampaignTransaction[]>([])
  const agentPeriods = ref<CampaignAgentPeriod[]>([])
  const playerPeriods = ref<CampaignPlayerPeriod[]>([])
  const tableDetailsCache = ref<CampaignTableDetail[]>([])
  const selectedCampaignId = ref<string | null>(null)
  const loading = ref(false)
  const importing = ref(false)
  const ready = ref(false)
  const error = ref<string | null>(null)
  const showArchived = ref(false)

  let channel: RealtimeChannel | null = null
  let suppressRealtimeUntil = 0
  let reloadTimer: ReturnType<typeof setTimeout> | null = null

  const selectedCampaign = computed(
    () =>
      campaigns.value.find((c) => c.id === selectedCampaignId.value) ?? null,
  )

  const visibleCampaigns = computed(() => {
    if (showArchived.value) return campaigns.value
    return campaigns.value.filter((c) => !c.isArchived)
  })

  const selectedMonthlyResults = computed(() => {
    if (!selectedCampaignId.value) return []
    return monthlyResults.value
      .filter((r) => r.campaignId === selectedCampaignId.value)
      .sort((a, b) => {
        if (a.referenceYear !== b.referenceYear) {
          return a.referenceYear - b.referenceYear
        }
        return a.referenceMonth - b.referenceMonth
      })
  })

  const selectedHistory = computed(() => {
    if (!selectedCampaignId.value) return []
    return history.value
      .filter((h) => h.campaignId === selectedCampaignId.value)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
  })

  const completedImports = computed(() =>
    imports.value
      .filter((i) => i.status === 'completed')
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
  )

  const completedTransactionImports = computed(() =>
    transactionImports.value
      .filter((i) => i.status === 'completed')
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
  )

  function quietRealtime(ms = 2500) {
    suppressRealtimeUntil = Date.now() + ms
  }

  function open(id: string) {
    selectedCampaignId.value = id
  }

  function close() {
    selectedCampaignId.value = null
  }

  function setShowArchived(value: boolean) {
    showArchived.value = value
  }

  function agentPeriodsFor(agentId: string | null | undefined) {
    if (!agentId) return []
    return agentPeriods.value
      .filter((p) => p.agentId === agentId)
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
  }

  function playerPeriodsForAgent(agentId: string | null | undefined) {
    if (!agentId) return []
    return playerPeriods.value
      .filter((p) => p.agentId === agentId)
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
  }

  function uniqueActivesForAgent(agentId: string | null | undefined) {
    return uniquePlayerIds(playerPeriodsForAgent(agentId)).length
  }

  function uniqueActivesForCampaign(campaign: Campaign) {
    return countActivePlayers(
      playerPeriodsForAgent(campaign.agentId),
      activationRakeThreshold(campaign),
    )
  }

  function canArchiveCampaign() {
    return useAuthStore().isAdmin
  }

  function canDeleteCampaign(campaign: Campaign) {
    const auth = useAuthStore()
    if (!auth.memberId) return false
    if (auth.isAdmin || !campaign.createdBy) return true
    return campaign.createdBy === auth.memberId
  }

  function metricsFor(campaign: Campaign): CampaignWeeklyMetrics {
    const periods = agentPeriodsFor(campaign.agentId).map((p) => ({
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      weeklyRake: p.weeklyRake,
      uniquePlayers: p.uniquePlayers,
    }))
    return buildCampaignWeeklyMetrics({
      campaign,
      agentPeriods: periods,
      uniqueActivePlayers: uniqueActivesForCampaign(campaign),
      activationInvestment: activationInvestmentFor(campaign.agentId),
    })
  }

  function activationInvestmentFor(agentId: string | null | undefined) {
    return sumActivationInvestment(transactions.value, agentId)
  }

  function activePlayerIdSet(campaign: Campaign): Set<string> {
    const threshold = activationRakeThreshold(campaign)
    const periods = playerPeriodsForAgent(campaign.agentId)
    if (threshold === null) {
      return new Set(uniquePlayerIds(periods))
    }
    return new Set(
      accumulatePlayerRake(
        periods.map((p) => ({
          playerId: p.playerId,
          weeklyRake: p.weeklyRake,
          name: p.playerName,
          nickname: p.nickname,
        })),
      )
        .filter((p) => p.rake > threshold)
        .map((p) => p.playerId),
    )
  }

  function purchasePowerFor(campaign: Campaign): PurchasePowerMetrics {
    const m = metricsFor(campaign)
    return buildPurchasePowerMetrics({
      rows: transactions.value,
      agentId: campaign.agentId,
      activePlayerIds: activePlayerIdSet(campaign),
      accumulatedRake: m.accumulatedRake,
    })
  }

  function funnelFor(campaign: Campaign): {
    steps: FunnelStep[]
    kpis: FunnelKpis
    diagnosis: FunnelDiagnosis
    warnings: FunnelWarnings
  } {
    const m = metricsFor(campaign)
    const steps = buildFunnelSteps(campaign, m.uniqueActivePlayers)
    const applicableCost = applicableAcquisitionCost({
      acquisitionNature: campaign.acquisitionNature,
      campaignInvestment: campaign.investment,
      activationInvestment: m.activationInvestment,
    })
    const kpis = buildFunnelKpis(campaign, applicableCost, m.uniqueActivePlayers)
    return {
      steps,
      kpis,
      diagnosis: diagnoseFunnel(steps, kpis),
      warnings: funnelWarnings(campaign),
    }
  }

  function playerDepositStats(playerId: string, agentId?: string | null) {
    const scoped = transactions.value.filter(
      (t) =>
        t.receiverPlayerId === playerId &&
        t.isDeposit &&
        (!agentId || t.agentId === agentId),
    )
    const volume = scoped.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0)
    return {
      depositCount: scoped.length,
      depositedVolume: volume,
      firstDepositAt:
        scoped
          .map((t) => t.occurredAt || t.periodStart)
          .filter(Boolean)
          .sort()[0] ?? null,
      lastDepositAt:
        scoped
          .map((t) => t.occurredAt || t.periodStart)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
    }
  }

  function rakeHealthFor(
    campaign: Campaign,
    periodStart?: string | null,
  ) {
    const rows = playerPeriodsForAgent(campaign.agentId).filter(
      (p) => !periodStart || p.periodStart === periodStart,
    )
    const players = periodStart
      ? rows.map((r) => ({
          playerId: r.playerId,
          name: r.playerName,
          nickname: r.nickname,
          rake: r.weeklyRake,
        }))
      : accumulatePlayerRake(
          rows.map((r) => ({
            playerId: r.playerId,
            weeklyRake: r.weeklyRake,
            name: r.playerName,
            nickname: r.nickname,
          })),
        )
    return buildRakeHealth(players)
  }

  function gameProfileFor(
    campaign: Campaign,
    tableRows: CampaignTableDetail[],
    periodStart?: string | null,
  ) {
    const filtered = tableRows.filter(
      (r) =>
        r.agentId === campaign.agentId &&
        (!periodStart || r.periodStart === periodStart),
    )
    return buildGameProfile(
      filtered.map((r) => ({
        gameType: r.gameType,
        playerId: r.playerId,
        rake: r.rake,
      })),
    )
  }

  function overviewKpis(): OverviewKpis & {
    recoveringCount: number
    noDataCount: number
    averageRakePerActive: number | null
  } {
    const list = visibleCampaigns.value.filter((c) => !c.isArchived)
    let totalInvestment = 0
    let totalAccumulatedRake = 0
    let rakeForRecovery = 0
    let investmentForRecovery = 0
    let totalCaptured = 0
    let totalActive = 0
    let paybackCount = 0
    let recoveringCount = 0
    let noDataCount = 0

    for (const campaign of list) {
      const m = metricsFor(campaign)
      totalAccumulatedRake += m.accumulatedRake
      totalCaptured += campaign.capturedPlayers
      totalActive += m.uniqueActivePlayers
      if (m.totalInvestment != null) {
        totalInvestment += m.totalInvestment
        investmentForRecovery += m.totalInvestment
        rakeForRecovery += m.accumulatedRake
      }
      if (m.status === 'payback') paybackCount += 1
      if (m.status === 'recovering') recoveringCount += 1
      if (m.status === 'no_data') noDataCount += 1
    }

    const activationRate =
      totalCaptured > 0 ? (totalActive / totalCaptured) * 100 : null
    const recoveryRate =
      investmentForRecovery > 0
        ? (rakeForRecovery / investmentForRecovery) * 100
        : null
    const costPerActive =
      totalActive > 0 && totalInvestment > 0
        ? totalInvestment / totalActive
        : null
    const averageRakePerActive =
      totalActive > 0 ? totalAccumulatedRake / totalActive : null

    return {
      totalInvestment,
      totalAccumulatedRake,
      totalCaptured,
      totalActive,
      activationRate,
      recoveryRate,
      paybackCount,
      costPerActive,
      recoveringCount,
      noDataCount,
      averageRakePerActive,
    }
  }

  async function appendHistory(
    campaignId: string,
    actionType: CampaignHistoryAction,
    description: string,
    metadata?: Record<string, unknown> | null,
  ) {
    const auth = useAuthStore()
    const now = new Date().toISOString()
    const row = {
      id: createHistoryId(),
      campaign_id: campaignId,
      action_type: actionType,
      description,
      metadata: metadata ?? null,
      created_by: auth.memberId,
      created_at: now,
    }
    const { error: insertError } = await supabase
      .from('campaign_history')
      .insert(row)
    if (insertError) {
      console.warn('[campaigns] history', insertError.message)
      return
    }
    history.value = [mapHistory(row), ...history.value]
  }

  async function load() {
    loading.value = true
    error.value = null

    const [
      campaignsRes,
      monthlyRes,
      historyRes,
      agentsRes,
      importsRes,
      txImportsRes,
      transactionsRes,
      agentPeriodsRes,
      playerPeriodsRes,
    ] = await Promise.all([
      supabase
        .from('campaigns')
        .select('*')
        .eq('board_id', BOARD_ID)
        .order('updated_at', { ascending: false }),
      supabase.from('campaign_monthly_results').select('*'),
      supabase
        .from('campaign_history')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('campaign_agents').select('*').eq('board_id', BOARD_ID),
      supabase
        .from('campaign_report_imports')
        .select('*')
        .eq('board_id', BOARD_ID)
        .order('period_start', { ascending: false }),
      supabase
        .from('campaign_transaction_imports')
        .select('*')
        .eq('board_id', BOARD_ID)
        .order('period_start', { ascending: false }),
      supabase
        .from('campaign_transactions')
        .select('*')
        .eq('board_id', BOARD_ID)
        .limit(50000),
      supabase
        .from('campaign_agent_periods')
        .select('*')
        .eq('board_id', BOARD_ID),
      supabase
        .from('campaign_player_periods')
        .select('*')
        .eq('board_id', BOARD_ID),
    ])

    const firstError =
      campaignsRes.error ||
      monthlyRes.error ||
      historyRes.error ||
      agentsRes.error ||
      importsRes.error ||
      txImportsRes.error ||
      transactionsRes.error ||
      agentPeriodsRes.error ||
      playerPeriodsRes.error

    if (firstError) {
      error.value = firstError.message
      useToastStore().error(firstError.message)
      loading.value = false
      return
    }

    campaigns.value = (campaignsRes.data ?? []).map((row) =>
      mapCampaign(row as Record<string, unknown>),
    )
    const campaignIds = new Set(campaigns.value.map((c) => c.id))
    monthlyResults.value = (monthlyRes.data ?? [])
      .map((row) => mapMonthly(row as Record<string, unknown>))
      .filter((row) => campaignIds.has(row.campaignId))
    history.value = (historyRes.data ?? [])
      .map((row) => mapHistory(row as Record<string, unknown>))
      .filter((row) => campaignIds.has(row.campaignId))
    agents.value = (agentsRes.data ?? []).map((row) =>
      mapAgent(row as Record<string, unknown>),
    )
    imports.value = (importsRes.data ?? []).map((row) =>
      mapImport(row as Record<string, unknown>),
    )
    transactionImports.value = (txImportsRes.data ?? []).map((row) =>
      mapTransactionImport(row as Record<string, unknown>),
    )
    transactions.value = (transactionsRes.data ?? []).map((row) =>
      mapTransaction(row as Record<string, unknown>),
    )
    agentPeriods.value = (agentPeriodsRes.data ?? []).map((row) =>
      mapAgentPeriod(row as Record<string, unknown>),
    )
    playerPeriods.value = (playerPeriodsRes.data ?? []).map((row) =>
      mapPlayerPeriod(row as Record<string, unknown>),
    )

    loading.value = false
  }

  function subscribeRealtime() {
    unsubscribeRealtime()
    channel = supabase
      .channel(`campaigns:${BOARD_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_monthly_results' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_history' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_agents' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_report_imports' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_agent_periods' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_player_periods' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_transaction_imports' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_transactions' }, scheduleReload)
      .subscribe()
  }

  function scheduleReload() {
    if (Date.now() < suppressRealtimeUntil) return
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      if (Date.now() < suppressRealtimeUntil) return
      void load()
    }, 700)
  }

  function unsubscribeRealtime() {
    if (reloadTimer) {
      clearTimeout(reloadTimer)
      reloadTimer = null
    }
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  async function init() {
    await load()
    subscribeRealtime()
    ready.value = true
    // Imports antigos com AGENTES=0 são irrecuperáveis (IDs trocados) — limpa para reimport.
    const broken = transactionImports.value.filter(
      (i) =>
        i.status === 'completed' &&
        i.transactionsCount > 0 &&
        i.agentsCount === 0,
    )
    if (broken.length > 0) {
      void purgeBrokenTransactionImports()
    }
  }

  function reset() {
    unsubscribeRealtime()
    campaigns.value = []
    monthlyResults.value = []
    history.value = []
    agents.value = []
    imports.value = []
    transactionImports.value = []
    transactions.value = []
    agentPeriods.value = []
    playerPeriods.value = []
    tableDetailsCache.value = []
    selectedCampaignId.value = null
    loading.value = false
    importing.value = false
    ready.value = false
    error.value = null
    showArchived.value = false
  }

  async function create(input: CampaignCreateInput) {
    const toast = useToastStore()
    const auth = useAuthStore()
    const nature: AcquisitionNature = input.acquisitionNature ?? 'PAID'
    const validation = validateCampaignInput(input, {
      nature,
      requirePaidInvestment: true,
    })
    if (validation) {
      toast.error(validation)
      return null
    }
    if (!input.startDate?.trim()) {
      toast.error('Data de início é obrigatória.')
      return null
    }

    const agentId = input.agentId?.trim() || null
    const agent = agentId
      ? agents.value.find((a) => a.agentId === agentId)
      : null
    const agencyName =
      input.agency?.trim() || agent?.name || null

    const now = new Date().toISOString()
    const id = createCampaignId()
    const investment =
      input.investment === null || input.investment === undefined
        ? null
        : Number(input.investment)
    const row = {
      id,
      board_id: BOARD_ID,
      name: input.name.trim(),
      acquisition_month: input.acquisitionMonth,
      acquisition_year: input.acquisitionYear,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      agency: agencyName,
      agent_id: agentId,
      acquisition_nature: nature,
      campaign_type: input.campaignType?.trim() || null,
      campaign_type_other: input.campaignTypeOther?.trim() || null,
      objective: input.objective?.trim() || null,
      audience: input.audience?.trim() || null,
      channel: input.channel?.trim() || null,
      origin: input.origin?.trim() || null,
      campaign_url: input.campaignUrl?.trim() || null,
      notes: input.notes?.trim() || null,
      investment,
      impressions: input.impressions ?? null,
      reach: input.reach ?? null,
      meta_conversations: input.metaConversations ?? null,
      service_conversations: input.serviceConversations ?? null,
      club_conversions: input.clubConversions ?? null,
      club_fichas_conversions: input.clubFichasConversions ?? null,
      captured_players: Number(input.capturedPlayers),
      active_players: Number(input.activePlayers ?? 0),
      activation_rule_type: input.activationRuleType ?? 'rake_gt_zero',
      activation_minimum_rake: input.activationMinimumRake ?? null,
      activation_rule_notes: input.activationRuleNotes?.trim() || null,
      rake_goal: input.rakeGoal ?? null,
      active_players_goal: input.activePlayersGoal ?? null,
      is_archived: false,
      created_by: auth.memberId,
      created_at: now,
      updated_at: now,
    }

    quietRealtime()
    const { error: insertError } = await supabase.from('campaigns').insert(row)
    if (insertError) {
      error.value = insertError.message
      toast.error(insertError.message)
      return null
    }

    const campaign = mapCampaign(row)
    campaigns.value = [campaign, ...campaigns.value]
    await appendHistory(id, 'created', `Criou a campanha ${campaign.name}.`)
    if (agentId) {
      await appendHistory(id, 'agency_linked', `Vinculou a agência ${agentId}.`, {
        agentId,
      })
    }
    toast.success('Campanha criada.')
    return campaign
  }

  async function update(id: string, patch: CampaignUpdateInput) {
    const toast = useToastStore()
    const campaign = campaigns.value.find((c) => c.id === id)
    if (!campaign) return false

    const nextNature: AcquisitionNature =
      patch.acquisitionNature ?? campaign.acquisitionNature
    const merged: CampaignUpdateInput = {
      name: patch.name ?? campaign.name,
      acquisitionMonth: patch.acquisitionMonth ?? campaign.acquisitionMonth,
      acquisitionYear: patch.acquisitionYear ?? campaign.acquisitionYear,
      startDate: patch.startDate ?? campaign.startDate ?? undefined,
      investment:
        patch.investment !== undefined ? patch.investment : campaign.investment,
      capturedPlayers: patch.capturedPlayers ?? campaign.capturedPlayers,
      activationRuleType: patch.activationRuleType ?? campaign.activationRuleType,
      acquisitionNature: nextNature,
      ...patch,
    }

    const validation = validateCampaignInput(merged, {
      nature: nextNature,
      requirePaidInvestment: true,
    })
    if (validation) {
      toast.error(validation)
      return false
    }

    const nextAgentId =
      patch.agentId !== undefined
        ? patch.agentId?.trim() || null
        : campaign.agentId
    const agent = nextAgentId
      ? agents.value.find((a) => a.agentId === nextAgentId)
      : null

    const dbPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (patch.name !== undefined) dbPatch.name = patch.name.trim()
    if (patch.acquisitionMonth !== undefined) {
      dbPatch.acquisition_month = patch.acquisitionMonth
    }
    if (patch.acquisitionYear !== undefined) {
      dbPatch.acquisition_year = patch.acquisitionYear
    }
    if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate
    if (patch.endDate !== undefined) dbPatch.end_date = patch.endDate
    if (patch.agency !== undefined) {
      dbPatch.agency = patch.agency?.trim() || null
    } else if (patch.agentId !== undefined && agent) {
      dbPatch.agency = agent.name
    }
    if (patch.agentId !== undefined) dbPatch.agent_id = nextAgentId
    if (patch.acquisitionNature !== undefined) {
      dbPatch.acquisition_nature = patch.acquisitionNature
    }
    if (patch.campaignType !== undefined) {
      dbPatch.campaign_type = patch.campaignType?.trim() || null
    }
    if (patch.campaignTypeOther !== undefined) {
      dbPatch.campaign_type_other = patch.campaignTypeOther?.trim() || null
    }
    if (patch.objective !== undefined) {
      dbPatch.objective = patch.objective?.trim() || null
    }
    if (patch.audience !== undefined) {
      dbPatch.audience = patch.audience?.trim() || null
    }
    if (patch.channel !== undefined) {
      dbPatch.channel = patch.channel?.trim() || null
    }
    if (patch.origin !== undefined) {
      dbPatch.origin = patch.origin?.trim() || null
    }
    if (patch.campaignUrl !== undefined) {
      dbPatch.campaign_url = patch.campaignUrl?.trim() || null
    }
    if (patch.notes !== undefined) dbPatch.notes = patch.notes?.trim() || null
    if (patch.investment !== undefined) {
      dbPatch.investment =
        patch.investment === null ? null : Number(patch.investment)
    }
    if (patch.impressions !== undefined) dbPatch.impressions = patch.impressions
    if (patch.reach !== undefined) dbPatch.reach = patch.reach
    if (patch.metaConversations !== undefined) {
      dbPatch.meta_conversations = patch.metaConversations
    }
    if (patch.serviceConversations !== undefined) {
      dbPatch.service_conversations = patch.serviceConversations
    }
    if (patch.clubConversions !== undefined) {
      dbPatch.club_conversions = patch.clubConversions
    }
    if (patch.clubFichasConversions !== undefined) {
      dbPatch.club_fichas_conversions = patch.clubFichasConversions
    }
    if (patch.capturedPlayers !== undefined) {
      dbPatch.captured_players = Number(patch.capturedPlayers)
    }
    if (patch.activePlayers !== undefined) {
      dbPatch.active_players = Number(patch.activePlayers)
    }
    if (patch.activationRuleType !== undefined) {
      dbPatch.activation_rule_type = patch.activationRuleType
    }
    if (patch.activationMinimumRake !== undefined) {
      dbPatch.activation_minimum_rake = patch.activationMinimumRake
    }
    if (patch.activationRuleNotes !== undefined) {
      dbPatch.activation_rule_notes = patch.activationRuleNotes?.trim() || null
    }
    if (patch.rakeGoal !== undefined) dbPatch.rake_goal = patch.rakeGoal
    if (patch.activePlayersGoal !== undefined) {
      dbPatch.active_players_goal = patch.activePlayersGoal
    }
    if (patch.isArchived !== undefined) dbPatch.is_archived = patch.isArchived

    quietRealtime()
    const { error: updateError } = await supabase
      .from('campaigns')
      .update(dbPatch)
      .eq('id', id)

    if (updateError) {
      error.value = updateError.message
      toast.error(updateError.message)
      return false
    }

    const funnelChanged =
      (patch.impressions !== undefined &&
        patch.impressions !== campaign.impressions) ||
      (patch.reach !== undefined && patch.reach !== campaign.reach) ||
      (patch.metaConversations !== undefined &&
        patch.metaConversations !== campaign.metaConversations) ||
      (patch.serviceConversations !== undefined &&
        patch.serviceConversations !== campaign.serviceConversations) ||
      (patch.clubConversions !== undefined &&
        patch.clubConversions !== campaign.clubConversions) ||
      (patch.clubFichasConversions !== undefined &&
        patch.clubFichasConversions !== campaign.clubFichasConversions)

    if (
      patch.acquisitionNature !== undefined &&
      patch.acquisitionNature !== campaign.acquisitionNature
    ) {
      await appendHistory(
        id,
        'nature_changed',
        `Alterou a natureza de ${campaign.name}.`,
        { from: campaign.acquisitionNature, to: patch.acquisitionNature },
      )
    } else if (
      patch.investment !== undefined &&
      patch.investment !== campaign.investment
    ) {
      await appendHistory(
        id,
        'investment_changed',
        `Alterou o investimento de ${campaign.name}.`,
        { from: campaign.investment, to: patch.investment },
      )
    } else if (funnelChanged) {
      await appendHistory(
        id,
        'funnel_changed',
        `Atualizou o funil de desempenho de ${campaign.name}.`,
      )
    } else if (
      patch.capturedPlayers !== undefined &&
      patch.capturedPlayers !== campaign.capturedPlayers
    ) {
      await appendHistory(
        id,
        'players_changed',
        `Alterou jogadores na agência de ${campaign.name}.`,
        {
          from: campaign.capturedPlayers,
          to: patch.capturedPlayers,
        },
      )
    } else if (
      patch.agentId !== undefined &&
      nextAgentId !== campaign.agentId
    ) {
      if (nextAgentId) {
        await appendHistory(id, 'agency_linked', `Vinculou a agência ${nextAgentId}.`, {
          agentId: nextAgentId,
          from: campaign.agentId,
        })
      } else {
        await appendHistory(
          id,
          'agency_unlinked',
          `Desvinculou a agência ${campaign.agentId}.`,
          { from: campaign.agentId },
        )
      }
    } else {
      await appendHistory(id, 'updated', `Editou a campanha ${campaign.name}.`)
    }

    Object.assign(
      campaign,
      mapCampaign({
        ...campaign,
        name: dbPatch.name ?? campaign.name,
        acquisition_month:
          dbPatch.acquisition_month ?? campaign.acquisitionMonth,
        acquisition_year: dbPatch.acquisition_year ?? campaign.acquisitionYear,
        start_date: dbPatch.start_date ?? campaign.startDate,
        end_date:
          dbPatch.end_date !== undefined ? dbPatch.end_date : campaign.endDate,
        agency: dbPatch.agency !== undefined ? dbPatch.agency : campaign.agency,
        agent_id:
          dbPatch.agent_id !== undefined ? dbPatch.agent_id : campaign.agentId,
        acquisition_nature:
          dbPatch.acquisition_nature ?? campaign.acquisitionNature,
        campaign_type:
          dbPatch.campaign_type !== undefined
            ? dbPatch.campaign_type
            : campaign.campaignType,
        campaign_type_other:
          dbPatch.campaign_type_other !== undefined
            ? dbPatch.campaign_type_other
            : campaign.campaignTypeOther,
        objective:
          dbPatch.objective !== undefined
            ? dbPatch.objective
            : campaign.objective,
        audience:
          dbPatch.audience !== undefined ? dbPatch.audience : campaign.audience,
        channel:
          dbPatch.channel !== undefined ? dbPatch.channel : campaign.channel,
        origin: dbPatch.origin !== undefined ? dbPatch.origin : campaign.origin,
        campaign_url:
          dbPatch.campaign_url !== undefined
            ? dbPatch.campaign_url
            : campaign.campaignUrl,
        notes: dbPatch.notes !== undefined ? dbPatch.notes : campaign.notes,
        investment:
          dbPatch.investment !== undefined
            ? dbPatch.investment
            : campaign.investment,
        impressions:
          dbPatch.impressions !== undefined
            ? dbPatch.impressions
            : campaign.impressions,
        reach: dbPatch.reach !== undefined ? dbPatch.reach : campaign.reach,
        meta_conversations:
          dbPatch.meta_conversations !== undefined
            ? dbPatch.meta_conversations
            : campaign.metaConversations,
        service_conversations:
          dbPatch.service_conversations !== undefined
            ? dbPatch.service_conversations
            : campaign.serviceConversations,
        club_conversions:
          dbPatch.club_conversions !== undefined
            ? dbPatch.club_conversions
            : campaign.clubConversions,
        club_fichas_conversions:
          dbPatch.club_fichas_conversions !== undefined
            ? dbPatch.club_fichas_conversions
            : campaign.clubFichasConversions,
        captured_players:
          dbPatch.captured_players ?? campaign.capturedPlayers,
        active_players: dbPatch.active_players ?? campaign.activePlayers,
        activation_rule_type:
          dbPatch.activation_rule_type ?? campaign.activationRuleType,
        activation_minimum_rake:
          dbPatch.activation_minimum_rake !== undefined
            ? dbPatch.activation_minimum_rake
            : campaign.activationMinimumRake,
        activation_rule_notes:
          dbPatch.activation_rule_notes !== undefined
            ? dbPatch.activation_rule_notes
            : campaign.activationRuleNotes,
        rake_goal:
          dbPatch.rake_goal !== undefined ? dbPatch.rake_goal : campaign.rakeGoal,
        active_players_goal:
          dbPatch.active_players_goal !== undefined
            ? dbPatch.active_players_goal
            : campaign.activePlayersGoal,
        is_archived: dbPatch.is_archived ?? campaign.isArchived,
        created_by: campaign.createdBy,
        created_at: campaign.createdAt,
        updated_at: dbPatch.updated_at,
        board_id: campaign.boardId,
        id: campaign.id,
      } as Record<string, unknown>),
    )

    toast.success('Campanha atualizada.')
    return true
  }

  async function duplicate(id: string) {
    const source = campaigns.value.find((c) => c.id === id)
    if (!source) return null
    const copy = await create({
      name: `${source.name} (cópia)`,
      acquisitionMonth: source.acquisitionMonth,
      acquisitionYear: source.acquisitionYear,
      startDate: source.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: source.endDate,
      agency: source.agency,
      agentId: source.agentId,
      acquisitionNature: source.acquisitionNature,
      campaignType: source.campaignType,
      campaignTypeOther: source.campaignTypeOther,
      objective: source.objective,
      audience: source.audience,
      channel: source.channel,
      origin: source.origin,
      campaignUrl: source.campaignUrl,
      notes: source.notes,
      investment: source.investment,
      impressions: null,
      reach: null,
      metaConversations: null,
      serviceConversations: null,
      clubConversions: null,
      clubFichasConversions: null,
      capturedPlayers: source.capturedPlayers,
      activationRuleType: source.activationRuleType,
      activationMinimumRake: source.activationMinimumRake,
      activationRuleNotes: source.activationRuleNotes,
      rakeGoal: source.rakeGoal,
      activePlayersGoal: source.activePlayersGoal,
    })
    if (copy) {
      await appendHistory(copy.id, 'duplicated', `Duplicou a campanha ${source.name}.`, {
        from: source.id,
      })
    }
    return copy
  }

  async function archive(id: string) {
    const toast = useToastStore()
    if (!canArchiveCampaign()) {
      toast.error('Apenas admins podem arquivar campanhas.')
      return false
    }
    const campaign = campaigns.value.find((c) => c.id === id)
    if (!campaign || campaign.isArchived) return false
    quietRealtime()
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) {
      toast.error(updateError.message)
      return false
    }
    campaign.isArchived = true
    await appendHistory(id, 'archived', `Arquivou a campanha ${campaign.name}.`)
    toast.success('Campanha arquivada.')
    return true
  }

  async function restore(id: string) {
    const toast = useToastStore()
    if (!canArchiveCampaign()) {
      toast.error('Apenas admins podem restaurar campanhas.')
      return false
    }
    const campaign = campaigns.value.find((c) => c.id === id)
    if (!campaign || !campaign.isArchived) return false
    quietRealtime()
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ is_archived: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) {
      toast.error(updateError.message)
      return false
    }
    campaign.isArchived = false
    await appendHistory(id, 'restored', `Restaurou a campanha ${campaign.name}.`)
    toast.success('Campanha restaurada.')
    return true
  }

  async function remove(id: string) {
    const toast = useToastStore()
    const campaign = campaigns.value.find((c) => c.id === id)
    if (!campaign) return false
    if (!canDeleteCampaign(campaign)) {
      toast.error('Somente admin pode excluir campanhas de outros usuários.')
      return false
    }
    quietRealtime()
    const { error: delError } = await supabase.from('campaigns').delete().eq('id', id)
    if (delError) {
      toast.error(delError.message)
      return false
    }
    campaigns.value = campaigns.value.filter((c) => c.id !== id)
    monthlyResults.value = monthlyResults.value.filter((r) => r.campaignId !== id)
    history.value = history.value.filter((h) => h.campaignId !== id)
    if (selectedCampaignId.value === id) selectedCampaignId.value = null
    toast.success('Campanha excluída.')
    return true
  }

  async function previewReport(file: File): Promise<ReportPreview | null> {
    const toast = useToastStore()
    try {
      const parsed = collapseParsedReport(await parseAgentReportFile(file))
      const reconciliations = buildAgentReconciliations(parsed.agents, parsed.players)
      const existing = agentPeriods.value.filter((p) =>
        parsed.agents.some(
          (a) =>
            a.agentId === p.agentId &&
            a.period.start === p.periodStart &&
            a.period.end === p.periodEnd,
        ),
      )
      const conflict: ImportConflict | null =
        existing.length > 0
          ? {
              periodStart: parsed.period.start,
              periodEnd: parsed.period.end,
              existingImportIds: [...new Set(existing.map((e) => e.importId))],
              affectedAgentIds: [...new Set(existing.map((e) => e.agentId))],
            }
          : null

      return {
        parsed,
        filename: file.name,
        reconciliations,
        conflict,
        conciliatedCount: reconciliations.filter((r) => r.conciliated).length,
        divergenceCount: reconciliations.filter((r) => !r.conciliated).length,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao ler o relatório.'
      toast.error(message)
      return null
    }
  }

  async function commitReport(params: {
    preview: ReportPreview
    replace: boolean
  }): Promise<CommitReportResult | null> {
    const toast = useToastStore()
    const auth = useAuthStore()
    const { preview, replace } = params
    const { parsed, filename, conflict, reconciliations } = preview

    if (conflict && !replace) {
      toast.error('Já existem dados para este período. Confirme a substituição.')
      return null
    }

    importing.value = true
    quietRealtime(8000)

    try {
      const recoByAgent = new Map(
        reconciliations.map((r) => [r.agentId, r]),
      )

      // Snapshot rake before for linked campaigns
      const linkedBefore = campaigns.value
        .filter((c) => c.agentId && parsed.uniqueAgentIds.includes(c.agentId))
        .map((c) => {
          const m = metricsFor(c)
          return {
            campaignId: c.id,
            name: c.name,
            agentId: c.agentId!,
            rakeBefore: m.accumulatedRake,
            recoveryBefore: m.recoveryRate,
          }
        })

      const replacedIds =
        conflict && replace ? conflict.existingImportIds : []
      const replacedImportId = replacedIds[0] ?? null

      const importId = createImportId()
      const now = new Date().toISOString()
      const importRow = {
        id: importId,
        board_id: BOARD_ID,
        original_filename: filename,
        period_start: parsed.period.start,
        period_end: parsed.period.end,
        imported_at: now,
        imported_by: auth.memberId,
        status: 'completed',
        agents_count: parsed.agents.length,
        players_count: parsed.uniquePlayerIds.length,
        table_rows_count: parsed.tables.length,
        warnings: parsed.warnings,
        summary: {
          gameTypes: parsed.gameTypes,
          conciliated: reconciliations.filter((r) => r.conciliated).length,
          divergences: reconciliations.filter((r) => !r.conciliated).length,
        },
        replaced_import_id: replacedImportId,
        created_at: now,
      }

      const agentPeriodRows = parsed.agents.map((a) => {
        const reco = recoByAgent.get(a.agentId)
        return {
          id: createAgentPeriodId(),
          board_id: BOARD_ID,
          import_id: importId,
          agent_id: a.agentId,
          agent_name: a.agentName,
          period_start: a.period.start,
          period_end: a.period.end,
          weekly_rake: a.weeklyRake,
          gains: a.gains,
          hands: a.hands,
          players_rake_sum: reco?.playersRakeSum ?? 0,
          unique_players: reco?.uniquePlayers ?? 0,
          reconciliation_diff: reco?.diff ?? 0,
          created_at: now,
        }
      })

      const playerPeriodRows = parsed.players.map((p) => ({
        id: createPlayerPeriodId(),
        board_id: BOARD_ID,
        import_id: importId,
        agent_id: p.agentId,
        player_id: p.playerId,
        player_name: p.playerName,
        nickname: p.nickname,
        period_start: p.period.start,
        period_end: p.period.end,
        weekly_rake: p.weeklyRake,
        gains: p.gains,
        hands: p.hands,
        created_at: now,
      }))

      const tableRows = parsed.tables.map((t) => ({
        id: createTableDetailId(),
        board_id: BOARD_ID,
        import_id: importId,
        agent_id: t.agentId,
        player_id: t.playerId,
        period_start: t.period.start,
        period_end: t.period.end,
        table_id: t.tableId,
        game_type: t.gameType,
        table_name: t.tableName,
        hands: t.hands,
        buy_in: t.buyIn,
        gains: t.gains,
        rake: t.rake,
        admin_fee: t.adminFee,
        created_at: now,
      }))

      const replacedSet = new Set(replacedIds)
      const agentUpserts = parsed.agents.map((agent) => {
        const existing = agents.value.find((a) => a.agentId === agent.agentId)
        const kept = agentPeriods.value.filter(
          (p) => p.agentId === agent.agentId && !replacedSet.has(p.importId),
        )
        const incoming = parsed.agents.filter((a) => a.agentId === agent.agentId)
        const accumulated = sumWeeklyRake([
          ...kept.map((p) => ({ weeklyRake: p.weeklyRake })),
          ...incoming.map((a) => ({ weeklyRake: a.weeklyRake })),
        ])
        const starts = [
          ...kept.map((p) => p.periodStart),
          ...incoming.map((a) => a.period.start),
        ]
        const firstSeen = starts.reduce((min, s) => (s < min ? s : min))
        const lastSeen = starts.reduce((max, s) => (s > max ? s : max))
        const periodsCount = new Set([
          ...kept.map((p) => `${p.periodStart}_${p.periodEnd}`),
          ...incoming.map((a) => `${a.period.start}_${a.period.end}`),
        ]).size
        return {
          board_id: BOARD_ID,
          agent_id: agent.agentId,
          name: agent.agentName,
          first_seen_start: firstSeen,
          last_seen_start: lastSeen,
          periods_count: periodsCount,
          accumulated_rake: accumulated,
          updated_at: now,
          created_at: existing?.createdAt ?? now,
        }
      })

      const playerIds = [...new Set(parsed.players.map((p) => p.playerId))]
      const playerUpserts = playerIds.map((playerId) => {
        const incoming = parsed.players.filter((p) => p.playerId === playerId)
        const kept = playerPeriods.value.filter(
          (p) => p.playerId === playerId && !replacedSet.has(p.importId),
        )
        const accumulated = sumWeeklyRake([
          ...kept.map((p) => ({ weeklyRake: p.weeklyRake })),
          ...incoming.map((p) => ({ weeklyRake: p.weeklyRake })),
        ])
        const starts = [
          ...kept.map((p) => p.periodStart),
          ...incoming.map((p) => p.period.start),
        ]
        const named = [...incoming].reverse().find((p) => p.playerName) ?? incoming[0]
        return {
          board_id: BOARD_ID,
          player_id: playerId,
          name: named?.playerName ?? '',
          nickname: named?.nickname ?? '',
          first_seen_start: starts.reduce((min, s) => (s < min ? s : min)),
          last_seen_start: starts.reduce((max, s) => (s > max ? s : max)),
          periods_count: new Set([
            ...kept.map((p) => `${p.periodStart}_${p.periodEnd}`),
            ...incoming.map((p) => `${p.period.start}_${p.period.end}`),
          ]).size,
          accumulated_rake: accumulated,
          updated_at: now,
          created_at: now,
        }
      })

      const { error: rpcError } = await supabase.rpc('commit_campaign_report', {
        p_replace_ids: replacedIds,
        p_import: importRow,
        p_agent_periods: agentPeriodRows,
        p_player_periods: playerPeriodRows,
        p_table_details: tableRows,
        p_agents: agentUpserts,
        p_players: playerUpserts,
      })
      if (rpcError) {
        if (/duplicate key|unique constraint/i.test(rpcError.message)) {
          throw new Error(
            'Este período já tem jogadores importados para a mesma agência. Marque substituir, ou o arquivo tem linhas repetidas da mesma semana.',
          )
        }
        throw new Error(rpcError.message)
      }

      // Refresh local state
      await load()

      const campaignUpdates = linkedBefore.map((before) => {
        const campaign = campaigns.value.find((c) => c.id === before.campaignId)
        if (!campaign) {
          return {
            campaignId: before.campaignId,
            name: before.name,
            rakeAdded: 0,
            rakeBefore: before.rakeBefore,
            rakeAfter: before.rakeBefore,
            recoveryBefore: before.recoveryBefore,
            recoveryAfter: before.recoveryBefore,
          }
        }
        const after = metricsFor(campaign)
        const weekRake =
          parsed.agents.find((a) => a.agentId === before.agentId)?.weeklyRake ??
          0
        return {
          campaignId: before.campaignId,
          name: before.name,
          rakeAdded: weekRake,
          rakeBefore: before.rakeBefore,
          rakeAfter: after.accumulatedRake,
          recoveryBefore: before.recoveryBefore,
          recoveryAfter: after.recoveryRate,
        }
      })

      for (const upd of campaignUpdates) {
        await appendHistory(
          upd.campaignId,
          replace ? 'report_replaced' : 'report_imported',
          replace
            ? `Reprocessou relatório ${formatPeriodLabel(parsed.period.start, parsed.period.end)}.`
            : `Importou relatório ${formatPeriodLabel(parsed.period.start, parsed.period.end)} (+R$ ${upd.rakeAdded.toFixed(2)}).`,
          {
            importId,
            periodStart: parsed.period.start,
            periodEnd: parsed.period.end,
            rakeAdded: upd.rakeAdded,
            rakeAfter: upd.rakeAfter,
          },
        )
      }

      toast.success(
        replace ? 'Relatório substituído e acumulados recalculados.' : 'Relatório importado.',
      )

      return {
        importId,
        periodLabel: formatPeriodLabel(parsed.period.start, parsed.period.end),
        agentsCount: parsed.agents.length,
        playersCount: parsed.uniquePlayerIds.length,
        tableRowsCount: parsed.tables.length,
        conciliatedCount: reconciliations.filter((r) => r.conciliated).length,
        divergenceCount: reconciliations.filter((r) => !r.conciliated).length,
        replaced: Boolean(conflict && replace),
        campaignUpdates,
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao processar o relatório.'
      error.value = message
      toast.error(message)
      return null
    } finally {
      importing.value = false
    }
  }

  async function rebuildMasterTotals() {
    const now = new Date().toISOString()
    for (const agent of agents.value) {
      const periods = agentPeriods.value.filter((p) => p.agentId === agent.agentId)
      const starts = periods.map((p) => p.periodStart)
      await supabase
        .from('campaign_agents')
        .update({
          accumulated_rake: sumWeeklyRake(periods),
          periods_count: new Set(periods.map((p) => `${p.periodStart}_${p.periodEnd}`)).size,
          first_seen_start: starts.length
            ? starts.reduce((min, s) => (s < min ? s : min))
            : agent.firstSeenStart,
          last_seen_start: starts.length
            ? starts.reduce((max, s) => (s > max ? s : max))
            : agent.lastSeenStart,
          updated_at: now,
        })
        .eq('board_id', BOARD_ID)
        .eq('agent_id', agent.agentId)
    }

    const playerIds = [...new Set(playerPeriods.value.map((p) => p.playerId))]
    for (const playerId of playerIds) {
      const periods = playerPeriods.value.filter((p) => p.playerId === playerId)
      const starts = periods.map((p) => p.periodStart)
      await supabase
        .from('campaign_players')
        .update({
          accumulated_rake: sumWeeklyRake(periods),
          periods_count: new Set(periods.map((p) => `${p.periodStart}_${p.periodEnd}`)).size,
          first_seen_start: starts.reduce((min, s) => (s < min ? s : min)),
          last_seen_start: starts.reduce((max, s) => (s > max ? s : max)),
          updated_at: now,
        })
        .eq('board_id', BOARD_ID)
        .eq('player_id', playerId)
    }
  }

  async function removeImport(id: string) {
    const toast = useToastStore()
    const item = imports.value.find((i) => i.id === id)
    if (!item) return false

    quietRealtime(4000)
    const { error: delError } = await supabase
      .from('campaign_report_imports')
      .delete()
      .eq('id', id)
    if (delError) {
      toast.error(delError.message)
      return false
    }

    await load()
    await rebuildMasterTotals()
    await load()
    toast.success('Importação excluída. Totais recalculados.')
    return true
  }

  async function previewTransactionReport(
    file: File,
  ): Promise<TransactionReportPreview | null> {
    const toast = useToastStore()
    try {
      const parsed = await parseTransactionReportFile(file)
      const broken = transactionImports.value.filter(
        (i) =>
          i.status === 'completed' &&
          i.transactionsCount > 0 &&
          i.agentsCount === 0,
      )
      const existing = transactionImports.value.filter(
        (i) =>
          i.status === 'completed' &&
          i.periodStart === parsed.period.start &&
          i.periodEnd === parsed.period.end,
      )
      const replaceCandidates = [
        ...new Map(
          [...existing, ...broken].map((i) => [i.id, i]),
        ).values(),
      ]
      const conflict: ImportConflict | null =
        replaceCandidates.length > 0
          ? {
              periodStart: parsed.period.start,
              periodEnd: parsed.period.end,
              existingImportIds: replaceCandidates.map((e) => e.id),
              affectedAgentIds: parsed.uniqueAgentIds,
            }
          : null
      return {
        parsed,
        filename: file.name,
        conflict,
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao ler o relatório de transações.'
      toast.error(message)
      return null
    }
  }

  async function commitTransactionReport(params: {
    preview: TransactionReportPreview
    replace: boolean
  }): Promise<CommitTransactionResult | null> {
    const toast = useToastStore()
    const auth = useAuthStore()
    const { preview, replace } = params
    const { parsed, filename, conflict } = preview

    if (conflict && !replace) {
      toast.error('Já existem transações para este período. Confirme a substituição.')
      return null
    }

    importing.value = true
    quietRealtime(8000)

    try {
      const playerLinks = playerPeriods.value.map((p) => ({
        playerId: p.playerId,
        agentId: p.agentId,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
      }))

      const resolvedRows = parsed.transactions.map((t) => {
        const eventDate = t.occurredAt?.slice(0, 10) ?? null
        const agentId = resolveHistoricalAgentId({
          reportAgentId: t.agentId,
          receiverPlayerId: t.receiverPlayerId,
          eventDate,
          playerPeriodLinks: playerLinks,
        })
        const week = eventDate
          ? mondaySundayContaining(eventDate)
          : parsed.period
        return {
          ...t,
          agentId,
          periodStart: week.start,
          periodEnd: week.end,
        }
      })

      const replacedIds =
        conflict && replace ? conflict.existingImportIds : []
      const replacedImportId = replacedIds[0] ?? null
      const importId = createTransactionImportId()
      const now = new Date().toISOString()

      const uniqueAgents = [
        ...new Set(
          resolvedRows
            .map((t) => t.agentId)
            .filter((id): id is string => Boolean(id)),
        ),
      ]
      const uniquePlayers = [
        ...new Set(resolvedRows.map((t) => t.receiverPlayerId)),
      ]
      const campaignAgentIds = new Set(
        campaigns.value
          .map((c) => c.agentId)
          .filter((id): id is string => Boolean(id)),
      )
      const agentsLinked = uniqueAgents.filter((id) => campaignAgentIds.has(id))
      const agentsWithout = uniqueAgents.filter((id) => !campaignAgentIds.has(id))
      const transactionsWithoutAgent = resolvedRows.filter((t) => !t.agentId).length

      const depositsCount = resolvedRows.filter((t) => t.isDeposit).length
      const bonusesCount = resolvedRows.filter((t) => t.isBonus).length

      const importRow = {
        id: importId,
        board_id: BOARD_ID,
        original_filename: filename,
        period_start: parsed.period.start,
        period_end: parsed.period.end,
        imported_at: now,
        imported_by: auth.memberId,
        status: 'completed',
        transactions_count: resolvedRows.length,
        deposits_count: depositsCount,
        bonuses_count: bonusesCount,
        agents_count: uniqueAgents.length,
        players_count: uniquePlayers.length,
        warnings: parsed.warnings,
        summary: {
          uniqueAgentIds: uniqueAgents,
          uniquePlayerIds: uniquePlayers,
          agentsLinkedToCampaigns: agentsLinked,
          agentsWithoutCampaign: agentsWithout,
          transactionsWithoutAgent,
          recognizedHeaders: parsed.recognizedHeaders,
          depositsCount,
          bonusesCount,
        },
        replaced_import_id: replacedImportId,
        created_at: now,
      }

      const txRows = resolvedRows.map((t) => ({
        id: createTransactionId(),
        board_id: BOARD_ID,
        import_id: importId,
        external_transaction_id: t.externalTransactionId,
        receiver_player_id: t.receiverPlayerId,
        receiver_nickname: t.receiverNickname,
        agent_id: t.agentId,
        agent_nickname: t.agentNickname,
        occurred_at: t.occurredAt,
        period_start: t.periodStart,
        period_end: t.periodEnd,
        origin: t.origin,
        transaction_type: t.sxType ?? t.transactionType,
        amount: t.amount,
        chips_send_out: t.chipsSendOut,
        chips_claimback: t.chipsClaimback,
        system_status: t.systemStatus,
        order_status: t.orderStatus,
        is_deposit: t.isDeposit,
        is_bonus: t.isBonus,
        raw: t.raw,
        created_at: now,
      }))

      const { error: rpcError } = await supabase.rpc(
        'commit_campaign_transactions',
        {
          p_import: importRow,
          p_transactions: txRows,
          p_replace_import_ids: replacedIds,
        },
      )
      if (rpcError) throw new Error(rpcError.message)

      await load()

      const affected = campaigns.value.filter(
        (c) => c.agentId && uniqueAgents.includes(c.agentId),
      )
      for (const campaign of affected) {
        await appendHistory(
          campaign.id,
          replace ? 'transactions_replaced' : 'transactions_imported',
          replace
            ? `Substituiu transações ${formatPeriodLabel(parsed.period.start, parsed.period.end)}.`
            : `Importou transações ${formatPeriodLabel(parsed.period.start, parsed.period.end)}.`,
          {
            importId,
            periodStart: parsed.period.start,
            periodEnd: parsed.period.end,
            transactionsCount: resolvedRows.length,
            depositsCount,
            bonusesCount,
            agentsCount: uniqueAgents.length,
          },
        )
      }

      toast.success(
        replace
          ? 'Transações substituídas.'
          : 'Transações importadas.',
      )

      return {
        importId,
        periodLabel: formatPeriodLabel(parsed.period.start, parsed.period.end),
        transactionsCount: resolvedRows.length,
        depositsCount,
        bonusesCount,
        agentsCount: uniqueAgents.length,
        playersCount: uniquePlayers.length,
        agentsLinkedToCampaigns: agentsLinked.length,
        agentsWithoutCampaign: agentsWithout.length,
        agentsWithoutCampaignIds: agentsWithout,
        transactionsWithoutAgent,
        replaced: Boolean(conflict && replace),
        affectedCampaignIds: affected.map((c) => c.id),
        recognizedHeaders: parsed.recognizedHeaders,
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao processar transações.'
      error.value = message
      toast.error(message)
      return null
    } finally {
      importing.value = false
    }
  }

  /**
   * Remove imports de Transações com conciliação quebrada (AGENTES=0)
   * para permitir reimportação segura após correção do parser.
   */
  async function purgeBrokenTransactionImports(): Promise<number> {
    const toast = useToastStore()
    const broken = transactionImports.value.filter(
      (i) =>
        i.status === 'completed' &&
        i.transactionsCount > 0 &&
        i.agentsCount === 0,
    )
    if (broken.length === 0) return 0

    quietRealtime(6000)
    let removed = 0
    for (const item of broken) {
      const { error: delError } = await supabase
        .from('campaign_transaction_imports')
        .delete()
        .eq('id', item.id)
      if (!delError) removed += 1
    }
    await load()
    if (removed > 0) {
      toast.success(
        `${removed} import(s) de transações inválido(s) removido(s). Reimporte o XLSX.`,
      )
    }
    return removed
  }

  async function removeTransactionImport(id: string) {
    const toast = useToastStore()
    const item = transactionImports.value.find((i) => i.id === id)
    if (!item) return false

    const agentIds = [
      ...new Set(
        transactions.value
          .filter((t) => t.importId === id && t.agentId)
          .map((t) => t.agentId!),
      ),
    ]

    quietRealtime(4000)
    const { error: delError } = await supabase
      .from('campaign_transaction_imports')
      .delete()
      .eq('id', id)
    if (delError) {
      toast.error(delError.message)
      return false
    }

    await load()

    const affected = campaigns.value.filter(
      (c) => c.agentId && agentIds.includes(c.agentId),
    )
    for (const campaign of affected) {
      await appendHistory(
        campaign.id,
        'transactions_deleted',
        `Removeu importação de transações ${formatPeriodLabel(item.periodStart, item.periodEnd)}.`,
        { importId: id },
      )
    }

    toast.success('Importação de transações excluída.')
    return true
  }

  async function loadTableDetails(agentId: string, periodStart?: string) {
    let query = supabase
      .from('campaign_table_details')
      .select('*')
      .eq('board_id', BOARD_ID)
      .eq('agent_id', agentId)
    if (periodStart) query = query.eq('period_start', periodStart)
    const { data, error: qErr } = await query.limit(5000)
    if (qErr) {
      useToastStore().error(qErr.message)
      return [] as CampaignTableDetail[]
    }
    const rows = (data ?? []).map((row) =>
      mapTableDetail(row as Record<string, unknown>),
    )
    // merge into cache for this agent
    tableDetailsCache.value = [
      ...tableDetailsCache.value.filter(
        (t) =>
          !(
            t.agentId === agentId &&
            (!periodStart || t.periodStart === periodStart)
          ),
      ),
      ...rows,
    ]
    return rows
  }

  async function loadPlayerTableDetails(agentId: string, playerId: string) {
    const { data, error: qErr } = await supabase
      .from('campaign_table_details')
      .select('*')
      .eq('board_id', BOARD_ID)
      .eq('agent_id', agentId)
      .eq('player_id', playerId)
      .limit(2000)
    if (qErr) {
      useToastStore().error(qErr.message)
      return [] as CampaignTableDetail[]
    }
    return (data ?? []).map((row) =>
      mapTableDetail(row as Record<string, unknown>),
    )
  }

  // --- Legacy monthly (kept for compatibility) ---
  function validateMonthlyInput(input: CampaignMonthlyResultInput) {
    const m = Number(input.referenceMonth)
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return 'Mês de referência deve estar entre 1 e 12.'
    }
    const y = Number(input.referenceYear)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      return 'Ano de referência inválido.'
    }
    if (Number(input.monthlyRake) < 0) return 'Rake mensal não pode ser negativo.'
    return null
  }

  async function upsertMonthlyResult(
    campaignId: string,
    input: CampaignMonthlyResultInput,
  ) {
    const toast = useToastStore()
    const auth = useAuthStore()
    const validation = validateMonthlyInput(input)
    if (validation) {
      toast.error(validation)
      return null
    }
    const existing = monthlyResults.value.find(
      (r) =>
        r.campaignId === campaignId &&
        r.referenceMonth === input.referenceMonth &&
        r.referenceYear === input.referenceYear,
    )
    const now = new Date().toISOString()
    if (existing) {
      return updateMonthlyResult(existing.id, input)
    }
    const row = {
      id: createMonthlyId(),
      campaign_id: campaignId,
      reference_month: input.referenceMonth,
      reference_year: input.referenceYear,
      monthly_rake: Number(input.monthlyRake),
      monthly_active_players: input.monthlyActivePlayers ?? null,
      top_player_rake: input.topPlayerRake ?? null,
      top_three_players_rake: input.topThreePlayersRake ?? null,
      notes: input.notes?.trim() || null,
      created_by: auth.memberId,
      created_at: now,
      updated_at: now,
    }
    quietRealtime()
    const { error: insertError } = await supabase
      .from('campaign_monthly_results')
      .insert(row)
    if (insertError) {
      toast.error(insertError.message)
      return null
    }
    const mapped = mapMonthly(row)
    monthlyResults.value = [...monthlyResults.value, mapped]
    await appendHistory(
      campaignId,
      'monthly_created',
      `Registrou rake mensal ${String(input.referenceMonth).padStart(2, '0')}/${input.referenceYear}.`,
    )
    return mapped
  }

  async function updateMonthlyResult(
    id: string,
    input: CampaignMonthlyResultInput,
  ) {
    const toast = useToastStore()
    const result = monthlyResults.value.find((r) => r.id === id)
    if (!result) return null
    const validation = validateMonthlyInput(input)
    if (validation) {
      toast.error(validation)
      return null
    }
    const dbPatch = {
      reference_month: input.referenceMonth,
      reference_year: input.referenceYear,
      monthly_rake: Number(input.monthlyRake),
      monthly_active_players: input.monthlyActivePlayers ?? null,
      top_player_rake: input.topPlayerRake ?? null,
      top_three_players_rake: input.topThreePlayersRake ?? null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    quietRealtime()
    const { error: updateError } = await supabase
      .from('campaign_monthly_results')
      .update(dbPatch)
      .eq('id', id)
    if (updateError) {
      toast.error(updateError.message)
      return null
    }
    Object.assign(result, mapMonthly({ ...result, ...dbPatch, campaign_id: result.campaignId, id, created_by: result.createdBy, created_at: result.createdAt }))
    await appendHistory(
      result.campaignId,
      'monthly_updated',
      `Atualizou rake mensal ${String(input.referenceMonth).padStart(2, '0')}/${input.referenceYear}.`,
    )
    return result
  }

  function monthlyResultsFor(campaignId: string) {
    return monthlyResults.value
      .filter((r) => r.campaignId === campaignId)
      .sort((a, b) => {
        if (a.referenceYear !== b.referenceYear) {
          return a.referenceYear - b.referenceYear
        }
        return a.referenceMonth - b.referenceMonth
      })
  }

  function findAgent(agentId: string | null | undefined) {
    if (!agentId) return null
    return agents.value.find((a) => a.agentId === agentId) ?? null
  }

  return {
    campaigns,
    monthlyResults,
    history,
    agents,
    imports,
    transactionImports,
    transactions,
    agentPeriods,
    playerPeriods,
    tableDetailsCache,
    completedImports,
    completedTransactionImports,
    selectedCampaignId,
    selectedCampaign,
    selectedMonthlyResults,
    selectedHistory,
    visibleCampaigns,
    loading,
    importing,
    ready,
    error,
    showArchived,
    init,
    reset,
    load,
    open,
    close,
    setShowArchived,
    create,
    update,
    duplicate,
    archive,
    restore,
    remove,
    upsertMonthlyResult,
    updateMonthlyResult,
    monthlyResultsFor,
    agentPeriodsFor,
    playerPeriodsForAgent,
    uniqueActivesForAgent,
    uniqueActivesForCampaign,
    canArchiveCampaign,
    canDeleteCampaign,
    metricsFor,
    activationInvestmentFor,
    purchasePowerFor,
    funnelFor,
    playerDepositStats,
    rakeHealthFor,
    gameProfileFor,
    overviewKpis,
    previewReport,
    commitReport,
    removeImport,
    previewTransactionReport,
    commitTransactionReport,
    removeTransactionImport,
    purgeBrokenTransactionImports,
    loadTableDetails,
    loadPlayerTableDetails,
    findAgent,
    formatPeriodLabel,
    // legacy helper still used by some components
    buildLegacyOverview,
  }
})
