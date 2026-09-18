import { BOARD_ID, supabase } from '../lib/supabase'
import type {
  Pipeline,
  PipelineBoard,
  PipelineEntry,
  PipelineStage,
} from '../types/pipelines'
import type { SegmentDefinition } from '../types/segments'
import { previewSegment } from './segmentsApi'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function asString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s ? s : null
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function mapPipeline(raw: Record<string, unknown>): Pipeline {
  return {
    id: String(raw.id ?? ''),
    boardId: String(raw.board_id ?? BOARD_ID),
    name: String(raw.name ?? ''),
    description: asString(raw.description),
    segmentId: asString(raw.segment_id),
    ownerMemberId: asString(raw.owner_member_id),
    createdBy: asString(raw.created_by),
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
  }
}

function mapStage(raw: Record<string, unknown>): PipelineStage {
  return {
    id: String(raw.id ?? ''),
    boardId: String(raw.board_id ?? BOARD_ID),
    pipelineId: String(raw.pipeline_id ?? ''),
    name: String(raw.name ?? ''),
    position: asNumber(raw.position),
    createdAt: String(raw.created_at ?? ''),
  }
}

function mapEntry(raw: Record<string, unknown>): PipelineEntry {
  return {
    id: String(raw.id ?? ''),
    boardId: String(raw.board_id ?? BOARD_ID),
    pipelineId: String(raw.pipeline_id ?? ''),
    stageId: String(raw.stage_id ?? ''),
    playerId: String(raw.player_id ?? ''),
    enteredAt: String(raw.entered_at ?? ''),
    leftAt: asString(raw.left_at),
    stillMatchesSegment: Boolean(raw.still_matches_segment ?? true),
  }
}

const DEFAULT_STAGES = ['Novo', 'Em contato', 'Qualificado', 'Fechado']

export async function listPipelines(): Promise<Pipeline[]> {
  const { data, error } = await supabase
    .from('crm_pipelines')
    .select('id, board_id, name, description, segment_id, owner_member_id, created_by, created_at, updated_at')
    .eq('board_id', BOARD_ID)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  const rows = (data ?? []).map((r) => mapPipeline(r as Record<string, unknown>))

  const segIds = [...new Set(rows.map((r) => r.segmentId).filter(Boolean))] as string[]
  if (segIds.length) {
    const { data: segs } = await supabase
      .from('crm_segment_definitions')
      .select('id, name')
      .in('id', segIds)
    const nameById = new Map(
      (segs ?? []).map((s) => [String((s as Record<string, unknown>).id), asString((s as Record<string, unknown>).name)]),
    )
    for (const row of rows) {
      if (row.segmentId) row.segmentName = nameById.get(row.segmentId) ?? null
    }
  }

  // Active entry counts
  if (rows.length) {
    const { data: entries } = await supabase
      .from('crm_pipeline_entries')
      .select('pipeline_id')
      .eq('board_id', BOARD_ID)
      .is('left_at', null)
      .in(
        'pipeline_id',
        rows.map((r) => r.id),
      )
    const counts = new Map<string, number>()
    for (const e of entries ?? []) {
      const pid = String((e as Record<string, unknown>).pipeline_id)
      counts.set(pid, (counts.get(pid) ?? 0) + 1)
    }
    for (const row of rows) {
      row.entryCount = counts.get(row.id) ?? 0
    }
  }

  return rows
}

