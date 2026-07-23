<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { marked } from 'marked'
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  MessageSquare,
  Paperclip,
  Tag,
  Users,
  X,
} from '@lucide/vue'
import { LABEL_COLOR_MAP } from '../types/board'
import { useBoardStore } from '../stores/board'

const board = useBoardStore()
const draftTitle = ref('')
const draftDescription = ref('')
const commentBody = ref('')
const isEditingDescription = ref(false)
const modalRef = ref<HTMLElement | null>(null)

const card = computed(() => board.selectedCard)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && board.selectedCardId) {
    board.closeCard()
  }
}

watch(
  card,
  async (value) => {
    if (!value) {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeydown)
      return
    }

    draftTitle.value = value.title
    draftDescription.value = value.description
    commentBody.value = ''
    isEditingDescription.value = !value.description.trim()
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeydown)
    await nextTick()
    modalRef.value?.focus()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})


const labels = computed(() => (card.value ? board.getLabelsForCard(card.value) : []))
const members = computed(() =>
  card.value ? board.getMembersForCard(card.value) : [],
)

const columnTitle = computed(
  () => board.columns.find((c) => c.id === card.value?.columnId)?.title ?? '',
)

const renderedDescription = computed(() => {
  if (!draftDescription.value.trim()) return ''
  return marked.parse(draftDescription.value, { async: false }) as string
})

const checklistStats = computed(() => {
  if (!card.value) return []
  return card.value.checklists.map((list) => {
    const total = list.items.length
    const done = list.items.filter((item) => item.completed).length
    return { ...list, done, total, percent: total ? Math.round((done / total) * 100) : 0 }
  })
})

const dueLabel = computed(() => {
  if (!card.value?.dueDate) return null
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(card.value.dueDate))
})

function saveTitle() {
  if (!card.value) return
  const title = draftTitle.value.trim()
  if (!title) {
    draftTitle.value = card.value.title
    return
  }
  board.updateCard(card.value.id, { title })
}

function saveDescription() {
  if (!card.value) return
  board.updateCard(card.value.id, { description: draftDescription.value })
  isEditingDescription.value = false
}

