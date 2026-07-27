import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { AppNotification } from '../types/board'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useBoardStore } from './board'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const loading = ref(false)
  const open = ref(false)
  let channel: RealtimeChannel | null = null
  let suppressRealtimeUntil = 0
  let reloadTimer: ReturnType<typeof setTimeout> | null = null

  const unreadCount = computed(
    () => items.value.filter((item) => !item.readAt).length,
  )

  const sorted = computed(() =>
    [...items.value].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  )

  /** Agrupa notificações semelhantes (mesmo tipo + cartão + título) */
  const grouped = computed(() => {
    const buckets = new Map<
      string,
      {
        key: string
        items: AppNotification[]
        latest: AppNotification
        unreadCount: number
      }
    >()

    for (const item of sorted.value) {
      const key = `${item.type}|${item.cardId ?? ''}|${item.title}`
      const existing = buckets.get(key)
      if (existing) {
        existing.items.push(item)
        if (!item.readAt) existing.unreadCount += 1
      } else {
        buckets.set(key, {
          key,
          items: [item],
          latest: item,
          unreadCount: item.readAt ? 0 : 1,
        })
      }
    }

    return [...buckets.values()]
  })

  const readCount = computed(
    () => items.value.filter((item) => item.readAt).length,
  )

  function mapRow(row: {
    id: string
    board_id: string
    recipient_member_id: string
    actor_member_id: string | null
    card_id: string | null
    type: string
    title: string
    body: string
    read_at: string | null
    created_at: string
    meta?: Record<string, unknown> | null
  }): AppNotification {
    return {
      id: row.id,
      boardId: row.board_id,
      recipientMemberId: row.recipient_member_id,
      actorMemberId: row.actor_member_id,
      cardId: row.card_id,
      type: row.type as AppNotification['type'],
      title: row.title,
      body: row.body,
      readAt: row.read_at,
      createdAt: row.created_at,
      meta: row.meta ?? {},
    }
  }

  function quietRealtime(ms = 1200) {
    suppressRealtimeUntil = Date.now() + ms
  }

  async function load() {
    const auth = useAuthStore()
    if (!auth.memberId) {
      items.value = []
      return
    }
    loading.value = true
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_member_id', auth.memberId)
      .order('created_at', { ascending: false })
      .limit(50)
    loading.value = false
    if (error) return
    items.value = (data ?? []).map(mapRow)
  }

  function scheduleReload() {
    if (Date.now() < suppressRealtimeUntil) return
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      if (Date.now() < suppressRealtimeUntil) return
      void load()
    }, 400)
  }

  function subscribe() {
    const auth = useAuthStore()
    if (!auth.memberId) return
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    channel = supabase
      .channel(`notifications:${auth.memberId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_member_id=eq.${auth.memberId}`,
        },
        () => {
          scheduleReload()
        },
      )
      .subscribe()
  }

  async function init() {
    await load()
    subscribe()
  }

  function reset() {
    items.value = []
    open.value = false
    if (reloadTimer) {
      clearTimeout(reloadTimer)
      reloadTimer = null
    }
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }

  async function persistReadAt(ids: string[], readAt: string) {
    if (!ids.length) return true

    quietRealtime()
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .in('id', ids)
      .select('id')

    if (error) {
      console.error('[notifications] falha ao marcar lidas', error.message)
      return false
    }

    // RLS pode “engolir” o update (0 linhas) sem error — confirma pelo select
    if ((data?.length ?? 0) < ids.length) {
      const auth = useAuthStore()
      if (!auth.memberId) return false
      const { data: fallback, error: fallbackError } = await supabase
        .from('notifications')
        .update({ read_at: readAt })
        .eq('recipient_member_id', auth.memberId)
        .in('id', ids)
        .select('id')

      if (fallbackError || !(fallback?.length ?? 0)) {
        console.error(
          '[notifications] update sem efeito (possível RLS)',
          fallbackError?.message,
        )
        return false
      }
    }

    return true
  }

  async function markRead(id: string) {
    const item = items.value.find((entry) => entry.id === id)
    if (!item || item.readAt) return
    const now = new Date().toISOString()
    item.readAt = now
    const ok = await persistReadAt([id], now)
    if (!ok) await load()
  }

  async function markAllRead() {
    const auth = useAuthStore()
    if (!auth.memberId) return

    const unreadIds = items.value
      .filter((item) => !item.readAt)
      .map((item) => item.id)
    if (!unreadIds.length) return

    const now = new Date().toISOString()
    for (const item of items.value) {
      if (!item.readAt) item.readAt = now
    }

    const ok = await persistReadAt(unreadIds, now)
    if (!ok) await load()
  }

  function openNotification(item: AppNotification) {
    void markRead(item.id)
    open.value = false
    if (item.cardId) {
      const board = useBoardStore()
      board.openCard(item.cardId)
    }
  }

  async function openGroup(group: {
    items: AppNotification[]
    latest: AppNotification
  }) {
    const unreadIds = group.items
      .filter((item) => !item.readAt)
      .map((item) => item.id)
    if (unreadIds.length) {
      const now = new Date().toISOString()
      for (const item of group.items) {
        if (!item.readAt) item.readAt = now
      }
      const ok = await persistReadAt(unreadIds, now)
      if (!ok) await load()
    }
    open.value = false
    if (group.latest.cardId) {
      const board = useBoardStore()
      board.openCard(group.latest.cardId)
    }
  }

  async function clearRead() {
    const auth = useAuthStore()
    if (!auth.memberId) return
    const readIds = items.value
      .filter((item) => item.readAt)
      .map((item) => item.id)
    if (!readIds.length) return

    quietRealtime()
    const { error } = await supabase
      .from('notifications')
      .delete()
      .in('id', readIds)
    if (error) {
      console.error('[notifications] falha ao limpar lidas', error.message)
      return
    }
    items.value = items.value.filter((item) => !item.readAt)
  }

  async function clearOlderThanDays(days = 14) {
    const auth = useAuthStore()
    if (!auth.memberId) return
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const oldIds = items.value
      .filter((item) => new Date(item.createdAt).getTime() < cutoff)
      .map((item) => item.id)
    if (!oldIds.length) return

    quietRealtime()
    const { error } = await supabase
      .from('notifications')
      .delete()
      .in('id', oldIds)
    if (error) {
      console.error('[notifications] falha ao limpar antigas', error.message)
      return
    }
    items.value = items.value.filter((item) => !oldIds.includes(item.id))
  }

  return {
    items,
    sorted,
    grouped,
    loading,
    open,
    unreadCount,
    readCount,
    init,
    reset,
    load,
    markRead,
    markAllRead,
    openNotification,
    openGroup,
    clearRead,
    clearOlderThanDays,
  }
})
