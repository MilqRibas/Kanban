<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Archive,
  ArrowLeft,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from '@lucide/vue'
import type { Campaign } from '../../types/campaigns'
import { ACTIVATION_RULE_LABELS } from '../../types/campaigns'
import { useAuthStore } from '../../stores/auth'
import { useCampaignsStore } from '../../stores/campaigns'
import { useEphemeralDismiss } from '../../composables/useEphemeralDismiss'
import {
  formatCurrency,
  formatMonthYear,
  formatNumber,
  formatPaybackLabel,
  formatPercent,
} from '../../utils/campaignFormat'
import {
  buildCampaignMetrics,
  generateCampaignInsights,
} from '../../utils/campaignMetrics'
import CampaignStatusBadge from './CampaignStatusBadge.vue'
import CampaignMonthlyTable from './CampaignMonthlyTable.vue'
import CampaignMonthlyResultModal from './CampaignMonthlyResultModal.vue'
import CampaignHistory from './CampaignHistory.vue'
import CampaignInsights from './CampaignInsights.vue'

const props = defineProps<{
  campaign: Campaign
}>()

const emit = defineEmits<{
  back: []
  edit: [id: string]
}>()

const auth = useAuthStore()
const store = useCampaignsStore()
const menuOpen = ref(false)
const monthlyOpen = ref(false)
const editingResultId = ref<string | null>(null)

useEphemeralDismiss({
  isOpen: () => menuOpen.value,
  onClose: () => {
    menuOpen.value = false
  },
})

const results = computed(() => store.monthlyResultsFor(props.campaign.id))
const metrics = computed(() =>
  buildCampaignMetrics(props.campaign, store.monthlyResults),
)
const history = computed(() =>
  store.history
    .filter((h) => h.campaignId === props.campaign.id)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
)

const sortedResults = computed(() => results.value)

const previousAndCurrentRake = computed(() => {
  const list = sortedResults.value
  if (list.length === 0) {
    return { previous: null as number | null, current: null as number | null }
  }
  const current = list[list.length - 1]?.monthlyRake ?? null
  const previous =
    list.length > 1 ? (list[list.length - 2]?.monthlyRake ?? null) : null
  return { previous, current }
})

const insights = computed(() =>
  generateCampaignInsights({
    campaign: props.campaign,
    metrics: metrics.value,
    peerCampaigns: store.visibleCampaigns,
    peerMonthlyResults: store.monthlyResults,
    previousMonthRake: previousAndCurrentRake.value.previous,
    currentMonthRake: previousAndCurrentRake.value.current,
  }),
)

const recoveryWidth = computed(() => {
  const rate = metrics.value.recoveryRate
  if (rate === null || !Number.isFinite(rate)) return 0
  return Math.max(0, rate)
})

const periodLabel = computed(() =>
  formatMonthYear(props.campaign.acquisitionMonth, props.campaign.acquisitionYear),
)

const typeLabel = computed(() => {
  if (props.campaign.campaignType === 'Outro' && props.campaign.campaignTypeOther) {
    return props.campaign.campaignTypeOther
  }
  return props.campaign.campaignType || '—'
})

const activationLabel = computed(() => {
  const rule = props.campaign.activationRuleType
  const base = ACTIVATION_RULE_LABELS[rule] ?? rule
  if (
    (rule === 'custom_minimum' || rule === 'custom_rule') &&
    props.campaign.activationMinimumRake != null
  ) {
    return `${base} (${formatCurrency(props.campaign.activationMinimumRake)})`
  }
  return base
})

const indicatorCards = computed(() => [
  {
    label: 'Investimento',
    value: formatCurrency(props.campaign.investment),
  },
  {
    label: 'Captados',
    value: formatNumber(props.campaign.capturedPlayers),
  },
  {
    label: 'Ativos',
    value: formatNumber(props.campaign.activePlayers),
  },
  {
    label: 'Inativos',
    value: formatNumber(metrics.value.inactivePlayers),
  },
  {
    label: 'Taxa de ativação',
    value: formatPercent(metrics.value.activationRate),
  },
  {
    label: 'Custo / captado',
    value: formatCurrency(metrics.value.costPerCaptured),
  },
  {
    label: 'Custo / ativo',
    value: formatCurrency(metrics.value.costPerActive),
  },
  {
    label: 'Rake acumulado',
    value: formatCurrency(metrics.value.accumulatedRake),
  },
  {
    label: 'Rake médio / ativo',
    value: formatCurrency(metrics.value.averageRakePerActive),
  },
  {
    label: 'Recuperação',
    value: formatPercent(metrics.value.recoveryRate),
  },
  {
    label: 'Diferença rake − inv.',
    value: formatCurrency(metrics.value.investmentDifference),
  },
  {
    label: 'Payback',
    value: formatPaybackLabel(metrics.value.payback),
  },
])

