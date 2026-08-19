<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Info, X } from '@lucide/vue'
import { useEscapeKey } from '../../composables/useEscapeKey'
import { useCampaignsStore } from '../../stores/campaigns'
import type {
  AcquisitionNature,
  ActivationRuleType,
  Campaign,
  CampaignCreateInput,
} from '../../types/campaigns'
import {
  ACQUISITION_NATURE_LABELS,
  ACQUISITION_NATURE_OPTIONS,
  ACTIVATION_RULE_LABELS,
  ACTIVATION_RULE_OPTIONS,
  CAMPAIGN_TYPE_OPTIONS,
} from '../../types/campaigns'
import { formatCurrency, parseCountInput } from '../../utils/campaignFormat'
import { isValidAgentId } from '../../utils/campaignReportParser'
import { funnelWarnings } from '../../utils/campaignFunnelMetrics'
import { buildSearchHaystack, matchesSearch } from '../../utils/search'

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
  acquisitionNature: AcquisitionNature
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
  impressions: string
  reach: string
  metaConversations: string
  serviceConversations: string
  clubConversions: string
  clubFichasConversions: string
  capturedPlayers: string
  agentId: string
  activationRuleType: ActivationRuleType
  activationMinimumRake: string
  activationRuleNotes: string
  rakeGoal: string
  activePlayersGoal: string
}

