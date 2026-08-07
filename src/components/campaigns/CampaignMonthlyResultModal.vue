<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useEscapeKey } from '../../composables/useEscapeKey'
import { useCampaignsStore } from '../../stores/campaigns'
import type { CampaignMonthlyResult } from '../../types/campaigns'
import { formatMonthYear } from '../../utils/campaignFormat'

const props = defineProps<{
  open: boolean
  campaignId: string
  resultId: string | null
  defaultMonth?: number
  defaultYear?: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const store = useCampaignsStore()
const saving = ref(false)
const formError = ref<string | null>(null)
const rakeInputRef = ref<HTMLInputElement | null>(null)

const now = new Date()

type Draft = {
  referenceMonth: number
  referenceYear: number
  monthlyRake: string
  monthlyActivePlayers: string
  topPlayerRake: string
  topThreePlayersRake: string
  notes: string
}

function emptyDraft(): Draft {
  return {
    referenceMonth: props.defaultMonth ?? now.getMonth() + 1,
    referenceYear: props.defaultYear ?? now.getFullYear(),
    monthlyRake: '',
    monthlyActivePlayers: '',
    topPlayerRake: '',
    topThreePlayersRake: '',
    notes: '',
  }
}

const draft = reactive<Draft>(emptyDraft())

const editing = computed(
  () =>
    (props.resultId
      ? store.monthlyResults.find((r) => r.id === props.resultId)
      : null) ?? null,
)

const existingForMonth = computed(() =>
  store.monthlyResults.find(
    (r) =>
      r.campaignId === props.campaignId &&
      r.referenceMonth === draft.referenceMonth &&
      r.referenceYear === draft.referenceYear &&
      r.id !== props.resultId,
  ),
)

const years = computed(() => {
  const list: number[] = []
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 5; y -= 1) {
    list.push(y)
  }
  return list
})

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

const fieldClass =
  'mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent'

function fillFromResult(result: CampaignMonthlyResult) {
  draft.referenceMonth = result.referenceMonth
  draft.referenceYear = result.referenceYear
  draft.monthlyRake = String(result.monthlyRake)
  draft.monthlyActivePlayers =
    result.monthlyActivePlayers != null ? String(result.monthlyActivePlayers) : ''
  draft.topPlayerRake =
    result.topPlayerRake != null ? String(result.topPlayerRake) : ''
  draft.topThreePlayersRake =
    result.topThreePlayersRake != null ? String(result.topThreePlayersRake) : ''
  draft.notes = result.notes ?? ''
}

function close() {
  emit('update:open', false)
}

useEscapeKey(
  () => props.open,
  () => close(),
)

watch(
  () => props.open,
  async (open) => {
    formError.value = null
    if (!open) return
    if (editing.value) fillFromResult(editing.value)
    else Object.assign(draft, emptyDraft())
    await nextTick()
    rakeInputRef.value?.focus()
  },
)

function parseNumber(
  raw: string | number | null | undefined,
  label: string,
  required: boolean,
) {
  let normalized = String(raw ?? '').trim()
  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  }
  if (!normalized) {
    return required
      ? { error: `${label} é obrigatório.`, value: null as number | null }
      : { error: null as string | null, value: null as number | null }
  }
  const value = Number(normalized)
  if (!Number.isFinite(value)) {
    return { error: `${label} inválido.`, value: null as number | null }
  }
  return { error: null as string | null, value }
}

