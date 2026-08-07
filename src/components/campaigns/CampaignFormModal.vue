<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useEscapeKey } from '../../composables/useEscapeKey'
import { useCampaignsStore } from '../../stores/campaigns'
import type {
  ActivationRuleType,
  Campaign,
  CampaignCreateInput,
} from '../../types/campaigns'
import {
  ACTIVATION_RULE_LABELS,
  ACTIVATION_RULE_OPTIONS,
  CAMPAIGN_TYPE_OPTIONS,
} from '../../types/campaigns'
import { formatCurrency } from '../../utils/campaignFormat'
import { calculateAccumulatedRake } from '../../utils/campaignMetrics'

const props = defineProps<{
  open: boolean
  campaignId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: [id: string]
}>()

const store = useCampaignsStore()
const saving = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)
const formBodyRef = ref<HTMLElement | null>(null)
const formError = ref<string | null>(null)

function setFormError(message: string) {
  formError.value = message
  void nextTick(() => {
    formBodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()

type Draft = {
  name: string
  acquisitionMonth: number
  acquisitionYear: number
  startDate: string
  endDate: string
  agency: string
  campaignType: string
  campaignTypeOther: string
  objective: string
  audience: string
  channel: string
  origin: string
  campaignUrl: string
  notes: string
  investment: string
  capturedPlayers: string
  activePlayers: string
  activationRuleType: ActivationRuleType
  activationMinimumRake: string
  activationRuleNotes: string
  rakeGoal: string
  activePlayersGoal: string
  referenceMonth: number
  referenceYear: number
  monthlyRake: string
  monthlyActivePlayers: string
}

function emptyDraft(): Draft {
  return {
    name: '',
    acquisitionMonth: currentMonth,
    acquisitionYear: currentYear,
    startDate: now.toISOString().slice(0, 10),
    endDate: '',
    agency: '',
    campaignType: '',
    campaignTypeOther: '',
    objective: '',
    audience: '',
    channel: '',
    origin: '',
    campaignUrl: '',
    notes: '',
    investment: '',
    capturedPlayers: '',
    activePlayers: '',
    activationRuleType: 'rake_gt_zero',
    activationMinimumRake: '',
    activationRuleNotes: '',
    rakeGoal: '',
    activePlayersGoal: '',
    referenceMonth: currentMonth,
    referenceYear: currentYear,
    monthlyRake: '',
    monthlyActivePlayers: '',
  }
}

const draft = reactive<Draft>(emptyDraft())

const editingCampaign = computed(
  () =>
    (props.campaignId
      ? store.campaigns.find((c) => c.id === props.campaignId)
      : null) ?? null,
)

const isEditing = computed(() => Boolean(editingCampaign.value))

const monthlyResultsForEdit = computed(() => {
  if (!editingCampaign.value) return []
  return store.monthlyResultsFor(editingCampaign.value.id)
})

const years = computed(() => {
  const list: number[] = []
  for (let y = currentYear + 1; y >= currentYear - 5; y -= 1) list.push(y)
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

const needsMinimumRake = computed(
  () =>
    draft.activationRuleType === 'custom_minimum' ||
    draft.activationRuleType === 'custom_rule' ||
    draft.activationRuleType === 'rake_gt_050',
)

const showTypeOther = computed(() => draft.campaignType === 'Outro')

const fieldClass =
  'mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent'

function fillFromCampaign(campaign: Campaign) {
  draft.name = campaign.name
  draft.acquisitionMonth = campaign.acquisitionMonth
  draft.acquisitionYear = campaign.acquisitionYear
  draft.startDate = campaign.startDate ?? now.toISOString().slice(0, 10)
  draft.endDate = campaign.endDate ?? ''
  draft.agency = campaign.agency ?? ''
  draft.campaignType = campaign.campaignType ?? ''
  draft.campaignTypeOther = campaign.campaignTypeOther ?? ''
  draft.objective = campaign.objective ?? ''
  draft.audience = campaign.audience ?? ''
  draft.channel = campaign.channel ?? ''
  draft.origin = campaign.origin ?? ''
  draft.campaignUrl = campaign.campaignUrl ?? ''
  draft.notes = campaign.notes ?? ''
  draft.investment = String(campaign.investment)
  draft.capturedPlayers = String(campaign.capturedPlayers)
  draft.activePlayers = String(campaign.activePlayers)
  draft.activationRuleType = campaign.activationRuleType
  draft.activationMinimumRake =
    campaign.activationMinimumRake != null
      ? String(campaign.activationMinimumRake)
      : campaign.activationRuleType === 'rake_gt_050'
        ? '0.5'
        : ''
  draft.activationRuleNotes = campaign.activationRuleNotes ?? ''
  draft.rakeGoal = campaign.rakeGoal != null ? String(campaign.rakeGoal) : ''
  draft.activePlayersGoal =
    campaign.activePlayersGoal != null ? String(campaign.activePlayersGoal) : ''

  const results = store.monthlyResultsFor(campaign.id)
  const latest = results[results.length - 1] ?? null
  draft.referenceMonth = latest?.referenceMonth ?? campaign.acquisitionMonth
  draft.referenceYear = latest?.referenceYear ?? campaign.acquisitionYear
  draft.monthlyRake =
    latest != null ? String(latest.monthlyRake) : ''
  draft.monthlyActivePlayers =
    latest?.monthlyActivePlayers != null
      ? String(latest.monthlyActivePlayers)
      : ''
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
    if (editingCampaign.value) {
      fillFromCampaign(editingCampaign.value)
    } else {
      Object.assign(draft, emptyDraft())
    }
    await nextTick()
    nameInputRef.value?.focus()
  },
)

watch(
  () => [draft.referenceMonth, draft.referenceYear, props.open] as const,
  () => {
    if (!props.open || !editingCampaign.value) return
    const existing = monthlyResultsForEdit.value.find(
      (r) =>
        r.referenceMonth === draft.referenceMonth &&
        r.referenceYear === draft.referenceYear,
    )
    if (existing) {
      draft.monthlyRake = String(existing.monthlyRake)
      draft.monthlyActivePlayers =
        existing.monthlyActivePlayers != null
          ? String(existing.monthlyActivePlayers)
          : ''
      return
    }
    draft.monthlyRake = ''
    draft.monthlyActivePlayers = ''
  },
)

function normalizeNumberInput(raw: string) {
  let value = raw.trim()
  if (!value) return ''
  // Aceita formatos BR (1.234,56 / 1234,56) e ponto decimal simples.
  if (value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.')
  }
  return value
}

function parseRequiredNumber(raw: string, label: string) {
  const normalized = normalizeNumberInput(raw)
  if (!normalized) return { error: `${label} é obrigatório.` as string, value: null }
  const value = Number(normalized)
  if (!Number.isFinite(value)) {
    return { error: `${label} inválido.`, value: null }
  }
  return { error: null as string | null, value }
}

function parseOptionalNumber(raw: string) {
  const normalized = normalizeNumberInput(raw)
  if (!normalized) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

const accumulatedRakePreview = computed(() => {
  const monthlyRaw = draft.monthlyRake.trim().replace(',', '.')
  const current =
    monthlyRaw && Number.isFinite(Number(monthlyRaw)) ? Number(monthlyRaw) : 0

  if (!editingCampaign.value) return current

  const others = monthlyResultsForEdit.value.filter(
    (r) =>
      !(
        r.referenceMonth === draft.referenceMonth &&
        r.referenceYear === draft.referenceYear
      ),
  )
  return calculateAccumulatedRake(others) + current
})

function buildPayload(): CampaignCreateInput | null {
  formError.value = null

  if (!draft.name.trim()) {
    setFormError('Nome da campanha é obrigatório.')
    return null
  }
  if (!draft.startDate) {
    setFormError('Data de início é obrigatória.')
    return null
  }

  const investment = parseRequiredNumber(draft.investment, 'Investimento')
  if (investment.error || investment.value === null) {
    setFormError(investment.error ?? 'Investimento inválido.')
    return null
  }
  const captured = parseRequiredNumber(draft.capturedPlayers, 'Jogadores captados')
  if (captured.error || captured.value === null) {
    setFormError(captured.error ?? 'Jogadores captados inválido.')
    return null
  }
  const active = parseRequiredNumber(draft.activePlayers, 'Jogadores ativos')
  if (active.error || active.value === null) {
    setFormError(active.error ?? 'Jogadores ativos inválido.')
    return null
  }

  if (investment.value < 0) {
    setFormError('Investimento não pode ser negativo.')
    return null
  }
  if (captured.value < 0 || active.value < 0) {
    setFormError('Captados e ativos não podem ser negativos.')
    return null
  }
  if (active.value > captured.value) {
    setFormError('Jogadores ativos não pode ser maior que captados.')
    return null
  }

  let activationMinimumRake: number | null = parseOptionalNumber(
    draft.activationMinimumRake,
  )
  if (draft.activationRuleType === 'rake_gt_050') {
    activationMinimumRake = 0.5
  }
  if (
    (draft.activationRuleType === 'custom_minimum' ||
      draft.activationRuleType === 'custom_rule') &&
    (activationMinimumRake === null || activationMinimumRake < 0)
  ) {
    setFormError('Informe o valor mínimo de rake para o critério escolhido.')
    return null
  }

  return {
    name: draft.name.trim(),
    acquisitionMonth: draft.acquisitionMonth,
    acquisitionYear: draft.acquisitionYear,
    startDate: draft.startDate,
    endDate: draft.endDate || null,
    agency: draft.agency.trim() || null,
    campaignType: draft.campaignType || null,
    campaignTypeOther:
      draft.campaignType === 'Outro'
        ? draft.campaignTypeOther.trim() || null
        : null,
    objective: draft.objective.trim() || null,
    audience: draft.audience.trim() || null,
    channel: draft.channel.trim() || null,
    origin: draft.origin.trim() || null,
    campaignUrl: draft.campaignUrl.trim() || null,
    notes: draft.notes.trim() || null,
    investment: investment.value,
    capturedPlayers: Math.round(captured.value),
    activePlayers: Math.round(active.value),
    activationRuleType: draft.activationRuleType,
    activationMinimumRake,
    activationRuleNotes: draft.activationRuleNotes.trim() || null,
    rakeGoal: parseOptionalNumber(draft.rakeGoal),
    activePlayersGoal: (() => {
      const n = parseOptionalNumber(draft.activePlayersGoal)
      return n === null ? null : Math.round(n)
    })(),
  }
}

async function save() {
  const payload = buildPayload()
  if (!payload) return

  const monthlyRaw = draft.monthlyRake.trim()
  let monthlyRake: number | null = null
  if (monthlyRaw) {
    const parsed = parseRequiredNumber(draft.monthlyRake, 'Rake do mês')
    if (parsed.error || parsed.value === null) {
      setFormError(parsed.error ?? 'Rake do mês inválido.')
      return
    }
    if (parsed.value < 0) {
      setFormError('Rake mensal não pode ser negativo.')
      return
    }
    monthlyRake = parsed.value
  }

  const monthlyActives = parseOptionalNumber(draft.monthlyActivePlayers)
  if (monthlyActives != null && monthlyActives < 0) {
    setFormError('Ativos no mês não pode ser negativo.')
    return
  }

  saving.value = true
  try {
    let campaignId: string | null = null

    if (editingCampaign.value) {
      const ok = await store.update(editingCampaign.value.id, payload)
      if (!ok) return
      campaignId = editingCampaign.value.id
    } else {
      const created = await store.create(payload)
      if (!created) return
      campaignId = created.id
    }

    if (campaignId && monthlyRake != null) {
      const result = await store.upsertMonthlyResult(campaignId, {
        referenceMonth: draft.referenceMonth,
        referenceYear: draft.referenceYear,
        monthlyRake,
        monthlyActivePlayers:
          monthlyActives != null ? Math.round(monthlyActives) : null,
      })
      if (!result) return
    }

    emit('saved', campaignId)
    close()
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Não foi possível salvar a campanha.'
    setFormError(message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="isEditing ? 'Editar campanha' : 'Nova campanha'"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/60"
        aria-label="Fechar"
        @click="close"
      />

      <form
        class="panel-glass relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl shadow-2xl sm:rounded-2xl"
        novalidate
        @submit.prevent="save"
      >
        <div class="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
          <h3 class="text-base font-semibold text-text-primary">
            {{ isEditing ? 'Editar campanha' : 'Nova campanha' }}
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

        <div ref="formBodyRef" class="space-y-5 overflow-y-auto px-5 py-4">
          <p
            v-if="formError"
            class="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200"
          >
            {{ formError }}
          </p>

          <section class="space-y-3">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-accent/90">
              Obrigatórios
            </h4>

            <label class="block text-xs text-text-muted">
              Nome da campanha
              <input
                ref="nameInputRef"
                v-model="draft.name"
                type="text"
                required
                placeholder="Ex.: 100K Plus"
                :class="fieldClass"
              />
            </label>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label class="block text-xs text-text-muted">
                Mês de aquisição
                <select v-model.number="draft.acquisitionMonth" required :class="fieldClass">
                  <option v-for="month in months" :key="month.value" :value="month.value">
                    {{ month.label }}
                  </option>
                </select>
              </label>

              <label class="block text-xs text-text-muted">
                Ano de aquisição
                <select v-model.number="draft.acquisitionYear" required :class="fieldClass">
                  <option v-for="year in years" :key="year" :value="year">
                    {{ year }}
                  </option>
                </select>
              </label>

              <label class="block text-xs text-text-muted">
                Data de início
                <input
                  v-model="draft.startDate"
                  type="date"
                  required
                  :class="fieldClass"
                />
              </label>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label class="block text-xs text-text-muted">
                Investimento (R$)
                <input
                  v-model="draft.investment"
                  type="text"
                  inputmode="decimal"
                  required
                  placeholder="2779,96"
                  :class="fieldClass"
                />
              </label>

              <label class="block text-xs text-text-muted">
                Jogadores captados
                <input
                  v-model="draft.capturedPlayers"
                  type="number"
                  min="0"
                  step="1"
                  required
                  :class="fieldClass"
                />
              </label>

              <label class="block text-xs text-text-muted">
                Jogadores ativos
                <input
                  v-model="draft.activePlayers"
                  type="number"
                  min="0"
                  step="1"
                  required
                  :class="fieldClass"
                />
              </label>
            </div>

            <label class="block text-xs text-text-muted">
              Critério de ativação
              <select v-model="draft.activationRuleType" required :class="fieldClass">
                <option
                  v-for="rule in ACTIVATION_RULE_OPTIONS"
                  :key="rule"
                  :value="rule"
                >
                  {{ ACTIVATION_RULE_LABELS[rule] }}
                </option>
              </select>
            </label>

            <label
              v-if="needsMinimumRake"
              class="block text-xs text-text-muted"
            >
              Considerar ativo quando o rake for maior que (R$)
              <input
                v-model="draft.activationMinimumRake"
                type="text"
                inputmode="decimal"
                :disabled="draft.activationRuleType === 'rake_gt_050'"
                placeholder="0,50"
                :class="fieldClass"
              />
            </label>

            <label class="block text-xs text-text-muted">
              Observação do critério
              <textarea
                v-model="draft.activationRuleNotes"
                rows="2"
                placeholder="Ex.: rake de R$ 0,50 é proveniente apenas da cortesia."
                :class="[fieldClass, 'resize-none']"
              />
            </label>
          </section>

          <section class="space-y-3">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-accent/90">
              Rake
            </h4>
            <p class="text-[11px] text-text-muted">
              Informe o rake do mês de referência. O rake acumulado é a soma de
              todos os lançamentos mensais.
            </p>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label class="block text-xs text-text-muted">
                Mês de referência
                <select v-model.number="draft.referenceMonth" :class="fieldClass">
                  <option v-for="month in months" :key="month.value" :value="month.value">
                    {{ month.label }}
                  </option>
                </select>
              </label>
              <label class="block text-xs text-text-muted">
                Ano de referência
                <select v-model.number="draft.referenceYear" :class="fieldClass">
                  <option v-for="year in years" :key="year" :value="year">
                    {{ year }}
                  </option>
                </select>
              </label>
              <label class="block text-xs text-text-muted">
                Rake do mês (R$)
                <input
                  v-model="draft.monthlyRake"
                  type="text"
                  inputmode="decimal"
                  placeholder="2344,03"
                  :class="fieldClass"
                />
              </label>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block text-xs text-text-muted">
                Ativos no mês
                <input
                  v-model="draft.monthlyActivePlayers"
                  type="number"
                  min="0"
                  step="1"
                  :class="fieldClass"
                />
              </label>
              <div class="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p class="text-[11px] text-text-muted">Rake acumulado (previsto)</p>
                <p class="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                  {{ formatCurrency(accumulatedRakePreview) }}
                </p>
              </div>
            </div>
          </section>

          <section class="space-y-3">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-accent/90">
              Opcionais
            </h4>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block text-xs text-text-muted">
                Data de encerramento
                <input v-model="draft.endDate" type="date" :class="fieldClass" />
              </label>

              <label class="block text-xs text-text-muted">
                Agência
                <input
                  v-model="draft.agency"
                  type="text"
                  placeholder="Nome da agência"
                  :class="fieldClass"
                />
              </label>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block text-xs text-text-muted">
                Tipo de campanha
                <select v-model="draft.campaignType" :class="fieldClass">
                  <option value="">Selecionar…</option>
                  <option
                    v-for="type in CAMPAIGN_TYPE_OPTIONS"
                    :key="type"
                    :value="type"
                  >
                    {{ type }}
                  </option>
                </select>
              </label>

              <label v-if="showTypeOther" class="block text-xs text-text-muted">
                Tipo (outro)
                <input
                  v-model="draft.campaignTypeOther"
                  type="text"
                  placeholder="Descreva o tipo"
                  :class="fieldClass"
                />
              </label>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block text-xs text-text-muted">
                Objetivo
                <input v-model="draft.objective" type="text" :class="fieldClass" />
              </label>
              <label class="block text-xs text-text-muted">
                Público
                <input v-model="draft.audience" type="text" :class="fieldClass" />
              </label>
              <label class="block text-xs text-text-muted">
                Canal
                <input v-model="draft.channel" type="text" :class="fieldClass" />
              </label>
              <label class="block text-xs text-text-muted">
                Origem
                <input v-model="draft.origin" type="text" :class="fieldClass" />
              </label>
            </div>

            <label class="block text-xs text-text-muted">
              Link da campanha
              <input
                v-model="draft.campaignUrl"
                type="text"
                inputmode="url"
                placeholder="https://…"
                :class="fieldClass"
              />
            </label>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block text-xs text-text-muted">
                Meta de rake (R$)
                <input
                  v-model="draft.rakeGoal"
                  type="text"
                  inputmode="decimal"
                  :class="fieldClass"
                />
              </label>
              <label class="block text-xs text-text-muted">
                Meta de jogadores ativos
                <input
                  v-model="draft.activePlayersGoal"
                  type="number"
                  min="0"
                  step="1"
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
          </section>
        </div>

        <div class="border-t border-border-subtle px-5 py-4">
          <p
            v-if="formError"
            class="mb-3 rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200"
          >
            {{ formError }}
          </p>
          <div class="flex justify-end gap-2">
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
        </div>
      </form>
    </div>
  </Teleport>
</template>
