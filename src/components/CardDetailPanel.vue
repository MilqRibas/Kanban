<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { marked } from 'marked'
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  Link2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Users,
  X,
} from '@lucide/vue'
import { LABEL_COLOR_MAP } from '../types/board'
import { useBoardStore } from '../stores/board'
import { useAuthStore } from '../stores/auth'
import MemberAvatar from './MemberAvatar.vue'

const board = useBoardStore()
const auth = useAuthStore()
const draftTitle = ref('')
const draftDescription = ref('')
const commentBody = ref('')
const commentInputRef = ref<HTMLTextAreaElement | null>(null)
const editingCommentId = ref<string | null>(null)
const editingCommentBody = ref('')
const isEditingDescription = ref(false)
const modalRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const showLinkForm = ref(false)
const linkUrl = ref('')
const linkTitle = ref('')
const attachmentError = ref<string | null>(null)
const newItemText = ref<Record<string, string>>({})
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStart = ref(-1)

const card = computed(() => board.selectedCard)
const currentMember = computed(() => {
  if (auth.memberId) {
    return board.getMemberById(auth.memberId) ?? null
  }
  return (
    board.members.find((member) => member.userId === auth.user?.id) ??
    board.members[0] ??
    null
  )
})
const fallbackMember = {
  name: 'Usuário',
  initials: '?',
  avatarColor: 'bg-sky-600',
  avatarUrl: null as string | null,
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && board.selectedCardId) {
    if (mentionOpen.value) {
      mentionOpen.value = false
      return
    }
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
    editingCommentId.value = null
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
    return {
      ...list,
      done,
      total,
      percent: total ? Math.round((done / total) * 100) : 0,
    }
  })
})

const startDateInput = computed({
  get: () => toDateInput(card.value?.startDate ?? null),
  set: (value: string) => {
    if (!card.value) return
    board.updateCard(card.value.id, {
      startDate: value ? fromDateInput(value) : null,
    })
  },
})

const dueDateInput = computed({
  get: () => toDateInput(card.value?.dueDate ?? null),
  set: (value: string) => {
    if (!card.value) return
    board.updateCard(card.value.id, {
      dueDate: value ? fromDateInput(value) : null,
    })
  },
})

const mentionCandidates = computed(() => {
  const query = mentionQuery.value.trim().toLowerCase()
  return board.members.filter((member) => {
    if (!query) return true
    return (
      member.name.toLowerCase().includes(query) ||
      (member.email ?? '').toLowerCase().includes(query)
    )
  })
})

function toDateInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromDateInput(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

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

function onCommentInput() {
  const el = commentInputRef.value
  if (!el) return
  const cursor = el.selectionStart ?? commentBody.value.length
  const before = commentBody.value.slice(0, cursor)
  const match = before.match(/@([^\s@]*)$/)
  if (!match) {
    mentionOpen.value = false
    mentionQuery.value = ''
    mentionStart.value = -1
    return
  }
  mentionOpen.value = true
  mentionQuery.value = match[1] ?? ''
  mentionStart.value = cursor - match[0].length
}

function insertMention(memberName: string) {
  if (mentionStart.value < 0) return
  const el = commentInputRef.value
  const cursor = el?.selectionStart ?? commentBody.value.length
  const before = commentBody.value.slice(0, mentionStart.value)
  const after = commentBody.value.slice(cursor)
  commentBody.value = `${before}@${memberName} ${after}`
  mentionOpen.value = false
  mentionQuery.value = ''
  mentionStart.value = -1
  nextTick(() => {
    const pos = before.length + memberName.length + 2
    el?.focus()
    el?.setSelectionRange(pos, pos)
  })
}

async function submitComment() {
  if (!card.value || !commentBody.value.trim()) return
  await board.addComment(card.value.id, commentBody.value)
  commentBody.value = ''
  mentionOpen.value = false
}

function startEditComment(commentId: string, body: string) {
  editingCommentId.value = commentId
  editingCommentBody.value = body
}

async function saveEditComment() {
  if (!card.value || !editingCommentId.value) return
  const ok = await board.updateComment(
    card.value.id,
    editingCommentId.value,
    editingCommentBody.value,
  )
  if (ok) editingCommentId.value = null
}

async function removeComment(commentId: string) {
  if (!card.value) return
  if (!window.confirm('Apagar este comentário?')) return
  await board.deleteComment(card.value.id, commentId)
}

function canManageComment(authorId: string) {
  return auth.isAdmin || authorId === auth.memberId
}

async function ensureChecklist() {
  if (!card.value) return
  await board.addChecklist(card.value.id)
}

async function addItem(listId: string) {
  if (!card.value) return
  const text = (newItemText.value[listId] ?? '').trim()
  if (!text) return
  await board.addChecklistItem(card.value.id, listId, text)
  newItemText.value[listId] = ''
}

async function onPickAttachment(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!card.value || !file) return
  attachmentError.value = null

  if (file.size > 5 * 1024 * 1024) {
    attachmentError.value = 'Arquivo acima do limite de 5 MB.'
    input.value = ''
    return
  }

  uploading.value = true
  try {
    const result = await board.uploadAttachment(card.value.id, file)
    if (!result) {
      attachmentError.value = board.error ?? 'Falha ao enviar o arquivo.'
    }
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function submitLink() {
  if (!card.value || !linkUrl.value.trim()) return
  attachmentError.value = null
  uploading.value = true
  try {
    const result = await board.addLinkAttachment(
      card.value.id,
      linkUrl.value,
      linkTitle.value,
    )
    if (!result) {
      attachmentError.value = board.error ?? 'Falha ao salvar o link.'
      return
    }
    linkUrl.value = ''
    linkTitle.value = ''
    showLinkForm.value = false
  } finally {
    uploading.value = false
  }
}

async function removeAttachment(attachmentId: string) {
  if (!card.value) return
  await board.removeAttachment(card.value.id, attachmentId)
}

function attachmentLabel(file: { kind?: string; name: string; mimeType: string }) {
  if (file.kind === 'link') return 'LINK'
  const fromName = file.name.split('.').pop()
  if (fromName && fromName !== file.name) return fromName.slice(0, 4)
  return file.mimeType.split('/').pop()?.slice(0, 4) || 'FILE'
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

function renderCommentBody(body: string) {
  let html = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  for (const member of board.members) {
    const escaped = member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    html = html.replace(
      new RegExp(`@${escaped}\\b`, 'gi'),
      `<span class="font-semibold text-accent">@${member.name}</span>`,
    )
  }
  return html
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
                <MemberAvatar
                  v-for="member in members"
                  :key="member.id"
                  :member="member"
                  size="lg"
                  class="border-2 border-board-elevated"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              <Calendar :size="13" />
              Datas
            </h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block text-xs text-text-muted">
                Data de início
                <input
                  v-model="startDateInput"
                  type="date"
                  class="mt-1 w-full rounded-lg border border-border-subtle bg-column px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label class="block text-xs text-text-muted">
                Data de conclusão
                <input
                  v-model="dueDateInput"
                  type="date"
                  class="mt-1 w-full rounded-lg border border-border-subtle bg-column px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
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

          <section>
            <div class="mb-2 flex items-center justify-between gap-2">
              <h3 class="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <CheckSquare :size="16" />
                Lista de verificação
              </h3>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-text-secondary hover:bg-white/10 hover:text-text-primary"
                @click="ensureChecklist"
              >
                <Plus :size="12" />
                {{ card.checklists.length ? 'Nova lista' : 'Criar lista' }}
              </button>
            </div>

            <div
              v-for="list in checklistStats"
              :key="list.id"
              class="mb-4 last:mb-0"
            >
              <h4 class="mb-2 flex items-center gap-1.5 text-sm font-medium text-text-primary">
                {{ list.title }}
                <span class="ml-auto text-xs font-normal text-text-muted">
                  {{ list.done }} de {{ list.total }} itens concluídos
                </span>
              </h4>
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
                    class="mt-1 accent-accent"
                    :checked="item.completed"
                    @change="
                      board.toggleChecklistItem(card.id, list.id, item.id)
                    "
                  />
                  <div class="min-w-0 flex-1">
                    <p
                      :class="
                        item.completed
                          ? 'text-text-muted line-through'
                          : 'text-text-primary'
                      "
                    >
                      {{ item.text }}
                    </p>
                    <div class="mt-1 flex flex-wrap items-center gap-2">
                      <select
                        class="rounded-md border border-border-subtle bg-column px-2 py-1 text-[11px] text-text-secondary outline-none focus:border-accent"
                        :value="item.assigneeId ?? ''"
                        @change="
                          board.setChecklistItemAssignee(
                            card.id,
                            list.id,
                            item.id,
                            ($event.target as HTMLSelectElement).value || null,
                          )
                        "
                      >
                        <option value="">Sem responsável</option>
                        <option
                          v-for="member in board.members"
                          :key="member.id"
                          :value="member.id"
                        >
                          {{ member.name }}
                        </option>
                      </select>
                      <button
                        type="button"
                        class="rounded p-1 text-text-muted hover:bg-danger/15 hover:text-danger"
                        title="Remover item"
                        @click="
                          board.removeChecklistItem(card.id, list.id, item.id)
                        "
                      >
                        <Trash2 :size="12" />
                      </button>
                    </div>
                  </div>
                </li>
              </ul>
              <form
                class="mt-2 flex items-center gap-2"
                @submit.prevent="addItem(list.id)"
              >
                <input
                  v-model="newItemText[list.id]"
                  type="text"
                  placeholder="Adicionar um item"
                  class="flex-1 rounded-lg border border-border-subtle bg-column px-3 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                />
                <button
                  type="submit"
                  class="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-board hover:bg-accent-hover"
                >
                  Add
                </button>
              </form>
            </div>
          </section>

          <section>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 class="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <Paperclip :size="16" />
                Anexos
              </h3>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary disabled:opacity-50"
                  :disabled="uploading"
                  @click="fileInputRef?.click()"
                >
                  {{ uploading ? 'Enviando…' : 'Arquivo' }}
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary disabled:opacity-50"
                  :disabled="uploading"
                  @click="showLinkForm = !showLinkForm"
                >
                  <Link2 :size="12" />
                  Link
                </button>
                <input
                  ref="fileInputRef"
                  type="file"
                  accept="image/*,.pdf,.csv,.txt,.json,.doc,.docx,.xls,.xlsx"
                  class="hidden"
                  @change="onPickAttachment"
                />
              </div>
            </div>

            <p class="mb-2 text-[11px] text-text-muted">
              Arquivos até 5 MB (foto, PDF, CSV, etc.)
            </p>

            <form
              v-if="showLinkForm"
              class="mb-3 space-y-2 rounded-xl border border-border-subtle bg-column p-3"
              @submit.prevent="submitLink"
            >
              <input
                v-model="linkUrl"
                type="url"
                required
                placeholder="https://…"
                class="w-full rounded-lg border border-border-subtle bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
              />
              <input
                v-model="linkTitle"
                type="text"
                placeholder="Título (opcional)"
                class="w-full rounded-lg border border-border-subtle bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
              />
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg px-2.5 py-1 text-xs text-text-muted hover:text-text-primary"
                  @click="showLinkForm = false"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  class="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-board hover:bg-accent-hover disabled:opacity-50"
                  :disabled="uploading || !linkUrl.trim()"
                >
                  Salvar link
                </button>
              </div>
            </form>

            <p v-if="attachmentError" class="mb-2 text-xs text-red-300">
              {{ attachmentError }}
            </p>

            <ul v-if="card.attachments.length" class="space-y-2">
              <li
                v-for="file in card.attachments"
                :key="file.id"
                class="flex items-center gap-3 rounded-xl bg-column px-3 py-2"
              >
                <div
                  class="flex size-10 items-center justify-center rounded-lg bg-surface text-[10px] font-semibold uppercase text-text-secondary"
                >
                  <Link2 v-if="file.kind === 'link'" :size="16" />
                  <template v-else>{{ attachmentLabel(file) }}</template>
                </div>
                <div class="min-w-0 flex-1">
                  <a
                    :href="file.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block truncate text-sm text-accent hover:underline"
                  >
                    {{ file.name }}
                  </a>
                  <p class="text-xs text-text-muted">
                    <template v-if="file.kind === 'link'">
                      Link · {{ formatDate(file.createdAt) }}
                    </template>
                    <template v-else>
                      {{ formatBytes(file.sizeBytes) }} ·
                      {{ formatDate(file.createdAt) }}
                    </template>
                  </p>
                </div>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-text-muted hover:bg-danger/15 hover:text-danger"
                  title="Remover anexo"
                  @click="removeAttachment(file.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </li>
            </ul>
            <p v-else class="text-sm text-text-muted">Nenhum anexo ainda.</p>
          </section>

          <section>
            <h3 class="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              <MessageSquare :size="16" />
              Comentários
            </h3>

            <form class="relative mb-4 flex gap-2" @submit.prevent="submitComment">
              <MemberAvatar :member="currentMember ?? fallbackMember" size="lg" />
              <div class="relative flex-1">
                <textarea
                  ref="commentInputRef"
                  v-model="commentBody"
                  rows="2"
                  placeholder="Escreva um comentário… Use @ para mencionar"
                  class="w-full resize-none rounded-xl border border-border-subtle bg-column px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                  @input="onCommentInput"
                />
                <div
                  v-if="mentionOpen && mentionCandidates.length"
                  class="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-xl border border-border-subtle bg-board-elevated shadow-xl"
                >
                  <button
                    v-for="member in mentionCandidates"
                    :key="member.id"
                    type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface"
                    @click="insertMention(member.name)"
                  >
                    <MemberAvatar :member="member" size="sm" />
                    <span class="text-text-primary">{{ member.name }}</span>
                  </button>
                </div>
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
                <MemberAvatar
                  :member="board.getMemberById(comment.authorId) ?? fallbackMember"
                  size="lg"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm">
                      <span class="font-semibold text-text-primary">
                        {{
                          board.getMemberById(comment.authorId)?.name ?? 'Usuário'
                        }}
                      </span>
                      <span class="ml-2 text-xs text-text-muted">
                        {{ formatDate(comment.createdAt) }}
                        <template v-if="comment.updatedAt"> · editado</template>
                      </span>
                    </p>
                    <div
                      v-if="canManageComment(comment.authorId)"
                      class="ml-auto flex items-center gap-1"
                    >
                      <button
                        type="button"
                        class="rounded p-1 text-text-muted hover:bg-surface hover:text-text-primary"
                        title="Editar"
                        @click="startEditComment(comment.id, comment.body)"
                      >
                        <Pencil :size="13" />
                      </button>
                      <button
                        type="button"
                        class="rounded p-1 text-text-muted hover:bg-danger/15 hover:text-danger"
                        title="Apagar"
                        @click="removeComment(comment.id)"
                      >
                        <Trash2 :size="13" />
                      </button>
                    </div>
                  </div>

                  <div
                    v-if="editingCommentId === comment.id"
                    class="mt-1 space-y-2"
                  >
                    <textarea
                      v-model="editingCommentBody"
                      rows="2"
                      class="w-full resize-none rounded-xl border border-border-subtle bg-column px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    />
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-board hover:bg-accent-hover"
                        @click="saveEditComment"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        class="rounded-lg px-2.5 py-1 text-xs text-text-muted hover:text-text-primary"
                        @click="editingCommentId = null"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                  <p
                    v-else
                    class="mt-1 rounded-xl bg-column px-3 py-2 text-sm text-text-secondary"
                    v-html="renderCommentBody(comment.body)"
                  />
                </div>
              </li>
              <li v-if="!card.comments.length" class="text-sm text-text-muted">
                Nenhum comentário ainda.
              </li>
            </ul>
          </section>
        </div>
      </article>
    </div>
  </Teleport>
</template>
