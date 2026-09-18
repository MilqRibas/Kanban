<script setup lang="ts">
import { computed, watch } from 'vue'
import { Loader2, Plus, Trash2 } from '@lucide/vue'
import { useDebouncedValue } from '../../composables/useDebouncedValue'
import { useSegmentsStore } from '../../stores/segments'
import { formatCurrency } from '../../utils/campaignFormat'
import {
  SEGMENT_FIELDS,
  SEGMENT_OPS_BY_KIND,
  createEmptyCondition,
  createEmptyGroup,
} from '../../utils/segmentDefinition'
import type { SegmentCondition, SegmentDefinition, SegmentOp } from '../../types/segments'

const name = defineModel<string>('name', { required: true })
const description = defineModel<string | null>('description', { required: true })
const definition = defineModel<SegmentDefinition>('definition', { required: true })

defineProps<{ saving?: boolean }>()
const emit = defineEmits<{ save: []; cancel: [] }>()

const store = useSegmentsStore()

const descriptionText = computed({
  get: () => description.value ?? '',
  set: (value: string) => {
    description.value = value.trim() ? value : null
  },
})

const debouncedDef = useDebouncedValue(() => JSON.stringify(definition.value), 400)

watch(
  debouncedDef,
  () => {
    void store.runPreview(definition.value)
  },
  { immediate: true },
)

function fieldKind(field: string): 'text' | 'number' | 'bool' {
  return SEGMENT_FIELDS.find((f) => f.value === field)?.kind ?? 'number'
}

function opsFor(field: string) {
  return SEGMENT_OPS_BY_KIND[fieldKind(field)]
}

function onFieldChange(cond: SegmentCondition, field: string) {
  cond.field = field
  const kind = fieldKind(field)
  const ops = SEGMENT_OPS_BY_KIND[kind]
  if (!ops.some((o) => o.value === cond.op)) {
    cond.op = ops[0].value
  }
  if (kind === 'bool') cond.value = true
  else if (kind === 'number' && typeof cond.value !== 'number') cond.value = 0
  else if (kind === 'text' && typeof cond.value !== 'string') cond.value = ''
}

function addGroup() {
  definition.value = {
    ...definition.value,
    groups: [...definition.value.groups, createEmptyGroup()],
  }
}

function removeGroup(index: number) {
  definition.value = {
    ...definition.value,
    groups: definition.value.groups.filter((_, i) => i !== index),
  }
}

function addCondition(groupIndex: number) {
  const groups = definition.value.groups.map((g, i) =>
    i === groupIndex
      ? { ...g, conditions: [...g.conditions, createEmptyCondition()] }
      : g,
  )
  definition.value = { ...definition.value, groups }
}

function removeCondition(groupIndex: number, condIndex: number) {
  const groups = definition.value.groups.map((g, i) => {
    if (i !== groupIndex) return g
    return { ...g, conditions: g.conditions.filter((_, j) => j !== condIndex) }
  })
  definition.value = { ...definition.value, groups }
}

function setGroupLogic(groupIndex: number, logic: 'and' | 'or') {
  const groups = definition.value.groups.map((g, i) =>
    i === groupIndex ? { ...g, logic } : g,
  )
  definition.value = { ...definition.value, groups }
}

function setOp(cond: SegmentCondition, op: SegmentOp) {
  cond.op = op
}

function setBoolValue(cond: SegmentCondition, raw: string) {
  cond.value = raw === 'true'
}

const canSave = computed(() => name.value.trim().length > 0)

const sampleNicks = computed(() =>
  (store.preview?.sample ?? []).map((s) => s.nickname || s.name || s.playerId),
)
</script>

