import { BOARD_ID, supabase } from '../lib/supabase'
import type { BiGrain, BiMetric, RankingCategory } from '../utils/biAnalytics'

export type BiWeek = {
  periodStart: string
  periodEnd: string
  complete: boolean
  tablesLoaded: boolean
  spinPlayers: number
}

export type BiRankRow = {
  category: RankingCategory
  placement: number
  playerId: string
  nickname: string | null
  rake: number
  tied: boolean
}

export type BiPrize = {
  id: string
  periodStart: string
  periodEnd: string
  category: RankingCategory
  playerId: string
  placement: number
  amount: number
  status: 'planejada' | 'registrada' | 'enviada'
  note: string | null
  rakeSnapshot: number
  createdAt: string
  updatedAt: string
}

export type BiOption = {
  kind: 'agent' | 'campaign'
  id: string
  label: string
  parentId: string | null
}

export type BiPlayerHit = {
  playerId: string
  nickname: string | null
  name: string | null
}

export type BiPoint = {
  bucketStart: string
  bucketEnd: string
  value: number | null
  partial: boolean
  hasData: boolean
}

function day(value: unknown): string {
  return String(value ?? '').slice(0, 10)
}

function fail(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback)
}

export async function loadSxWeeks(): Promise<BiWeek[]> {
  const { data, error } = await supabase.rpc('bi_sx_weeks', { p_board_id: BOARD_ID })
  fail(error, 'Falha ao listar semanas.')
  return (data ?? []).map((row: Record<string, unknown>) => ({
    periodStart: day(row.period_start),
    periodEnd: day(row.period_end),
    complete: Boolean(row.complete),
    tablesLoaded: Boolean(row.tables_loaded),
    spinPlayers: Number(row.spin_players) || 0,
  }))
}

export async function loadWeeklyRanking(periodStart: string): Promise<BiRankRow[]> {
  const { data, error } = await supabase.rpc('bi_sx_weekly_ranking', {
    p_board_id: BOARD_ID,
    p_period_start: periodStart,
  })
  fail(error, 'Falha ao carregar o ranking.')
  return (data ?? []).map((row: Record<string, unknown>) => ({
    category: String(row.category) as RankingCategory,
    placement: Number(row.placement),
    playerId: String(row.player_id),
    nickname: row.nickname == null ? null : String(row.nickname),
    rake: Number(row.rake) || 0,
    tied: Boolean(row.tied),
  }))
}

export async function loadWeeklyPrizes(periodStart: string): Promise<BiPrize[]> {
  const { data, error } = await supabase.rpc('bi_list_weekly_prizes', {
    p_board_id: BOARD_ID,
    p_period_start: periodStart,
  })
  fail(error, 'Falha ao carregar premiações.')
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    periodStart: day(row.period_start),
    periodEnd: day(row.period_end),
    category: String(row.category) as RankingCategory,
    playerId: String(row.player_id),
    placement: Number(row.placement),
    amount: Number(row.amount) || 0,
    status: String(row.status) as BiPrize['status'],
    note: row.note == null ? null : String(row.note),
    rakeSnapshot: Number(row.rake_snapshot) || 0,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }))
}

export async function saveWeeklyPrize(input: {
  periodStart: string
  category: RankingCategory
  playerId: string
  placement: number
  amount: number
  status: BiPrize['status']
  note: string
  createdBy: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('bi_save_weekly_prize', {
    p_board_id: BOARD_ID,
    p_period_start: input.periodStart,
    p_category: input.category,
    p_player_id: input.playerId,
    p_placement: input.placement,
    p_amount: input.amount,
    p_status: input.status,
    p_note: input.note,
    p_created_by: input.createdBy,
  })
  fail(error, 'Falha ao registrar a premiação.')
}

export async function loadEvolutionOptions(club: string): Promise<BiOption[]> {
  const { data, error } = await supabase.rpc('bi_evolution_options', {
    p_board_id: BOARD_ID,
    p_club: club,
  })
  fail(error, 'Falha ao carregar filtros.')
  return (data ?? []).map((row: Record<string, unknown>) => ({
    kind: String(row.kind) as BiOption['kind'],
    id: String(row.id),
    label: String(row.label ?? row.id),
    parentId: row.parent_id == null ? null : String(row.parent_id),
  }))
}

export async function searchBiPlayers(club: string, agentId: string, query: string): Promise<BiPlayerHit[]> {
  const { data, error } = await supabase.rpc('bi_search_players', {
    p_board_id: BOARD_ID,
    p_club: club,
    p_agent_id: agentId,
    p_query: query.trim(),
  })
  fail(error, 'Falha ao buscar jogador.')
  return (data ?? []).map((row: Record<string, unknown>) => ({
    playerId: String(row.player_id),
    nickname: row.nickname == null ? null : String(row.nickname),
    name: row.name == null ? null : String(row.name),
  }))
}

export async function loadPerformanceSeries(input: {
  metric: BiMetric
  grain: BiGrain
  from: string
  to: string
  club: string
  agentId: string
  campaignId: string
  playerId: string
}): Promise<BiPoint[]> {
  const { data, error } = await supabase.rpc('bi_performance_series', {
    p_board_id: BOARD_ID,
    p_metric: input.metric,
    p_grain: input.grain,
    p_from: input.from,
    p_to: input.to,
    p_club: input.club,
    p_agent_id: input.agentId,
    p_campaign_id: input.campaignId,
    p_player_id: input.playerId,
  })
  fail(error, 'Falha ao calcular a evolução.')
  return (data ?? []).map((row: Record<string, unknown>) => ({
    bucketStart: day(row.bucket_start),
    bucketEnd: day(row.bucket_end),
    value: row.value == null || !row.has_data ? null : Number(row.value),
    partial: Boolean(row.partial),
    hasData: Boolean(row.has_data),
  }))
}
