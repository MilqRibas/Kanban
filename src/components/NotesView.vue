<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  FileText,
  NotebookPen,
  Plus,
  Search,
  Trash2,
  Users,
} from '@lucide/vue'
import { useNotesStore } from '../stores/notes'
import { useBoardStore } from '../stores/board'
import type { NoteKind } from '../types/notes'

const notesStore = useNotesStore()
const board = useBoardStore()

const search = ref('')
const draftTitle = ref('')
const draftBody = ref('')

const filteredNotes = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return notesStore.sortedNotes
  return notesStore.sortedNotes.filter(
    (note) =>
      note.title.toLowerCase().includes(query) ||
      note.body.toLowerCase().includes(query),
  )
})

watch(
  () => notesStore.selectedNote,
  (note) => {
    draftTitle.value = note?.title ?? ''
    draftBody.value = note?.body ?? ''
  },
  { immediate: true },
)

function saveTitle() {
  const note = notesStore.selectedNote
  if (!note) return
  const title = draftTitle.value.trim() || 'Sem título'
  draftTitle.value = title
  notesStore.updateNote(note.id, { title })
}

function saveBody() {
  const note = notesStore.selectedNote
  if (!note) return
  notesStore.updateNote(note.id, { body: draftBody.value })
}

function setKind(kind: NoteKind) {
  const note = notesStore.selectedNote
  if (!note) return
  notesStore.updateNote(note.id, { kind })
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function preview(body: string) {
  return body.replace(/[#>*\-\n]+/g, ' ').trim().slice(0, 80) || 'Sem conteúdo'
}

function authorName(authorId: string) {
  return board.getMemberById(authorId)?.name ?? 'Time'
}

function confirmDelete() {
  const note = notesStore.selectedNote
  if (!note) return
  if (window.confirm(`Excluir “${note.title}”?`)) {
    notesStore.deleteNote(note.id)
  }
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-16 pt-2 md:flex-row"
  >
    <aside
      class="flex max-h-44 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border-subtle/60 bg-board-elevated/95 md:max-h-none md:w-72 lg:w-80"
    >
      <div class="border-b border-border-subtle p-3">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-text-primary">Bloco de notas</h2>
          <div class="flex gap-1">
            <button
              type="button"
              class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              title="Nova anotação"
              @click="notesStore.createNote('note')"
            >
              <Plus :size="16" :stroke-width="2" />
            </button>
            <button
              type="button"
              class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              title="Nova ata de reunião"
              @click="notesStore.createNote('meeting')"
            >
              <Users :size="16" :stroke-width="2" />
            </button>
          </div>
        </div>

        <label class="relative block">
          <Search
            :size="14"
            class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            v-model="search"
            type="search"
            placeholder="Buscar notas…"
            class="w-full rounded-lg border border-border-subtle bg-column py-2 pl-8 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
          />
        </label>
      </div>

      <ul class="flex-1 space-y-1 overflow-y-auto p-2">
        <li v-for="note in filteredNotes" :key="note.id">
          <button
            type="button"
            :class="[
              'w-full rounded-xl px-3 py-2.5 text-left transition-colors',
              notesStore.selectedNoteId === note.id
                ? 'bg-surface'
                : 'hover:bg-surface/60',
            ]"
            @click="notesStore.selectNote(note.id)"
          >
            <div class="mb-1 flex items-center gap-1.5">
              <component
                :is="note.kind === 'meeting' ? Users : FileText"
                :size="13"
                class="shrink-0 text-text-muted"
              />
              <span class="truncate text-sm font-medium text-text-primary">
                {{ note.title }}
              </span>
            </div>
            <p class="line-clamp-2 text-xs text-text-muted">
              {{ preview(note.body) }}
            </p>
            <p class="mt-1.5 text-[11px] text-text-muted/80">
              {{ formatDate(note.updatedAt) }}
            </p>
          </button>
        </li>

        <li
          v-if="!filteredNotes.length"
          class="px-3 py-8 text-center text-sm text-text-muted"
        >
          Nenhuma nota encontrada.
        </li>
      </ul>
    </aside>

    <section
      class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle/60 bg-board-elevated/95"
    >
      <template v-if="notesStore.selectedNote">
        <header
          class="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3 sm:px-5"
        >
          <NotebookPen :size="18" class="text-accent" />
          <div class="flex rounded-lg bg-column p-0.5">
            <button
              type="button"
              :class="[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                notesStore.selectedNote.kind === 'note'
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              ]"
              @click="setKind('note')"
            >
              Anotação
            </button>
            <button
              type="button"
              :class="[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                notesStore.selectedNote.kind === 'meeting'
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              ]"
              @click="setKind('meeting')"
            >
              Ata de reunião
            </button>
          </div>

          <p class="ml-auto text-xs text-text-muted">
            {{ authorName(notesStore.selectedNote.authorId) }} ·
            {{ formatDate(notesStore.selectedNote.updatedAt) }}
          </p>

          <button
            type="button"
            class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-danger/15 hover:text-danger"
            title="Excluir nota"
            @click="confirmDelete"
          >
            <Trash2 :size="16" :stroke-width="2" />
          </button>
        </header>

        <div class="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
          <input
            v-model="draftTitle"
            type="text"
            class="mb-3 w-full rounded-lg bg-transparent px-1 text-xl font-semibold text-text-primary outline-none focus:bg-surface"
            placeholder="Título"
            @blur="saveTitle"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <textarea
            v-model="draftBody"
            class="min-h-0 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-1 py-1 text-sm leading-relaxed text-text-secondary outline-none placeholder:text-text-muted focus:border-border-subtle focus:bg-column/40"
            placeholder="Escreva atas, decisões, ideias soltas do time… Markdown é bem-vindo."
            @blur="saveBody"
          />
        </div>
      </template>

      <div
        v-else
        class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <NotebookPen :size="36" class="text-text-muted" />
        <p class="text-sm text-text-muted">
          Nenhuma nota ainda. Crie uma anotação ou ata de reunião.
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-board hover:bg-accent-hover"
            @click="notesStore.createNote('note')"
          >
            Nova anotação
          </button>
          <button
            type="button"
            class="rounded-lg bg-surface px-3 py-1.5 text-sm text-text-primary hover:bg-column-hover"
            @click="notesStore.createNote('meeting')"
          >
            Nova ata
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