const evolutionRows = computed(() => {
  let accumulated = 0
  const maxRake = Math.max(
    1,
    ...sortedResults.value.map((r) => r.monthlyRake),
    props.campaign.investment,
  )
  const activeValues = sortedResults.value
    .map((r) => r.monthlyActivePlayers)
    .filter((v): v is number => v != null)
  const maxActive = Math.max(1, ...activeValues)

  return sortedResults.value.map((result) => {
    accumulated += result.monthlyRake
    return {
      id: result.id,
      label: formatMonthYear(result.referenceMonth, result.referenceYear),
      monthly: result.monthlyRake,
      accumulated,
      active: result.monthlyActivePlayers,
      monthlyWidth: (result.monthlyRake / maxRake) * 100,
      accumulatedWidth: (accumulated / maxRake) * 100,
      activeWidth:
        result.monthlyActivePlayers != null
          ? (result.monthlyActivePlayers / maxActive) * 100
          : null,
    }
  })
})

function canDelete() {
  if (!props.campaign.createdBy || props.campaign.createdBy === auth.memberId) {
    return true
  }
  return auth.isAdmin
}

function openMonthlyCreate() {
  editingResultId.value = null
  monthlyOpen.value = true
}

function openMonthlyEdit(id: string) {
  editingResultId.value = id
  monthlyOpen.value = true
}

async function onDuplicate() {
  menuOpen.value = false
  const copy = await store.duplicate(props.campaign.id)
  if (copy) store.open(copy.id)
}

async function onArchive() {
  menuOpen.value = false
  await store.archive(props.campaign.id)
}

async function onRestore() {
  menuOpen.value = false
  await store.restore(props.campaign.id)
}

