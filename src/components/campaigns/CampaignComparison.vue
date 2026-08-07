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
      selectedIds.value = props.campaigns
        .slice(0, Math.min(4, props.campaigns.length))
        .map((c) => c.id)
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
  <div class="space-y-2.5">
    <div class="panel-glass rounded-2xl px-3 py-2.5 sm:px-3.5">
      <div class="flex flex-wrap items-center gap-2">
        <div class="mr-1 min-w-0">
          <h3 class="text-sm font-semibold text-text-primary">Comparar</h3>
          <p class="text-[11px] text-text-muted">2 a 5 campanhas</p>
        </div>
        <button
          v-for="campaign in campaigns"
          :key="campaign.id"
          type="button"
          class="rounded-lg px-2.5 py-1 text-xs transition-all sm:text-sm"
          :class="
            selectedIds.includes(campaign.id)
              ? 'bg-accent/20 text-text-primary ring-1 ring-accent/45'
              : 'bg-surface text-text-secondary hover:text-text-primary'
          "
          :disabled="!selectedIds.includes(campaign.id) && !canSelectMore"
          @click="toggle(campaign.id)"
        >
          {{ campaign.name }}
        </button>
        <span class="ml-auto text-[11px] text-text-muted">
          {{ selectedIds.length }} sel.
        </span>
      </div>
    </div>

    <div
      v-if="comparisonRows.length >= 2"
      class="panel-glass overflow-hidden rounded-2xl"
    >
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-border-subtle bg-surface/60 text-[10px] uppercase tracking-wide text-text-muted">
            <tr>
              <th class="sticky left-0 z-10 bg-surface/95 px-3 py-2 font-medium backdrop-blur">
                Indicador
              </th>
              <th
                v-for="row in comparisonRows"
                :key="row.campaign.id"
                class="min-w-[8.5rem] px-3 py-2 font-medium normal-case tracking-normal"
              >
                <div class="space-y-1">
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
              class="border-b border-border-subtle/50"
            >
              <th
                class="sticky left-0 z-10 bg-board-elevated/95 px-3 py-1.5 text-left text-xs font-medium text-text-muted backdrop-blur"
              >
                {{ metric.label }}
              </th>
              <td
                v-for="row in comparisonRows"
                :key="`${row.campaign.id}-${metric.key}`"
                class="px-3 py-1.5 tabular-nums text-text-primary"
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
      class="panel-glass rounded-2xl p-4 text-sm text-text-muted"
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