async function save() {
  formError.value = null
  const rake = parseNumber(draft.monthlyRake, 'Rake do mês', true)
  if (rake.error || rake.value === null) {
    formError.value = rake.error
    return
  }
  if (rake.value < 0) {
    formError.value = 'Rake mensal não pode ser negativo.'
    return
  }

  const actives = parseNumber(draft.monthlyActivePlayers, 'Ativos no mês', false)
  if (actives.error) {
    formError.value = actives.error
    return
  }
  if (actives.value != null && actives.value < 0) {
    formError.value = 'Ativos no mês não pode ser negativo.'
    return
  }

  const topPlayer = parseNumber(draft.topPlayerRake, 'Rake do maior jogador', false)
  const topThree = parseNumber(
    draft.topThreePlayersRake,
    'Rake dos três maiores',
    false,
  )
  if (topPlayer.error || topThree.error) {
    formError.value = topPlayer.error || topThree.error
    return
  }

  if (existingForMonth.value && !editing.value) {
    const label = formatMonthYear(draft.referenceMonth, draft.referenceYear)
    const editExisting = window.confirm(
      `Já existe lançamento para ${label}. Deseja editar o registro existente?`,
    )
    if (!editExisting) return
    saving.value = true
    try {
      const updated = await store.updateMonthlyResult(existingForMonth.value.id, {
        referenceMonth: draft.referenceMonth,
        referenceYear: draft.referenceYear,
        monthlyRake: rake.value,
        monthlyActivePlayers: actives.value,
        topPlayerRake: topPlayer.value,
        topThreePlayersRake: topThree.value,
        notes: draft.notes.trim() || null,
      })
      if (updated) {
        emit('saved')
        close()
      }
    } finally {
      saving.value = false
    }
    return
  }

  saving.value = true
  try {
    const payload = {
      referenceMonth: draft.referenceMonth,
      referenceYear: draft.referenceYear,
      monthlyRake: rake.value,
      monthlyActivePlayers: actives.value,
      topPlayerRake: topPlayer.value,
      topThreePlayersRake: topThree.value,
      notes: draft.notes.trim() || null,
    }

    const result = editing.value
      ? await store.updateMonthlyResult(editing.value.id, payload)
      : await store.upsertMonthlyResult(props.campaignId, payload)

    if (result) {
      emit('saved')
      close()
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="editing ? 'Editar resultado mensal' : 'Adicionar atualização mensal'"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/60"
        aria-label="Fechar"
        @click="close"
      />

      <form
        class="panel-glass relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl shadow-2xl sm:rounded-2xl"
        @submit.prevent="save"
      >
        <div class="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
          <h3 class="text-base font-semibold text-text-primary">
            {{ editing ? 'Editar resultado mensal' : 'Atualização mensal' }}
          </h3>
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
            aria-label="Fechar"
            @click="close"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="space-y-3 overflow-y-auto px-5 py-4">
          <p
            v-if="formError"
            class="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200"
          >
            {{ formError }}
          </p>

          <div class="grid grid-cols-2 gap-3">
            <label class="block text-xs text-text-muted">
              Mês de referência
              <select v-model.number="draft.referenceMonth" required :class="fieldClass">
                <option v-for="month in months" :key="month.value" :value="month.value">
                  {{ month.label }}
                </option>
              </select>
            </label>
            <label class="block text-xs text-text-muted">
              Ano
              <select v-model.number="draft.referenceYear" required :class="fieldClass">
                <option v-for="year in years" :key="year" :value="year">
                  {{ year }}
                </option>
              </select>
            </label>
          </div>

          <label class="block text-xs text-text-muted">
            Rake do mês (R$)
            <input
              ref="rakeInputRef"
              v-model="draft.monthlyRake"
              type="text"
              inputmode="decimal"
              required
              placeholder="2344,03"
              :class="fieldClass"
            />
          </label>

          <label class="block text-xs text-text-muted">
            Jogadores ativos no mês
            <input
              v-model="draft.monthlyActivePlayers"
              type="number"
              min="0"
              step="1"
              :class="fieldClass"
            />
          </label>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="block text-xs text-text-muted">
              Rake do maior jogador (opc.)
              <input
                v-model="draft.topPlayerRake"
                type="text"
                inputmode="decimal"
                :class="fieldClass"
              />
            </label>
            <label class="block text-xs text-text-muted">
              Rake dos 3 maiores (opc.)
              <input
                v-model="draft.topThreePlayersRake"
                type="text"
                inputmode="decimal"
                :class="fieldClass"
              />
            </label>
          </div>

          <label class="block text-xs text-text-muted">
            Observações
            <textarea
              v-model="draft.notes"
              rows="3"
              :class="[fieldClass, 'resize-none']"
            />
          </label>
        </div>

        <div class="flex justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
            @click="close"
          >
            Cancelar
          </button>
          <button
            type="submit"
            class="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-board hover:bg-accent-hover disabled:opacity-60"
            :disabled="saving"
          >
            {{ saving ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