async function onDelete() {
  menuOpen.value = false
  if (!canDelete()) return
  const confirmed = window.confirm(
    `Excluir a campanha "${props.campaign.name}"? Esta ação não pode ser desfeita.`,
  )
  if (!confirmed) return
  const ok = await store.remove(props.campaign.id)
  if (ok) emit('back')
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-footer-pad pt-2 sm:pt-3">
    <div class="page-shell flex flex-col gap-3 sm:gap-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 space-y-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
            @click="emit('back')"
          >
            <ArrowLeft :size="16" />
            Voltar
          </button>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              {{ campaign.name }}
            </h2>
            <CampaignStatusBadge :status="metrics.status" />
          </div>
          <p class="text-sm text-text-muted">
            {{ periodLabel }}
            <span class="text-border-subtle">·</span>
            {{ typeLabel }}
            <span v-if="campaign.agency">
              <span class="text-border-subtle">·</span>
              {{ campaign.agency }}
            </span>
          </p>
          <p class="text-xs text-text-muted">
            Critério: {{ activationLabel }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary hover:bg-card"
            @click="emit('edit', campaign.id)"
          >
            <Pencil :size="15" />
            Editar
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-board hover:bg-accent-hover"
            @click="openMonthlyCreate"
          >
            <Plus :size="16" />
            Atualização mensal
          </button>
          <div class="relative">
            <button
              type="button"
              data-ephemeral-menu
              class="rounded-xl border border-border-subtle bg-surface p-2 text-text-secondary hover:text-text-primary"
              title="Mais ações"
              @click.stop="menuOpen = !menuOpen"
            >
              <MoreHorizontal :size="16" />
            </button>
            <div
              v-if="menuOpen"
              data-ephemeral-menu
              class="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border-subtle bg-board-elevated py-1 shadow-xl"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                @click="onDuplicate"
              >
                <Copy :size="14" />
                Duplicar
              </button>
              <button
                v-if="!campaign.isArchived && auth.isAdmin"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                @click="onArchive"
              >
                <Archive :size="14" />
                Arquivar
              </button>
              <button
                v-if="campaign.isArchived && auth.isAdmin"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                @click="onRestore"
              >
                <RotateCcw :size="14" />
                Restaurar
              </button>
              <button
                v-if="canDelete()"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                @click="onDelete"
              >
                <Trash2 :size="14" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <div
          v-for="card in indicatorCards"
          :key="card.label"
          class="panel-glass rounded-2xl px-3.5 py-3"
        >
          <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            {{ card.label }}
          </p>
          <p class="mt-1.5 text-base font-semibold tabular-nums text-text-primary sm:text-lg">
            {{ card.value }}
          </p>
        </div>
      </div>

      <div class="panel-glass rounded-2xl p-3 sm:p-4">
        <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-text-primary">
              Recuperação do investimento
            </h3>
            <p class="mt-1 text-sm text-text-secondary">
              {{ formatCurrency(metrics.accumulatedRake) }}
              de
              {{ formatCurrency(campaign.investment) }}
            </p>
          </div>
          <p class="text-lg font-semibold tabular-nums text-accent">
            {{ formatPercent(metrics.recoveryRate) }}
          </p>
        </div>
        <div class="h-2.5 overflow-hidden rounded-full bg-surface sm:h-3">
          <div
            class="h-full rounded-full bg-accent transition-all duration-500"
            :style="{ width: `${Math.min(recoveryWidth, 100)}%` }"
          />
        </div>
        <p
          v-if="recoveryWidth > 100"
          class="mt-2 text-xs text-success"
        >
          Recuperação acima de 100% — valor real: {{ formatPercent(metrics.recoveryRate) }}
        </p>
      </div>

      <section class="panel-glass rounded-2xl p-3 sm:p-4">
        <h3 class="mb-2.5 text-sm font-semibold text-text-primary">
          Evolução mensal
        </h3>
        <div v-if="evolutionRows.length" class="space-y-3">
          <article
            v-for="row in evolutionRows"
            :key="row.id"
            class="rounded-xl bg-surface/40 px-3 py-2.5"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <p class="text-xs font-medium text-text-primary sm:text-sm">
                {{ row.label }}
              </p>
              <p class="text-xs tabular-nums text-text-secondary">
                Acum. {{ formatCurrency(row.accumulated) }}
              </p>
            </div>
            <div class="space-y-1.5">
              <div class="flex justify-between gap-2 text-[11px] text-text-muted">
                <span>Rake do mês</span>
                <span class="tabular-nums">{{ formatCurrency(row.monthly) }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-board/70">
                <div
                  class="h-full rounded-full bg-accent/80"
                  :style="{ width: `${row.monthlyWidth}%` }"
                />
              </div>
              <div class="flex justify-between gap-2 text-[11px] text-text-muted">
                <span>Rake acumulado</span>
                <span class="tabular-nums">{{ formatCurrency(row.accumulated) }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-board/70">
                <div
                  class="h-full rounded-full bg-accent/55"
                  :style="{ width: `${row.accumulatedWidth}%` }"
                />
              </div>
              <template v-if="row.activeWidth != null">
                <div class="flex justify-between gap-2 text-[11px] text-text-muted">
                  <span>Ativos no mês</span>
                  <span class="tabular-nums">{{ row.active }}</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-board/70">
                  <div
                    class="h-full rounded-full bg-accent/40"
                    :style="{ width: `${row.activeWidth}%` }"
                  />
                </div>
              </template>
            </div>
          </article>
        </div>
        <p v-else class="text-sm text-text-muted">
          Adicione lançamentos mensais para ver a evolução.
        </p>
      </section>

      <section class="space-y-3">
        <div class="flex items-baseline justify-between gap-2">
          <h3 class="text-base font-semibold text-text-primary sm:text-lg">
            Resultados mensais
          </h3>
          <span class="text-xs text-text-muted">
            {{ sortedResults.length }}
            {{ sortedResults.length === 1 ? 'mês' : 'meses' }}
          </span>
        </div>
        <CampaignMonthlyTable
          :campaign="campaign"
          :results="sortedResults"
          @edit="openMonthlyEdit"
        />
      </section>

      <CampaignInsights :insights="insights" />
      <CampaignHistory :entries="history" />

      <div
        v-if="campaign.notes || campaign.activationRuleNotes"
        class="panel-glass space-y-2 rounded-2xl p-4 text-sm text-text-secondary"
      >
        <h3 class="font-semibold text-text-primary">Observações</h3>
        <p v-if="campaign.activationRuleNotes">
          <span class="text-text-muted">Critério:</span>
          {{ campaign.activationRuleNotes }}
        </p>
        <p v-if="campaign.notes">{{ campaign.notes }}</p>
      </div>
    </div>

    <CampaignMonthlyResultModal
      v-model:open="monthlyOpen"
      :campaign-id="campaign.id"
      :result-id="editingResultId"
      :default-month="campaign.acquisitionMonth"
      :default-year="campaign.acquisitionYear"
    />
  </div>
</template>