export async function createPipeline(input: {
  name: string
  description?: string | null
  segmentId?: string | null
  createdBy?: string | null
  stageNames?: string[]
}): Promise<Pipeline> {
  const now = new Date().toISOString()
  const id = newId('pipe')

  const { data, error } = await supabase
    .from('crm_pipelines')
    .insert({
      id,
      board_id: BOARD_ID,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      segment_id: input.segmentId || null,
      created_by: input.createdBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select('id, board_id, name, description, segment_id, owner_member_id, created_by, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)

  const stageNames = input.stageNames?.length ? input.stageNames : DEFAULT_STAGES
  const stages = stageNames.map((name, position) => ({
    id: newId('pstg'),
    board_id: BOARD_ID,
    pipeline_id: id,
    name,
    position,
    created_at: now,
  }))

  const { error: stageErr } = await supabase.from('crm_pipeline_stages').insert(stages)
  if (stageErr) throw new Error(stageErr.message)

  return mapPipeline(data as Record<string, unknown>)
}

export async function updatePipeline(
  id: string,
  patch: { name?: string; description?: string | null; segmentId?: string | null },
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name != null) payload.name = patch.name.trim()
  if (patch.description !== undefined) payload.description = patch.description?.trim() || null
  if (patch.segmentId !== undefined) payload.segment_id = patch.segmentId

  const { error } = await supabase
    .from('crm_pipelines')
    .update(payload)
    .eq('id', id)
    .eq('board_id', BOARD_ID)
  if (error) throw new Error(error.message)
}

export async function deletePipeline(id: string): Promise<void> {
  const { error } = await supabase.from('crm_pipelines').delete().eq('id', id).eq('board_id', BOARD_ID)
  if (error) throw new Error(error.message)
}

export async function loadPipelineBoard(pipelineId: string): Promise<PipelineBoard> {
  const { data: pipe, error: pipeErr } = await supabase
    .from('crm_pipelines')
    .select('id, board_id, name, description, segment_id, owner_member_id, created_by, created_at, updated_at')
    .eq('id', pipelineId)
    .eq('board_id', BOARD_ID)
    .single()
  if (pipeErr) throw new Error(pipeErr.message)

  const { data: stagesRaw, error: stageErr } = await supabase
    .from('crm_pipeline_stages')
    .select('id, board_id, pipeline_id, name, position, created_at')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true })
  if (stageErr) throw new Error(stageErr.message)

  const { data: entriesRaw, error: entryErr } = await supabase
    .from('crm_pipeline_entries')
    .select(
      'id, board_id, pipeline_id, stage_id, player_id, entered_at, left_at, still_matches_segment',
    )
    .eq('pipeline_id', pipelineId)
    .is('left_at', null)
  if (entryErr) throw new Error(entryErr.message)

  const pipeline = mapPipeline(pipe as Record<string, unknown>)
  if (pipeline.segmentId) {
    const { data: seg } = await supabase
      .from('crm_segment_definitions')
      .select('name')
      .eq('id', pipeline.segmentId)
      .maybeSingle()
    pipeline.segmentName = asString((seg as Record<string, unknown> | null)?.name)
  }

  const stages = (stagesRaw ?? []).map((s) => mapStage(s as Record<string, unknown>))
  const entries = (entriesRaw ?? []).map((e) => mapEntry(e as Record<string, unknown>))

  // Enrich entries with nick / incentive from preview facts when possible (lightweight list RPC)
  if (entries.length) {
    const playerIds = entries.map((e) => e.playerId)
    const { data: listData } = await supabase.rpc('crm_list_players', {
      p_board_id: BOARD_ID,
      p_search: null,
      p_campaign_filter: 'all',
      p_sort: 'player_id_asc',
      p_limit: Math.min(Math.max(playerIds.length, 50), 500),
      p_offset: 0,
      p_incentive_available_filter: 'all',
      p_incentive_received_filter: 'all',
    })
    const payload = (listData ?? {}) as Record<string, unknown>
    const rows = Array.isArray(payload.rows) ? payload.rows : []
    const byId = new Map<string, Record<string, unknown>>()
    for (const row of rows) {
      const r = row as Record<string, unknown>
      byId.set(String(r.playerId ?? ''), r)
    }
    for (const entry of entries) {
      const r = byId.get(entry.playerId)
      if (!r) continue
      entry.nickname = asString(r.nickname)
      entry.name = asString(r.name)
      entry.incentiveAvailable = asNumber(r.incentivoDisponivel)
    }
  }

  return { pipeline, stages, entries }
}

export async function movePipelineEntry(input: {
  entryId: string
  pipelineId: string
  playerId: string
  fromStageId: string
  toStageId: string
  actorId?: string | null
}): Promise<void> {
  if (input.fromStageId === input.toStageId) return

  const { error } = await supabase
    .from('crm_pipeline_entries')
    .update({ stage_id: input.toStageId })
    .eq('id', input.entryId)
    .eq('pipeline_id', input.pipelineId)
  if (error) throw new Error(error.message)

  const { error: evtErr } = await supabase.from('crm_pipeline_events').insert({
    id: newId('pevt'),
    board_id: BOARD_ID,
    pipeline_id: input.pipelineId,
    player_id: input.playerId,
    event_type: 'moved',
    from_stage_id: input.fromStageId,
    to_stage_id: input.toStageId,
    actor_id: input.actorId ?? null,
    occurred_at: new Date().toISOString(),
    meta: {},
  })
  if (evtErr) throw new Error(evtErr.message)
}

