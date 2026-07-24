import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Note, NoteKind } from '../types/notes'
import { BOARD_ID, supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useBoardStore } from './board'

function createId() {
  return `note-${crypto.randomUUID().slice(0, 8)}`
}

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const selectedNoteId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let channel: RealtimeChannel | null = null
  let suppressRealtimeUntil = 0
  let reloadTimer: ReturnType<typeof setTimeout> | null = null

  const selectedNote = computed(
    () => notes.value.find((note) => note.id === selectedNoteId.value) ?? null,
  )

  const sortedNotes = computed(() =>
    [...notes.value].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  )

  function quietRealtime(ms = 800) {
    suppressRealtimeUntil = Date.now() + ms
  }

  async function loadNotes() {
    loading.value = true
    error.value = null
    const { data, error: loadError } = await supabase
      .from('notes')
      .select('*')
      .eq('board_id', BOARD_ID)
      .order('updated_at', { ascending: false })

    if (loadError) {
      error.value = loadError.message
      loading.value = false
      return
    }

    notes.value = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      kind: row.kind as NoteKind,
      authorId: row.author_id ?? 'm3',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    if (
      !selectedNoteId.value ||
      !notes.value.some((note) => note.id === selectedNoteId.value)
    ) {
      selectedNoteId.value = notes.value[0]?.id ?? null
    }
    loading.value = false
  }

  function subscribeRealtime() {
    unsubscribeRealtime()
    channel = supabase
      .channel(`notes:${BOARD_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes' },
        () => {
          if (Date.now() < suppressRealtimeUntil) return
          if (reloadTimer) clearTimeout(reloadTimer)
          reloadTimer = setTimeout(() => {
            reloadTimer = null
            if (Date.now() < suppressRealtimeUntil) return
            void loadNotes()
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
    await loadNotes()
    subscribeRealtime()
  }

  function reset() {
    unsubscribeRealtime()
    notes.value = []
    selectedNoteId.value = null
  }

  function selectNote(id: string) {
    selectedNoteId.value = id
  }

  async function createNote(kind: NoteKind = 'note') {
    const auth = useAuthStore()
    const board = useBoardStore()
    const note: Note = {
      id: createId(),
      title: kind === 'meeting' ? 'Nova ata de reunião' : 'Nova anotação',
      body: '',
      kind,
      authorId: auth.memberId ?? board.members[0]?.id ?? 'm3',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    notes.value.unshift(note)
    selectedNoteId.value = note.id
    quietRealtime()
    const { error: insertError } = await supabase.from('notes').insert({
      id: note.id,
      board_id: BOARD_ID,
      title: note.title,
      body: note.body,
      kind: note.kind,
      author_id: note.authorId,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
    })
    if (insertError) error.value = insertError.message
    return note
  }

  async function updateNote(
    id: string,
    patch: Partial<Pick<Note, 'title' | 'body' | 'kind'>>,
  ) {
    const note = notes.value.find((item) => item.id === id)
    if (!note) return
    Object.assign(note, patch, { updatedAt: new Date().toISOString() })
    quietRealtime()
    await supabase
      .from('notes')
      .update({
        title: note.title,
        body: note.body,
        kind: note.kind,
        updated_at: note.updatedAt,
      })
      .eq('id', id)
  }

  async function deleteNote(id: string) {
    const index = notes.value.findIndex((note) => note.id === id)
    if (index === -1) return
    notes.value.splice(index, 1)
    if (selectedNoteId.value === id) {
      selectedNoteId.value = notes.value[0]?.id ?? null
    }
    quietRealtime()
    await supabase.from('notes').delete().eq('id', id)
  }

  return {
    notes,
    selectedNoteId,
    selectedNote,
    sortedNotes,
    loading,
    error,
    init,
    reset,
    selectNote,
    createNote,
    updateNote,
    deleteNote,
  }
})
