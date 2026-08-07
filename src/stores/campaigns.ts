import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  ActivationRuleType,
  Campaign,
  CampaignCreateInput,
  CampaignHistoryAction,
  CampaignHistoryEntry,
  CampaignMonthlyResult,
  CampaignMonthlyResultInput,
  CampaignUpdateInput,
} from '../types/campaigns'
import { BOARD_ID, supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'

function createCampaignId() {
  return `campaign-${crypto.randomUUID().slice(0, 8)}`
}

function createMonthlyId() {
  return `cmr-${crypto.randomUUID().slice(0, 8)}`
}

function createHistoryId() {
  return `ch-${crypto.randomUUID().slice(0, 8)}`
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

function mapCampaign(row: Record<string, unknown>): Campaign {
  const rule = String(row.activation_rule_type ?? 'rake_gt_zero')
  return {
    id: String(row.id),
    boardId: String(row.board_id ?? BOARD_ID),
    name: String(row.name ?? ''),
    acquisitionMonth: toNumber(row.acquisition_month, 1),
    acquisitionYear: toNumber(row.acquisition_year, new Date().getFullYear()),
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    agency: (row.agency as string | null) ?? null,
    campaignType: (row.campaign_type as string | null) ?? null,
    campaignTypeOther: (row.campaign_type_other as string | null) ?? null,
    objective: (row.objective as string | null) ?? null,
    audience: (row.audience as string | null) ?? null,
    channel: (row.channel as string | null) ?? null,
    origin: (row.origin as string | null) ?? null,
    campaignUrl: (row.campaign_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    investment: toNumber(row.investment),
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

function validateCampaignInput(input: CampaignCreateInput | CampaignUpdateInput) {
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
  if (input.investment !== undefined && Number(input.investment) < 0) {
    return 'Investimento não pode ser negativo.'
  }
  if (input.capturedPlayers !== undefined && Number(input.capturedPlayers) < 0) {
    return 'Jogadores captados não pode ser negativo.'
  }
  if (input.activePlayers !== undefined && Number(input.activePlayers) < 0) {
    return 'Jogadores ativos não pode ser negativo.'
  }
  const captured =
    input.capturedPlayers !== undefined ? Number(input.capturedPlayers) : null
  const active =
    input.activePlayers !== undefined ? Number(input.activePlayers) : null
  if (captured !== null && active !== null && active > captured) {
    return 'Jogadores ativos não pode ser maior que captados.'
  }
  return null
}

function validateMonthlyInput(input: CampaignMonthlyResultInput) {
  const m = Number(input.referenceMonth)
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    return 'Mês de referência deve estar entre 1 e 12.'
  }
  const y = Number(input.referenceYear)
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    return 'Ano de referência inválido.'
  }
  if (Number(input.monthlyRake) < 0) {
    return 'Rake mensal não pode ser negativo.'
  }
  if (
    input.monthlyActivePlayers != null &&
    Number(input.monthlyActivePlayers) < 0
  ) {
    return 'Ativos no mês não pode ser negativo.'
  }
  return null
}

export const useCampaignsStore = defineStore('campaigns', () => {
  const campaigns = ref<Campaign[]>([])
  const monthlyResults = ref<CampaignMonthlyResult[]>([])
  const history = ref<CampaignHistoryEntry[]>([])
  const selectedCampaignId = ref<string | null>(null)
  const loading = ref(false)
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

  function quietRealtime(ms = 1200) {
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

    const [campaignsRes, monthlyRes, historyRes] = await Promise.all([
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
    ])

    if (campaignsRes.error) {
      error.value = campaignsRes.error.message
      useToastStore().error(campaignsRes.error.message)
      loading.value = false
      return
    }
    if (monthlyRes.error) {
      error.value = monthlyRes.error.message
      useToastStore().error(monthlyRes.error.message)
      loading.value = false
      return
    }
    if (historyRes.error) {
      error.value = historyRes.error.message
      useToastStore().error(historyRes.error.message)
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

    loading.value = false
  }

  function subscribeRealtime() {
    unsubscribeRealtime()
    channel = supabase
      .channel(`campaigns:${BOARD_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaigns' },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_monthly_results' },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_history' },
        scheduleReload,
      )
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
  }

  function reset() {
    unsubscribeRealtime()
    campaigns.value = []
    monthlyResults.value = []
    history.value = []
    selectedCampaignId.value = null
    loading.value = false
    ready.value = false
    error.value = null
    showArchived.value = false
  }

  async function create(input: CampaignCreateInput) {
    const toast = useToastStore()
    const auth = useAuthStore()
    const validation = validateCampaignInput(input)
    if (validation) {
      toast.error(validation)
      return null
    }
    if (!input.startDate?.trim()) {
      toast.error('Data de início é obrigatória.')
      return null
    }

    const now = new Date().toISOString()
    const id = createCampaignId()
    const row = {
      id,
      board_id: BOARD_ID,
      name: input.name.trim(),
      acquisition_month: input.acquisitionMonth,
      acquisition_year: input.acquisitionYear,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      agency: input.agency?.trim() || null,
      campaign_type: input.campaignType?.trim() || null,
      campaign_type_other: input.campaignTypeOther?.trim() || null,
      objective: input.objective?.trim() || null,
      audience: input.audience?.trim() || null,
      channel: input.channel?.trim() || null,
      origin: input.origin?.trim() || null,
      campaign_url: input.campaignUrl?.trim() || null,
      notes: input.notes?.trim() || null,
      investment: Number(input.investment),
      captured_players: Number(input.capturedPlayers),
      active_players: Number(input.activePlayers),
      activation_rule_type: input.activationRuleType,
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
    toast.success('Campanha criada.')
    return campaign
  }

  async function update(id: string, patch: CampaignUpdateInput) {
    const toast = useToastStore()
    const campaign = campaigns.value.find((c) => c.id === id)
    if (!campaign) return false

    const merged: CampaignUpdateInput = {
      name: patch.name ?? campaign.name,
      acquisitionMonth: patch.acquisitionMonth ?? campaign.acquisitionMonth,
      acquisitionYear: patch.acquisitionYear ?? campaign.acquisitionYear,
      startDate: patch.startDate ?? campaign.startDate ?? undefined,
      investment: patch.investment ?? campaign.investment,
      capturedPlayers: patch.capturedPlayers ?? campaign.capturedPlayers,
      activePlayers: patch.activePlayers ?? campaign.activePlayers,
      activationRuleType: patch.activationRuleType ?? campaign.activationRuleType,
      ...patch,
    }

    const validation = validateCampaignInput(merged)
    if (validation) {
      toast.error(validation)
      return false
    }

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
    if (patch.agency !== undefined) dbPatch.agency = patch.agency?.trim() || null
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
    if (patch.investment !== undefined) dbPatch.investment = Number(patch.investment)
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

    const historyParts: string[] = []
    if (
      patch.investment !== undefined &&
      patch.investment !== campaign.investment
    ) {
      historyParts.push('alterou o investimento')
      await appendHistory(
        id,
        'investment_changed',
        `Alterou o investimento de ${campaign.name}.`,
        {
          from: campaign.investment,
          to: patch.investment,
        },
      )
    }
    if (
      (patch.activePlayers !== undefined &&
        patch.activePlayers !== campaign.activePlayers) ||
      (patch.capturedPlayers !== undefined &&
        patch.capturedPlayers !== campaign.capturedPlayers)
    ) {
      await appendHistory(
        id,
        'players_changed',
        `Alterou captados/ativos de ${campaign.name}.`,
        {
          capturedFrom: campaign.capturedPlayers,
          capturedTo: patch.capturedPlayers ?? campaign.capturedPlayers,
          activeFrom: campaign.activePlayers,
          activeTo: patch.activePlayers ?? campaign.activePlayers,
        },
      )
    } else if (!historyParts.length) {
      await appendHistory(id, 'updated', `Editou a campanha ${campaign.name}.`)
    }

    Object.assign(campaign, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.acquisitionMonth !== undefined
        ? { acquisitionMonth: patch.acquisitionMonth }
        : {}),
      ...(patch.acquisitionYear !== undefined
        ? { acquisitionYear: patch.acquisitionYear }
        : {}),
      ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
      ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
      ...(patch.agency !== undefined
        ? { agency: patch.agency?.trim() || null }
        : {}),
      ...(patch.campaignType !== undefined
        ? { campaignType: patch.campaignType?.trim() || null }
        : {}),
      ...(patch.campaignTypeOther !== undefined
        ? { campaignTypeOther: patch.campaignTypeOther?.trim() || null }
        : {}),
      ...(patch.objective !== undefined
        ? { objective: patch.objective?.trim() || null }
        : {}),
      ...(patch.audience !== undefined
        ? { audience: patch.audience?.trim() || null }
        : {}),
      ...(patch.channel !== undefined
        ? { channel: patch.channel?.trim() || null }
        : {}),
      ...(patch.origin !== undefined
        ? { origin: patch.origin?.trim() || null }
        : {}),
      ...(patch.campaignUrl !== undefined
        ? { campaignUrl: patch.campaignUrl?.trim() || null }
        : {}),
      ...(patch.notes !== undefined
        ? { notes: patch.notes?.trim() || null }
        : {}),
      ...(patch.investment !== undefined
        ? { investment: Number(patch.investment) }
        : {}),
      ...(patch.capturedPlayers !== undefined
        ? { capturedPlayers: Number(patch.capturedPlayers) }
        : {}),
      ...(patch.activePlayers !== undefined
        ? { activePlayers: Number(patch.activePlayers) }
        : {}),
      ...(patch.activationRuleType !== undefined
        ? { activationRuleType: patch.activationRuleType }
        : {}),
      ...(patch.activationMinimumRake !== undefined
        ? { activationMinimumRake: patch.activationMinimumRake }
        : {}),
      ...(patch.activationRuleNotes !== undefined
        ? { activationRuleNotes: patch.activationRuleNotes?.trim() || null }
        : {}),
      ...(patch.rakeGoal !== undefined ? { rakeGoal: patch.rakeGoal } : {}),
      ...(patch.activePlayersGoal !== undefined
        ? { activePlayersGoal: patch.activePlayersGoal }
        : {}),
      ...(patch.isArchived !== undefined
        ? { isArchived: patch.isArchived }
        : {}),
      updatedAt: String(dbPatch.updated_at),
    })

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
      campaignType: source.campaignType,
      campaignTypeOther: source.campaignTypeOther,
      objective: source.objective,
      audience: source.audience,
      channel: source.channel,
      origin: source.origin,
      campaignUrl: source.campaignUrl,
      notes: source.notes,
      investment: source.investment,
      capturedPlayers: source.capturedPlayers,
      activePlayers: source.activePlayers,
      activationRuleType: source.activationRuleType,
      activationMinimumRake: source.activationMinimumRake,
      activationRuleNotes: source.activationRuleNotes,
      rakeGoal: source.rakeGoal,
      activePlayersGoal: source.activePlayersGoal,
    })

    if (copy) {
      await appendHistory(
        copy.id,
        'duplicated',
        `Duplicou a campanha a partir de ${source.name}.`,
        { sourceId: source.id },
      )
    }

    return copy
  }

  async function setArchivedState(id: string, isArchived: boolean) {
    const auth = useAuthStore()
    const toast = useToastStore()
    if (!auth.isAdmin) {
      toast.error(
        isArchived
          ? 'Apenas admins podem arquivar campanhas.'
          : 'Apenas admins podem restaurar campanhas.',
      )
      return false
    }

    const campaign = campaigns.value.find((c) => c.id === id)
    if (!campaign) return false

    const updatedAt = new Date().toISOString()
    quietRealtime()
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ is_archived: isArchived, updated_at: updatedAt })
      .eq('id', id)

    if (updateError) {
      error.value = updateError.message
      toast.error(updateError.message)
      return false
    }

    campaign.isArchived = isArchived
    campaign.updatedAt = updatedAt
    await appendHistory(
      id,
      isArchived ? 'archived' : 'restored',
      isArchived
        ? `Arquivou a campanha ${campaign.name}.`
        : `Restaurou a campanha ${campaign.name}.`,
    )
    toast.success(isArchived ? 'Campanha arquivada.' : 'Campanha restaurada.')
    return true
  }

  async function archive(id: string) {
    return setArchivedState(id, true)
  }

  async function restore(id: string) {
    return setArchivedState(id, false)
  }

  async function remove(id: string) {
    const auth = useAuthStore()
    const toast = useToastStore()
    const campaign = campaigns.value.find((c) => c.id === id)
    if (!campaign) return false

    if (campaign.createdBy && campaign.createdBy !== auth.memberId && !auth.isAdmin) {
      toast.error('Somente admin pode excluir campanhas de outros usuários.')
      return false
    }

    await appendHistory(
      id,
      'deleted',
      `Excluiu a campanha ${campaign.name}.`,
    )

    quietRealtime()
    const { error: deleteError } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id)

    if (deleteError) {
      error.value = deleteError.message
      toast.error(deleteError.message)
      return false
    }

    campaigns.value = campaigns.value.filter((c) => c.id !== id)
    monthlyResults.value = monthlyResults.value.filter((r) => r.campaignId !== id)
    history.value = history.value.filter((h) => h.campaignId !== id)
    if (selectedCampaignId.value === id) selectedCampaignId.value = null
    toast.success('Campanha excluída.')
    return true
  }

  async function upsertMonthlyResult(
    campaignId: string,
    input: CampaignMonthlyResultInput,
  ) {
    const toast = useToastStore()
    const auth = useAuthStore()
    const campaign = campaigns.value.find((c) => c.id === campaignId)
    if (!campaign) return null

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

    if (existing) {
      if (
        existing.createdBy &&
        existing.createdBy !== auth.memberId &&
        !auth.isAdmin
      ) {
        toast.error('Somente admin pode editar resultados de outros usuários.')
        return null
      }
      return updateMonthlyResult(existing.id, input)
    }

    const now = new Date().toISOString()
    const id = createMonthlyId()
    const row = {
      id,
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
      error.value = insertError.message
      toast.error(insertError.message)
      return null
    }

    const result = mapMonthly(row)
    monthlyResults.value = [...monthlyResults.value, result]
    await appendHistory(
      campaignId,
      'monthly_created',
      `Adicionou o rake de ${String(input.referenceMonth).padStart(2, '0')}/${input.referenceYear}: R$ ${Number(input.monthlyRake).toFixed(2)}.`,
      {
        monthlyRake: input.monthlyRake,
        referenceMonth: input.referenceMonth,
        referenceYear: input.referenceYear,
      },
    )
    toast.success('Resultado mensal adicionado.')
    return result
  }

  async function updateMonthlyResult(
    id: string,
    input: Partial<CampaignMonthlyResultInput>,
  ) {
    const toast = useToastStore()
    const auth = useAuthStore()
    const result = monthlyResults.value.find((r) => r.id === id)
    if (!result) return null

    if (
      result.createdBy &&
      result.createdBy !== auth.memberId &&
      !auth.isAdmin
    ) {
      toast.error('Somente admin pode editar resultados de outros usuários.')
      return null
    }

    const merged: CampaignMonthlyResultInput = {
      referenceMonth: input.referenceMonth ?? result.referenceMonth,
      referenceYear: input.referenceYear ?? result.referenceYear,
      monthlyRake: input.monthlyRake ?? result.monthlyRake,
      monthlyActivePlayers:
        input.monthlyActivePlayers !== undefined
          ? input.monthlyActivePlayers
          : result.monthlyActivePlayers,
      topPlayerRake:
        input.topPlayerRake !== undefined
          ? input.topPlayerRake
          : result.topPlayerRake,
      topThreePlayersRake:
        input.topThreePlayersRake !== undefined
          ? input.topThreePlayersRake
          : result.topThreePlayersRake,
      notes: input.notes !== undefined ? input.notes : result.notes,
    }

    const validation = validateMonthlyInput(merged)
    if (validation) {
      toast.error(validation)
      return null
    }

    const dbPatch = {
      reference_month: merged.referenceMonth,
      reference_year: merged.referenceYear,
      monthly_rake: Number(merged.monthlyRake),
      monthly_active_players: merged.monthlyActivePlayers ?? null,
      top_player_rake: merged.topPlayerRake ?? null,
      top_three_players_rake: merged.topThreePlayersRake ?? null,
      notes: merged.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    quietRealtime()
    const { error: updateError } = await supabase
      .from('campaign_monthly_results')
      .update(dbPatch)
      .eq('id', id)

    if (updateError) {
      error.value = updateError.message
      toast.error(updateError.message)
      return null
    }

    Object.assign(result, {
      referenceMonth: merged.referenceMonth,
      referenceYear: merged.referenceYear,
      monthlyRake: Number(merged.monthlyRake),
      monthlyActivePlayers: merged.monthlyActivePlayers ?? null,
      topPlayerRake: merged.topPlayerRake ?? null,
      topThreePlayersRake: merged.topThreePlayersRake ?? null,
      notes: merged.notes?.trim() || null,
      updatedAt: dbPatch.updated_at,
    })

    await appendHistory(
      result.campaignId,
      'monthly_updated',
      `Atualizou o rake de ${String(merged.referenceMonth).padStart(2, '0')}/${merged.referenceYear}: R$ ${Number(merged.monthlyRake).toFixed(2)}.`,
      {
        monthlyRake: merged.monthlyRake,
        referenceMonth: merged.referenceMonth,
        referenceYear: merged.referenceYear,
      },
    )
    toast.success('Resultado mensal atualizado.')
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

  return {
    campaigns,
    monthlyResults,
    history,
    selectedCampaignId,
    selectedCampaign,
    selectedMonthlyResults,
    selectedHistory,
    visibleCampaigns,
    loading,
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
  }
})
