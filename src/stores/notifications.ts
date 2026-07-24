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

  const unreadCount = computed(
    () => items.value.filter((item) => !item.readAt).length,
  )

  const sorted = computed(() =>
    [...items.value].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
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
    items.value = []
    open.value = false
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }

  async function markRead(id: string) {
    const item = items.value.find((entry) => entry.id === id)
    if (!item || item.readAt) return
    item.readAt = new Date().toISOString()
    await supabase
      .from('notifications')
      .update({ read_at: item.readAt })
      .eq('id', id)
  }

  async function markAllRead() {
    const auth = useAuthStore()
    if (!auth.memberId) return
    const now = new Date().toISOString()
    for (const item of items.value) {
      if (!item.readAt) item.readAt = now
    }
    await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('recipient_member_id', auth.memberId)
      .is('read_at', null)
  }

  function openNotification(item: AppNotification) {
    void markRead(item.id)
    open.value = false
    if (item.cardId) {
      const board = useBoardStore()
      board.openCard(item.cardId)
    }
  }

  return {
    items,
    sorted,
    loading,
    open,
    unreadCount,
    init,
    reset,
    load,
    markRead,
    markAllRead,
    openNotification,
  }
})
