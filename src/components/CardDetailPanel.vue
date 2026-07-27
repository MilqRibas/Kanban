<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  renderCommentMarkdown,
  renderMarkdown,
  wrapSelection,
} from '../lib/markdown'
import {
  AlignLeft,
  Archive,
  Bold,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  Ellipsis,
  GripVertical,
  Italic,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from '@lucide/vue'
import draggable from 'vuedraggable'
import { useBoardStore } from '../stores/board'
import { useAuthStore } from '../stores/auth'
import MemberAvatar from './MemberAvatar.vue'
import AssigneePicker from './AssigneePicker.vue'
import LabelPicker from './LabelPicker.vue'
import { useEphemeralDismiss } from '../composables/useEphemeralDismiss'

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
const addingItemFor = ref<string | null>(null)
const hideCheckedByList = ref<Record<string, boolean>>({})
const openItemMenu = ref<string | null>(null)
const openItemDate = ref<string | null>(null)
const editingItemId = ref<string | null>(null)
const editingItemText = ref('')
const datesOpen = ref(false)
const cardMenuOpen = ref(false)
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStart = ref(-1)

const anyEphemeralOpen = computed(
  () =>
    Boolean(
      datesOpen.value ||
        openItemMenu.value ||
        openItemDate.value ||
        cardMenuOpen.value,
    ),
)

function dismissEphemeral() {
  datesOpen.value = false
  openItemMenu.value = null
  openItemDate.value = null
  cardMenuOpen.value = false
}

useEphemeralDismiss({
  isOpen: anyEphemeralOpen,
  onClose: dismissEphemeral,
  delayMs: 4000,
})

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
    if (
      datesOpen.value ||
      openItemMenu.value ||
      openItemDate.value ||
      cardMenuOpen.value
    ) {
      datesOpen.value = false
      openItemMenu.value = null
      openItemDate.value = null
      cardMenuOpen.value = false
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
    cardMenuOpen.value = false
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

const isCardDone = computed(() => {
  if (!card.value) return false
  const doneColumn = board.columns.find((column) => column.isDoneColumn)
  return Boolean(
    card.value.completed ||
      (doneColumn && card.value.columnId === doneColumn.id),
  )
})

const dueDateStatus = computed(() => {
  if (!card.value?.dueDate) return null
  if (isCardDone.value) return 'done' as const
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(card.value.dueDate)
  due.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return 'overdue' as const
  if (diff === 0) return 'today' as const
  return 'ok' as const
})

const dueDateLabel = computed(() => {
  if (!card.value?.dueDate) return 'Definir data'
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(card.value.dueDate))
})

const columnTitle = computed(
  () => board.columns.find((c) => c.id === card.value?.columnId)?.title ?? '',
)

const renderedDescription = computed(() => {
  if (!draftDescription.value.trim()) return ''
  return renderMarkdown(draftDescription.value)
})

function onDescriptionClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('a')) {
    event.stopPropagation()
    return
  }
  isEditingDescription.value = true
}

function applyCommentFormat(kind: 'bold' | 'italic') {
  const el = commentInputRef.value
  if (!el) return
  const start = el.selectionStart ?? commentBody.value.length
  const end = el.selectionEnd ?? start
  const wrapper =
    kind === 'bold'
      ? { before: '**', after: '**' }
      : { before: '*', after: '*' }
  const { next, cursor } = wrapSelection(commentBody.value, start, end, wrapper)
  commentBody.value = next
  nextTick(() => {
    el.focus()
    el.setSelectionRange(cursor, cursor)
    onCommentInput()
  })
}

function startEditChecklistItem(itemId: string, text: string) {
  editingItemId.value = itemId
  editingItemText.value = text
  openItemMenu.value = null
}

async function saveChecklistItem(listId: string, itemId: string) {
  if (!card.value) return
  const text = editingItemText.value.trim()
  if (!text) return
  await board.renameChecklistItem(card.value.id, listId, itemId, text)
  editingItemId.value = null
}

function onChecklistReorder(listId: string, orderedIds: string[]) {
  if (!card.value) return
  void board.reorderChecklistItems(card.value.id, listId, orderedIds)
}

