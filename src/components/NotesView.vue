<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  Bold,
  FileText,
  Italic,
  NotebookPen,
  Search,
  Trash2,
  Users,
} from '@lucide/vue'
import { useNotesStore } from '../stores/notes'
import { useBoardStore } from '../stores/board'
import { useAuthStore } from '../stores/auth'
import type { NoteKind } from '../types/notes'
import { useDebouncedValue } from '../composables/useDebouncedValue'
import { buildSearchHaystack, matchesSearch } from '../utils/search'
import {
  insertAtCursor,
  renderMarkdown,
  wrapSelection,
} from '../lib/markdown'
import EmojiPicker from './EmojiPicker.vue'

const notesStore = useNotesStore()
const board = useBoardStore()
const auth = useAuthStore()

const search = ref('')
const searchQuery = useDebouncedValue(() => search.value, 150)
const kindFilter = ref<'all' | NoteKind>('all')
const draftTitle = ref('')
const draftBody = ref('')
const bodyRef = ref<HTMLTextAreaElement | null>(null)
const previewMode = ref(false)

const canEditSelected = computed(() => {
  const note = notesStore.selectedNote
  if (!note || !auth.memberId) return false
  return true
})

const canDeleteSelected = computed(() => {
  const note = notesStore.selectedNote
  if (!note || !auth.memberId) return false
  return !note.authorId || note.authorId === auth.memberId || auth.isAdmin
})

const noteSearchIndex = computed(() => {
  const map = new Map<string, string>()
  for (const note of notesStore.sortedNotes) {
    map.set(note.id, buildSearchHaystack([note.title, note.body]))
  }
  return map
})

const filteredNotes = computed(() => {
  let list = notesStore.sortedNotes
  if (kindFilter.value !== 'all') {
    list = list.filter((note) => note.kind === kindFilter.value)
  }
  const query = searchQuery.value
  if (!query.trim()) return list
  return list.filter((note) =>
    matchesSearch(noteSearchIndex.value.get(note.id) ?? '', query),
  )
})

const isMeeting = computed(
  () => notesStore.selectedNote?.kind === 'meeting',
)

const renderedBody = computed(() => {
  if (!draftBody.value.trim()) return ''
  return renderMarkdown(draftBody.value)
})

const emptyHint = computed(() => {
  if (kindFilter.value === 'meeting') {
    return 'Nenhuma ata ainda. Crie uma ata para registrar reuniões do time.'
  }
  if (kindFilter.value === 'note') {
    return 'Nenhuma anotação ainda. Use notas para ideias rápidas e lembretes.'
  }
  return 'Nada por aqui. Escolha se quer criar uma anotação ou uma ata.'
})

async function createNote(kind: NoteKind) {
  kindFilter.value = kind
  previewMode.value = false
  await notesStore.createNote(kind)
}

