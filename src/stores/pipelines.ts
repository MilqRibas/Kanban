import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  addPipelineStage,
  addPlayerToPipeline,
  createPipeline,
  deletePipeline,
  listPipelines,
  listPipelineLeadEvents,
  loadPipelineBoard,
  movePipelineEntry,
  renamePipelineStage,
  reorderPipelineStages,
  syncPipelineFromSegment,
  updatePipeline,
  updatePipelineEntryNextContact,
  updatePipelineEntryNotes,
} from '../services/pipelinesApi'
import { listSegments } from '../services/segmentsApi'
import type { Pipeline, PipelineBoard, PipelineEntry, PipelineEvent } from '../types/pipelines'
import type { SegmentDefinition } from '../types/segments'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'

export const usePipelinesStore = defineStore('pipelines', () => {
  const rows = ref<Pipeline[]>([])
  const board = ref<PipelineBoard | null>(null)
  const leadEvents = ref<PipelineEvent[]>([])
  const loading = ref(false)
  const boardLoading = ref(false)
  const ready = ref(false)
  const error = ref<string | null>(null)
  const syncing = ref(false)

  async function load() {
    loading.value = true
    error.value = null
    try {
      rows.value = await listPipelines()
      ready.value = true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao carregar pipelines.'
      error.value = message
      useToastStore().error(message)
    } finally {
      loading.value = false
    }
  }

  async function init() {
    if (ready.value) return
    await load()
  }

  async function loadBoard(pipelineId: string) {
    boardLoading.value = true
    error.value = null
    try {
      board.value = await loadPipelineBoard(pipelineId)
    } catch (err) {
      board.value = null
      const message =
        err instanceof Error ? err.message : 'Falha ao abrir board do pipeline.'
      error.value = message
      useToastStore().error(message)
    } finally {
      boardLoading.value = false
    }
  }

  async function create(input: {
    name: string
    description?: string | null
    segmentId?: string | null
  }): Promise<Pipeline | null> {
    try {
      const auth = useAuthStore()
      const pipe = await createPipeline({
        ...input,
        createdBy: auth.memberId ?? null,
      })
      rows.value = [pipe, ...rows.value]
      useToastStore().success('Pipeline criado.')
      return pipe
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao criar pipeline.'
      useToastStore().error(message)
      return null
    }
  }

  async function createFromSegment(segmentId: string, name?: string): Promise<Pipeline | null> {
    const segments = await listSegments()
    const seg = segments.find((s) => s.id === segmentId)
    if (!seg) {
      useToastStore().error('Segmentação não encontrada.')
      return null
    }
    const pipe = await create({
      name: name?.trim() || `Pipeline · ${seg.name}`,
      segmentId: seg.id,
      description: seg.description,
    })
    if (pipe) {
      await loadBoard(pipe.id)
      await syncFromSegment(seg.definition)
    }
    return pipe
  }

  async function moveCard(entryId: string, toStageId: string) {
    const current = board.value
    if (!current) return
    const entry = current.entries.find((e) => e.id === entryId)
    if (!entry || entry.stageId === toStageId) return

    const fromStageId = entry.stageId
    // Optimistic
    entry.stageId = toStageId
    try {
      const auth = useAuthStore()
      await movePipelineEntry({
        entryId,
        pipelineId: current.pipeline.id,
        playerId: entry.playerId,
        fromStageId,
        toStageId,
        actorId: auth.memberId ?? null,
      })
    } catch (err) {
      entry.stageId = fromStageId
      const message =
        err instanceof Error ? err.message : 'Falha ao mover card.'
      useToastStore().error(message)
    }
  }

  /** Apply local column card lists after drag (vuedraggable). */
  function applyColumnEntries(stageId: string, entries: PipelineEntry[]) {
    const current = board.value
    if (!current) return
    const incomingIds = new Set(entries.map((entry) => entry.id))
    const kept = current.entries.filter(
      (entry) => entry.stageId !== stageId && !incomingIds.has(entry.id),
    )
    const seen = new Set<string>()
    const next: PipelineEntry[] = []
    for (const entry of entries) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      next.push({ ...entry, stageId })
    }
    current.entries = [...kept, ...next]
  }

  async function saveEntryNotes(entryId: string, notes: string) {
    const entry = board.value?.entries.find((item) => item.id === entryId)
    if (!entry) return
    const next = notes.trim() || null
    if ((entry.notes ?? null) === next) return
    const prev = entry.notes ?? null
    entry.notes = next
    try {
      const auth = useAuthStore()
      await updatePipelineEntryNotes({
        entryId,
        pipelineId: entry.pipelineId,
        playerId: entry.playerId,
        notes,
        actorId: auth.memberId ?? null,
      })
      await loadLeadEvents(entry.pipelineId, entry.playerId)
    } catch (err) {
      entry.notes = prev
      const message =
        err instanceof Error ? err.message : 'Falha ao salvar a observação.'
      useToastStore().error(message)
    }
  }

  async function saveNextContact(entryId: string, nextContactAt: string | null) {
    const entry = board.value?.entries.find((item) => item.id === entryId)
    if (!entry) return
    const next = nextContactAt || null
    if ((entry.nextContactAt ?? null) === next) return
    const prev = entry.nextContactAt ?? null
    entry.nextContactAt = next
    try {
      await updatePipelineEntryNextContact({ entryId, nextContactAt: next })
    } catch (err) {
      entry.nextContactAt = prev
      const message =
        err instanceof Error ? err.message : 'Falha ao salvar o próximo contato.'
      useToastStore().error(message)
    }
  }

  async function loadLeadEvents(pipelineId: string, playerId: string) {
    leadEvents.value = await listPipelineLeadEvents(pipelineId, playerId)
  }

  async function addPlayerFromBase(pipelineId: string, playerId: string) {
    const auth = useAuthStore()
    const result = await addPlayerToPipeline({
      pipelineId,
      playerId,
      actorId: auth.memberId ?? null,
    })
    if (board.value?.pipeline.id === pipelineId) await loadBoard(pipelineId)
    return result
  }

  async function syncFromSegment(definition?: SegmentDefinition) {
    const current = board.value
    if (!current) return
    let def = definition
    if (!def) {
      const segId = current.pipeline.segmentId
      if (!segId) {
        useToastStore().error('Pipeline sem segmentação vinculada.')
        return
      }
      const segments = await listSegments()
      const seg = segments.find((s) => s.id === segId)
      if (!seg) {
        useToastStore().error('Segmentação vinculada não encontrada.')
        return
      }
      def = seg.definition
    }

    syncing.value = true
    try {
      const auth = useAuthStore()
      const result = await syncPipelineFromSegment(
        current.pipeline.id,
        def,
        auth.memberId ?? null,
      )
      await loadBoard(current.pipeline.id)
      useToastStore().success(
        `Sincronizado: ${result.added} novo(s), ${result.updated} atualizado(s).`,
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao sincronizar da segmentação.'
      useToastStore().error(message)
    } finally {
      syncing.value = false
    }
  }

  async function addStage(name: string) {
    const current = board.value
    if (!current) return
    try {
      const stage = await addPipelineStage(current.pipeline.id, name)
      current.stages = [...current.stages, stage]
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao adicionar estágio.'
      useToastStore().error(message)
    }
  }

  async function renameStage(stageId: string, name: string) {
    const current = board.value
    if (!current) return
    const stage = current.stages.find((s) => s.id === stageId)
    if (!stage) return
    const prev = stage.name
    stage.name = name
    try {
      await renamePipelineStage(stageId, name)
    } catch (err) {
      stage.name = prev
      const message =
        err instanceof Error ? err.message : 'Falha ao renomear estágio.'
      useToastStore().error(message)
    }
  }

  async function reorderStages(orderedIds: string[]) {
    const current = board.value
    if (!current) return
    const byId = new Map(current.stages.map((s) => [s.id, s]))
    current.stages = orderedIds
      .map((id, position) => {
        const s = byId.get(id)
        if (!s) return null
        return { ...s, position }
      })
      .filter(Boolean) as typeof current.stages
    try {
      await reorderPipelineStages(current.pipeline.id, orderedIds)
    } catch (err) {
      await loadBoard(current.pipeline.id)
      const message =
        err instanceof Error ? err.message : 'Falha ao reordenar estágios.'
      useToastStore().error(message)
    }
  }

  async function remove(id: string) {
    try {
      await deletePipeline(id)
      rows.value = rows.value.filter((r) => r.id !== id)
      if (board.value?.pipeline.id === id) board.value = null
      useToastStore().success('Pipeline removido.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao remover pipeline.'
      useToastStore().error(message)
    }
  }

  async function rename(id: string, name: string) {
    try {
      await updatePipeline(id, { name })
      const row = rows.value.find((r) => r.id === id)
      if (row) row.name = name
      if (board.value?.pipeline.id === id) board.value.pipeline.name = name
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao renomear pipeline.'
      useToastStore().error(message)
    }
  }

  function closeBoard() {
    board.value = null
    leadEvents.value = []
  }

  function reset() {
    rows.value = []
    board.value = null
    leadEvents.value = []
    loading.value = false
    boardLoading.value = false
    ready.value = false
    error.value = null
    syncing.value = false
  }

  return {
    rows,
    board,
    leadEvents,
    loading,
    boardLoading,
    ready,
    error,
    syncing,
    init,
    load,
    loadBoard,
    create,
    createFromSegment,
    moveCard,
    applyColumnEntries,
    saveEntryNotes,
    saveNextContact,
    loadLeadEvents,
    addPlayerFromBase,
    syncFromSegment,
    addStage,
    renameStage,
    reorderStages,
    remove,
    rename,
    closeBoard,
    reset,
  }
})
