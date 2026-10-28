<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  AlignLeft,
  Calendar,
  Clock,
  ImagePlus,
  Loader2,
  Paperclip,
  Trash2,
  X,
} from '@lucide/vue'
import { insertAtCursor, renderMarkdown } from '../lib/markdown'
import { useAgendaStore } from '../stores/agenda'
import { useBoardStore } from '../stores/board'
import { useToastStore } from '../stores/toast'
import AssigneePicker from './AssigneePicker.vue'
import MemberAvatar from './MemberAvatar.vue'

const props = defineProps<{
  eventId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const agenda = useAgendaStore()
const board = useBoardStore()
const toast = useToastStore()

const event = computed(
  () => agenda.events.find((item) => item.id === props.eventId) ?? null,
)

const draftTitle = ref('')
const draftDescription = ref('')
const draftDate = ref('')
const draftTime = ref('')
const isEditingDescription = ref(false)
const descriptionInputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const savingMeta = ref(false)
const savingNotes = ref(false)
const uploading = ref(false)
const attachmentError = ref<string | null>(null)

watch(
  event,
  (value) => {
    if (!value) {
      emit('close')
      return
    }
    draftTitle.value = value.title
    draftDescription.value = value.description ?? ''
    draftDate.value = value.eventDate
    draftTime.value = value.eventTime ?? ''
    isEditingDescription.value = !(value.description ?? '').trim()
  },
  { immediate: true },
)

const renderedDescription = computed(() => {
  if (!draftDescription.value.trim()) return ''
  return renderMarkdown(draftDescription.value)
})

const imageAttachments = computed(
  () =>
    event.value?.attachments.filter((file) =>
      file.mimeType.startsWith('image/'),
    ) ?? [],
)

function formatDayLabel(dateKey: string) {
  const [y, m, day] = dateKey.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(d)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function onDescriptionClick(ev: MouseEvent) {
  const target = ev.target as HTMLElement | null
  if (target?.closest('a') || target?.closest('img')) {
    ev.stopPropagation()
    return
  }
  isEditingDescription.value = true
}

function insertMarkdownImage(url: string, alt: string) {
  const el = descriptionInputRef.value
  const markdown = `![${alt}](${url})`
  if (!el) {
    draftDescription.value = draftDescription.value
      ? `${draftDescription.value.trimEnd()}\n\n${markdown}\n`
      : `${markdown}\n`
    return
  }
  const start = el.selectionStart ?? draftDescription.value.length
  const end = el.selectionEnd ?? start
  const needsLeadingNewline =
    start > 0 && draftDescription.value[start - 1] !== '\n'
  const insert = `${needsLeadingNewline ? '\n\n' : ''}${markdown}\n`
  const { next, cursor } = insertAtCursor(
    draftDescription.value,
    start,
    end,
    insert,
  )
  draftDescription.value = next
  nextTick(() => {
    el.focus()
    el.setSelectionRange(cursor, cursor)
  })
}

async function saveMeta() {
  if (!event.value || savingMeta.value) return
  const title = draftTitle.value.trim()
  if (!title) {
    toast.error('Informe um título.')
    return
  }
  savingMeta.value = true
  try {
    await agenda.updateEvent(event.value.id, {
      title,
      eventDate: draftDate.value,
      eventTime: draftTime.value || null,
    })
  } finally {
    savingMeta.value = false
  }
}

async function saveDescription() {
  if (!event.value || savingNotes.value) return
  savingNotes.value = true
  try {
    await agenda.updateEvent(event.value.id, {
      description: draftDescription.value.trim() || null,
    })
    isEditingDescription.value = false
    toast.success('Descrição salva.')
  } finally {
    savingNotes.value = false
  }
}

async function handleImageFile(file: File, insertInDescription = true) {
  if (!event.value) return
  if (!file.type.startsWith('image/') && insertInDescription) {
    // ainda permite anexar não-imagem pelo seletor
  }
  attachmentError.value = null
  if (file.size > 5 * 1024 * 1024) {
    attachmentError.value = 'Arquivo acima do limite de 5 MB.'
    return
  }
  uploading.value = true
  try {
    const uploaded = await agenda.uploadAttachment(event.value.id, file)
    if (!uploaded) {
      attachmentError.value = agenda.error ?? 'Falha ao enviar o arquivo.'
      return
    }
    if (insertInDescription && uploaded.mimeType.startsWith('image/')) {
      isEditingDescription.value = true
      await nextTick()
      insertMarkdownImage(
        uploaded.url,
        uploaded.name.replace(/\.[^.]+$/, '') || 'imagem',
      )
      await agenda.updateEvent(event.value.id, {
        description: draftDescription.value.trim() || null,
      })
    }
    toast.success(
      uploaded.mimeType.startsWith('image/')
        ? 'Imagem adicionada'
        : 'Anexo adicionado',
    )
  } finally {
    uploading.value = false
  }
}

async function onPaste(ev: ClipboardEvent) {
  const items = ev.clipboardData?.items
  if (!items?.length) return
  const imageItem = Array.from(items).find((item) =>
    item.type.startsWith('image/'),
  )
  if (!imageItem) return
  const file = imageItem.getAsFile()
  if (!file) return
  ev.preventDefault()
  await handleImageFile(file, true)
}

async function onPickAttachment(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await handleImageFile(file, file.type.startsWith('image/'))
}

async function removeAttachment(attachmentId: string) {
  if (!event.value) return
  await agenda.removeAttachment(event.value.id, attachmentId)
}

async function onDelete() {
  if (!event.value) return
  if (!confirm('Remover este item da agenda?')) return
  const id = event.value.id
  emit('close')
  await agenda.removeEvent(id)
}

function memberById(id: string) {
  return board.getMemberById(id)
}
</script>

<template>
  <div
    v-if="event"
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center"
    @click.self="emit('close')"
    @paste="onPaste"
  >
    <div
      class="flex max-h-[min(92dvh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-board shadow-xl"
      role="dialog"
      aria-modal="true"
      :aria-label="event.title"
      @keydown.esc.stop="emit('close')"
    >
      <header
        class="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5"
      >
        <div class="min-w-0 flex-1 space-y-2">
          <input
            v-model="draftTitle"
            type="text"
            class="w-full rounded-xl border border-transparent bg-transparent px-1 text-lg font-semibold text-text-primary outline-none hover:border-white/10 focus:border-accent/40 focus:bg-board-elevated"
            @blur="saveMeta"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <p class="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span class="inline-flex items-center gap-1">
              <Calendar :size="12" />
              {{ formatDayLabel(event.eventDate) }}
            </span>
            <span
              v-if="event.eventTime"
              class="inline-flex items-center gap-1 text-accent"
            >
              <Clock :size="12" />
              {{ event.eventTime }}
            </span>
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
          aria-label="Fechar"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div class="grid gap-6 lg:grid-cols-[1fr_220px]">
          <div class="space-y-5">
            <section class="flex flex-wrap items-start gap-x-8 gap-y-4">
              <AssigneePicker
                label="Membros"
                variant="stack"
                :selected-ids="event.memberIds"
                :members="board.members"
                @toggle="agenda.toggleMember(event.id, $event)"
              />

              <div class="min-w-[11rem] space-y-2">
                <p
                  class="text-[11px] font-semibold uppercase tracking-wide text-text-muted"
                >
                  Data e horário
                </p>
                <div class="flex flex-wrap gap-2">
                  <input
                    v-model="draftDate"
                    type="date"
                    class="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                    @change="saveMeta"
                  />
                  <input
                    v-model="draftTime"
                    type="time"
                    class="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                    @change="saveMeta"
                  />
                </div>
              </div>
            </section>

            <section>
              <div class="mb-2 flex items-center justify-between gap-2">
                <h3
                  class="flex items-center gap-1.5 text-sm font-semibold text-text-primary"
                >
                  <AlignLeft :size="16" />
                  Descrição / ata
                </h3>
                <button
                  v-if="!isEditingDescription && (event.description || '').trim()"
                  type="button"
                  class="rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface"
                  @click="isEditingDescription = true"
                >
                  Editar
                </button>
              </div>

              <div v-if="isEditingDescription" class="space-y-2">
                <p class="text-[11px] text-text-muted">
                  Cole uma imagem (Ctrl+V) ou use o botão de anexos.
                  {{ uploading ? 'Enviando…' : '' }}
                </p>
                <textarea
                  ref="descriptionInputRef"
                  v-model="draftDescription"
                  rows="8"
                  placeholder="Registre decisões, combinados e próximos passos. Cole imagens aqui."
                  class="w-full resize-y rounded-xl border border-border-subtle bg-column px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                  @paste="onPaste"
                />
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-board hover:bg-accent-hover disabled:opacity-50"
                    :disabled="savingNotes"
                    @click="saveDescription"
                  >
                    {{ savingNotes ? 'Salvando…' : 'Salvar' }}
                  </button>
                  <button
                    type="button"
                    class="rounded-lg px-3 py-1.5 text-sm text-text-secondary hover:bg-surface"
                    :disabled="savingNotes"
                    @click="
                      draftDescription = event.description ?? '';
                      isEditingDescription = false
                    "
                  >
                    Cancelar
                  </button>
                </div>
              </div>

              <button
                v-else-if="!(event.description || '').trim()"
                type="button"
                class="w-full rounded-xl border border-dashed border-white/15 bg-column/40 px-3 py-8 text-left text-sm text-text-muted hover:border-accent/35 hover:text-text-secondary"
                @click="isEditingDescription = true"
              >
                Adicionar descrição ou colar imagem…
              </button>

              <div
                v-else
                class="markdown-body break-words rounded-xl bg-column/50 px-3.5 py-2.5 text-sm text-text-secondary"
                @click="onDescriptionClick"
                v-html="renderedDescription"
              />
            </section>

            <section v-if="imageAttachments.length" class="space-y-2">
              <h3 class="text-sm font-semibold text-text-primary">Imagens</h3>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <a
                  v-for="img in imageAttachments"
                  :key="img.id"
                  :href="img.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group relative overflow-hidden rounded-xl border border-white/10 bg-column"
                >
                  <img
                    :src="img.url"
                    :alt="img.name"
                    class="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                </a>
              </div>
            </section>

            <section>
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3
                  class="flex items-center gap-1.5 text-sm font-semibold text-text-primary"
                >
                  <Paperclip :size="16" />
                  Anexos
                </h3>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-white/10 hover:text-text-primary disabled:opacity-50"
                    :disabled="uploading"
                    @click="fileInputRef?.click()"
                  >
                    <ImagePlus :size="12" />
                    {{ uploading ? 'Enviando…' : 'Arquivo / imagem' }}
                  </button>
                  <input
                    ref="fileInputRef"
                    type="file"
                    accept="image/*,.pdf,.csv,.txt,.doc,.docx,.xls,.xlsx"
                    class="hidden"
                    @change="onPickAttachment"
                  />
                </div>
              </div>
              <p class="mb-2 text-[11px] text-text-muted">
                Até 5 MB · cole imagens em qualquer lugar deste painel
              </p>
              <p v-if="attachmentError" class="mb-2 text-xs text-red-300">
                {{ attachmentError }}
              </p>
              <ul v-if="event.attachments.length" class="space-y-2">
                <li
                  v-for="file in event.attachments"
                  :key="file.id"
                  class="flex items-center gap-3 rounded-xl bg-column px-3 py-2"
                >
                  <div
                    class="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-surface text-[10px] font-semibold uppercase text-text-secondary"
                  >
                    <img
                      v-if="file.mimeType.startsWith('image/')"
                      :src="file.url"
                      :alt="file.name"
                      class="size-full object-cover"
                    />
                    <template v-else>
                      {{ file.name.split('.').pop()?.slice(0, 4) || 'FILE' }}
                    </template>
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
                      {{ formatBytes(file.sizeBytes) }}
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

          <aside class="space-y-3 lg:border-l lg:border-white/10 lg:pl-4">
            <p
              class="text-[11px] font-semibold uppercase tracking-wide text-text-muted"
            >
              Opções
            </p>
            <div
              v-if="event.memberIds.length"
              class="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-column/40 p-2"
            >
              <MemberAvatar
                v-for="memberId in event.memberIds"
                :key="memberId"
                :member="
                  memberById(memberId) ?? {
                    name: '?',
                    initials: '?',
                    avatarColor: 'bg-sky-600',
                    avatarUrl: null,
                  }
                "
                size="sm"
              />
            </div>
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary disabled:opacity-50"
              :disabled="uploading"
              @click="fileInputRef?.click()"
            >
              <Loader2 v-if="uploading" :size="14" class="animate-spin" />
              <Paperclip v-else :size="14" />
              Anexar
            </button>
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger hover:bg-danger/20"
              @click="onDelete"
            >
              <Trash2 :size="14" />
              Excluir item
            </button>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>
