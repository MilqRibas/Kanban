import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { CommunityContent } from '../types/community'
import { BOARD_ID, supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'

function createId() {
  return `cc-${crypto.randomUUID().slice(0, 8)}`
}

function mapRow(row: Record<string, unknown>): CommunityContent {
  return {
    id: String(row.id),
    sectionId: (row.section_id as string | null) ?? null,
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    status: String(row.status ?? 'Rascunho'),
    contentType: String(row.content_type ?? ''),
    objective: String(row.objective ?? ''),
    community: String(row.community ?? ''),
    fds: String(row.fds ?? ''),
    publishDate: (row.publish_date as string | null) ?? null,
    authorId: (row.author_id as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export const useCommunityStore = defineStore('community', () => {
  const items = ref<CommunityContent[]>([])
  const selectedId = ref<string | null>(null)
  const activeSectionId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let channel: RealtimeChannel | null = null
  let suppressRealtimeUntil = 0
  let reloadTimer: ReturnType<typeof setTimeout> | null = null

  const selected = computed(
    () => items.value.find((item) => item.id === selectedId.value) ?? null,
  )

  const sectionItems = computed(() => {
    if (!activeSectionId.value) return items.value
    return items.value.filter(
      (item) => item.sectionId === activeSectionId.value,
    )
  })

  const byPublishDate = computed(() => {
    const map: Record<string, CommunityContent[]> = {}
    for (const item of sectionItems.value) {
      if (!item.publishDate) continue
      const key = item.publishDate.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(item)
    }
    return map
  })

  const undatedItems = computed(() =>
    sectionItems.value.filter((item) => !item.publishDate),
  )

  function quietRealtime(ms = 800) {
    suppressRealtimeUntil = Date.now() + ms
  }

  function setActiveSection(sectionId: string | null) {
    activeSectionId.value = sectionId
  }

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: loadError } = await supabase
      .from('community_contents')
      .select('*')
      .eq('board_id', BOARD_ID)
      .order('publish_date', { ascending: true })

    if (loadError) {
      error.value = loadError.message
      useToastStore().error(loadError.message)
      loading.value = false
      return
    }

    items.value = (data ?? []).map((row) => mapRow(row as Record<string, unknown>))
    loading.value = false
  }

  function subscribeRealtime() {
    unsubscribeRealtime()
    channel = supabase
      .channel(`community:${BOARD_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_contents' },
        () => {
          if (Date.now() < suppressRealtimeUntil) return
          if (reloadTimer) clearTimeout(reloadTimer)
          reloadTimer = setTimeout(() => {
            reloadTimer = null
            if (Date.now() < suppressRealtimeUntil) return
            void load()
          }, 700)
        },
      )
      .subscribe()
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
  }

  function reset() {
    unsubscribeRealtime()
    items.value = []
    selectedId.value = null
    activeSectionId.value = null
    loading.value = false
    error.value = null
  }

  function open(id: string) {
    selectedId.value = id
  }

  function close() {
    selectedId.value = null
  }

  async function create(params: {
    title?: string
    body?: string
    publishDate?: string | null
    status?: string
    sectionId?: string | null
  }) {
    const auth = useAuthStore()
    const toast = useToastStore()
    const now = new Date().toISOString()
    const id = createId()
    const sectionId = params.sectionId ?? activeSectionId.value
    const row = {
      id,
      board_id: BOARD_ID,
      section_id: sectionId,
      title: params.title?.trim() || 'Novo conteúdo',
      body: params.body ?? '',
      status: params.status ?? 'Rascunho',
      content_type: '',
      objective: '',
      community: '',
      fds: '',
      publish_date: params.publishDate ?? null,
      author_id: auth.memberId,
      created_at: now,
      updated_at: now,
    }

    quietRealtime()
    const { error: insertError } = await supabase
      .from('community_contents')
      .insert(row)

    if (insertError) {
      error.value = insertError.message
      toast.error(insertError.message)
      return null
    }

    const item = mapRow(row)
    items.value = [...items.value, item]
    selectedId.value = id
    return item
  }

  async function update(
    id: string,
    patch: Partial<{
      title: string
      body: string
      status: string
      contentType: string
      objective: string
      community: string
      fds: string
      publishDate: string | null
      sectionId: string | null
    }>,
  ) {
    const item = items.value.find((entry) => entry.id === id)
    if (!item) return
    const toast = useToastStore()

    const dbPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (patch.title !== undefined) dbPatch.title = patch.title
    if (patch.body !== undefined) dbPatch.body = patch.body
    if (patch.status !== undefined) dbPatch.status = patch.status
    if (patch.contentType !== undefined) dbPatch.content_type = patch.contentType
    if (patch.objective !== undefined) dbPatch.objective = patch.objective
    if (patch.community !== undefined) dbPatch.community = patch.community
    if (patch.fds !== undefined) dbPatch.fds = patch.fds
    if (patch.publishDate !== undefined) dbPatch.publish_date = patch.publishDate
    if (patch.sectionId !== undefined) dbPatch.section_id = patch.sectionId

    quietRealtime()
    const { error: updateError } = await supabase
      .from('community_contents')
      .update(dbPatch)
      .eq('id', id)

    if (updateError) {
      error.value = updateError.message
      toast.error(updateError.message)
      return
    }

    Object.assign(item, {
      ...patch,
      updatedAt: String(dbPatch.updated_at),
    })
  }

  async function remove(id: string) {
    const toast = useToastStore()
    quietRealtime()
    const { error: deleteError } = await supabase
      .from('community_contents')
      .delete()
      .eq('id', id)

    if (deleteError) {
      error.value = deleteError.message
      toast.error(deleteError.message)
      return
    }

    items.value = items.value.filter((item) => item.id !== id)
    if (selectedId.value === id) selectedId.value = null
  }

  return {
    items,
    selectedId,
    activeSectionId,
    selected,
    sectionItems,
    byPublishDate,
    undatedItems,
    loading,
    error,
    init,
    reset,
    load,
    setActiveSection,
    open,
    close,
    create,
    update,
    remove,
  }
})
