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
import { useAuthStore } from '../stores/auth'
import type { NoteKind } from '../types/notes'

const notesStore = useNotesStore()
const board = useBoardStore()
const auth = useAuthStore()

const search = ref('')
const kindFilter = ref<'all' | NoteKind>('all')
const draftTitle = ref('')
const draftBody = ref('')

const canEditSelected = computed(() => {
  const note = notesStore.selectedNote
  if (!note || !auth.memberId) return false
  // Qualquer membro logado pode editar; exclusão fica restrita no store
  return true
})

const canDeleteSelected = computed(() => {
  const note = notesStore.selectedNote
  if (!note || !auth.memberId) return false
  return !note.authorId || note.authorId === auth.memberId || auth.isAdmin
})

const filteredNotes = computed(() => {
  let list = notesStore.sortedNotes
  if (kindFilter.value !== 'all') {
    list = list.filter((note) => note.kind === kindFilter.value)
  }
  const query = search.value.trim().toLowerCase()
  if (!query) return list
  return list.filter(
    (note) =>
      note.title.toLowerCase().includes(query) ||
      note.body.toLowerCase().includes(query),
  )
})

async function createNote(kind: NoteKind) {
  kindFilter.value = kind
  await notesStore.createNote(kind)
}

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
  if (!note || !canEditSelected.value) return
  const title = draftTitle.value.trim() || 'Sem título'
  draftTitle.value = title
  if (title === note.title) return
  void notesStore.updateNote(note.id, { title })
}

function saveBody() {
  const note = notesStore.selectedNote
  if (!note || !canEditSelected.value) return
  if (draftBody.value === note.body) return
  void notesStore.updateNote(note.id, { body: draftBody.value })
}

function setKind(kind: NoteKind) {
  const note = notesStore.selectedNote
  if (!note || !canEditSelected.value) return
  const title = draftTitle.value.trim() || note.title
  draftTitle.value = title
  // Um único save: evita corrida blur do textarea + clique no tipo
  void notesStore.updateNote(
    note.id,
    {
      kind,
      title,
      body: draftBody.value,
    },
    { immediate: true },
  )
  if (kindFilter.value !== 'all') kindFilter.value = kind
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
  if (!note || !canDeleteSelected.value) return
  if (window.confirm(`Excluir “${note.title}”?`)) {
    notesStore.deleteNote(note.id)
  }
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-[4.75rem] pt-2 md:flex-row md:gap-2 md:px-3 md:pb-16"
  >
    <aside
      class="panel-glass flex max-h-[40vh] w-full shrink-0 flex-col overflow-hidden rounded-xl md:max-h-none md:w-72 lg:w-80"
    >
      <div class="border-b border-border-subtle p-3">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-text-primary">Bloco de notas</h2>
          <div class="flex gap-1">
            <button
              type="button"
              class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              title="Nova anotação"
              @click="createNote('note')"
            >
              <Plus :size="16" :stroke-width="2" />
            </button>
            <button
              type="button"
              class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              title="Nova ata de reunião"
              @click="createNote('meeting')"
            >
              <Users :size="16" :stroke-width="2" />
            </button>
          </div>
        </div>

        <div class="mb-3 flex rounded-lg bg-column p-0.5">
          <button
            v-for="option in [
              { id: 'all' as const, label: 'Todas' },
              { id: 'note' as const, label: 'Notas' },
              { id: 'meeting' as const, label: 'Atas' },
            ]"
            :key="option.id"
            type="button"
            :class="[
              'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              kindFilter === option.id
                ? 'bg-surface text-text-primary'
                : 'text-text-muted hover:text-text-secondary',
            ]"
            @click="kindFilter = option.id"
          >
            {{ option.label }}
          </button>
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
      class="panel-glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl"
    >
      <template v-if="notesStore.selectedNote">
        <header
          class="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3 sm:px-5"
        >
          <NotebookPen :size="18" class="text-accent" />
          <span class="hidden text-[11px] text-text-muted sm:inline">Tipo:</span>
          <div class="flex rounded-lg bg-column p-0.5">
            <button
              type="button"
              :disabled="!canEditSelected"
              :class="[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                notesStore.selectedNote.kind === 'note'
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
                !canEditSelected && 'cursor-default opacity-60',
              ]"
              @mousedown.prevent
              @click="setKind('note')"
            >
              Anotação
            </button>
            <button
              type="button"
              :disabled="!canEditSelected"
              :class="[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                notesStore.selectedNote.kind === 'meeting'
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
                !canEditSelected && 'cursor-default opacity-60',
              ]"
              @mousedown.prevent
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
            v-if="canDeleteSelected"
            type="button"
            class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-danger/15 hover:text-danger"
            title="Excluir nota"
            @click="confirmDelete"
          >
            <Trash2 :size="16" :stroke-width="2" />
          </button>
        </header>

        <p
          v-if="notesStore.error"
          class="mx-4 mt-3 rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200 sm:mx-5"
        >
          {{ notesStore.error }}
          <button
            type="button"
            class="ml-2 underline"
            @click="notesStore.error = null"
          >
            fechar
          </button>
        </p>

        <div class="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
          <input
            v-model="draftTitle"
            type="text"
            :readonly="!canEditSelected"
            :class="[
              'mb-3 w-full rounded-lg bg-transparent px-1 text-xl font-semibold text-text-primary outline-none',
              canEditSelected ? 'focus:bg-surface' : 'cursor-default',
            ]"
            placeholder="Título"
            @blur="saveTitle"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <textarea
            v-model="draftBody"
            :readonly="!canEditSelected"
            :class="[
              'min-h-0 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-1 py-1 text-sm leading-relaxed text-text-secondary outline-none placeholder:text-text-muted',
              canEditSelected
                ? 'focus:border-border-subtle focus:bg-column/40'
                : 'cursor-default',
            ]"
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
