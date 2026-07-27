<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  ChevronRight,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  Users,
  X,
} from '@lucide/vue'
import { useCommunityStore } from '../stores/community'
import { useHubSectionsStore } from '../stores/hubSections'
import type { HubSection } from '../types/community'
import CommunityCalendar from './CommunityCalendar.vue'

type HubScreen = 'home' | 'conteudo' | 'section'

const screen = ref<HubScreen>('home')
const activeSectionId = ref<string | null>(null)
const community = useCommunityStore()
const hubSections = useHubSectionsStore()
const ready = ref(false)

const menuId = ref<string | null>(null)
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const draftTitle = ref('')
const draftDescription = ref('')
const draftEyebrow = ref('')
const draftUrl = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

const renamingId = ref<string | null>(null)
const renameDraft = ref('')

const activeSection = computed(
  () =>
    hubSections.conteudoSections.find(
      (section) => section.id === activeSectionId.value,
    ) ?? null,
)

onMounted(async () => {
  if (!ready.value) {
    await Promise.all([community.init(), hubSections.init()])
    ready.value = true
  }
})

function cardIcon(card: HubSection) {
  if (card.kind === 'link' || card.url) return KeyRound
  if (card.kind === 'folder') return FileText
  return StickyNote
}

function openCard(card: HubSection) {
  menuId.value = null
  if (card.kind === 'folder' || card.id === 'hub-conteudo') {
    screen.value = 'conteudo'
    return
  }
  if (card.url) {
    window.open(card.url, '_blank', 'noopener,noreferrer')
    return
  }
  // Card sem link: abre formulário de edição
  openEditForm(card)
}

async function openCreateForm() {
  editingId.value = null
  draftTitle.value = ''
  draftDescription.value = ''
  draftEyebrow.value = 'Card'
  draftUrl.value = ''
  formOpen.value = true
  menuId.value = null
  await nextTick()
  titleInputRef.value?.focus()
}

async function openEditForm(card: HubSection) {
  editingId.value = card.id
  draftTitle.value = card.title
  draftDescription.value = card.description
  draftEyebrow.value = card.eyebrow || 'Card'
  draftUrl.value = card.url ?? ''
  formOpen.value = true
  menuId.value = null
  await nextTick()
  titleInputRef.value?.focus()
}

function closeForm() {
  formOpen.value = false
  editingId.value = null
}

async function saveForm() {
  const title = draftTitle.value.trim()
  if (!title) {
    titleInputRef.value?.focus()
    return
  }
  const url = draftUrl.value.trim() || null
  const existing = editingId.value
    ? hubSections.homeCards.find((card) => card.id === editingId.value)
    : null
  const kind =
    existing?.kind === 'folder'
      ? 'folder'
      : url
        ? 'link'
        : 'note'

  const payload = {
    title,
    description: draftDescription.value.trim(),
    eyebrow:
      draftEyebrow.value.trim() ||
      (kind === 'folder' ? 'Produção' : url ? 'Link' : 'Card'),
    url: kind === 'folder' ? null : url,
    kind: kind as 'link' | 'folder' | 'note',
  }

  if (editingId.value) {
    await hubSections.update(editingId.value, payload)
  } else {
    await hubSections.create({
      parent: 'home',
      ...payload,
    })
  }
  closeForm()
}

async function removeCard(card: HubSection) {
  menuId.value = null
  if (!confirm(`Excluir o card “${card.title}”?`)) return
  await hubSections.remove(card.id)
}

function openSection(section: HubSection) {
  activeSectionId.value = section.id
  screen.value = 'section'
  menuId.value = null
}

function startRename(section: HubSection) {
  renamingId.value = section.id
  renameDraft.value = section.title
  menuId.value = null
}

async function confirmRename(section: HubSection) {
  if (renamingId.value !== section.id) return
  const title = renameDraft.value.trim()
  renamingId.value = null
  if (!title || title === section.title) return
  await hubSections.rename(section.id, title)
}

async function removeSection(section: HubSection) {
  menuId.value = null
  if (
    !confirm(
      `Excluir a subdivisão “${section.title}”? O calendário deixa de aparecer, mas os conteúdos já criados permanecem.`,
    )
  ) {
    return
  }
  const ok = await hubSections.remove(section.id)
  if (ok && activeSectionId.value === section.id) {
    activeSectionId.value = null
    screen.value = 'conteudo'
  }
}

