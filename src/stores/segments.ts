import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  deleteSegment as apiDelete,
  listSegments,
  previewSegment,
  upsertSegment,
} from '../services/segmentsApi'
import type {
  SegmentDefinition,
  SegmentPreviewResult,
  SegmentRow,
} from '../types/segments'
import { cloneDefinition, createDefaultDefinition, sanitizeDefinition } from '../utils/segmentDefinition'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'

export const useSegmentsStore = defineStore('segments', () => {
  const rows = ref<SegmentRow[]>([])
  const loading = ref(false)
  const ready = ref(false)
  const error = ref<string | null>(null)
  const saving = ref(false)

  const preview = ref<SegmentPreviewResult | null>(null)
  const previewLoading = ref(false)
  const previewError = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      rows.value = await listSegments()
      ready.value = true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao carregar segmentações.'
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

  async function save(input: {
    id?: string | null
    name: string
    description?: string | null
    definition: SegmentDefinition
  }): Promise<SegmentRow | null> {
    saving.value = true
    error.value = null
    try {
      const auth = useAuthStore()
      const cleaned = sanitizeDefinition(input.definition)
      const row = await upsertSegment({
        ...input,
        definition: cleaned,
        createdBy: auth.memberId ?? null,
      })
      const idx = rows.value.findIndex((r) => r.id === row.id)
      if (idx >= 0) rows.value[idx] = { ...rows.value[idx], ...row }
      else rows.value = [row, ...rows.value]
      useToastStore().success('Segmentação salva.')
      return row
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao salvar segmentação.'
      error.value = message
      useToastStore().error(message)
      return null
    } finally {
      saving.value = false
    }
  }

  async function remove(id: string) {
    try {
      await apiDelete(id)
      rows.value = rows.value.filter((r) => r.id !== id)
      useToastStore().success('Segmentação removida.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao remover segmentação.'
      useToastStore().error(message)
    }
  }

  async function runPreview(definition: SegmentDefinition, sampleLimit = 20) {
    previewLoading.value = true
    previewError.value = null
    try {
      const cleaned = sanitizeDefinition(definition)
      if (!cleaned.groups.length) {
        preview.value = { count: 0, sample: [] }
        return preview.value
      }
      preview.value = await previewSegment(cleaned, sampleLimit)
      return preview.value
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao pré-visualizar segmento.'
      previewError.value = message
      preview.value = null
      return null
    } finally {
      previewLoading.value = false
    }
  }

  function duplicateRow(row: SegmentRow): {
    name: string
    description: string | null
    definition: SegmentDefinition
  } {
    return {
      name: `${row.name} (cópia)`,
      description: row.description,
      definition: cloneDefinition(row.definition ?? createDefaultDefinition()),
    }
  }

  function cachePlayerCount(id: string, count: number) {
    const row = rows.value.find((r) => r.id === id)
    if (row) row.playerCount = count
  }

  function reset() {
    rows.value = []
    loading.value = false
    ready.value = false
    error.value = null
    saving.value = false
    preview.value = null
    previewLoading.value = false
    previewError.value = null
  }

  return {
    rows,
    loading,
    ready,
    error,
    saving,
    preview,
    previewLoading,
    previewError,
    init,
    load,
    save,
    remove,
    runPreview,
    duplicateRow,
    cachePlayerCount,
    reset,
  }
})