<template>
  <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
    <div class="space-y-3">
      <div class="panel-glass space-y-3 rounded-2xl p-3 sm:p-4">
        <div>
          <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Nome
          </label>
          <input
            v-model="name"
            type="text"
            placeholder="Ex.: Rake 30d alto + disponível"
            class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none ring-accent/40 focus:ring-2"
          />
        </div>
        <div>
          <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Descrição
          </label>
          <input
            v-model="descriptionText"
            type="text"
            placeholder="Opcional"
            class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none ring-accent/40 focus:ring-2"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span>Grupos unidos por</span>
          <select
            v-model="definition.groupLogic"
            class="rounded-lg border border-white/10 bg-board-elevated px-2 py-1 text-sm text-text-primary"
          >
            <option value="or">OU</option>
            <option value="and">E</option>
          </select>
        </div>
      </div>

      <div
        v-for="(group, gi) in definition.groups"
        :key="gi"
        class="panel-glass space-y-2 rounded-2xl p-3 sm:p-4"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-xs text-text-secondary">
            <span class="font-semibold text-text-primary">Grupo {{ gi + 1 }}</span>
            <select
              :value="group.logic"
              class="rounded-lg border border-white/10 bg-board-elevated px-2 py-1 text-sm text-text-primary"
              @change="setGroupLogic(gi, ($event.target as HTMLSelectElement).value as 'and' | 'or')"
            >
              <option value="and">E (todas)</option>
              <option value="or">OU (qualquer)</option>
            </select>
          </div>
          <button
            type="button"
            class="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-rose-300/80 hover:bg-rose-500/10"
            title="Remover grupo"
            :disabled="definition.groups.length <= 1"
            @click="removeGroup(gi)"
          >
            <Trash2 :size="14" />
          </button>
        </div>

        <div
          v-for="(cond, ci) in group.conditions"
          :key="ci"
          class="grid gap-1.5 rounded-xl border border-white/5 bg-board-elevated/40 p-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto]"
        >
          <select
            :value="cond.field"
            class="rounded-lg border border-white/10 bg-board px-2 py-1.5 text-sm text-text-primary"
            @change="onFieldChange(cond, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="f in SEGMENT_FIELDS" :key="f.value" :value="f.value">
              {{ f.label }}
            </option>
          </select>

          <select
            :value="cond.op"
            class="rounded-lg border border-white/10 bg-board px-2 py-1.5 text-sm text-text-primary"
            @change="setOp(cond, ($event.target as HTMLSelectElement).value as SegmentOp)"
          >
            <option v-for="op in opsFor(cond.field)" :key="op.value" :value="op.value">
              {{ op.label }}
            </option>
          </select>

          <div class="flex gap-1">
            <template v-if="fieldKind(cond.field) === 'bool'">
              <select
                :value="String(cond.value)"
                class="w-full rounded-lg border border-white/10 bg-board px-2 py-1.5 text-sm text-text-primary"
                @change="setBoolValue(cond, ($event.target as HTMLSelectElement).value)"
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </template>
            <template v-else-if="fieldKind(cond.field) === 'number'">
              <input
                v-model.number="cond.value"
                type="number"
                step="any"
                class="w-full min-w-0 rounded-lg border border-white/10 bg-board px-2 py-1.5 text-sm text-text-primary"
              />
              <input
                v-if="cond.op === 'between'"
                v-model.number="cond.valueTo"
                type="number"
                step="any"
                placeholder="até"
                class="w-full min-w-0 rounded-lg border border-white/10 bg-board px-2 py-1.5 text-sm text-text-primary"
              />
            </template>
            <template v-else>
              <input
                v-model="cond.value"
                type="text"
                class="w-full rounded-lg border border-white/10 bg-board px-2 py-1.5 text-sm text-text-primary"
              />
            </template>
          </div>

          <button
            type="button"
            class="inline-flex size-8 items-center justify-center self-center rounded-lg border border-white/10 text-text-muted hover:bg-white/5 hover:text-rose-300"
            title="Remover condição"
            @click="removeCondition(gi, ci)"
          >
            <Trash2 :size="14" />
          </button>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-text-secondary hover:bg-white/5 hover:text-text-primary"
          @click="addCondition(gi)"
        >
          <Plus :size="12" />
          Condição
        </button>
      </div>

      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3 py-2 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary"
        @click="addGroup"
      >
        <Plus :size="14" />
        Adicionar grupo
      </button>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-semibold text-board hover:bg-accent-hover disabled:opacity-50"
          :disabled="!canSave || saving"
          @click="emit('save')"
        >
          <Loader2 v-if="saving" class="animate-spin" :size="14" />
          Salvar
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center rounded-xl border border-white/10 px-3.5 text-sm text-text-secondary hover:bg-white/5"
          @click="emit('cancel')"
        >
          Cancelar
        </button>
      </div>
    </div>

    <aside class="panel-glass h-fit space-y-3 rounded-2xl p-3 sm:p-4 lg:sticky lg:top-2">
      <div class="flex items-center justify-between gap-2">
        <h4 class="text-sm font-semibold text-text-primary">Pré-visualização</h4>
        <Loader2 v-if="store.previewLoading" class="animate-spin text-accent" :size="14" />
      </div>
      <p v-if="store.previewError" class="text-xs text-rose-300">{{ store.previewError }}</p>
      <p class="text-2xl font-semibold tabular-nums text-text-primary">
        {{ store.preview?.count ?? '—' }}
        <span class="text-sm font-normal text-text-muted">jogadores</span>
      </p>
      <ul v-if="sampleNicks.length" class="space-y-1 text-xs text-text-secondary">
        <li
          v-for="(nick, i) in sampleNicks"
          :key="i"
          class="truncate rounded-lg bg-white/[0.03] px-2 py-1"
        >
          {{ nick }}
        </li>
      </ul>
      <p v-else class="text-xs text-text-muted">
        Ajuste as condições para ver uma amostra de nicks.
      </p>
      <ul
        v-if="store.preview?.sample?.length"
        class="space-y-1 border-t border-white/5 pt-2 text-[11px] text-text-muted"
      >
        <li
          v-for="s in store.preview.sample.slice(0, 5)"
          :key="s.playerId"
          class="flex justify-between gap-2"
        >
          <span class="truncate">{{ s.playerId }}</span>
          <span class="tabular-nums">{{ formatCurrency(s.incentiveAvailable) }}</span>
        </li>
      </ul>
    </aside>
  </div>
</template>
