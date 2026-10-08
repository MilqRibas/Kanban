<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ArrowLeft,
  Columns3,
  ContactRound,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from '@lucide/vue'
import draggable from 'vuedraggable'
import { usePipelinesStore } from '../../stores/pipelines'
import { useSegmentsStore } from '../../stores/segments'
import { useCrmStore } from '../../stores/crm'
import { usePlayer360 } from '../../composables/usePlayer360'
import { formatDate, formatDateTime } from '../../utils/campaignFormat'
import {
  compareLeadsByNextContact,
  formatIsoDay,
  leadMovesToPersist,
  nextContactRank,
} from '../../utils/pipelineLeads'
import type { PipelineEntry, PipelineEvent, PipelineStage } from '../../types/pipelines'
import CrmView from './CrmView.vue'

type CrmInnerTab = 'pipelines' | 'players'

const store = usePipelinesStore()
const segments = useSegmentsStore()
const crm = useCrmStore()
const player360 = usePlayer360()

const innerTab = ref<CrmInnerTab>('pipelines')
const createOpen = ref(false)
const createName = ref('')
const createSegmentId = ref('')
const newStageName = ref('')
const renamingStageId = ref<string | null>(null)
const renameDraft = ref('')
const selectedLeadId = ref<string | null>(null)
const notesDraft = ref('')
const contactDraft = ref('')
const notesStatus = ref<'idle' | 'saving' | 'saved'>('idle')
const leadQuery = ref('')

function openLead(entry: PipelineEntry) {
  selectedLeadId.value = entry.id
  notesDraft.value = entry.notes ?? ''
  contactDraft.value = entry.nextContactAt ?? ''
  notesStatus.value = 'idle'
  void store.loadLeadEvents(entry.pipelineId, entry.playerId)
}

function closeLead() {
  void saveLeadNotes()
  selectedLeadId.value = null
}

async function saveLeadNotes() {
  const lead = selectedLead.value
  if (!lead) return
  const next = notesDraft.value.trim()
  if ((lead.notes ?? '') === next) return
  notesStatus.value = 'saving'
  await store.saveEntryNotes(lead.id, notesDraft.value)
  notesStatus.value = 'saved'
}

async function saveNextContact() {
  const lead = selectedLead.value
  if (!lead) return
  await store.saveNextContact(lead.id, contactDraft.value || null)
}

function onLeadKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !selectedLeadId.value) return
  event.preventDefault()
  closeLead()
}

onMounted(() => {
  window.addEventListener('keydown', onLeadKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onLeadKeydown)
})

onMounted(async () => {
  await Promise.all([store.init(), segments.init()])
  if (!crm.ready) await crm.init()
})

const board = computed(() => store.board)

const selectedLead = computed(() =>
  board.value?.entries.find((entry) => entry.id === selectedLeadId.value) ?? null,
)

const stagesModel = computed({
  get: (): PipelineStage[] => board.value?.stages ?? [],
  set: (next: PipelineStage[]) => {
    void store.reorderStages(next.map((s) => s.id))
  },
})

function entriesForStage(stageId: string): PipelineEntry[] {
  return board.value?.entries.filter((e) => e.stageId === stageId) ?? []
}

function leadMatches(entry: PipelineEntry) {
  const query = leadQuery.value.trim().toLowerCase()
  if (!query) return true
  return [entry.playerId, entry.nickname, entry.name, entry.notes].some((value) =>
    (value ?? '').toLowerCase().includes(query),
  )
}

function visibleEntries(stageId: string): PipelineEntry[] {
  return entriesForStage(stageId)
    .filter(leadMatches)
    .slice()
    .sort((a, b) => compareLeadsByNextContact(a, b))
}

function contactChip(entry: PipelineEntry) {
  if (!entry.nextContactAt) return 'Sem data'
  const [, month, day] = entry.nextContactAt.slice(0, 10).split('-')
  return month && day ? `${day}/${month}` : formatIsoDay(entry.nextContactAt)
}

function contactChipClass(entry: PipelineEntry) {
  const rank = nextContactRank(entry.nextContactAt)
  if (rank === 0) return 'bg-rose-500/15 text-rose-200'
  if (rank === 1) return 'bg-amber-400/10 text-amber-200/90'
  return 'bg-white/10 text-text-secondary'
}

