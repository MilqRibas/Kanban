import { BOARD_ID, supabase } from '../lib/supabase'
import type {
  SegmentDefinition,
  SegmentPreviewResult,
  SegmentPreviewSample,
  SegmentRow,
} from '../types/segments'
import { createDefaultDefinition } from '../utils/segmentDefinition'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s ? s : null
}

function mapDefinition(raw: unknown): SegmentDefinition {
  if (!raw || typeof raw !== 'object') return createDefaultDefinition()
  const obj = raw as Record<string, unknown>
  const groups = Array.isArray(obj.groups) ? obj.groups : []
  return {
    groupLogic: obj.groupLogic === 'and' ? 'and' : 'or',
    groups: groups.map((g) => {
      const group = (g ?? {}) as Record<string, unknown>
      const conditions = Array.isArray(group.conditions) ? group.conditions : []
      return {
        logic: group.logic === 'or' ? ('or' as const) : ('and' as const),
        conditions: conditions.map((c) => {
          const cond = (c ?? {}) as Record<string, unknown>
          return {
            field: String(cond.field ?? ''),
            op: (String(cond.op ?? 'eq') as SegmentDefinition['groups'][0]['conditions'][0]['op']),
            value: (cond.value as string | number | boolean) ?? '',
            valueTo: cond.valueTo == null ? undefined : asNumber(cond.valueTo),
          }
        }),
      }
    }),
  }
}

function mapRow(raw: Record<string, unknown>): SegmentRow {
  return {
    id: String(raw.id ?? ''),
    boardId: String(raw.board_id ?? BOARD_ID),
    name: String(raw.name ?? ''),
    description: asString(raw.description),
    definition: mapDefinition(raw.definition),
    updatedAt: String(raw.updated_at ?? new Date().toISOString()),
  }
}

export async function listSegments(): Promise<SegmentRow[]> {
  const { data, error } = await supabase
    .from('crm_segment_definitions')
    .select('id, board_id, name, description, definition, updated_at')
    .eq('board_id', BOARD_ID)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>))

  // Enrich with pipeline names when linked
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return rows

  const { data: pipes } = await supabase
    .from('crm_pipelines')
    .select('name, segment_id')
    .eq('board_id', BOARD_ID)
    .in('segment_id', ids)

  if (pipes?.length) {
    const bySeg = new Map<string, string>()
    for (const p of pipes) {
      const segId = asString((p as Record<string, unknown>).segment_id)
      const name = asString((p as Record<string, unknown>).name)
      if (segId && name && !bySeg.has(segId)) bySeg.set(segId, name)
    }
    for (const row of rows) {
      row.pipelineName = bySeg.get(row.id) ?? null
    }
  }

  return rows
}

export async function upsertSegment(input: {
  id?: string | null
  name: string
  description?: string | null
  definition: SegmentDefinition
  createdBy?: string | null
}): Promise<SegmentRow> {
  const now = new Date().toISOString()
  const id = input.id?.trim() || newId('seg')
  const isUpdate = Boolean(input.id?.trim())

  const payload: Record<string, unknown> = {
    id,
    board_id: BOARD_ID,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    definition: input.definition,
    updated_at: now,
  }

  if (!isUpdate) {
    payload.created_by = input.createdBy ?? null
    payload.created_at = now
  }

  const { data, error } = await supabase
    .from('crm_segment_definitions')
    .upsert(payload, { onConflict: 'id' })
    .select('id, board_id, name, description, definition, updated_at')
    .single()

  if (error) throw new Error(error.message)
  return mapRow(data as Record<string, unknown>)
}

export async function deleteSegment(id: string): Promise<void> {
  const { error } = await supabase
    .from('crm_segment_definitions')
    .delete()
    .eq('id', id)
    .eq('board_id', BOARD_ID)
  if (error) throw new Error(error.message)
}

export type SegmentClubFilter =
  | 'all'
  | 'sx_club'
  | 'xtreme_pro'
  | 'sx_only'
  | 'xtreme_only'
  | 'both'

export async function previewSegment(
  definition: SegmentDefinition,
  sampleLimit = 20,
  club: SegmentClubFilter = 'all',
): Promise<SegmentPreviewResult> {
  const { data, error } = await supabase.rpc('crm_preview_segment', {
    p_board_id: BOARD_ID,
    p_definition: definition,
    p_sample_limit: sampleLimit,
    ...(club === 'all' ? {} : { p_club: club }),
  })
  if (error) throw new Error(error.message)

  const payload = (data ?? {}) as Record<string, unknown>
  const sampleRaw = Array.isArray(payload.sample) ? payload.sample : []
  const sample: SegmentPreviewSample[] = sampleRaw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      playerId: String(r.playerId ?? r.player_id ?? ''),
      name: asString(r.name),
      nickname: asString(r.nickname),
      incentiveAvailable: asNumber(r.incentiveAvailable ?? r.incentive_available),
      accumulatedRake: asNumber(r.accumulatedRake ?? r.accumulated_rake),
    }
  })

  return {
    count: asNumber(payload.count),
    sample,
  }
}

/** Preview with high sample limit — used by pipeline sync. */
export async function previewSegmentPlayers(
  definition: SegmentDefinition,
  sampleLimit = 5000,
): Promise<SegmentPreviewSample[]> {
  const result = await previewSegment(definition, sampleLimit)
  return result.sample
}
