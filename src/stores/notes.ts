import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Note, NoteKind } from '../types/notes'
import { BOARD_ID, supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'

function createId() {
  return `note-${crypto.randomUUID().slice(0, 8)}`
}

function friendlyError(raw: string | null | undefined) {
  const message = (raw ?? '').trim()
  if (!message) return 'Não foi possível salvar a nota.'
  if (/failed to fetch|networkerror|load failed|fetch failed|abort/i.test(message)) {
    return 'Falha de conexão ao salvar. Verifique a internet e tente de novo.'
  }
  if (/TypeError:/i.test(message)) {
    return 'Falha de conexão ao sincronizar as notas.'
  }
  return message
}

function isTransient(raw: string | null | undefined) {
  return /failed to fetch|networkerror|load failed|fetch failed|abort|TypeError:/i.test(
    raw ?? '',
  )
}

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const selectedNoteId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let channel: RealtimeChannel | null = null
  let suppressRealtimeUntil = 0
  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  let loadGeneration = 0
  let writeChain: Promise<void> = Promise.resolve()
  let lastToastAt = 0
  let lastToastMessage = ''

  const pendingPatches = new Map<
    string,
    Partial<Pick<Note, 'title' | 'body' | 'kind'>>
  >()
  const flushTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const selectedNote = computed(
    () => notes.value.find((note) => note.id === selectedNoteId.value) ?? null,
  )

  const sortedNotes = computed(() =>
    [...notes.value].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  )

  function quietRealtime(ms = 2000) {
    suppressRealtimeUntil = Date.now() + ms
  }

  function reportError(raw: string, opts?: { toast?: boolean; soft?: boolean }) {
    const message = friendlyError(raw)
    if (opts?.soft && notes.value.length && isTransient(raw)) {
      console.warn('[notes]', message)
      return
    }
    error.value = message
    if (opts?.toast === false) return
    const now = Date.now()
    if (message === lastToastMessage && now - lastToastAt < 4000) return
    lastToastMessage = message
    lastToastAt = now
    useToastStore().error(message)
  }

  function enqueueWrite(task: () => Promise<void>) {
    writeChain = writeChain.then(task, task)
    return writeChain
  }

  async function loadNotes(opts?: { background?: boolean }) {
    const generation = ++loadGeneration
    if (!opts?.background) {
      loading.value = true
      error.value = null
    }

    try {
      const { data, error: loadError } = await supabase
        .from('notes')
        .select('*')
        .eq('board_id', BOARD_ID)
        .order('updated_at', { ascending: false })

      if (generation !== loadGeneration) return

      if (loadError) {
        reportError(loadError.message, {
          toast: !opts?.background,
          soft: Boolean(opts?.background),
        })
        loading.value = false
        return
      }

      notes.value = (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        kind: row.kind as NoteKind,
        authorId: row.author_id ?? '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))

      if (
        !selectedNoteId.value ||
        !notes.value.some((note) => note.id === selectedNoteId.value)
      ) {
        selectedNoteId.value = notes.value[0]?.id ?? null
      }

      error.value = null
    } catch (err) {
      if (generation !== loadGeneration) return
      const message = err instanceof Error ? err.message : String(err)
      reportError(message, {
        toast: !opts?.background,
        soft: Boolean(opts?.background),
      })
    } finally {
      if (generation === loadGeneration) loading.value = false
    }
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
            void loadNotes({ background: true })
          }, 1000)
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
    for (const timer of flushTimers.values()) clearTimeout(timer)
    flushTimers.clear()
    pendingPatches.clear()
    writeChain = Promise.resolve()
    unsubscribeRealtime()
    notes.value = []
    selectedNoteId.value = null
    error.value = null
  }

  function selectNote(id: string) {
    selectedNoteId.value = id
  }

  async function createNote(kind: NoteKind = 'note') {
    const auth = useAuthStore()
    if (!auth.memberId) {
      reportError('Faça login novamente para criar notas.')
      return null
    }
    const note: Note = {
      id: createId(),
      title: kind === 'meeting' ? 'Nova ata de reunião' : 'Nova anotação',
      body: '',
      kind,
      authorId: auth.memberId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    notes.value.unshift(note)
    selectedNoteId.value = note.id

    await enqueueWrite(async () => {
      quietRealtime()
      try {
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
        if (insertError) {
          reportError(insertError.message)
          notes.value = notes.value.filter((item) => item.id !== note.id)
          selectedNoteId.value = notes.value[0]?.id ?? null
          return
        }
        error.value = null
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        reportError(message)
        notes.value = notes.value.filter((item) => item.id !== note.id)
        selectedNoteId.value = notes.value[0]?.id ?? null
      }
    })

    return notes.value.find((item) => item.id === note.id) ?? null
  }

  async function persistNote(id: string) {
    const note = notes.value.find((item) => item.id === id)
    const patch = pendingPatches.get(id)
    pendingPatches.delete(id)
    if (!note || !patch || !Object.keys(patch).length) return

    const auth = useAuthStore()
    if (!auth.memberId) {
      reportError('Faça login novamente para editar notas.')
      return
    }

    Object.assign(note, patch, { updatedAt: new Date().toISOString() })
    quietRealtime()

    // Usa UPSERT (POST) em vez de UPDATE (PATCH).
    // Alguns navegadores/extensões CORS bloqueiam PATCH no preflight,
    // mesmo com o Supabase liberando o método.
    const row = {
      id: note.id,
      board_id: BOARD_ID,
      title: note.title,
      body: note.body,
      kind: note.kind,
      author_id: note.authorId || auth.memberId,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
    }

    try {
      let { error: saveError } = await supabase
        .from('notes')
        .upsert(row, { onConflict: 'id' })

      if (saveError && isTransient(saveError.message)) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        ;({ error: saveError } = await supabase
          .from('notes')
          .upsert(row, { onConflict: 'id' }))
      }

      if (saveError) {
        reportError(saveError.message)
        return
      }
      error.value = null
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (isTransient(message)) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        try {
          const { error: retryError } = await supabase
            .from('notes')
            .upsert(row, { onConflict: 'id' })
          if (retryError) {
            reportError(retryError.message)
            return
          }
          error.value = null
          return
        } catch (retryErr) {
          const retryMessage =
            retryErr instanceof Error ? retryErr.message : String(retryErr)
          reportError(retryMessage)
          return
        }
      }
      reportError(message)
    }
  }

  function scheduleFlush(id: string, delayMs = 400) {
    const prev = flushTimers.get(id)
    if (prev) clearTimeout(prev)
    flushTimers.set(
      id,
      setTimeout(() => {
        flushTimers.delete(id)
        void enqueueWrite(() => persistNote(id))
      }, delayMs),
    )
  }

  async function updateNote(
    id: string,
    patch: Partial<Pick<Note, 'title' | 'body' | 'kind'>>,
    opts?: { immediate?: boolean },
  ) {
    const note = notes.value.find((item) => item.id === id)
    if (!note) return
    const auth = useAuthStore()
    if (!auth.memberId) {
      reportError('Faça login novamente para editar notas.')
      return
    }

    const merged = { ...(pendingPatches.get(id) ?? {}), ...patch }
    pendingPatches.set(id, merged)
    Object.assign(note, patch, { updatedAt: new Date().toISOString() })

    if (opts?.immediate) {
      const timer = flushTimers.get(id)
      if (timer) clearTimeout(timer)
      flushTimers.delete(id)
      await enqueueWrite(() => persistNote(id))
      return
    }

    scheduleFlush(id, patch.body !== undefined ? 500 : 250)
  }

  async function deleteNote(id: string) {
    const index = notes.value.findIndex((note) => note.id === id)
    if (index === -1) return
    const note = notes.value[index]
    const auth = useAuthStore()
    if (
      !auth.memberId ||
      (note.authorId && note.authorId !== auth.memberId && !auth.isAdmin)
    ) {
      reportError('Só o autor (ou admin) pode excluir a nota.')
      return
    }

    const timer = flushTimers.get(id)
    if (timer) clearTimeout(timer)
    flushTimers.delete(id)
    pendingPatches.delete(id)

    notes.value.splice(index, 1)
    if (selectedNoteId.value === id) {
      selectedNoteId.value = notes.value[0]?.id ?? null
    }

    await enqueueWrite(async () => {
      quietRealtime()
      try {
        const { error: deleteError } = await supabase
          .from('notes')
          .delete()
          .eq('id', id)
        if (deleteError) {
          reportError(deleteError.message)
          await loadNotes({ background: true })
        } else {
          error.value = null
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        reportError(message)
        await loadNotes({ background: true })
      }
    })
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
