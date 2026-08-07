<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Campaign, CampaignMonthlyResult } from '../../types/campaigns'
import {
  formatCurrency,
  formatMonthYear,
  formatNumber,
  formatPaybackLabel,
  formatPercent,
} from '../../utils/campaignFormat'
import {
  buildCampaignMetrics,
  generateComparisonInsights,
} from '../../utils/campaignMetrics'
import CampaignInsights from './CampaignInsights.vue'
import CampaignStatusBadge from './CampaignStatusBadge.vue'

const props = defineProps<{
  campaigns: Campaign[]
  monthlyResults: CampaignMonthlyResult[]
}>()

const selectedIds = ref<string[]>([])

watch(
  () => props.campaigns.map((c) => c.id).join(','),
  () => {
    selectedIds.value = selectedIds.value.filter((id) =>
      props.campaigns.some((c) => c.id === id),
    )
    if (selectedIds.value.length < 2 && props.campaigns.length >= 2) {
      selectedIds.value = props.campaigns.slice(0, Math.min(4, props.campaigns.length)).map(
        (c) => c.id,
      )
    }
  },
  { immediate: true },
)

const selectedCampaigns = computed(() =>
  props.campaigns.filter((c) => selectedIds.value.includes(c.id)),
)

const canSelectMore = computed(() => selectedIds.value.length < 5)

function toggle(id: string) {
  if (selectedIds.value.includes(id)) {
    if (selectedIds.value.length <= 2) return
    selectedIds.value = selectedIds.value.filter((item) => item !== id)
    return
  }
  if (!canSelectMore.value) return
  selectedIds.value = [...selectedIds.value, id]
}

const comparisonRows = computed(() =>
  selectedCampaigns.value.map((campaign) => {
    const metrics = buildCampaignMetrics(campaign, props.monthlyResults)
    return { campaign, metrics }
  }),
)

const insights = computed(() =>
  generateComparisonInsights(selectedCampaigns.value, props.monthlyResults),
)

type MetricKey =
  | 'investment'
  | 'captured'
  | 'active'
  | 'inactive'
  | 'activation'
  | 'costCaptured'
  | 'costActive'
  | 'rake'
  | 'avgRake'
  | 'recovery'
  | 'difference'
  | 'payback'
  | 'months'

const metricDefs: { key: MetricKey; label: string }[] = [
  { key: 'investment', label: 'Investimento' },
  { key: 'captured', label: 'Captados' },
  { key: 'active', label: 'Ativos' },
  { key: 'inactive', label: 'Inativos' },
  { key: 'activation', label: 'Taxa de ativação' },
  { key: 'costCaptured', label: 'Custo / captado' },
  { key: 'costActive', label: 'Custo / ativo' },
  { key: 'rake', label: 'Rake acumulado' },
  { key: 'avgRake', label: 'Rake médio / ativo' },
  { key: 'recovery', label: 'Recuperação' },
  { key: 'difference', label: 'Diferença rake − inv.' },
  { key: 'payback', label: 'Mês de payback' },
  { key: 'months', label: 'Meses acompanhados' },
]

function cellValue(row: (typeof comparisonRows.value)[number], key: MetricKey) {
  const { campaign, metrics } = row
  switch (key) {
    case 'investment':
      return formatCurrency(campaign.investment)
    case 'captured':
      return formatNumber(campaign.capturedPlayers)
    case 'active':
      return formatNumber(campaign.activePlayers)
    case 'inactive':
      return formatNumber(metrics.inactivePlayers)
    case 'activation':
      return formatPercent(metrics.activationRate)
    case 'costCaptured':
      return formatCurrency(metrics.costPerCaptured)
    case 'costActive':
      return formatCurrency(metrics.costPerActive)
    case 'rake':
      return formatCurrency(metrics.accumulatedRake)
    case 'avgRake':
      return formatCurrency(metrics.averageRakePerActive)
    case 'recovery':
      return formatPercent(metrics.recoveryRate)
    case 'difference':
      return formatCurrency(metrics.investmentDifference)
    case 'payback':
      if (!metrics.payback.reached) return 'Ainda não atingiu'
      if (metrics.payback.month && metrics.payback.year) {
        return formatMonthYear(metrics.payback.month, metrics.payback.year)
      }
      return formatPaybackLabel(metrics.payback)
    case 'months':
      return formatNumber(metrics.monthsTracked)
    default:
      return '—'
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="panel-glass rounded-2xl p-4 sm:p-5">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">
            Selecionar campanhas
          </h3>
          <p class="mt-1 text-xs text-text-muted">
            Escolha entre 2 e 5 campanhas para comparar.
          </p>
        </div>
        <span class="text-xs text-text-muted">
          {{ selectedIds.length }} selecionada{{ selectedIds.length === 1 ? '' : 's' }}
        </span>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="campaign in campaigns"
          :key="campaign.id"
          type="button"
          class="rounded-xl px-3 py-1.5 text-sm transition-all"
          :class="
            selectedIds.includes(campaign.id)
              ? 'bg-accent/20 text-text-primary ring-1 ring-accent/45'
              : 'bg-surface text-text-secondary hover:text-text-primary'
          "
          :disabled="
            !selectedIds.includes(campaign.id) && !canSelectMore
          "
          @click="toggle(campaign.id)"
        >
          {{ campaign.name }}
        </button>
      </div>
    </div>

    <div
      v-if="comparisonRows.length >= 2"
      class="panel-glass overflow-hidden rounded-2xl"
    >
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-border-subtle bg-surface/60 text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th class="sticky left-0 z-10 bg-surface/95 px-3 py-3 font-medium backdrop-blur">
                Indicador
              </th>
              <th
                v-for="row in comparisonRows"
                :key="row.campaign.id"
                class="min-w-[9.5rem] px-3 py-3 font-medium normal-case tracking-normal"
              >
                <div class="space-y-1.5">
                  <p class="text-sm font-semibold text-text-primary">
                    {{ row.campaign.name }}
                  </p>
                  <CampaignStatusBadge :status="row.metrics.status" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="metric in metricDefs"
              :key="metric.key"
              class="border-b border-border-subtle/60"
            >
              <th
                class="sticky left-0 z-10 bg-board-elevated/95 px-3 py-3 text-left text-xs font-medium text-text-muted backdrop-blur"
              >
                {{ metric.label }}
              </th>
              <td
                v-for="row in comparisonRows"
                :key="`${row.campaign.id}-${metric.key}`"
                class="px-3 py-3 tabular-nums text-text-primary"
              >
                {{ cellValue(row, metric.key) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p
      v-else
      class="panel-glass rounded-2xl p-5 text-sm text-text-muted"
    >
      Selecione ao menos 2 campanhas para ver o comparativo.
    </p>

    <CampaignInsights
      v-if="comparisonRows.length >= 2"
      title="Análise comparativa"
      :insights="insights"
    />
  </div>
</template>