function submitComment() {
  if (!card.value || !commentBody.value.trim()) return
  board.addComment(card.value.id, commentBody.value)
  commentBody.value = ''
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="card"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      :aria-label="card.title"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Fechar detalhes"
        @click="board.closeCard()"
      />

      <article
        class="relative z-10 flex max-h-[min(92vh,860px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-subtle bg-board-elevated shadow-2xl shadow-black/50"
        tabindex="-1"
        ref="modalRef"
      >
        <header class="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
          <div class="min-w-0 flex-1">
            <input
              v-model="draftTitle"
              type="text"
              class="w-full rounded-lg bg-transparent px-1 py-0.5 text-xl font-semibold text-text-primary outline-none focus:bg-surface"
              @blur="saveTitle"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
            <p class="mt-1 px-1 text-sm text-text-muted">
              na lista
              <span class="font-medium text-text-secondary">
                {{ columnTitle }}
              </span>
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            aria-label="Fechar"
            @click="board.closeCard()"
          >
            <X :size="20" :stroke-width="2" />
          </button>
        </header>

        <div class="flex-1 space-y-6 overflow-y-auto px-5 pb-6 sm:px-6">
          <section class="flex flex-wrap gap-5">
            <div v-if="labels.length">
              <h3 class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <Tag :size="13" />
                Etiquetas
              </h3>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="label in labels"
                  :key="label.id"
                  class="rounded-md px-2.5 py-1 text-xs font-medium text-board"
                  :style="{ backgroundColor: LABEL_COLOR_MAP[label.color] }"
                >
                  {{ label.name }}
                </span>
              </div>
            </div>

            <div v-if="members.length">
              <h3 class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <Users :size="13" />
                Responsáveis
              </h3>
              <div class="flex -space-x-1.5">
                <div
                  v-for="member in members"
                  :key="member.id"
                  :class="[
                    member.avatarColor,
                    'flex size-8 items-center justify-center rounded-full border-2 border-board-elevated text-[10px] font-semibold text-white',
                  ]"
                  :title="member.name"
                >
                  {{ member.initials }}
                </div>
              </div>
            </div>

            <div v-if="dueLabel">
              <h3 class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <Calendar :size="13" />
                Prazo
              </h3>
              <span class="rounded-md bg-surface px-2.5 py-1 text-sm text-text-primary">
                {{ dueLabel }}
              </span>
            </div>
          </section>

          <section>
            <div class="mb-2 flex items-center justify-between">
              <h3 class="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <AlignLeft :size="16" />
                Descrição
              </h3>
              <button
                v-if="!isEditingDescription && card.description"
                type="button"
                class="rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface"
                @click="isEditingDescription = true"
              >
                Editar
              </button>
            </div>

            <div v-if="isEditingDescription" class="space-y-2">
              <textarea
                v-model="draftDescription"
                rows="6"
                placeholder="Adicione uma descrição mais detalhada… (Markdown suportado)"
                class="w-full resize-y rounded-xl border border-border-subtle bg-column px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-board hover:bg-accent-hover"
                  @click="saveDescription"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-sm text-text-secondary hover:bg-surface"
                  @click="
                    draftDescription = card.description;
                    isEditingDescription = false
                  "
                >
                  Cancelar
                </button>
              </div>
            </div>

            <button
              v-else-if="!card.description.trim()"
              type="button"
              class="w-full rounded-xl bg-column px-3 py-3 text-left text-sm text-text-muted hover:bg-column-hover"
              @click="isEditingDescription = true"
            >
              Adicionar uma descrição mais detalhada…
            </button>

            <div
              v-else
              class="markdown-body cursor-pointer rounded-xl bg-column/50 px-3 py-2 text-sm text-text-secondary"
              @click="isEditingDescription = true"
              v-html="renderedDescription"
            />
          </section>

          <section v-if="checklistStats.length">
            <div
              v-for="list in checklistStats"
              :key="list.id"
              class="mb-4 last:mb-0"
            >
              <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <CheckSquare :size="16" />
                {{ list.title }}
                <span class="ml-auto text-xs font-normal text-text-muted">
                  {{ list.done }}/{{ list.total }}
                </span>
              </h3>
              <div class="mb-2 h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  class="h-full rounded-full bg-success transition-all"
                  :style="{ width: `${list.percent}%` }"
                />
              </div>
              <ul class="space-y-1.5">
                <li
                  v-for="item in list.items"
                  :key="item.id"
                  class="flex items-start gap-2 rounded-md px-1 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    class="mt-0.5 accent-accent"
                    :checked="item.completed"
                    disabled
                  />
                  <span
                    :class="
                      item.completed
                        ? 'text-text-muted line-through'
                        : 'text-text-primary'
                    "
                  >
                    {{ item.text }}
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <section v-if="card.attachments.length">
            <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              <Paperclip :size="16" />
              Anexos
            </h3>
            <ul class="space-y-2">
              <li
                v-for="file in card.attachments"
                :key="file.id"
                class="flex items-center gap-3 rounded-xl bg-column px-3 py-2"
              >
                <div
                  class="flex size-10 items-center justify-center rounded-lg bg-surface text-xs font-semibold uppercase text-text-secondary"
                >
                  {{ file.name.split('.').pop() }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-text-primary">{{ file.name }}</p>
                  <p class="text-xs text-text-muted">
                    {{ formatBytes(file.sizeBytes) }} · {{ formatDate(file.createdAt) }}
                  </p>
                </div>
              </li>
            </ul>
          </section>

          <section>
            <h3 class="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              <MessageSquare :size="16" />
              Comentários
            </h3>

            <form class="mb-4 flex gap-2" @submit.prevent="submitComment">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[10px] font-semibold text-white"
              >
                AS
              </div>
              <div class="flex-1">
                <textarea
                  v-model="commentBody"
                  rows="2"
                  placeholder="Escreva um comentário…"
                  class="w-full resize-none rounded-xl border border-border-subtle bg-column px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                />
                <button
                  v-if="commentBody.trim()"
                  type="submit"
                  class="mt-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-board hover:bg-accent-hover"
                >
                  Salvar
                </button>
              </div>
            </form>

            <ul class="space-y-3">
              <li
                v-for="comment in [...card.comments].reverse()"
                :key="comment.id"
                class="flex gap-2"
              >
                <div
                  :class="[
                    board.getMemberById(comment.authorId)?.avatarColor ?? 'bg-surface',
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white',
                  ]"
                >
                  {{ board.getMemberById(comment.authorId)?.initials ?? '?' }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm">
                    <span class="font-semibold text-text-primary">
                      {{ board.getMemberById(comment.authorId)?.name ?? 'Usuário' }}
                    </span>
                    <span class="ml-2 text-xs text-text-muted">
                      {{ formatDate(comment.createdAt) }}
                    </span>
                  </p>
                  <p class="mt-1 rounded-xl bg-column px-3 py-2 text-sm text-text-secondary">
                    {{ comment.body }}
                  </p>
                </div>
              </li>
              <li
                v-if="!card.comments.length"
                class="text-sm text-text-muted"
              >
                Nenhum comentário ainda.
              </li>
            </ul>
          </section>
        </div>
      </article>
    </div>
  </Teleport>
</template>