async function addSection() {
  const section = await hubSections.create({
    parent: 'conteudo',
    title: 'Nova subdivisão',
    kind: 'community_calendar',
    eyebrow: 'Subdivisão',
    description: 'Agenda de posts e conteúdos por dia',
  })
  if (section) {
    renamingId.value = section.id
    renameDraft.value = section.title
  }
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-[4.75rem] pt-2 sm:px-4 sm:pb-16 sm:pt-3"
  >
    <template v-if="screen === 'home'">
      <header class="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-3 sm:mb-5">
        <div>
          <h2 class="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            HUB
          </h2>
          <p class="mt-1 text-sm text-text-muted">
            Crie cards livres — atalhos, links ou notas do time
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-board hover:bg-accent-hover"
          @click="openCreateForm"
        >
          <Plus :size="16" />
          Novo card
        </button>
      </header>

      <p v-if="hubSections.error" class="mb-3 text-xs text-red-300">
        {{ hubSections.error }}
      </p>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <div
          v-for="card in hubSections.homeCards"
          :key="card.id"
          class="panel-glass panel-glass-accent group relative flex min-h-[9.5rem] cursor-pointer flex-col justify-between rounded-3xl p-5 text-left transition-all hover:brightness-110 sm:min-h-[11rem] sm:p-6"
          role="button"
          tabindex="0"
          :aria-label="`Abrir ${card.title}`"
          @click="openCard(card)"
          @keydown.enter.prevent="openCard(card)"
        >
          <div class="pointer-events-none">
            <p
              class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent/90"
            >
              <component :is="cardIcon(card)" :size="13" />
              {{ card.eyebrow || (card.url ? 'Link' : 'Card') }}
            </p>
            <h3 class="mt-2 text-lg font-semibold text-text-primary">
              {{ card.title }}
            </h3>
          </div>

          <div class="mt-4 flex items-end justify-between gap-2">
            <p class="pointer-events-none line-clamp-2 text-xs text-text-muted">
              {{ card.description || 'Sem descrição' }}
              <span
                v-if="card.kind === 'folder'"
                class="ml-1 inline-flex items-center gap-0.5"
              >
                <ChevronRight :size="11" class="inline" />
              </span>
              <span
                v-else-if="card.url"
                class="ml-1 inline-flex items-center gap-0.5"
              >
                <ExternalLink :size="11" class="inline" />
              </span>
            </p>

            <div class="relative shrink-0" @click.stop>
              <button
                type="button"
                class="pointer-events-auto rounded-lg p-1.5 text-text-muted opacity-70 hover:bg-white/10 hover:text-text-primary group-hover:opacity-100"
                title="Opções"
                @click="menuId = menuId === card.id ? null : card.id"
              >
                <MoreHorizontal :size="16" />
              </button>
              <div
                v-if="menuId === card.id"
                class="absolute bottom-full right-0 z-20 mb-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-white/10 bg-board-elevated py-1 shadow-xl"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
                  @click="openEditForm(card)"
                >
                  <Pencil :size="14" />
                  Editar
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                  @click="removeCard(card)"
                >
                  <Trash2 :size="14" />
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-white/15 text-text-muted transition-colors hover:border-accent/40 hover:bg-white/5 hover:text-text-secondary sm:min-h-[11rem]"
          @click="openCreateForm"
        >
          <Plus :size="22" />
          <span class="text-sm font-medium">Adicionar card</span>
        </button>
      </div>
    </template>

    <template v-else-if="screen === 'conteudo'">
      <header class="mb-4 shrink-0">
        <button
          type="button"
          class="mb-2 rounded-lg px-2 py-1 text-xs text-text-secondary hover:bg-white/10 hover:text-text-primary"
          @click="screen = 'home'"
        >
          ← HUB
        </button>
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 class="text-xl font-semibold text-text-primary">Conteúdo</h2>
            <p class="mt-1 text-sm text-text-muted">
              Subdivisões — renomeie ou exclua pelo menu de cada card
            </p>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/10 hover:text-text-primary"
            @click="addSection"
          >
            <Plus :size="14" />
            Nova subdivisão
          </button>
        </div>
      </header>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          v-for="section in hubSections.conteudoSections"
          :key="section.id"
          class="panel-glass panel-glass-accent relative flex min-h-[8rem] cursor-pointer flex-col justify-between rounded-3xl p-5 text-left transition-all hover:brightness-110"
          role="button"
          tabindex="0"
          :aria-label="`Abrir ${section.title}`"
          @click="openSection(section)"
          @keydown.enter.prevent="openSection(section)"
        >
          <div class="pointer-events-none">
            <p
              class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent/90"
            >
              <Users :size="13" />
              Subdivisão
            </p>
            <input
              v-if="renamingId === section.id"
              v-model="renameDraft"
              type="text"
              class="pointer-events-auto mt-2 w-full rounded-lg border border-accent/50 bg-black/30 px-2 py-1 text-lg font-semibold text-text-primary outline-none"
              @click.stop
              @blur="confirmRename(section)"
              @keydown.enter.prevent="confirmRename(section)"
              @keydown.escape.prevent="renamingId = null"
            />
            <h3 v-else class="mt-2 text-lg font-semibold text-text-primary">
              {{ section.title }}
            </h3>
          </div>

          <div class="mt-3 flex items-center justify-between gap-2">
            <p class="pointer-events-none text-xs text-text-muted">
              Agenda de posts e conteúdos por dia
            </p>
            <div class="relative" @click.stop>
              <button
                type="button"
                class="pointer-events-auto rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
                title="Opções"
                @click="menuId = menuId === section.id ? null : section.id"
              >
                <MoreHorizontal :size="16" />
              </button>
              <div
                v-if="menuId === section.id"
                class="absolute bottom-full right-0 z-20 mb-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-white/10 bg-board-elevated py-1 shadow-xl"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
                  @click="startRename(section)"
                >
                  <Pencil :size="14" />
                  Renomear
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                  @click="removeSection(section)"
                >
                  <Trash2 :size="14" />
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>

        <p
          v-if="!hubSections.conteudoSections.length && !hubSections.loading"
          class="col-span-full py-8 text-center text-sm text-text-muted"
        >
          Nenhuma subdivisão. Crie uma para organizar o calendário.
        </p>
      </div>
    </template>

    <CommunityCalendar
      v-else-if="activeSection"
      class="min-h-0 flex-1"
      :title="activeSection.title"
      @back="screen = 'conteudo'"
    />

    <!-- Create / edit card modal -->
    <Teleport to="body">
      <div
        v-if="formOpen"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Card do HUB"
      >
        <button
          type="button"
          class="absolute inset-0 bg-black/60"
          aria-label="Fechar"
          @click="closeForm"
        />
        <form
          class="panel-glass relative z-10 w-full max-w-md rounded-2xl p-5 shadow-2xl"
          @submit.prevent="saveForm"
        >
          <div class="mb-4 flex items-center justify-between gap-2">
            <h3 class="text-base font-semibold text-text-primary">
              {{ editingId ? 'Editar card' : 'Novo card' }}
            </h3>
            <button
              type="button"
              class="rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
              aria-label="Fechar"
              @click="closeForm"
            >
              <X :size="16" />
            </button>
          </div>

          <div class="space-y-3">
            <label class="block text-xs text-text-muted">
              Título
              <input
                ref="titleInputRef"
                v-model="draftTitle"
                type="text"
                required
                placeholder="Ex.: Docs, Drive, Briefing…"
                class="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
              />
            </label>

            <label class="block text-xs text-text-muted">
              Rótulo (opcional)
              <input
                v-model="draftEyebrow"
                type="text"
                placeholder="Ex.: Link, Nota, Ferramenta"
                class="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
              />
            </label>

            <label class="block text-xs text-text-muted">
              Descrição (opcional)
              <textarea
                v-model="draftDescription"
                rows="2"
                placeholder="O que é este card?"
                class="mt-1 w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
              />
            </label>

            <label class="block text-xs text-text-muted">
              <span class="inline-flex items-center gap-1">
                <Link2 :size="12" />
                Link (opcional)
              </span>
              <input
                v-model="draftUrl"
                type="url"
                placeholder="https://…"
                class="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
              />
              <span class="mt-1 block text-[11px] text-text-muted">
                Se tiver link, o clique abre em nova aba. Sem link, serve como
                atalho/nota editável.
              </span>
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
              @click="closeForm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-board hover:bg-accent-hover"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </Teleport>
  </div>
</template>
