import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { BOARD_ID, supabase } from '../lib/supabase'
import type { AgendaEvent, AgendaEventDraft } from '../types/agenda'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'

function createId() {
  return `agevt-${crypto.randomUUID().slice(0, 8)}`
}

function mapRow(row: Record<string, unknown>): AgendaEvent {
  return {
    id: String(row.id),
    boardId: String(row.board_id ?? BOARD_ID),
    title: String(row.title ?? ''),
    description: row.description == null ? null : String(row.description),
    eventDate: String(row.event_date ?? '').slice(0, 10),
    eventTime: row.event_time == null || row.event_time === '' ? null : String(row.event_time),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

export const useAgendaStore = defineStore('agenda', () => {
  const events = ref<AgendaEvent[]>([])
  const loading = ref(false)
  const ready = ref(false)
  const error = ref<string | null>(null)
  let channel: RealtimeChannel | null = null

  const sortedEvents = computed(() =>
    [...events.value].sort((a, b) => {
      const d = a.eventDate.localeCompare(b.eventDate)
      if (d !== 0) return d
      const ta = a.eventTime || '99:99'
      const tb = b.eventTime || '99:99'
      return ta.localeCompare(tb)
    }),
  )

  function eventsOnDate(dateKey: string) {
    return sortedEvents.value.filter((e) => e.eventDate === dateKey)
  }

  async function load() {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('team_agenda_events')
        .select('*')
        .eq('board_id', BOARD_ID)
        .order('event_date', { ascending: true })
      if (err) throw err
      events.value = (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
      ready.value = true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao carregar a agenda.'
      error.value = message
      useToastStore().error(message)
    } finally {
      loading.value = false
    }
  }

  async function init() {
    await load()
    if (channel) return
    channel = supabase
      .channel(`team_agenda:${BOARD_ID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_agenda_events',
          filter: `board_id=eq.${BOARD_ID}`,
        },
        () => {
          void load()
        },
      )
      .subscribe()
  }

  function reset() {
    events.value = []
    ready.value = false
    error.value = null
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  async function addEvent(draft: AgendaEventDraft) {
    const title = draft.title.trim()
    if (!title) {
      useToastStore().error('Informe um título.')
      return null
    }
    if (!draft.eventDate) {
      useToastStore().error('Informe a data.')
      return null
    }
    const auth = useAuthStore()
    const now = new Date().toISOString()
    const row = {
      id: createId(),
      board_id: BOARD_ID,
      title,
      description: draft.description?.trim() || null,
      event_date: draft.eventDate,
      event_time: draft.eventTime?.trim() || null,
      created_by: auth.memberId,
      created_at: now,
      updated_at: now,
    }
    const { data, error: err } = await supabase
      .from('team_agenda_events')
      .insert(row)
      .select('*')
      .single()
    if (err) {
      useToastStore().error(err.message)
      return null
    }
    const mapped = mapRow(data as Record<string, unknown>)
    events.value = [...events.value.filter((e) => e.id !== mapped.id), mapped]
    useToastStore().success('Item adicionado à agenda.')
    return mapped
  }

  async function updateEvent(id: string, draft: Partial<AgendaEventDraft>) {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (draft.title != null) patch.title = draft.title.trim()
    if (draft.description !== undefined) {
      patch.description = draft.description?.trim() || null
    }
    if (draft.eventDate != null) patch.event_date = draft.eventDate
    if (draft.eventTime !== undefined) {
      patch.event_time = draft.eventTime?.trim() || null
    }
    const { data, error: err } = await supabase
      .from('team_agenda_events')
      .update(patch)
      .eq('board_id', BOARD_ID)
      .eq('id', id)
      .select('*')
      .single()
    if (err) {
      useToastStore().error(err.message)
      return null
    }
    const mapped = mapRow(data as Record<string, unknown>)
    events.value = events.value.map((e) => (e.id === id ? mapped : e))
    return mapped
  }

  async function removeEvent(id: string) {
    const { error: err } = await supabase
      .from('team_agenda_events')
      .delete()
      .eq('board_id', BOARD_ID)
      .eq('id', id)
    if (err) {
      useToastStore().error(err.message)
      return
    }
    events.value = events.value.filter((e) => e.id !== id)
    useToastStore().success('Item removido da agenda.')
  }

  return {
    events,
    sortedEvents,
    loading,
    ready,
    error,
    eventsOnDate,
    init,
    load,
    reset,
    addEvent,
    updateEvent,
    removeEvent,
  }
})