function contactChipTitle(entry: PipelineEntry) {
  if (!entry.nextContactAt) return 'Sem próximo contato'
  const day = formatIsoDay(entry.nextContactAt)
  return nextContactRank(entry.nextContactAt) === 0 ? `Atrasado · ${day}` : day
}

function eventLabel(event: PipelineEvent) {
  const to = event.toStageId ? stageName(event.toStageId) : ''
  const from = event.fromStageId ? stageName(event.fromStageId) : ''
  if (event.eventType === 'moved') {
    return from && to ? `${from} → ${to}` : 'Mudou de estágio'
  }
  if (event.eventType === 'entered') return to ? `Entrou em ${to}` : 'Entrou no pipeline'
  if (event.eventType === 'note') return 'Observação salva'
  if (event.eventType === 'left') return 'Saiu do pipeline'
  return 'Atualização'
}

function cardTitle(entry: PipelineEntry) {
  const name = (entry.nickname || entry.name || '').trim()
  if (name && name !== entry.playerId) return name
  return entry.playerId
}

function cardHasDistinctName(entry: PipelineEntry) {
  return cardTitle(entry) !== entry.playerId
}

function stageName(stageId: string) {
  return board.value?.stages.find((stage) => stage.id === stageId)?.name ?? ''
}

function onStageListUpdate(stageId: string, list: PipelineEntry[]) {
  const hidden = entriesForStage(stageId).filter((entry) => !leadMatches(entry))
  const merged = [
    ...list,
    ...hidden.filter((entry) => !list.some((item) => item.id === entry.id)),
  ]
  const moves = leadMovesToPersist(list, stageId)
  store.applyColumnEntries(stageId, merged)
  for (const move of moves) {
    void store.moveCard(move.id, stageId, move.fromStageId)
  }
}

async function openCreate() {
  createOpen.value = true
  createName.value = ''
  createSegmentId.value = segments.rows[0]?.id ?? ''
  if (!segments.ready) await segments.init()
}

async function confirmCreate() {
  if (!createName.value.trim()) return
  const pipe = await store.create({
    name: createName.value.trim(),
    segmentId: createSegmentId.value || null,
  })
  createOpen.value = false
  if (pipe) {
    await store.loadBoard(pipe.id)
    if (pipe.segmentId) await store.syncFromSegment()
  }
}

async function createFromSegmentQuick(segmentId: string) {
  const pipe = await store.createFromSegment(segmentId)
  if (pipe) await store.loadBoard(pipe.id)
}

function openBoard(id: string) {
  void store.loadBoard(id)
}

function closeBoard() {
  selectedLeadId.value = null
  store.closeBoard()
}

async function onSync() {
  await store.syncFromSegment()
}

async function onAddStage() {
  const name = newStageName.value.trim()
  if (!name) return
  await store.addStage(name)
  newStageName.value = ''
}

function startRenameStage(stageId: string, name: string) {
  renamingStageId.value = stageId
  renameDraft.value = name
}

async function commitRenameStage() {
  if (!renamingStageId.value) return
  const name = renameDraft.value.trim()
  if (name) await store.renameStage(renamingStageId.value, name)
  renamingStageId.value = null
}

async function onDeletePipeline(id: string, name: string) {
  if (!confirm(`Remover pipeline "${name}"?`)) return
  await store.remove(id)
}
</script>

