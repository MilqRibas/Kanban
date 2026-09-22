<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from '@lucide/vue'
import { useDebouncedValue } from '../../composables/useDebouncedValue'
import { useSegmentsStore } from '../../stores/segments'
import { formatDate } from '../../utils/campaignFormat'
import { createDefaultDefinition } from '../../utils/segmentDefinition'
import { matchesSearch, buildSearchHaystack } from '../../utils/search'
import type { SegmentClubFilter } from '../../services/segmentsApi'
import type { SegmentDefinition, SegmentRow } from '../../types/segments'
import SegmentBuilder from './SegmentBuilder.vue'

const store = useSegmentsStore()
const searchInput = ref('')
const debouncedSearch = useDebouncedValue(() => searchInput.value, 200)
const editing = ref<SegmentRow | null>(null)
const creating = ref(false)
const draftName = ref('')
const draftDescription = ref<string | null>(null)
const draftDefinition = ref<SegmentDefinition>(createDefaultDefinition())
const draftId = ref<string | null>(null)

onMounted(() => {
  void store.init()
})

const filtered = computed(() => {
  const q = debouncedSearch.value
  if (!q.trim()) return store.rows
  return store.rows.filter((row) =>
    matchesSearch(
      buildSearchHaystack([row.name, row.description, row.pipelineName]),
      q,
    ),
  )
})

const builderOpen = computed(() => creating.value || Boolean(editing.value))

function onClubChange(event: Event) {
  store.setClubFilter((event.target as HTMLSelectElement).value as SegmentClubFilter)
}

function openCreate() {
  editing.value = null
  creating.value = true
  draftId.value = null
  draftName.value = ''
  draftDescription.value = null
  draftDefinition.value = createDefaultDefinition()
}

function openEdit(row: SegmentRow) {
  creating.value = false
  editing.value = row
  draftId.value = row.id
  draftName.value = row.name
  draftDescription.value = row.description
  draftDefinition.value = JSON.parse(JSON.stringify(row.definition)) as SegmentDefinition
}

function openDuplicate(row: SegmentRow) {
  const dup = store.duplicateRow(row)
  creating.value = true
  editing.value = null
  draftId.value = null
  draftName.value = dup.name
  draftDescription.value = dup.description
  draftDefinition.value = dup.definition
}

function closeBuilder() {
  creating.value = false
  editing.value = null
  draftId.value = null
}

async function onSave() {
  const row = await store.save({
    id: draftId.value,
    name: draftName.value,
    description: draftDescription.value,
    definition: draftDefinition.value,
  })
  if (row) {
    if (store.preview) store.cachePlayerCount(row.id, store.preview.count)
    closeBuilder()
  }
}

async function onDelete(row: SegmentRow) {
  if (!confirm(`Remover segmentação "${row.name}"?`)) return
  await store.remove(row.id)
}

watch(
  () => store.preview?.count,
  (count) => {
    if (count != null && draftId.value) store.cachePlayerCount(draftId.value, count)
  },
)
</script>

<template>
  <div class="space-y-3">
    <template v-if="!builderOpen">
      <header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 class="text-base font-semibold text-text-primary">Segmentações</h3>
          <p class="text-xs text-text-muted">
            Defina públicos com condições compostas (AND/OR) e use-os em pipelines CRM.
            O filtro de clube vale na prévia. Todos inclui histórico sem clube identificado.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-board hover:bg-accent-hover"
          @click="openCreate"
        >
          <Plus :size="16" />
          Nova segmentação
        </button>
      </header>

      <label class="flex items-center gap-2 text-xs text-text-muted">
        Clube na prévia
        <select
          :value="store.clubFilter"
          class="rounded-lg border border-white/10 bg-board-elevated px-2 py-1 text-sm text-text-primary"
          @change="onClubChange"
        >
          <option value="all">Todos</option>
          <option value="sx_club">SX Club</option>
          <option value="xtreme_pro">Xtreme Pro</option>
          <option value="sx_only">Somente SX</option>
          <option value="xtreme_only">Somente Xtreme</option>
          <option value="both">Nos dois clubes</option>
        </select>
      </label>

      <div class="relative">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          :size="15"
        />
        <input
          v-model="searchInput"
          type="search"
          placeholder="Buscar segmentação…"
          class="w-full rounded-xl border border-white/10 bg-board-elevated py-2 pl-9 pr-3 text-sm text-text-primary outline-none ring-accent/40 placeholder:text-text-muted focus:ring-2"
        />
      </div>

      <p
        v-if="store.error"
        class="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200"
      >
        {{ store.error }}
      </p>

      <div class="panel-glass overflow-hidden rounded-2xl">
        <div
          v-if="store.loading && !store.ready"
          class="flex items-center justify-center gap-2 px-3 py-10 text-sm text-text-muted"
        >
          <Loader2 class="animate-spin" :size="18" />
          Carregando…
        </div>
        <ul v-else-if="filtered.length === 0" class="px-3 py-10 text-center text-sm text-text-muted">
          Nenhuma segmentação ainda. Crie a primeira para alimentar o CRM.
        </ul>
        <ul v-else class="divide-y divide-white/5">
          <li
            v-for="row in filtered"
            :key="row.id"
            class="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-text-primary">{{ row.name }}</p>
              <p class="text-[11px] text-text-muted">
                Atualizada {{ formatDate(row.updatedAt) }}
                <span v-if="row.playerCount != null">
                  · {{ row.playerCount }} jogador{{ row.playerCount === 1 ? '' : 'es' }}
                </span>
                <span v-if="row.pipelineName"> · Pipeline: {{ row.pipelineName }}</span>
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-text-secondary hover:bg-white/5 hover:text-text-primary"
                title="Editar"
                @click="openEdit(row)"
              >
                <Pencil :size="14" />
              </button>
              <button
                type="button"
                class="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-text-secondary hover:bg-white/5 hover:text-text-primary"
                title="Duplicar"
                @click="openDuplicate(row)"
              >
                <Copy :size="14" />
              </button>
              <button
                type="button"
                class="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-rose-300/80 hover:bg-rose-500/10"
                title="Excluir"
                @click="onDelete(row)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <template v-else>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        @click="closeBuilder"
      >
        <ArrowLeft :size="16" />
        Voltar à lista
      </button>
      <SegmentBuilder
        v-model:name="draftName"
        v-model:description="draftDescription"
        v-model:definition="draftDefinition"
        :saving="store.saving"
        @save="onSave"
        @cancel="closeBuilder"
      />
    </template>
  </div>
</template>
