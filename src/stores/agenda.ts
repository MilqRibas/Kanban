import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { BOARD_ID, supabase } from '../lib/supabase'
import type { Attachment } from '../types/board'
import type { AgendaEvent, AgendaEventDraft } from '../types/agenda'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'

function createId(prefix = 'agevt') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function mapAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return []
  const list: Attachment[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = String(row.id ?? '')
    const url = String(row.url ?? '')
    if (!id || !url) continue
    list.push({
      id,
      name: String(row.name ?? 'arquivo'),
      url,
      mimeType: String(row.mimeType ?? row.mime_type ?? 'application/octet-stream'),
      sizeBytes: Number(row.sizeBytes ?? row.size_bytes ?? 0),
      createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
      kind: row.kind === 'link' ? 'link' : 'file',
    })
  }
  return list
}

function mapRow(row: Record<string, unknown>): AgendaEvent {
  const memberRaw = row.member_ids
  const memberIds = Array.isArray(memberRaw)
    ? memberRaw.map((id) => String(id)).filter(Boolean)
    : []
  return {
    id: String(row.id),
    boardId: String(row.board_id ?? BOARD_ID),
    title: String(row.title ?? ''),
    description: row.description == null ? null : String(row.description),
    eventDate: String(row.event_date ?? '').slice(0, 10),
    eventTime:
      row.event_time == null || row.event_time === ''
        ? null
        : String(row.event_time).slice(0, 5),
    memberIds,
    attachments: mapAttachments(row.attachments),
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

  function getById(id: string) {
    return events.value.find((e) => e.id === id) ?? null
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
      member_ids: draft.memberIds ?? [],
      attachments: [],
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

  async function updateEvent(
    id: string,
    draft: Partial<AgendaEventDraft> & {
      attachments?: Attachment[]
      memberIds?: string[]
    },
  ) {
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
    if (draft.memberIds !== undefined) patch.member_ids = draft.memberIds
    if (draft.attachments !== undefined) patch.attachments = draft.attachments
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

  async function toggleMember(eventId: string, memberId: string) {
    const event = getById(eventId)
    if (!event) return null
    const has = event.memberIds.includes(memberId)
    const memberIds = has
      ? event.memberIds.filter((id) => id !== memberId)
      : [...event.memberIds, memberId]
    return updateEvent(eventId, { memberIds })
  }

  async function uploadAttachment(eventId: string, file: File) {
    const toast = useToastStore()
    const event = getById(eventId)
    if (!event) return null

    const maxBytes = 5 * 1024 * 1024
    if (file.size > maxBytes) {
      toast.error('Arquivo acima do limite de 5 MB.')
      return null
    }

    const attachmentId = createId('a')
    const fallbackExt = file.type.split('/')[1] || 'bin'
    const rawName = file.name?.trim() || `arquivo.${fallbackExt}`
    const safeName = rawName.replace(/[^\w.\-]+/g, '_')
    const storagePath = `${BOARD_ID}/agenda/${eventId}/${attachmentId}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('card-attachments')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })
    if (uploadError) {
      error.value = uploadError.message
      toast.error(uploadError.message)
      return null
    }

    const { data: publicUrl } = supabase.storage
      .from('card-attachments')
      .getPublicUrl(storagePath)

    const attachment: Attachment = {
      id: attachmentId,
      name: safeName,
      url: publicUrl.publicUrl,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      kind: 'file',
    }

    const nextAttachments = [...event.attachments, attachment]
    const saved = await updateEvent(eventId, { attachments: nextAttachments })
    if (!saved) return null
    return attachment
  }

  async function removeAttachment(eventId: string, attachmentId: string) {
    const event = getById(eventId)
    if (!event) return
    const attachment = event.attachments.find((item) => item.id === attachmentId)
    const nextAttachments = event.attachments.filter((item) => item.id !== attachmentId)
    await updateEvent(eventId, { attachments: nextAttachments })

    if (attachment?.kind !== 'link' && attachment?.url) {
      const storagePath = decodeURIComponent(
        attachment.url.split('/card-attachments/')[1]?.split('?')[0] ?? '',
      )
      if (storagePath) {
        await supabase.storage.from('card-attachments').remove([storagePath])
      }
    }
  }

  async function removeEvent(id: string) {
    const event = getById(id)
    const { error: err } = await supabase
      .from('team_agenda_events')
      .delete()
      .eq('board_id', BOARD_ID)
      .eq('id', id)
    if (err) {
      useToastStore().error(err.message)
      return
    }
    if (event?.attachments.length) {
      const paths = event.attachments
        .map((file) =>
          decodeURIComponent(
            file.url.split('/card-attachments/')[1]?.split('?')[0] ?? '',
          ),
        )
        .filter(Boolean)
      if (paths.length) {
        await supabase.storage.from('card-attachments').remove(paths)
      }
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
    getById,
    init,
    load,
    reset,
    addEvent,
    updateEvent,
    toggleMember,
    uploadAttachment,
    removeAttachment,
    removeEvent,
  }
})