<template>
  <div class="space-y-3">
    <div
      class="flex gap-1 rounded-xl border border-white/10 bg-board-elevated/40 p-1"
      role="tablist"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="innerTab === 'pipelines'"
        class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        :class="
          innerTab === 'pipelines'
            ? 'bg-accent text-board'
            : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
        "
        @click="innerTab = 'pipelines'"
      >
        <Columns3 :size="15" />
        Pipelines
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="innerTab === 'players'"
        class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        :class="
          innerTab === 'players'
            ? 'bg-accent text-board'
            : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
        "
        @click="innerTab = 'players'"
      >
        <ContactRound :size="15" />
        Base de Jogadores
      </button>
    </div>

    <CrmView v-if="innerTab === 'players'" embedded />

    <template v-else>
      <template v-if="board">
        <header class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <button
              type="button"
              class="mb-1 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
              @click="closeBoard"
            >
              <ArrowLeft :size="14" />
              Pipelines
            </button>
            <h3 class="truncate text-base font-semibold text-text-primary">
              {{ board.pipeline.name }}
            </h3>
            <p class="text-[11px] text-text-muted">
              <span v-if="board.pipeline.segmentName">
                Segmento: {{ board.pipeline.segmentName }}
              </span>
              <span v-else-if="board.pipeline.segmentId">Segmento vinculado</span>
              <span v-else>Sem segmentação</span>
              · {{ board.entries.length }}
              {{ board.entries.length === 1 ? 'lead' : 'leads' }}
            </p>
          </div>
          <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <input
              v-model="leadQuery"
              type="search"
              placeholder="Buscar lead por nome, ID ou observação"
              aria-label="Buscar lead"
              class="h-9 w-full rounded-xl border border-white/10 bg-board-elevated px-3 text-sm text-text-primary outline-none focus:border-accent/60 sm:w-72"
            />
            <button
              type="button"
              class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-board-elevated px-3 text-sm text-text-primary hover:bg-surface disabled:opacity-50"
              :disabled="!board.pipeline.segmentId || store.syncing"
              @click="onSync"
            >
              <RefreshCw :size="14" :class="store.syncing ? 'animate-spin' : ''" />
              Atualizar da segmentação
            </button>
          </div>
        </header>

        <div
          v-if="store.boardLoading"
          class="flex items-center justify-center gap-2 py-12 text-sm text-text-muted"
        >
          <Loader2 class="animate-spin" :size="18" />
          Carregando board…
        </div>

        <div v-else class="space-y-2">
          <p class="text-[11px] text-text-muted">
            Arraste o ícone para mover o lead. Clique no card para abrir a observação.
            A faixa abaixo só muda a ordem dos estágios.
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <draggable
              v-model="stagesModel"
              item-key="id"
              :animation="150"
              class="flex flex-wrap gap-1"
              handle=".stage-handle"
            >
              <template #item="{ element: stage }">
                <span
                  class="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-board-elevated/60 px-2 py-1 text-[11px] text-text-secondary"
                >
                  <GripVertical class="stage-handle cursor-grab text-text-muted" :size="12" />
                  {{ stage.name }}
                </span>
              </template>
            </draggable>
            <form class="flex items-center gap-1" @submit.prevent="onAddStage">
              <input
                v-model="newStageName"
                type="text"
                placeholder="Novo estágio"
                class="w-32 rounded-lg border border-white/10 bg-board-elevated px-2 py-1 text-xs text-text-primary"
              />
              <button
                type="submit"
                class="inline-flex size-7 items-center justify-center rounded-lg border border-white/10 text-text-secondary hover:bg-white/5"
                title="Adicionar estágio"
              >
                <Plus :size="14" />
              </button>
            </form>
          </div>

          <div
            class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]"
          >
            <section
              v-for="stage in board.stages"
              :key="stage.id"
              class="panel-glass flex w-[16.5rem] shrink-0 flex-col rounded-2xl"
            >
              <header class="flex items-center gap-1 border-b border-white/5 px-2.5 py-2">
                <template v-if="renamingStageId === stage.id">
                  <input
                    v-model="renameDraft"
                    type="text"
                    class="min-w-0 flex-1 rounded-md border border-white/10 bg-board px-1.5 py-0.5 text-xs text-text-primary"
                    @keydown.enter="commitRenameStage"
                    @blur="commitRenameStage"
                  />
                </template>
                <button
                  v-else
                  type="button"
                  class="min-w-0 flex-1 truncate text-left text-xs font-semibold text-text-primary hover:text-accent"
                  title="Renomear"
                  @click="startRenameStage(stage.id, stage.name)"
                >
                  {{ stage.name }}
                </button>
                <span class="tabular-nums text-[10px] text-text-muted">
                  {{ visibleEntries(stage.id).length }}
                  <template v-if="leadQuery.trim()">
                    / {{ entriesForStage(stage.id).length }}
                  </template>
                </span>
              </header>

              <draggable
                :model-value="visibleEntries(stage.id)"
                item-key="id"
                handle=".lead-handle"
                :group="{ name: 'crm-pipeline', pull: true, put: true }"
                :animation="150"
                class="flex min-h-[8rem] flex-1 flex-col gap-1.5 p-2"
                @update:model-value="(list: PipelineEntry[]) => onStageListUpdate(stage.id, list)"
              >
                <template #item="{ element: entry }">
                  <div
                    class="flex overflow-hidden rounded-lg border border-white/10 bg-board-elevated/80 transition-colors hover:border-accent/40"
                    :class="!entry.stillMatchesSegment ? 'opacity-60' : ''"
                  >
                    <button
                      type="button"
                      class="lead-handle flex w-6 shrink-0 cursor-grab items-start justify-center pt-2 text-text-muted hover:bg-white/5 hover:text-text-primary active:cursor-grabbing"
                      aria-label="Arrastar lead"
                    >
                      <GripVertical :size="13" />
                    </button>
                    <button
                      type="button"
                      class="min-w-0 flex-1 py-1.5 pr-2 text-left"
                      @click="openLead(entry)"
                    >
                      <span class="flex items-center gap-1.5">
                        <span class="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-text-primary">
                          {{ cardTitle(entry) }}
                        </span>
                        <span
                          class="shrink-0 rounded px-1 py-px text-[10px] font-medium leading-4"
                          :class="contactChipClass(entry)"
                          :title="contactChipTitle(entry)"
                        >
                          {{ contactChip(entry) }}
                        </span>
                      </span>
                      <span
                        v-if="cardHasDistinctName(entry)"
                        class="block truncate font-mono text-[10px] leading-4 text-text-muted"
                      >
                        {{ entry.playerId }}
                      </span>
                      <span
                        v-if="entry.notes"
                        class="mt-0.5 block truncate text-[11px] leading-4 text-text-secondary"
                      >
                        {{ entry.notes }}
                      </span>
                      <span
                        v-if="!entry.stillMatchesSegment"
                        class="mt-0.5 block text-[10px] leading-4 text-amber-300/90"
                      >
                        Fora do segmento
                      </span>
                    </button>
                  </div>
                </template>
              </draggable>
              <p
                v-if="visibleEntries(stage.id).length === 0"
                class="px-3 pb-3 text-center text-[11px] text-text-muted"
              >
                {{
                  leadQuery.trim()
                    ? 'Nenhum lead com essa busca'
                    : 'Arraste um lead para cá'
                }}
              </p>
            </section>
          </div>
        </div>

        <Teleport to="body">
          <div
            v-if="selectedLead"
            class="fixed inset-0 z-[70] flex justify-end bg-black/50"
            role="presentation"
            @click.self="closeLead"
          >
            <aside
              class="flex h-dvh w-full max-w-md flex-col border-l border-white/10 bg-board shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="lead-panel-title"
            >
              <div class="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div class="min-w-0">
                  <p id="lead-panel-title" class="truncate text-base font-semibold text-text-primary">
                    {{ cardTitle(selectedLead) }}
                  </p>
                  <p class="font-mono text-xs text-text-muted">
                    {{ selectedLead.playerId }}
                    <span v-if="stageName(selectedLead.stageId)">
                      · {{ stageName(selectedLead.stageId) }}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-white/5 hover:text-text-primary"
                  aria-label="Fechar lead"
                  @click="closeLead"
                >
                  <X :size="16" />
                </button>
              </div>

              <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <label class="flex flex-col gap-1.5 text-xs text-text-muted">
                  Próximo contato
                  <input
                    v-model="contactDraft"
                    type="date"
                    class="h-10 w-full rounded-xl border border-white/10 bg-board-elevated px-3 text-sm text-text-primary outline-none focus:border-accent/60"
                    @change="saveNextContact"
                  />
                  <span class="text-[11px]">
                    Sem data ou atrasado, o lead sobe no topo da coluna.
                  </span>
                </label>

                <label class="flex flex-col gap-1.5 text-xs text-text-muted">
                  Observação
                  <textarea
                    v-model="notesDraft"
                    rows="4"
                    class="w-full resize-y rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/60"
                    placeholder="O que foi combinado com este lead"
                    @input="notesStatus = 'idle'"
                    @blur="saveLeadNotes"
                  />
                  <span class="text-[11px]">
                    {{
                      notesStatus === 'saving'
                        ? 'Salvando…'
                        : notesStatus === 'saved'
                          ? 'Observação salva'
                          : 'Salva ao sair do campo ou ao fechar'
                    }}
                  </span>
                </label>

                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Histórico
                  </p>
                  <p
                    v-if="store.leadEvents.length === 0"
                    class="mt-2 text-xs text-text-muted"
                  >
                    Nenhuma movimentação registrada.
                  </p>
                  <ol v-else class="mt-2 space-y-2">
                    <li
                      v-for="event in store.leadEvents"
                      :key="event.id"
                      class="rounded-xl border border-white/10 bg-board-elevated/70 px-3 py-2"
                    >
                      <p class="text-sm text-text-primary">{{ eventLabel(event) }}</p>
                      <p class="text-[11px] text-text-muted">
                        {{ formatDateTime(event.occurredAt) }}
                      </p>
                      <p
                        v-if="event.eventType === 'note' && event.note"
                        class="mt-1 text-xs text-text-secondary"
                      >
                        {{ event.note }}
                      </p>
                    </li>
                  </ol>
                </div>
              </div>

              <div class="shrink-0 border-t border-white/10 px-4 py-3">
                <button
                  type="button"
                  class="inline-flex h-9 w-full items-center justify-center rounded-xl border border-white/10 bg-board-elevated px-3 text-sm text-text-primary hover:bg-surface"
                  @click="saveLeadNotes(); player360.open(selectedLead.playerId)"
                >
                  Abrir ficha do jogador
                </button>
              </div>
            </aside>
          </div>
        </Teleport>
      </template>

      <template v-else>
        <header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 class="text-base font-semibold text-text-primary">Pipelines CRM</h3>
            <p class="text-xs text-text-muted">
              Kanban operacional alimentado por segmentações.
            </p>
          </div>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-board hover:bg-accent-hover"
            @click="openCreate"
          >
            <Plus :size="16" />
            Novo pipeline
          </button>
        </header>

        <div v-if="createOpen" class="panel-glass space-y-3 rounded-2xl p-3 sm:p-4">
          <div>
            <label class="mb-1 block text-[11px] font-semibold uppercase text-text-muted">
              Nome
            </label>
            <input
              v-model="createName"
              type="text"
              class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
              placeholder="Ex.: Recuperação incentivo"
            />
          </div>
          <div>
            <label class="mb-1 block text-[11px] font-semibold uppercase text-text-muted">
              Segmentação
            </label>
            <select
              v-model="createSegmentId"
              class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Sem segmentação</option>
              <option v-for="s in segments.rows" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-board hover:bg-accent-hover"
              @click="confirmCreate"
            >
              Criar
            </button>
            <button
              type="button"
              class="rounded-xl border border-white/10 px-3 py-2 text-sm text-text-secondary"
              @click="createOpen = false"
            >
              Cancelar
            </button>
          </div>
        </div>

        <div
          v-if="store.loading && !store.ready"
          class="flex items-center justify-center gap-2 py-10 text-sm text-text-muted"
        >
          <Loader2 class="animate-spin" :size="18" />
          Carregando…
        </div>

        <ul
          v-else-if="store.rows.length === 0"
          class="panel-glass rounded-2xl px-3 py-10 text-center text-sm text-text-muted"
        >
          Nenhum pipeline. Crie a partir de uma segmentação ou do zero.
          <div v-if="segments.rows.length" class="mt-3 flex flex-wrap justify-center gap-2">
            <button
              v-for="s in segments.rows.slice(0, 4)"
              :key="s.id"
              type="button"
              class="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-text-secondary hover:bg-white/5 hover:text-text-primary"
              @click="createFromSegmentQuick(s.id)"
            >
              De “{{ s.name }}”
            </button>
          </div>
        </ul>

        <ul v-else class="panel-glass divide-y divide-white/5 overflow-hidden rounded-2xl">
          <li
            v-for="row in store.rows"
            :key="row.id"
            class="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <button type="button" class="min-w-0 flex-1 text-left" @click="openBoard(row.id)">
              <p class="truncate text-sm font-medium text-text-primary">{{ row.name }}</p>
              <p class="text-[11px] text-text-muted">
                {{ formatDate(row.updatedAt) }}
                <span v-if="row.segmentName"> · {{ row.segmentName }}</span>
                <span v-if="row.entryCount != null">
                  · {{ row.entryCount }} card{{ row.entryCount === 1 ? '' : 's' }}
                </span>
              </p>
            </button>
            <div class="flex gap-1">
              <button
                type="button"
                class="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-text-secondary hover:bg-white/5"
                @click="openBoard(row.id)"
              >
                Abrir
              </button>
              <button
                type="button"
                class="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-rose-300/80 hover:bg-rose-500/10"
                @click="onDeletePipeline(row.id, row.name)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>
