import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Note, NoteKind } from '../types/notes'

const STORAGE_KEY = 'kanban-team-notes'

function createId() {
  return `note-${crypto.randomUUID().slice(0, 8)}`
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getSeedNotes()
    return JSON.parse(raw) as Note[]
  } catch {
    return getSeedNotes()
  }
}

function getSeedNotes(): Note[] {
  const now = new Date()
  const iso = (daysAgo: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString()
  }

  return [
    {
      id: createId(),
      title: 'Ata — Sync semanal',
      kind: 'meeting',
      authorId: 'm1',
      body: `## Participantes
- Ana, Marcos, Julia

## Pauta
1. Status do onboarding B2C
2. Bug de upload
3. Integração Sheets

## Decisões
- Priorizar o bug de upload esta semana
- Webhook Sheets entra na Fase 6

## Próximos passos
- [ ] Marcos: payload final
- [ ] Julia: wireframe do modal`,
      createdAt: iso(2),
      updatedAt: iso(2),
    },
    {
      id: createId(),
      title: 'Ideias soltas do time',
      kind: 'note',
      authorId: 'm3',
      body: `- Atalho para filtrar cards por responsável
- Badge de “atrasado” mais visível no card
- Template de ata de reunião no bloco de notas`,
      createdAt: iso(5),
      updatedAt: iso(1),
    },
  ]
}

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>(loadNotes())
  const selectedNoteId = ref<string | null>(notes.value[0]?.id ?? null)

  const selectedNote = computed(
    () => notes.value.find((note) => note.id === selectedNoteId.value) ?? null,
  )

  const sortedNotes = computed(() =>
    [...notes.value].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  )

  watch(
    notes,
    (value) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    },
    { deep: true },
  )

  function selectNote(id: string) {
    selectedNoteId.value = id
  }

  function createNote(kind: NoteKind = 'note') {
    const note: Note = {
      id: createId(),
      title: kind === 'meeting' ? 'Nova ata de reunião' : 'Nova anotação',
      body: '',
      kind,
      authorId: 'm1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    notes.value.unshift(note)
    selectedNoteId.value = note.id
    return note
  }

  function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'kind'>>) {
    const note = notes.value.find((item) => item.id === id)
    if (!note) return
    Object.assign(note, patch, { updatedAt: new Date().toISOString() })
  }

  function deleteNote(id: string) {
    const index = notes.value.findIndex((note) => note.id === id)
    if (index === -1) return
    notes.value.splice(index, 1)
    if (selectedNoteId.value === id) {
      selectedNoteId.value = notes.value[0]?.id ?? null
    }
  }

  return {
    notes,
    selectedNoteId,
    selectedNote,
    sortedNotes,
    selectNote,
    createNote,
    updateNote,
    deleteNote,
  }
})
