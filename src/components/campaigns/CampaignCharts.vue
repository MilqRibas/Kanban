<script setup lang="ts">
import { computed } from 'vue'
import type { Campaign } from '../../types/campaigns'
import { useCampaignsStore } from '../../stores/campaigns'
import { formatCurrency, formatPercent } from '../../utils/campaignFormat'
import CampaignStatusBadge from './CampaignStatusBadge.vue'

const props = defineProps<{
  campaigns: Campaign[]
}>()

const store = useCampaignsStore()

const rows = computed(() => {
  return [...props.campaigns]
    .map((campaign) => {
      const metrics = store.metricsFor(campaign)
      const health = store.rakeHealthFor(campaign)
      return {
        campaign,
        metrics,
        health,
        recoveryWidth: Math.min(Math.max(metrics.recoveryRate ?? 0, 0), 100),
      }
    })
    .sort(
      (a, b) => (b.metrics.recoveryRate ?? -1) - (a.metrics.recoveryRate ?? -1),
    )
})

const weekColumns = computed(() => {
  const keys = new Map<string, { start: string; end: string }>()
  for (const campaign of props.campaigns) {
    for (const period of store.agentPeriodsFor(campaign.agentId)) {
      keys.set(period.periodStart, {
        start: period.periodStart,
        end: period.periodEnd,
      })
    }
  }
  return [...keys.values()].sort((a, b) => a.start.localeCompare(b.start))
})

function weekRake(campaign: Campaign, periodStart: string) {
  return (
    store
      .agentPeriodsFor(campaign.agentId)
      .find((p) => p.periodStart === periodStart)?.weeklyRake ?? null
  )
}
</script>

<template>
  <div class="space-y-3">
    <div class="panel-glass rounded-2xl p-4">
      <h3 class="mb-3 text-sm font-semibold text-text-primary">
        Recuperação por campanha
      </h3>
      <div v-if="rows.length === 0" class="text-sm text-text-muted">
        Nenhuma campanha para exibir.
      </div>
      <ul v-else class="space-y-3">
        <li v-for="row in rows" :key="row.campaign.id" class="space-y-1">
          <div class="flex items-center justify-between gap-2 text-sm">
            <span class="truncate font-medium text-text-primary">
              {{ row.campaign.name }}
            </span>
            <div class="flex items-center gap-2">
              <CampaignStatusBadge :status="row.metrics.status" />
              <span class="tabular-nums text-text-secondary">
                {{ formatPercent(row.metrics.recoveryRate) }}
              </span>
            </div>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              class="h-full rounded-full bg-accent transition-all"
              :style="{ width: `${row.recoveryWidth}%` }"
            />
          </div>
          <p class="text-[11px] text-text-muted">
            {{ formatCurrency(row.metrics.accumulatedRake) }} rake ·
            {{ row.metrics.weeksTracked }} sem. ·
            {{ row.health.classificationLabel }}
          </p>
        </li>
      </ul>
    </div>

    <div v-if="weekColumns.length" class="panel-glass overflow-hidden rounded-2xl">
      <div class="border-b border-border-subtle px-4 py-3">
        <h3 class="text-sm font-semibold text-text-primary">Rake semanal</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-surface/50 text-xs text-text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">Campanha</th>
              <th
                v-for="col in weekColumns"
                :key="col.start"
                class="whitespace-nowrap px-3 py-2 font-medium"
              >
                {{ store.formatPeriodLabel(col.start, col.end) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.campaign.id"
              class="border-t border-border-subtle/50"
            >
              <td class="px-3 py-2 font-medium text-text-primary">
                {{ row.campaign.name }}
              </td>
              <td
                v-for="col in weekColumns"
                :key="col.start"
                class="px-3 py-2 tabular-nums text-text-secondary"
              >
                {{
                  weekRake(row.campaign, col.start) != null
                    ? formatCurrency(weekRake(row.campaign, col.start)!)
                    : '—'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