const checklistStats = computed(() => {
  if (!card.value) return []
  return card.value.checklists.map((list) => {
    const total = list.items.length
    const done = list.items.filter((item) => item.completed).length
    const hideChecked = hideCheckedByList.value[list.id] ?? false
    const visibleItems = hideChecked
      ? list.items.filter((item) => !item.completed)
      : list.items
    return {
      ...list,
      done,
      total,
      percent: total ? Math.round((done / total) * 100) : 0,
      hideChecked,
      visibleItems,
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
  addingItemFor.value = null
}

function toggleHideChecked(listId: string) {
  hideCheckedByList.value = {
    ...hideCheckedByList.value,
    [listId]: !(hideCheckedByList.value[listId] ?? false),
  }
}

async function deleteChecklist(listId: string) {
  if (!card.value) return
  if (!window.confirm('Excluir esta lista de verificação?')) return
  await board.removeChecklist(card.value.id, listId)
}

function formatItemDue(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso))
}

function itemDateKey(listId: string, itemId: string) {
  return `${listId}:${itemId}`
}

async function archiveCurrentCard() {
  if (!card.value) return
  cardMenuOpen.value = false
  await board.archiveCard(card.value.id)
}

async function deleteCurrentCard() {
  if (!card.value) return
  const title = card.value.title
  cardMenuOpen.value = false
  if (
    !window.confirm(
      `Apagar permanentemente o cartão “${title}”? Esta ação não pode ser desfeita.`,
    )
  ) {
    return
  }
  await board.deleteCard(card.value.id)
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
  let html = renderCommentMarkdown(body)
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
      class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
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
        class="relative z-10 flex max-h-[min(94dvh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-board-elevated/95 shadow-2xl shadow-black/50 backdrop-blur-md sm:rounded-2xl"
        tabindex="-1"
        ref="modalRef"
      >
        <div
          class="flex shrink-0 justify-center pt-2 sm:hidden"
          aria-hidden="true"
        >
          <span class="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <header class="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
              <button
                type="button"
                :title="
                  isCardDone
                    ? 'Reabrir tarefa'
                    : 'Marcar tarefa como concluída'
                "
                :aria-label="
                  isCardDone
                    ? 'Reabrir tarefa'
                    : 'Marcar tarefa como concluída'
                "
                :aria-pressed="isCardDone"
                :class="[
                  'mt-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
                  isCardDone
                    ? 'border-success bg-success text-board'
                    : 'border-white/30 text-white/25 hover:border-success hover:text-success',
                ]"
                @click="board.toggleCardDone(card.id)"
              >
                <Check :size="13" :stroke-width="3" />
              </button>
              <div class="min-w-0 flex-1">
                <input
                  v-model="draftTitle"
                  type="text"
                  :class="[
                    'w-full rounded-lg bg-transparent px-1 py-0.5 text-xl font-semibold outline-none focus:bg-surface',
                    isCardDone
                      ? 'text-text-muted line-through'
                      : 'text-text-primary',
                  ]"
                  @blur="saveTitle"
                  @keydown.enter.prevent="
                    ($event.target as HTMLInputElement).blur()
                  "
                />
                <p class="mt-1 px-1 text-sm text-text-muted">
                  na lista
                  <span class="font-medium text-text-secondary">
                    {{ columnTitle }}
                  </span>
                </p>
              </div>
              <div class="relative shrink-0" data-ephemeral-menu>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                  aria-label="Opções do cartão"
                  :aria-expanded="cardMenuOpen"
                  @click="cardMenuOpen = !cardMenuOpen"
                >
                  <MoreHorizontal :size="18" :stroke-width="2" />
                </button>
                <div
                  v-if="cardMenuOpen"
                  class="absolute right-0 top-[calc(100%+4px)] z-40 min-w-[11rem] overflow-hidden rounded-xl border border-white/10 bg-board-elevated py-1 shadow-xl shadow-black/50"
                  role="menu"
                >
                  <button
                    v-if="card.archivedAt"
                    type="button"
                    role="menuitem"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                    @click="
                      board.unarchiveCard(card.id);
                      cardMenuOpen = false
                    "
                  >
                    <Archive :size="14" />
                    Restaurar
                  </button>
                  <button
                    v-else
                    type="button"
                    role="menuitem"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                    @click="archiveCurrentCard"
                  >
                    <Archive :size="14" />
                    Arquivar
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                    @click="deleteCurrentCard"
                  >
                    <Trash2 :size="14" />
                    Apagar
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary lg:hidden"
                aria-label="Fechar"
                @click="board.closeCard()"
              >
                <X :size="20" :stroke-width="2" />
              </button>
            </header>

            <div class="flex-1 space-y-6 overflow-y-auto px-5 pb-6 sm:px-6">
          <section class="flex flex-wrap items-start gap-x-8 gap-y-5">
            <AssigneePicker
              label="Membros"
              variant="stack"
              :selected-ids="card.memberIds"
              :members="board.members"
              @toggle="board.toggleCardMember(card.id, $event)"
            />

            <LabelPicker
              :selected-ids="card.labelIds"
              :labels="board.labels"
              :card-id="card.id"
              @toggle="board.toggleCardLabel(card.id, $event)"
            />

            <div class="relative min-w-[11rem]" data-ephemeral-menu>
              <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Data entrega
              </p>
              <button
                type="button"
                class="inline-flex w-full items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-left text-sm text-text-secondary transition-colors hover:border-white/25 hover:bg-white/10"
                @click="datesOpen = !datesOpen"
              >
                <Calendar :size="14" class="shrink-0 text-text-muted" />
                <span class="min-w-0 flex-1 truncate">{{ dueDateLabel }}</span>
                <span
                  v-if="dueDateStatus === 'done'"
                  class="rounded bg-success px-1.5 py-0.5 text-[10px] font-semibold text-board"
                >
                  Concluído
                </span>
                <span
                  v-else-if="dueDateStatus === 'overdue'"
                  class="rounded bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white"
                >
                  Atrasado
                </span>
                <span
                  v-else-if="dueDateStatus === 'today'"
                  class="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-board"
                >
                  Hoje
                </span>
                <ChevronDown :size="14" class="shrink-0 text-text-muted" />
              </button>

              <div
                v-if="datesOpen"
                class="absolute left-0 top-[calc(100%+6px)] z-40 w-64 space-y-3 rounded-xl border border-white/10 bg-board-elevated p-3 shadow-xl shadow-black/50"
              >
                <label class="block text-xs text-text-muted">
                  Início
                  <input
                    v-model="startDateInput"
                    type="date"
                    class="mt-1 w-full rounded-lg border border-border-subtle bg-column px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </label>
                <label class="block text-xs text-text-muted">
                  Conclusão
                  <input
                    v-model="dueDateInput"
                    type="date"
                    class="mt-1 w-full rounded-lg border border-border-subtle bg-column px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </label>
                <button
                  v-if="card.dueDate || card.startDate"
                  type="button"
                  class="text-xs text-danger hover:underline"
                  @click="
                    board.updateCard(card.id, { startDate: null, dueDate: null });
                    datesOpen = false
                  "
                >
                  Remover datas
                </button>
              </div>
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
              class="markdown-body rounded-xl bg-column/50 px-3 py-2 text-sm text-text-secondary"
              @click="onDescriptionClick"
              v-html="renderedDescription"
            />
          </section>

          <section>
            <div class="mb-3 flex items-center justify-between gap-2">
              <h3 class="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <CheckSquare :size="16" />
                Checklist
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
              class="mb-5 last:mb-0"
            >
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <h4 class="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <CheckSquare :size="15" class="text-text-muted" />
                  {{ list.title }}
                </h4>
                <div class="ml-auto flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    class="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-text-secondary hover:bg-white/10 hover:text-text-primary"
                    @click="toggleHideChecked(list.id)"
                  >
                    {{
                      list.hideChecked
                        ? 'Mostrar itens marcados'
                        : 'Ocultar itens marcados'
                    }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-text-secondary hover:bg-danger/15 hover:text-danger"
                    @click="deleteChecklist(list.id)"
                  >
                    Excluir
                  </button>
                </div>
              </div>

              <div class="mb-2 flex items-center gap-3">
                <span class="w-8 shrink-0 text-right text-[11px] tabular-nums text-text-muted">
                  {{ list.percent }}%
                </span>
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    class="h-full rounded-full bg-white/70 transition-all"
                    :style="{ width: `${list.percent}%` }"
                  />
                </div>
              </div>

              <draggable
                :model-value="list.items"
                item-key="id"
                handle=".checklist-drag-handle"
                :animation="150"
                ghost-class="opacity-40"
                class="space-y-0.5"
                @update:model-value="
                  (items: typeof list.items) =>
                    onChecklistReorder(
                      list.id,
                      items.map((item) => item.id),
                    )
                "
              >
                <template #item="{ element: item }">
                  <li
                    v-show="!list.hideChecked || !item.completed"
                    class="group relative flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-white/5"
                  >
                    <button
                      type="button"
                      class="checklist-drag-handle cursor-grab touch-none rounded p-0.5 text-text-muted opacity-0 hover:text-text-primary active:cursor-grabbing group-hover:opacity-100"
                      title="Arrastar para reordenar"
                      aria-label="Reordenar"
                    >
                      <GripVertical :size="14" />
                    </button>
                    <input
                      type="checkbox"
                      class="size-4 shrink-0 accent-[#39bcff]"
                      :checked="item.completed"
                      @change="
                        board.toggleChecklistItem(card.id, list.id, item.id)
                      "
                    />
                    <form
                      v-if="editingItemId === item.id"
                      class="min-w-0 flex-1"
                      @submit.prevent="saveChecklistItem(list.id, item.id)"
                    >
                      <input
                        v-model="editingItemText"
                        type="text"
                        class="w-full rounded-md border border-accent/50 bg-board-elevated px-2 py-1 text-sm text-text-primary outline-none"
                        @keydown.escape="editingItemId = null"
                        @blur="saveChecklistItem(list.id, item.id)"
                      />
                    </form>
                    <button
                      v-else
                      type="button"
                      :class="[
                        'min-w-0 flex-1 text-left leading-snug',
                        item.completed
                          ? 'text-text-muted line-through'
                          : 'text-text-primary',
                      ]"
                      title="Clique para editar"
                      @click="startEditChecklistItem(item.id, item.text)"
                    >
                      {{ item.text }}
                    </button>

                    <div class="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                      <div class="relative" data-ephemeral-menu>
                        <button
                          type="button"
                          :class="[
                            'inline-flex items-center gap-1 rounded-md px-1 py-1 text-text-muted hover:bg-white/10 hover:text-text-primary',
                            item.dueDate && 'text-[#39bcff]',
                          ]"
                          :title="
                            item.dueDate
                              ? formatItemDue(item.dueDate)
                              : 'Definir prazo'
                          "
                          @click="
                            openItemDate =
                              openItemDate === itemDateKey(list.id, item.id)
                                ? null
                                : itemDateKey(list.id, item.id)
                          "
                        >
                          <Clock :size="14" :stroke-width="1.75" />
                          <span
                            v-if="item.dueDate"
                            class="text-[10px] font-medium"
                          >
                            {{ formatItemDue(item.dueDate) }}
                          </span>
                        </button>
                        <div
                          v-if="openItemDate === itemDateKey(list.id, item.id)"
                          class="absolute right-0 top-[calc(100%+4px)] z-30 w-44 rounded-lg border border-white/10 bg-board-elevated p-2 shadow-xl"
                        >
                          <input
                            type="date"
                            class="w-full rounded-md border border-border-subtle bg-column px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                            :value="toDateInput(item.dueDate ?? null)"
                            @change="
                              board.setChecklistItemDueDate(
                                card.id,
                                list.id,
                                item.id,
                                ($event.target as HTMLInputElement).value
                                  ? fromDateInput(
                                      ($event.target as HTMLInputElement).value,
                                    )
                                  : null,
                              );
                              openItemDate = null
                            "
                          />
                          <button
                            v-if="item.dueDate"
                            type="button"
                            class="mt-1.5 text-[11px] text-danger hover:underline"
                            @click="
                              board.setChecklistItemDueDate(
                                card.id,
                                list.id,
                                item.id,
                                null,
                              );
                              openItemDate = null
                            "
                          >
                            Remover prazo
                          </button>
                        </div>
                      </div>

                      <AssigneePicker
                        variant="icon"
                        :selected-ids="item.assigneeIds ?? []"
                        :members="board.members"
                        @toggle="
                          board.toggleChecklistItemAssignee(
                            card.id,
                            list.id,
                            item.id,
                            $event,
                          )
                        "
                      />

                      <div class="relative" data-ephemeral-menu>
                        <button
                          type="button"
                          class="rounded-md p-1 text-text-muted hover:bg-white/10 hover:text-text-primary"
                          title="Mais ações"
                          @click="
                            openItemMenu =
                              openItemMenu === item.id ? null : item.id
                          "
                        >
                          <Ellipsis :size="14" />
                        </button>
                        <div
                          v-if="openItemMenu === item.id"
                          class="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[8rem] rounded-lg border border-white/10 bg-board-elevated p-1 shadow-xl"
                        >
                          <button
                            type="button"
                            class="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-white/10"
                            @click="startEditChecklistItem(item.id, item.text)"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            class="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-danger hover:bg-danger/15"
                            @click="
                              board.removeChecklistItem(
                                card.id,
                                list.id,
                                item.id,
                              );
                              openItemMenu = null
                            "
                          >
                            Excluir item
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                </template>
              </draggable>

              <form
                v-if="addingItemFor === list.id"
                class="mt-2 flex items-center gap-2"
                @submit.prevent="addItem(list.id)"
              >
                <input
                  v-model="newItemText[list.id]"
                  type="text"
                  autofocus
                  placeholder="Adicionar um item"
                  class="flex-1 rounded-lg border border-border-subtle bg-column px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                />
                <button
                  type="submit"
                  class="rounded-lg bg-accent px-2.5 py-2 text-xs font-medium text-board hover:bg-accent-hover"
                >
                  Add
                </button>
                <button
                  type="button"
                  class="rounded-lg px-2 py-2 text-xs text-text-muted hover:text-text-primary"
                  @click="addingItemFor = null"
                >
                  Cancelar
                </button>
              </form>
              <button
                v-else
                type="button"
                class="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
                @click="addingItemFor = list.id"
              >
                Adicionar um item
              </button>
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
            </div>
          </div>

          <aside
            class="flex min-h-0 w-full shrink-0 flex-col border-t border-white/10 bg-column/30 lg:w-[340px] lg:border-l lg:border-t-0"
          >
            <div
              class="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-4 py-3"
            >
              <h3 class="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <MessageSquare :size="15" />
                Comentários
              </h3>
              <button
                type="button"
                class="hidden rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary lg:inline-flex"
                aria-label="Fechar"
                @click="board.closeCard()"
              >
                <X :size="18" :stroke-width="2" />
              </button>
            </div>

            <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
              <form
                class="relative shrink-0 border-b border-white/5 px-4 py-3"
                @submit.prevent="submitComment"
              >
                <div class="flex gap-2">
                  <MemberAvatar
                    :member="currentMember ?? fallbackMember"
                    size="md"
                  />
                  <div class="relative min-w-0 flex-1">
                    <div
                      class="mb-1.5 flex items-center gap-1"
                      role="toolbar"
                      aria-label="Formatação"
                    >
                      <button
                        type="button"
                        class="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
                        title="Negrito (**texto**)"
                        @click="applyCommentFormat('bold')"
                      >
                        <Bold :size="14" />
                      </button>
                      <button
                        type="button"
                        class="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
                        title="Itálico (*texto*)"
                        @click="applyCommentFormat('italic')"
                      >
                        <Italic :size="14" />
                      </button>
                    </div>
                    <textarea
                      ref="commentInputRef"
                      v-model="commentBody"
                      rows="2"
                      placeholder="Escrever um comentário… Use @"
                      class="w-full resize-none rounded-xl border border-border-subtle bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
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
                </div>
              </form>

              <ul class="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                <li
                  v-for="comment in [...card.comments].reverse()"
                  :key="comment.id"
                  class="flex gap-2"
                >
                  <MemberAvatar
                    :member="
                      board.getMemberById(comment.authorId) ?? fallbackMember
                    "
                    size="md"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="text-sm">
                        <span class="font-semibold text-text-primary">
                          {{
                            board.getMemberById(comment.authorId)?.name ??
                            'Usuário'
                          }}
                        </span>
                        <span class="ml-2 text-[11px] text-text-muted">
                          {{ formatDate(comment.createdAt) }}
                          <template v-if="comment.updatedAt">
                            · editado
                          </template>
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
                        class="w-full resize-none rounded-xl border border-border-subtle bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
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
                      class="markdown-body mt-1 rounded-xl bg-board-elevated/80 px-3 py-2 text-sm text-text-secondary"
                      v-html="renderCommentBody(comment.body)"
                    />
                  </div>
                </li>
                <li
                  v-if="!card.comments.length"
                  class="py-6 text-center text-sm text-text-muted"
                >
                  Nenhum comentário ainda.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </article>
    </div>
  </Teleport>
</template>
