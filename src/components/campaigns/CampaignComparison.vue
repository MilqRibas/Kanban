<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Campaign } from '../../types/campaigns'
import { ACQUISITION_NATURE_LABELS } from '../../types/campaigns'
import { useCampaignsStore } from '../../stores/campaigns'
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from '../../utils/campaignFormat'
import { formatPeriodLabel } from '../../utils/campaignWeeklyMetrics'
import CampaignStatusBadge from './CampaignStatusBadge.vue'
import CollapsiblePanel from './CollapsiblePanel.vue'

const props = defineProps<{
  campaigns: Campaign[]
}>()

const store = useCampaignsStore()
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

const rows = computed(() =>
  selectedCampaigns.value.map((campaign) => {
    const metrics = store.metricsFor(campaign)
    const health = store.rakeHealthFor(campaign)
    const power = store.purchasePowerFor(campaign)
    return { campaign, metrics, health, power }
  }),
)

function toggle(id: string) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((x) => x !== id)
  } else {
    selectedIds.value = [...selectedIds.value, id]
  }
}

const metricDefs: Array<{
  label: string
  value: (row: (typeof rows.value)[number]) => string
}> = [
  {
    label: 'Natureza',
    value: (r) =>
      ACQUISITION_NATURE_LABELS[r.campaign.acquisitionNature] ??
      r.campaign.acquisitionNature,
  },
  {
    label: 'Investimento Campanha',
    value: (r) => formatCurrency(r.metrics.campaignInvestment),
  },
  {
    label: 'Ativação',
    value: (r) => formatCurrency(r.metrics.activationInvestment),
  },
  {
    label: 'Investimento Total',
    value: (r) => formatCurrency(r.metrics.totalInvestment),
  },
  { label: 'Jogadores', value: (r) => formatNumber(r.metrics.agencyPlayers) },
  { label: 'Ativos únicos', value: (r) => formatNumber(r.metrics.uniqueActivePlayers) },
  { label: 'Ativação %', value: (r) => formatPercent(r.metrics.activationRate) },
  { label: 'Rake acumulado', value: (r) => formatCurrency(r.metrics.accumulatedRake) },
  {
    label: 'Volume depositado',
    value: (r) => formatCurrency(r.power.depositedVolume),
  },
  {
    label: 'Depositantes',
    value: (r) => formatNumber(r.power.uniqueDepositors),
  },
  { label: 'Rake/ativo', value: (r) => formatCurrency(r.metrics.averageRakePerActive) },
  { label: 'Recuperação', value: (r) => formatPercent(r.metrics.recoveryRate) },
  { label: 'Custo/ativo', value: (r) => formatCurrency(r.metrics.costPerActive) },
  {
    label: 'Top 1',
    value: (r) =>
      r.health.top1Share != null
        ? formatPercent(r.health.top1Share * 100)
        : '—',
  },
  {
    label: 'Top 3',
    value: (r) =>
      r.health.top3Share != null
        ? formatPercent(r.health.top3Share * 100)
        : '—',
  },
  {
    label: 'Top 10',
    value: (r) =>
      r.health.top10Share != null
        ? formatPercent(r.health.top10Share * 100)
        : '—',
  },
  {
    label: 'Jogadores p/ 80%',
    value: (r) =>
      r.health.playersFor80 != null
        ? `${r.health.playersFor80} / ${r.health.uniquePlayers}`
        : '—',
  },
  { label: 'Saúde', value: (r) => r.health.classificationLabel },
  {
    label: 'Payback',
    value: (r) =>
      r.metrics.payback.reached && r.metrics.payback.periodStart
        ? formatPeriodLabel(
            r.metrics.payback.periodStart,
            r.metrics.payback.periodEnd ?? r.metrics.payback.periodStart,
          )
        : 'Não atingido',
  },
  { label: 'Semanas', value: (r) => String(r.metrics.weeksTracked) },
  {
    label: 'Status',
    value: () => '',
  },
]
</script>

<template>
  <div class="space-y-4">
    <div class="panel-glass rounded-2xl p-4">
      <h3 class="mb-3 text-sm font-semibold text-text-primary">
        Selecione campanhas para comparar
      </h3>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="campaign in campaigns"
          :key="campaign.id"
          type="button"
          :class="[
            'rounded-xl px-3 py-1.5 text-sm transition-colors',
            selectedIds.includes(campaign.id)
              ? 'bg-accent/20 text-text-primary ring-1 ring-accent/45'
              : 'bg-surface text-text-secondary hover:text-text-primary',
          ]"
          @click="toggle(campaign.id)"
        >
          {{ campaign.name }}
        </button>
      </div>
    </div>

    <div v-if="rows.length < 2" class="panel-glass rounded-2xl p-6 text-sm text-text-muted">
      Selecione pelo menos 2 campanhas para comparar.
    </div>

    <CollapsiblePanel
      v-if="rows.length >= 2"
      title="Comparativo"
      hint="Métricas lado a lado das campanhas selecionadas"
      :default-open="true"
    >
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-border-subtle bg-surface/60 text-xs text-text-muted">
            <tr>
              <th class="px-3 py-3 font-medium">Métrica</th>
              <th
                v-for="row in rows"
                :key="row.campaign.id"
                class="px-3 py-3 font-medium"
              >
                {{ row.campaign.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(metric, idx) in metricDefs"
              :key="metric.label"
              class="border-b border-border-subtle/50"
              :class="idx % 2 === 1 ? 'bg-white/[0.04]' : ''"
            >
              <td class="px-3 py-2 text-text-muted">{{ metric.label }}</td>
              <td
                v-for="row in rows"
                :key="row.campaign.id"
                class="whitespace-nowrap px-3 py-2 tabular-nums text-text-primary"
              >
                <CampaignStatusBadge
                  v-if="metric.label === 'Status'"
                  :status="row.metrics.status"
                />
                <template v-else>{{ metric.value(row) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </CollapsiblePanel>
  </div>
</template>
