<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowLeft,
  Columns3,
  ContactRound,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from '@lucide/vue'
import draggable from 'vuedraggable'
import { usePipelinesStore } from '../../stores/pipelines'
import { useSegmentsStore } from '../../stores/segments'
import { useCrmStore } from '../../stores/crm'
import { usePlayer360 } from '../../composables/usePlayer360'
import { formatCurrency, formatDate } from '../../utils/campaignFormat'
import type { PipelineEntry, PipelineStage } from '../../types/pipelines'
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

onMounted(async () => {
  await Promise.all([store.init(), segments.init()])
  if (!crm.ready) await crm.init()
})

const board = computed(() => store.board)

const stagesModel = computed({
  get: (): PipelineStage[] => board.value?.stages ?? [],
  set: (next: PipelineStage[]) => {
    void store.reorderStages(next.map((s) => s.id))
  },
})

function entriesForStage(stageId: string): PipelineEntry[] {
  return board.value?.entries.filter((e) => e.stageId === stageId) ?? []
}

function onStageListUpdate(stageId: string, list: PipelineEntry[]) {
  const prevIds = new Set(entriesForStage(stageId).map((e) => e.id))
  store.applyColumnEntries(stageId, list)
  for (const entry of list) {
    if (!prevIds.has(entry.id)) {
      void store.moveCard(entry.id, stageId)
    }
  }
}

function cardLabel(entry: PipelineEntry) {
  return entry.nickname || entry.name || entry.playerId
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
              · {{ board.entries.length }} cards
            </p>
          </div>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-board-elevated px-3 text-sm text-text-primary hover:bg-surface disabled:opacity-50"
            :disabled="!board.pipeline.segmentId || store.syncing"
            @click="onSync"
          >
            <RefreshCw :size="14" :class="store.syncing ? 'animate-spin' : ''" />
            Atualizar da segmentação
          </button>
        </header>

        <div
          v-if="store.boardLoading"
          class="flex items-center justify-center gap-2 py-12 text-sm text-text-muted"
        >
          <Loader2 class="animate-spin" :size="18" />
          Carregando board…
        </div>

        <div v-else class="space-y-2">
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
                  {{ entriesForStage(stage.id).length }}
                </span>
              </header>

              <draggable
                :model-value="entriesForStage(stage.id)"
                item-key="id"
                :group="{ name: 'crm-pipeline' }"
                :animation="150"
                class="flex min-h-[8rem] flex-1 flex-col gap-1.5 p-2"
                @update:model-value="(list: PipelineEntry[]) => onStageListUpdate(stage.id, list)"
              >
                <template #item="{ element: entry }">
                  <button
                    type="button"
                    class="w-full rounded-xl border border-white/10 bg-board-elevated/80 px-2.5 py-2 text-left transition-colors hover:border-accent/40 hover:bg-surface"
                    :class="!entry.stillMatchesSegment ? 'opacity-60' : ''"
                    @click="player360.open(entry.playerId)"
                  >
                    <p class="truncate text-sm font-medium text-text-primary">
                      {{ cardLabel(entry) }}
                    </p>
                    <p class="font-mono text-[10px] text-text-muted">{{ entry.playerId }}</p>
                    <p
                      v-if="entry.incentiveAvailable != null"
                      class="mt-1 text-[11px] tabular-nums"
                      :class="
                        entry.incentiveAvailable < 0 ? 'text-rose-300' : 'text-text-secondary'
                      "
                    >
                      Disp. {{ formatCurrency(entry.incentiveAvailable) }}
                    </p>
                    <p
                      v-if="!entry.stillMatchesSegment"
                      class="mt-0.5 text-[10px] text-amber-300/90"
                    >
                      Fora do segmento
                    </p>
                  </button>
                </template>
              </draggable>
            </section>
          </div>
        </div>
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