watch(
  () => notesStore.selectedNote,
  (note) => {
    draftTitle.value = note?.title ?? ''
    draftBody.value = note?.body ?? ''
    previewMode.value = false
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

function applyFormat(kind: 'bold' | 'italic') {
  const el = bodyRef.value
  if (!el || !canEditSelected.value) return
  previewMode.value = false
  const start = el.selectionStart ?? draftBody.value.length
  const end = el.selectionEnd ?? start
  const wrapper =
    kind === 'bold'
      ? { before: '**', after: '**' }
      : { before: '*', after: '*' }
  const { next, cursor } = wrapSelection(draftBody.value, start, end, wrapper)
  draftBody.value = next
  nextTick(() => {
    el.focus()
    el.setSelectionRange(cursor, cursor)
  })
}

function insertEmoji(emoji: string) {
  if (!canEditSelected.value) return
  previewMode.value = false
  nextTick(() => {
    const el = bodyRef.value
    if (!el) {
      draftBody.value += emoji
      return
    }
    const start = el.selectionStart ?? draftBody.value.length
    const end = el.selectionEnd ?? start
    const { next, cursor } = insertAtCursor(draftBody.value, start, end, emoji)
    draftBody.value = next
    nextTick(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  })
}

function onFormatKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey
  if (!mod) return
  const key = event.key.toLowerCase()
  if (key === 'b') {
    event.preventDefault()
    applyFormat('bold')
  } else if (key === 'i') {
    event.preventDefault()
    applyFormat('italic')
  }
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
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
    <div
      class="page-shell flex min-h-0 flex-1 flex-col gap-2 overflow-hidden md:flex-row md:gap-2"
    >
    <aside
      class="panel-glass flex max-h-[40vh] w-full shrink-0 flex-col overflow-hidden rounded-xl md:max-h-none md:w-72 lg:w-80"
    >
      <div class="border-b border-border-subtle p-3">
        <div class="mb-1">
          <h2 class="text-sm font-semibold text-text-primary">Notas & Atas</h2>
          <p class="text-[11px] text-text-muted">
            Anotações rápidas e atas de reunião, separados por tipo
          </p>
        </div>

        <div class="mb-3 mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
            @click="createNote('note')"
          >
            <FileText :size="14" />
            Anotação
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-2 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
            @click="createNote('meeting')"
          >
            <Users :size="14" />
            Nova ATA
          </button>
        </div>

        <div class="mb-3 flex rounded-lg bg-column p-0.5">
          <button
            v-for="option in [
              { id: 'all' as const, label: 'Todas' },
              { id: 'note' as const, label: 'Anotações' },
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
            placeholder="Buscar…"
            class="w-full rounded-lg border border-border-subtle bg-column py-2 pl-8 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
          />
        </label>
      </div>

      <ul class="flex-1 space-y-1 overflow-y-auto scroll-footer-pad p-2">
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
              <span
                :class="[
                  'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                  note.kind === 'meeting'
                    ? 'bg-accent/20 text-accent'
                    : 'bg-white/10 text-text-muted',
                ]"
              >
                {{ note.kind === 'meeting' ? 'ATA' : 'Nota' }}
              </span>
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
          {{ emptyHint }}
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
          <component
            :is="isMeeting ? Users : FileText"
            :size="18"
            :class="isMeeting ? 'text-accent' : 'text-text-muted'"
          />
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {{ isMeeting ? 'Ata de reunião' : 'Anotação' }}
            </p>
          </div>

          <div
            v-if="canEditSelected"
            class="flex rounded-lg bg-column p-0.5"
            title="Converter tipo"
          >
            <button
              type="button"
              :class="[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                !isMeeting
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              ]"
              @mousedown.prevent
              @click="setKind('note')"
            >
              Anotação
            </button>
            <button
              type="button"
              :class="[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                isMeeting
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              ]"
              @mousedown.prevent
              @click="setKind('meeting')"
            >
              ATA
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
            title="Excluir"
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
            :placeholder="isMeeting ? 'Título da reunião' : 'Título da anotação'"
            @blur="saveTitle"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />

          <div
            v-if="canEditSelected"
            class="mb-2 flex flex-wrap items-center gap-1"
            role="toolbar"
            aria-label="Formatação"
          >
            <button
              type="button"
              class="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
              title="Negrito (Ctrl+B)"
              @mousedown.prevent="applyFormat('bold')"
            >
              <Bold :size="14" />
            </button>
            <button
              type="button"
              class="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
              title="Itálico (Ctrl+I)"
              @mousedown.prevent="applyFormat('italic')"
            >
              <Italic :size="14" />
            </button>
            <EmojiPicker compact @pick="insertEmoji" />
            <button
              type="button"
              :class="[
                'ml-auto rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                previewMode
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:bg-white/10 hover:text-text-primary',
              ]"
              @click="previewMode = !previewMode"
            >
              {{ previewMode ? 'Editar' : 'Pré-visualizar' }}
            </button>
          </div>

          <div
            v-if="previewMode"
            class="markdown-body min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-subtle/60 bg-column/30 px-3 py-2 text-sm leading-relaxed text-text-secondary"
            v-html="renderedBody || '<p class=\'text-text-muted\'>Nada para pré-visualizar.</p>'"
          />
          <textarea
            v-else
            ref="bodyRef"
            v-model="draftBody"
            :readonly="!canEditSelected"
            :class="[
              'min-h-0 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-1 py-1 text-sm leading-relaxed text-text-secondary outline-none placeholder:text-text-muted',
              canEditSelected
                ? 'focus:border-border-subtle focus:bg-column/40'
                : 'cursor-default',
            ]"
            :placeholder="
              isMeeting
                ? 'Preencha pauta, participantes, decisões e próximos passos…'
                : 'Escreva ideias, lembretes e anotações do time…'
            "
            @blur="saveBody"
            @keydown="onFormatKeydown"
          />
        </div>
      </template>

      <div
        v-else
        class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <NotebookPen :size="36" class="text-text-muted" />
        <div>
          <p class="text-sm font-medium text-text-primary">
            Escolha o que deseja criar
          </p>
          <p class="mt-1 max-w-sm text-xs text-text-muted">
            <strong class="text-text-secondary">Anotação</strong> = ideias e
            lembretes.
            <strong class="text-accent">ATA</strong> = registro de reunião com
            pauta e decisões.
          </p>
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm text-text-primary hover:bg-column-hover"
            @click="createNote('note')"
          >
            <FileText :size="15" />
            Nova anotação
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-board hover:bg-accent-hover"
            @click="createNote('meeting')"
          >
            <Users :size="15" />
            Nova ATA
          </button>
        </div>
      </div>
    </section>
    </div>
  </div>
</template>
