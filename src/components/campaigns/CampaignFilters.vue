<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown } from '@lucide/vue'
import type { CampaignComputedStatus } from '../../types/campaigns'
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_OPTIONS,
} from '../../types/campaigns'

export type CampaignFiltersState = {
  year: number | 'all'
  month: number | 'all'
  status: CampaignComputedStatus | 'all'
  name: string
  campaignType: string | 'all'
}

const props = defineProps<{
  modelValue: CampaignFiltersState
  years: number[]
  showArchived: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: CampaignFiltersState]
  'update:showArchived': [value: boolean]
}>()

const expanded = ref(false)

const months = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
]

const statusOptions: { value: CampaignComputedStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'payback', label: CAMPAIGN_STATUS_LABELS.payback },
  { value: 'recovering', label: CAMPAIGN_STATUS_LABELS.recovering },
  { value: 'no_return', label: CAMPAIGN_STATUS_LABELS.no_return },
  { value: 'no_data', label: CAMPAIGN_STATUS_LABELS.no_data },
  { value: 'archived', label: CAMPAIGN_STATUS_LABELS.archived },
]

const local = computed({
  get: () => props.modelValue,
  set: (value: CampaignFiltersState) => emit('update:modelValue', value),
})

const activeFilterCount = computed(() => {
  let count = 0
  if (local.value.year !== 'all') count += 1
  if (local.value.month !== 'all') count += 1
  if (local.value.status !== 'all') count += 1
  if (local.value.campaignType !== 'all') count += 1
  if (local.value.name.trim()) count += 1
  if (props.showArchived) count += 1
  return count
})

function patch(partial: Partial<CampaignFiltersState>) {
  emit('update:modelValue', { ...props.modelValue, ...partial })
}

const selectClass =
  'rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent/60 sm:rounded-xl sm:px-3 sm:py-2'
</script>

<template>
  <div class="panel-glass rounded-2xl p-2.5 sm:p-3.5">
    <div class="flex items-center gap-2">
      <input
        type="search"
        class="min-w-0 flex-1"
        :class="selectClass"
        :value="local.name"
        placeholder="Buscar campanha…"
        @input="patch({ name: ($event.target as HTMLInputElement).value })"
      />
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary sm:px-3 sm:py-2 sm:text-sm"
        @click="expanded = !expanded"
      >
        Filtros
        <span
          v-if="activeFilterCount"
          class="rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent"
        >
          {{ activeFilterCount }}
        </span>
        <ChevronDown
          :size="14"
          class="transition-transform"
          :class="expanded ? 'rotate-180' : ''"
        />
      </button>
    </div>

    <div
      v-show="expanded"
      class="mt-2.5 grid grid-cols-2 gap-2 border-t border-border-subtle/60 pt-2.5 md:grid-cols-4 xl:grid-cols-5"
    >
      <label class="flex flex-col gap-1 text-[11px] text-text-muted">
        Ano
        <select
          class="w-full"
          :class="selectClass"
          :value="local.year"
          @change="
            patch({
              year:
                ($event.target as HTMLSelectElement).value === 'all'
                  ? 'all'
                  : Number(($event.target as HTMLSelectElement).value),
            })
          "
        >
          <option value="all">Todos</option>
          <option v-for="year in years" :key="year" :value="year">
            {{ year }}
          </option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-[11px] text-text-muted">
        Mês
        <select
          class="w-full"
          :class="selectClass"
          :value="local.month"
          @change="
            patch({
              month:
                ($event.target as HTMLSelectElement).value === 'all'
                  ? 'all'
                  : Number(($event.target as HTMLSelectElement).value),
            })
          "
        >
          <option value="all">Todos</option>
          <option v-for="month in months" :key="month.value" :value="month.value">
            {{ month.label }}
          </option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-[11px] text-text-muted">
        Status
        <select
          class="w-full"
          :class="selectClass"
          :value="local.status"
          @change="
            patch({
              status: ($event.target as HTMLSelectElement)
                .value as CampaignFiltersState['status'],
            })
          "
        >
          <option
            v-for="option in statusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-[11px] text-text-muted">
        Tipo
        <select
          class="w-full"
          :class="selectClass"
          :value="local.campaignType"
          @change="
            patch({
              campaignType: ($event.target as HTMLSelectElement).value,
            })
          "
        >
          <option value="all">Todos</option>
          <option v-for="type in CAMPAIGN_TYPE_OPTIONS" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
      </label>

      <label
        class="col-span-2 inline-flex items-center gap-2 text-xs text-text-secondary md:col-span-4 xl:col-span-1"
      >
        <input
          type="checkbox"
          class="rounded border-border-subtle"
          :checked="showArchived"
          @change="
            emit(
              'update:showArchived',
              ($event.target as HTMLInputElement).checked,
            )
          "
        />
        Mostrar arquivadas
      </label>
    </div>
  </div>
</template>
