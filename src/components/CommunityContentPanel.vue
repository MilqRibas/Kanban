<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  Bold,
  Calendar,
  ChevronDown,
  CircleDot,
  FileText,
  Italic,
  Link2,
  MoreHorizontal,
  Target,
  Trash2,
  Users,
  X,
} from '@lucide/vue'
import { useCommunityStore } from '../stores/community'
import { CONTENT_STATUS_OPTIONS } from '../types/community'
import { renderMarkdown, wrapSelection } from '../lib/markdown'

const community = useCommunityStore()
const draftTitle = ref('')
const draftBody = ref('')
const isEditingBody = ref(false)
const showMoreProps = ref(false)
const statusOpen = ref(false)
const menuOpen = ref(false)
const bodyRef = ref<HTMLTextAreaElement | null>(null)

const STATUS_STYLES: Record<string, string> = {
  Rascunho: 'bg-white/10 text-text-secondary',
  'Em produção': 'bg-amber-500/20 text-amber-200',
  Pronto: 'bg-sky-500/20 text-sky-200',
  Enviado: 'bg-emerald-500/20 text-emerald-300',
}

watch(
  () => community.selected,
  (item) => {
    if (!item) return
    draftTitle.value = item.title
    draftBody.value = item.body
    isEditingBody.value = !item.body.trim()
    showMoreProps.value = false
    statusOpen.value = false
    menuOpen.value = false
  },
  { immediate: true },
)

const renderedBody = computed(() => {
  if (!draftBody.value.trim()) return ''
  return renderMarkdown(draftBody.value)
})

