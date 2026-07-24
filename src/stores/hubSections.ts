import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { HubSection, HubSectionKind } from '../types/community'
import { BOARD_ID, supabase } from '../lib/supabase'

function createId() {
  return `hub-${crypto.randomUUID().slice(0, 8)}`
}

function mapKind(raw: unknown): HubSectionKind {
  if (
    raw === 'link' ||
    raw === 'folder' ||
    raw === 'community_calendar' ||
    raw === 'note'
  ) {
    return raw
  }
  return 'note'
}

function mapRow(row: Record<string, unknown>): HubSection {
  return {
    id: String(row.id),
    parent: String(row.parent ?? 'home'),
    title: String(row.title ?? 'Sem título'),
    kind: mapKind(row.kind),
    description: String(row.description ?? ''),
    eyebrow: String(row.eyebrow ?? ''),
    url: (row.url as string | null) ?? null,
    position: Number(row.position ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export const useHubSectionsStore = defineStore('hubSections', () => {
  const sections = ref<HubSection[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let channel: RealtimeChannel | null = null

  const homeCards = computed(() =>
    [...sections.value]
      .filter((section) => section.parent === 'home')
      .sort((a, b) => a.position - b.position),
  )

  const conteudoSections = computed(() =>
    [...sections.value]
      .filter((section) => section.parent === 'conteudo')
      .sort((a, b) => a.position - b.position),
  )

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: loadError } = await supabase
      .from('hub_sections')
      .select('*')
      .eq('board_id', BOARD_ID)
      .order('position', { ascending: true })

    if (loadError) {
      error.value = loadError.message
      loading.value = false
      return
    }

    sections.value = (data ?? []).map((row) =>
      mapRow(row as Record<string, unknown>),
    )
    loading.value = false
  }

  function subscribe() {
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
    channel = supabase
      .channel(`hub_sections:${BOARD_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hub_sections' },
        () => {
          void load()
        },
      )
      .subscribe()
  }

  async function init() {
    await load()
    subscribe()
  }

  function reset() {
    sections.value = []
    error.value = null
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  function nextPosition(parent: string) {
    return (
      sections.value
        .filter((section) => section.parent === parent)
        .reduce((max, section) => Math.max(max, section.position), -1) + 1
    )
  }

  async function create(params: {
    title?: string
    parent?: string
    kind?: HubSectionKind
    description?: string
    eyebrow?: string
    url?: string | null
  }) {
    const parent = params.parent ?? 'home'
    const kind = params.kind ?? (parent === 'conteudo' ? 'community_calendar' : 'note')
    const now = new Date().toISOString()
    const id = createId()
    const row = {
      id,
      board_id: BOARD_ID,
      parent,
      title: params.title?.trim() || (parent === 'conteudo' ? 'Nova subdivisão' : 'Novo card'),
      kind,
      description: params.description?.trim() ?? '',
      eyebrow: params.eyebrow?.trim() ?? (kind === 'link' ? 'Link' : 'Card'),
      url: params.url?.trim() || null,
      position: nextPosition(parent),
      created_at: now,
      updated_at: now,
    }
    const { error: insertError } = await supabase.from('hub_sections').insert(row)
    if (insertError) {
      error.value = insertError.message
      return null
    }
    const section = mapRow(row)
    sections.value = [...sections.value, section]
    return section
  }

  async function update(
    id: string,
    patch: Partial<{
      title: string
      description: string
      eyebrow: string
      url: string | null
      kind: HubSectionKind
    }>,
  ) {
    const section = sections.value.find((item) => item.id === id)
    if (!section) return

    const dbPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (patch.title !== undefined) dbPatch.title = patch.title.trim()
    if (patch.description !== undefined) dbPatch.description = patch.description.trim()
    if (patch.eyebrow !== undefined) dbPatch.eyebrow = patch.eyebrow.trim()
    if (patch.url !== undefined) dbPatch.url = patch.url?.trim() || null
    if (patch.kind !== undefined) dbPatch.kind = patch.kind

    const { error: updateError } = await supabase
      .from('hub_sections')
      .update(dbPatch)
      .eq('id', id)

    if (updateError) {
      error.value = updateError.message
      return
    }

    Object.assign(section, {
      ...patch,
      title: patch.title !== undefined ? patch.title.trim() : section.title,
      description:
        patch.description !== undefined
          ? patch.description.trim()
          : section.description,
      eyebrow:
        patch.eyebrow !== undefined ? patch.eyebrow.trim() : section.eyebrow,
      url:
        patch.url !== undefined ? patch.url?.trim() || null : section.url,
      updatedAt: String(dbPatch.updated_at),
    })
  }

  async function rename(id: string, title: string) {
    await update(id, { title })
  }

  async function remove(id: string) {
    const { error: deleteError } = await supabase
      .from('hub_sections')
      .delete()
      .eq('id', id)
    if (deleteError) {
      error.value = deleteError.message
      return false
    }
    sections.value = sections.value.filter((item) => item.id !== id)
    return true
  }

  return {
    sections,
    homeCards,
    conteudoSections,
    loading,
    error,
    init,
    reset,
    load,
    create,
    update,
    rename,
    remove,
  }
})