export async function addPipelineStage(
  pipelineId: string,
  name: string,
  position?: number,
): Promise<PipelineStage> {
  let pos = position
  if (pos == null) {
    const { data } = await supabase
      .from('crm_pipeline_stages')
      .select('position')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: false })
      .limit(1)
    pos = data?.[0] ? asNumber((data[0] as Record<string, unknown>).position) + 1 : 0
  }

  const row = {
    id: newId('pstg'),
    board_id: BOARD_ID,
    pipeline_id: pipelineId,
    name: name.trim() || 'Novo estágio',
    position: pos,
    created_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('crm_pipeline_stages')
    .insert(row)
    .select('id, board_id, pipeline_id, name, position, created_at')
    .single()
  if (error) throw new Error(error.message)

  await supabase
    .from('crm_pipelines')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', pipelineId)

  return mapStage(data as Record<string, unknown>)
}

export async function renamePipelineStage(stageId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('crm_pipeline_stages')
    .update({ name: name.trim() })
    .eq('id', stageId)
    .eq('board_id', BOARD_ID)
  if (error) throw new Error(error.message)
}

export async function reorderPipelineStages(
  pipelineId: string,
  orderedStageIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedStageIds.length; i++) {
    const { error } = await supabase
      .from('crm_pipeline_stages')
      .update({ position: i })
      .eq('id', orderedStageIds[i])
      .eq('pipeline_id', pipelineId)
    if (error) throw new Error(error.message)
  }
}

/**
 * Sync pipeline entries from linked segment definition.
 * - Inserts matching players into the first stage if absent
 * - Updates still_matches_segment for existing active entries
 */
export async function syncPipelineFromSegment(
  pipelineId: string,
  definition: SegmentDefinition,
  actorId?: string | null,
): Promise<{ added: number; updated: number }> {
  const board = await loadPipelineBoard(pipelineId)
  if (!board.stages.length) throw new Error('Pipeline sem estágios.')

  const firstStageId = board.stages[0].id
  const preview = await previewSegment(definition, 5000)
  const matchingIds = new Set(preview.sample.map((s) => s.playerId).filter(Boolean))
  const sampleComplete = preview.count <= preview.sample.length

  const existingByPlayer = new Map(board.entries.map((e) => [e.playerId, e]))
  let added = 0
  let updated = 0
  const now = new Date().toISOString()

  const toInsert: Record<string, unknown>[] = []
  const events: Record<string, unknown>[] = []

  for (const sample of preview.sample) {
    const playerId = sample.playerId
    if (!playerId) continue
    const existing = existingByPlayer.get(playerId)
    if (!existing) {
      const entryId = newId('pent')
      toInsert.push({
        id: entryId,
        board_id: BOARD_ID,
        pipeline_id: pipelineId,
        stage_id: firstStageId,
        player_id: playerId,
        entered_at: now,
        left_at: null,
        still_matches_segment: true,
      })
      events.push({
        id: newId('pevt'),
        board_id: BOARD_ID,
        pipeline_id: pipelineId,
        player_id: playerId,
        event_type: 'entered',
        from_stage_id: null,
        to_stage_id: firstStageId,
        actor_id: actorId ?? null,
        occurred_at: now,
        meta: {
          source: 'segment_sync',
          nickname: sample.nickname,
          incentiveAvailable: sample.incentiveAvailable,
        },
      })
      added++
    }
  }

  if (toInsert.length) {
    const { error } = await supabase.from('crm_pipeline_entries').insert(toInsert)
    if (error) throw new Error(error.message)
  }
  if (events.length) {
    const { error } = await supabase.from('crm_pipeline_events').insert(events)
    if (error) throw new Error(error.message)
  }

  for (const entry of board.entries) {
    let nextMatch: boolean | null = null
    if (matchingIds.has(entry.playerId)) nextMatch = true
    else if (sampleComplete) nextMatch = false

    if (nextMatch != null && entry.stillMatchesSegment !== nextMatch) {
      const { error } = await supabase
        .from('crm_pipeline_entries')
        .update({ still_matches_segment: nextMatch })
        .eq('id', entry.id)
      if (error) throw new Error(error.message)
      updated++
    }
  }

  await supabase
    .from('crm_pipelines')
    .update({ updated_at: now })
    .eq('id', pipelineId)

  return { added, updated }
}