const publishLabel = computed(() => {
  const raw = community.selected?.publishDate
  if (!raw) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${raw.slice(0, 10)}T12:00:00`))
})

function onBodyClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('a')) {
    event.stopPropagation()
    return
  }
  isEditingBody.value = true
  nextTick(() => bodyRef.value?.focus())
}

async function saveTitle() {
  if (!community.selected) return
  const title = draftTitle.value.trim() || 'Sem título'
  draftTitle.value = title
  await community.update(community.selected.id, { title })
}

async function saveBody() {
  if (!community.selected) return
  await community.update(community.selected.id, { body: draftBody.value })
  isEditingBody.value = false
}

async function setStatus(status: string) {
  if (!community.selected) return
  statusOpen.value = false
  await community.update(community.selected.id, { status })
}

async function saveField(
  field: 'contentType' | 'objective' | 'community' | 'fds' | 'publishDate',
  value: string,
) {
  if (!community.selected) return
  if (field === 'publishDate') {
    await community.update(community.selected.id, {
      publishDate: value || null,
    })
    return
  }
  await community.update(community.selected.id, { [field]: value })
}

function applyFormat(kind: 'bold' | 'italic') {
  const el = bodyRef.value
  if (!el) {
    isEditingBody.value = true
    return
  }
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

async function removeSelected() {
  if (!community.selected) return
  menuOpen.value = false
  if (!confirm('Excluir este conteúdo?')) return
  await community.remove(community.selected.id)
}

function emptyLabel(value: string) {
  return value.trim() ? value : 'Vazio'
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="community.selected"
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      :aria-label="community.selected.title"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Fechar"
        @click="community.close()"
      />

      <div
        class="panel-glass relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-2xl shadow-black/50"
      >
        <!-- Top bar -->
        <div class="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-4">
          <div
            class="flex size-10 items-center justify-center rounded-xl bg-[#39bcff]/15 text-[#39bcff] ring-1 ring-[#39bcff]/25"
          >
            <Users :size="20" :stroke-width="2" />
          </div>

          <div class="flex items-center gap-1">
            <div class="relative">
              <button
                type="button"
                class="rounded-lg p-2 text-text-muted hover:bg-white/10 hover:text-text-primary"
                title="Mais ações"
                @click="menuOpen = !menuOpen"
              >
                <MoreHorizontal :size="18" />
              </button>
              <div
                v-if="menuOpen"
                class="absolute right-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-white/10 bg-board-elevated py-1 shadow-xl"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                  @click="removeSelected"
                >
                  <Trash2 :size="14" />
                  Excluir
                </button>
              </div>
            </div>
            <button
              type="button"
              class="rounded-lg p-2 text-text-secondary hover:bg-white/10 hover:text-text-primary"
              aria-label="Fechar"
              @click="community.close()"
            >
              <X :size="18" />
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-8">
          <!-- Title -->
          <input
            v-model="draftTitle"
            type="text"
            class="mb-5 w-full bg-transparent text-3xl font-bold uppercase tracking-tight text-text-primary outline-none placeholder:text-text-muted sm:text-4xl"
            placeholder="Sem título"
            @blur="saveTitle"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />

          <!-- Properties -->
          <div class="space-y-1">
            <!-- Status -->
            <div class="grid grid-cols-[9.5rem_1fr] items-center gap-2 py-1.5 sm:grid-cols-[11rem_1fr]">
              <div class="flex items-center gap-2 text-sm text-text-muted">
                <CircleDot :size="15" class="opacity-70" />
                Status
              </div>
              <div class="relative min-w-0">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors hover:brightness-110"
                  :class="STATUS_STYLES[community.selected.status] ?? STATUS_STYLES.Rascunho"
                  @click="statusOpen = !statusOpen"
                >
                  {{ community.selected.status || 'Rascunho' }}
                  <ChevronDown :size="12" />
                </button>
                <div
                  v-if="statusOpen"
                  class="absolute left-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-white/10 bg-board-elevated py-1 shadow-xl"
                >
                  <button
                    v-for="option in CONTENT_STATUS_OPTIONS"
                    :key="option"
                    type="button"
                    class="flex w-full items-center px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
                    @click="setStatus(option)"
                  >
                    <span
                      class="mr-2 inline-block size-2 rounded-full"
                      :class="STATUS_STYLES[option]"
                    />
                    {{ option }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Publish date -->
            <div class="grid grid-cols-[9.5rem_1fr] items-center gap-2 py-1.5 sm:grid-cols-[11rem_1fr]">
              <div class="flex items-center gap-2 text-sm text-text-muted">
                <Calendar :size="15" class="opacity-70" />
                Data de publicação
              </div>
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <input
                  type="date"
                  class="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                  :value="community.selected.publishDate?.slice(0, 10) ?? ''"
                  @change="
                    saveField(
                      'publishDate',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
                <span
                  v-if="publishLabel"
                  class="text-xs text-text-muted"
                >
                  {{ publishLabel }}
                </span>
                <button
                  v-if="community.selected.publishDate"
                  type="button"
                  class="text-xs text-text-muted hover:text-text-primary"
                  @click="saveField('publishDate', '')"
                >
                  Limpar
                </button>
              </div>
            </div>

            <!-- Content type -->
            <div class="grid grid-cols-[9.5rem_1fr] items-center gap-2 py-1.5 sm:grid-cols-[11rem_1fr]">
              <div class="flex items-center gap-2 text-sm text-text-muted">
                <FileText :size="15" class="opacity-70" />
                Tipo de conteúdo
              </div>
              <input
                :value="community.selected.contentType"
                type="text"
                placeholder="Vazio"
                class="min-w-0 rounded-md bg-transparent px-2 py-1 text-sm text-text-primary outline-none placeholder:text-text-muted hover:bg-white/5 focus:bg-white/5"
                @change="
                  saveField(
                    'contentType',
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </div>

            <!-- Objective -->
            <div class="grid grid-cols-[9.5rem_1fr] items-center gap-2 py-1.5 sm:grid-cols-[11rem_1fr]">
              <div class="flex items-center gap-2 text-sm text-text-muted">
                <Target :size="15" class="opacity-70" />
                Objetivo
              </div>
              <input
                :value="community.selected.objective"
                type="text"
                placeholder="Vazio"
                class="min-w-0 rounded-md bg-transparent px-2 py-1 text-sm text-text-primary outline-none placeholder:text-text-muted hover:bg-white/5 focus:bg-white/5"
                @change="
                  saveField(
                    'objective',
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </div>

            <template v-if="showMoreProps">
              <!-- FDS -->
              <div class="grid grid-cols-[9.5rem_1fr] items-center gap-2 py-1.5 sm:grid-cols-[11rem_1fr]">
                <div class="flex items-center gap-2 text-sm text-text-muted">
                  <Link2 :size="15" class="opacity-70" />
                  FDS
                </div>
                <input
                  :value="community.selected.fds"
                  type="text"
                  placeholder="Vazio"
                  class="min-w-0 rounded-md bg-transparent px-2 py-1 text-sm text-text-primary outline-none placeholder:text-text-muted hover:bg-white/5 focus:bg-white/5"
                  @change="
                    saveField('fds', ($event.target as HTMLInputElement).value)
                  "
                />
              </div>

              <!-- Which community -->
              <div class="grid grid-cols-[9.5rem_1fr] items-center gap-2 py-1.5 sm:grid-cols-[11rem_1fr]">
                <div class="flex items-center gap-2 text-sm text-text-muted">
                  <Users :size="15" class="opacity-70" />
                  Qual Comunidade?
                </div>
                <input
                  :value="community.selected.community"
                  type="text"
                  placeholder="Vazio"
                  class="min-w-0 rounded-md bg-transparent px-2 py-1 text-sm text-text-primary outline-none placeholder:text-text-muted hover:bg-white/5 focus:bg-white/5"
                  @change="
                    saveField(
                      'community',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </div>
            </template>

            <button
              type="button"
              class="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-white/5 hover:text-text-secondary"
              @click="showMoreProps = !showMoreProps"
            >
              <ChevronDown
                :size="13"
                :class="showMoreProps ? 'rotate-180' : ''"
                class="transition-transform"
              />
              {{ showMoreProps ? 'Menos propriedades' : 'Mais 2 propriedades' }}
            </button>
          </div>

          <div class="my-5 border-t border-white/10" />

          <!-- Content body -->
          <div>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-base font-semibold text-text-primary">
                Visão geral do conteúdo
              </h3>
              <div
                v-if="isEditingBody"
                class="flex items-center gap-1"
                role="toolbar"
                aria-label="Formatação"
              >
                <button
                  type="button"
                  class="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
                  title="Negrito"
                  @mousedown.prevent="applyFormat('bold')"
                >
                  <Bold :size="14" />
                </button>
                <button
                  type="button"
                  class="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
                  title="Itálico"
                  @mousedown.prevent="applyFormat('italic')"
                >
                  <Italic :size="14" />
                </button>
              </div>
            </div>

            <textarea
              v-if="isEditingBody"
              ref="bodyRef"
              v-model="draftBody"
              rows="12"
              placeholder="Escreva a visão geral do conteúdo… Markdown e links são suportados."
              class="w-full resize-y rounded-xl border border-transparent bg-transparent px-1 py-1 text-[15px] leading-relaxed text-text-primary outline-none placeholder:text-text-muted focus:border-white/10"
              @blur="saveBody"
            />
            <div
              v-else-if="renderedBody"
              class="markdown-body cursor-text px-1 text-[15px] leading-relaxed text-text-secondary"
              @click="onBodyClick"
              v-html="renderedBody"
            />
            <button
              v-else
              type="button"
              class="w-full rounded-xl border border-dashed border-white/10 px-3 py-8 text-left text-sm text-text-muted hover:border-[#39bcff]/35 hover:text-text-secondary"
              @click="isEditingBody = true"
            >
              Adicionar texto…
            </button>
          </div>

          <!-- subtle empty hint for collapsed props -->
          <p v-if="!showMoreProps" class="sr-only">
            {{ emptyLabel(community.selected.fds) }}
            {{ emptyLabel(community.selected.community) }}
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