function emptyDraft(): Draft {
  return {
    name: '',
    acquisitionNature: 'PAID',
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
    impressions: '',
    reach: '',
    metaConversations: '',
    serviceConversations: '',
    clubConversions: '',
    clubFichasConversions: '',
    capturedPlayers: '',
    agentId: '',
    activationRuleType: 'rake_gt_zero',
    activationMinimumRake: '',
    activationRuleNotes: '',
    rakeGoal: '',
    activePlayersGoal: '',
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

const agentQuery = ref('')

const agentOptions = computed(() => {
  const q = agentQuery.value
  const list = [...store.agents]
    .filter((a) => isValidAgentId(a.agentId))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  if (!q.trim()) return list
  return list.filter((a) =>
    matchesSearch(buildSearchHaystack([a.agentId, a.name]), q),
  )
})

const selectedAgentLabel = computed(() => {
  if (!draft.agentId) return ''
  const agent = store.agents.find((a) => a.agentId === draft.agentId)
  return agent ? `${agent.agentId} — ${agent.name}` : draft.agentId
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
const isPaid = computed(() => draft.acquisitionNature === 'PAID')

const softFunnelWarnings = computed(() => {
  const warnings = funnelWarnings({
    impressions: parseOptionalCount(draft.impressions),
    reach: parseOptionalCount(draft.reach),
    metaConversations: parseOptionalCount(draft.metaConversations),
    serviceConversations: parseOptionalCount(draft.serviceConversations),
    clubConversions: parseOptionalCount(draft.clubConversions),
    clubFichasConversions: parseOptionalCount(draft.clubFichasConversions),
  })
  const messages: string[] = []
  if (warnings.reachGtImpressions) {
    messages.push('Alcance maior que impressões — confira os números.')
  }
  if (warnings.serviceGtMeta) {
    messages.push('Conversas de atendimento maiores que Meta — confira.')
  }
  if (warnings.fichasGtClub) {
    messages.push('Conversões Clube+Fichas maiores que Clube — confira.')
  }
  return messages
})

const fieldClass =
  'mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent'

function fillFromCampaign(campaign: Campaign) {
  draft.name = campaign.name
  draft.acquisitionNature = campaign.acquisitionNature ?? 'PAID'
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
  draft.investment =
    campaign.investment != null ? String(campaign.investment) : ''
  draft.impressions =
    campaign.impressions != null ? String(campaign.impressions) : ''
  draft.reach = campaign.reach != null ? String(campaign.reach) : ''
  draft.metaConversations =
    campaign.metaConversations != null
      ? String(campaign.metaConversations)
      : ''
  draft.serviceConversations =
    campaign.serviceConversations != null
      ? String(campaign.serviceConversations)
      : ''
  draft.clubConversions =
    campaign.clubConversions != null ? String(campaign.clubConversions) : ''
  draft.clubFichasConversions =
    campaign.clubFichasConversions != null
      ? String(campaign.clubFichasConversions)
      : ''
  draft.capturedPlayers = String(campaign.capturedPlayers)
  draft.agentId = campaign.agentId ?? ''
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
    agentQuery.value = ''
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
  () => draft.startDate,
  (iso) => {
    if (!iso) return
    const [yearRaw, monthRaw] = iso.slice(0, 10).split('-')
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    if (year >= 2000 && month >= 1 && month <= 12) {
      draft.acquisitionYear = year
      draft.acquisitionMonth = month
    }
  },
)

function normalizeNumberInput(raw: string | number | null | undefined) {
  let value = String(raw ?? '').trim()
  if (!value) return ''
  // Aceita formatos BR (1.234,56 / 1234,56) e ponto decimal simples.
  if (value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.')
  }
  return value
}

function parseRequiredNumber(
  raw: string | number | null | undefined,
  label: string,
) {
  const normalized = normalizeNumberInput(raw)
  if (!normalized) return { error: `${label} é obrigatório.` as string, value: null }
  const value = Number(normalized)
  if (!Number.isFinite(value)) {
    return { error: `${label} inválido.`, value: null }
  }
  return { error: null as string | null, value }
}

function parseOptionalNumber(raw: string | number | null | undefined) {
  const normalized = normalizeNumberInput(raw)
  if (!normalized) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function parseOptionalCount(raw: string | number | null | undefined) {
  return parseCountInput(raw)
}

const cohortPreview = computed(() => {
  if (!draft.agentId) return { playerCount: 0, accumulatedRake: 0 }
  return store.previewCohort({
    agentId: draft.agentId,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
  })
})

const accumulatedRakePreview = computed(() => cohortPreview.value.accumulatedRake)

const historicalAgentRake = computed(() => {
  if (!draft.agentId || !draft.startDate) return 0
  return store
    .agentPeriodsFor(draft.agentId)
    .filter((p) => p.periodEnd < draft.startDate)
    .reduce((sum, p) => sum + (Number(p.weeklyRake) || 0), 0)
})

const selectedAgentNoWindowRake = computed(
  () => Boolean(draft.agentId) && cohortPreview.value.playerCount === 0,
)

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

  let investmentValue: number | null = null
  if (draft.acquisitionNature === 'PAID') {
    const investment = parseRequiredNumber(
      draft.investment,
      'Investimento da Campanha',
    )
    if (investment.error || investment.value === null) {
      setFormError(investment.error ?? 'Investimento inválido.')
      return null
    }
    investmentValue = investment.value
  } else {
    investmentValue = parseOptionalNumber(draft.investment)
  }

  const captured = parseRequiredNumber(
    draft.capturedPlayers,
    'Jogadores na agência',
  )
  if (captured.error || captured.value === null) {
    setFormError(captured.error ?? 'Jogadores na agência inválido.')
    return null
  }

  if (investmentValue != null && investmentValue < 0) {
    setFormError('Investimento não pode ser negativo.')
    return null
  }
  if (captured.value < 0) {
    setFormError('Jogadores na agência não pode ser negativo.')
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

  const agent = draft.agentId
    ? store.agents.find((a) => a.agentId === draft.agentId)
    : null

  return {
    name: draft.name.trim(),
    acquisitionNature: draft.acquisitionNature,
    acquisitionMonth: draft.acquisitionMonth,
    acquisitionYear: draft.acquisitionYear,
    startDate: draft.startDate,
    endDate: draft.endDate || null,
    agency: agent?.name || draft.agency.trim() || null,
    agentId: draft.agentId.trim() || null,
    campaignType: draft.campaignType || null,
    campaignTypeOther:
      draft.campaignType === 'Outro' ? draft.campaignTypeOther.trim() || null : null,
    objective: draft.objective.trim() || null,
    audience: draft.audience.trim() || null,
    channel: draft.channel.trim() || null,
    origin: draft.origin.trim() || null,
    campaignUrl: draft.campaignUrl.trim() || null,
    notes: draft.notes.trim() || null,
    investment: investmentValue,
    impressions: parseOptionalCount(draft.impressions),
    reach: parseOptionalCount(draft.reach),
    metaConversations: parseOptionalCount(draft.metaConversations),
    serviceConversations: parseOptionalCount(draft.serviceConversations),
    clubConversions: parseOptionalCount(draft.clubConversions),
    clubFichasConversions: parseOptionalCount(draft.clubFichasConversions),
    capturedPlayers: captured.value,
    activationRuleType: draft.activationRuleType,
    activationMinimumRake,
    activationRuleNotes: draft.activationRuleNotes.trim() || null,
    rakeGoal: parseOptionalNumber(draft.rakeGoal),
    activePlayersGoal: parseOptionalNumber(draft.activePlayersGoal),
  }
}

async function save() {
  const payload = buildPayload()
  if (!payload) return

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
        class="panel-glass footer-sheet-offset relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl shadow-2xl sm:rounded-2xl"
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

            <label class="block text-xs text-text-muted">
              Natureza da aquisição
              <select v-model="draft.acquisitionNature" required :class="fieldClass">
                <option
                  v-for="nature in ACQUISITION_NATURE_OPTIONS"
                  :key="nature"
                  :value="nature"
                >
                  {{ ACQUISITION_NATURE_LABELS[nature] }}
                </option>
              </select>
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

            <label class="block text-xs text-text-muted">
              <span class="inline-flex items-center gap-1">
                Fim do período de aquisição
                <span
                  class="inline-flex text-text-muted"
                  aria-label="Após esta data, novos jogadores não serão atribuídos à campanha. Jogadores já adquiridos continuam gerando rake normalmente."
                  title="Após esta data, novos jogadores não serão atribuídos à campanha. Jogadores já adquiridos continuam gerando rake normalmente."
                >
                  <Info :size="13" />
                </span>
              </span>
              <input v-model="draft.endDate" type="date" :class="fieldClass" />
              <span class="mt-1 block text-[11px] text-text-muted">
                Opcional. Vazio = a campanha continua aceitando novos jogadores no Agent ID.
              </span>
            </label>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block text-xs text-text-muted">
                Investimento da Campanha (R$)
                <input
                  v-model="draft.investment"
                  type="text"
                  inputmode="decimal"
                  :required="isPaid"
                  :placeholder="isPaid ? '2779,96' : 'Opcional'"
                  :class="fieldClass"
                />
                <span v-if="!isPaid" class="mt-1 block text-[11px] text-text-muted">
                  Opcional na captação orgânica (vazio = sem investimento).
                </span>
              </label>

              <label class="block text-xs text-text-muted">
                Jogadores na agência
                <input
                  v-model="draft.capturedPlayers"
                  type="number"
                  min="0"
                  step="1"
                  required
                  :class="fieldClass"
                />
              </label>
            </div>

            <div class="space-y-2 rounded-xl border border-border-subtle/70 bg-column/30 p-3">
              <p class="text-xs font-medium text-text-secondary">
                Agência (Agent ID)
              </p>
              <p v-if="store.agents.length === 0" class="text-xs text-text-muted">
                Importe um relatório semanal para cadastrar automaticamente as agências.
              </p>
              <template v-else>
                <input
                  v-model="agentQuery"
                  type="search"
                  placeholder="Pesquisar por Agent ID ou nome…"
                  :class="fieldClass"
                />
                <select v-model="draft.agentId" :class="fieldClass">
                  <option value="">Sem vínculo</option>
                  <option
                    v-for="agent in agentOptions"
                    :key="agent.agentId"
                    :value="agent.agentId"
                  >
                    {{ agent.agentId }} — {{ agent.name }}
                  </option>
                </select>
                <p v-if="selectedAgentLabel" class="text-xs text-accent">
                  Selecionado: {{ selectedAgentLabel }}
                  · {{ cohortPreview.playerCount }}
                  {{ cohortPreview.playerCount === 1 ? 'jogador' : 'jogadores' }}
                  na coorte
                  · rake {{ formatCurrency(accumulatedRakePreview) }}
                </p>
                <p
                  v-if="selectedAgentLabel && selectedAgentNoWindowRake"
                  class="text-[11px] text-amber-200"
                >
                  Nenhum Player ID deste Agent ID na janela de aquisição — importe o
                  relatório desse período ou confira o Agent ID.
                </p>
                <p
                  v-if="selectedAgentLabel && historicalAgentRake > 0.009"
                  class="text-[11px] text-text-muted"
                >
                  O Agent ID tem {{ formatCurrency(historicalAgentRake) }} de rake
                  antes do início — esse histórico não entra na campanha.
                </p>
              </template>
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
              Funil de desempenho
            </h4>
            <p class="text-xs text-text-muted">
              Campos manuais do funil. Não bloqueiam o salvamento.
            </p>

            <div
              v-if="isPaid"
              class="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <label class="block text-xs text-text-muted">
                Impressões
                <input
                  v-model="draft.impressions"
                  type="text"
                  inputmode="decimal"
                  :class="fieldClass"
                />
              </label>
              <label class="block text-xs text-text-muted">
                Alcance
                <input
                  v-model="draft.reach"
                  type="text"
                  inputmode="decimal"
                  :class="fieldClass"
                />
              </label>
              <label class="block text-xs text-text-muted">
                Conversas iniciadas — Meta
                <input
                  v-model="draft.metaConversations"
                  type="text"
                  inputmode="decimal"
                  :class="fieldClass"
                />
              </label>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block text-xs text-text-muted">
                Conversas iniciadas — Atendimento
                <input
                  v-model="draft.serviceConversations"
                  type="text"
                  inputmode="decimal"
                  :class="fieldClass"
                />
              </label>
              <label class="block text-xs text-text-muted">
                Conversões no Clube
                <input
                  v-model="draft.clubConversions"
                  type="text"
                  inputmode="decimal"
                  :class="fieldClass"
                />
              </label>
              <label class="block text-xs text-text-muted">
                Conversões Clube + Fichas
                <input
                  v-model="draft.clubFichasConversions"
                  type="text"
                  inputmode="decimal"
                  :class="fieldClass"
                />
              </label>
            </div>

            <ul
              v-if="softFunnelWarnings.length"
              class="space-y-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
            >
              <li v-for="(msg, i) in softFunnelWarnings" :key="i">{{ msg }}</li>
            </ul>
          </section>

          <section class="space-y-3">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-accent/90">
              Opcionais
            </h4>

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
