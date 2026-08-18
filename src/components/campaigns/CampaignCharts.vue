<script setup lang="ts">
import { computed } from 'vue'
import type { Campaign } from '../../types/campaigns'
import { useCampaignsStore } from '../../stores/campaigns'
import { formatCurrency, formatPercent } from '../../utils/campaignFormat'
import CampaignStatusBadge from './CampaignStatusBadge.vue'
import CollapsiblePanel from './CollapsiblePanel.vue'

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
    for (const period of store.agentPeriodsForCampaign(campaign)) {
      keys.set(period.periodStart, {
        start: period.periodStart,
        end: period.periodEnd,
      })
    }
  }
  return [...keys.values()].sort((a, b) => a.start.localeCompare(b.start))
})

const rakeByCampaignWeek = computed(() => {
  const map = new Map<string, number>()
  for (const campaign of props.campaigns) {
    for (const period of store.agentPeriodsForCampaign(campaign)) {
      map.set(`${campaign.id}:${period.periodStart}`, period.weeklyRake)
    }
  }
  return map
})

function weekRake(campaign: Campaign, periodStart: string) {
  const value = rakeByCampaignWeek.value.get(`${campaign.id}:${periodStart}`)
  return value == null ? null : value
}

function shortPeriod(start: string, end: string) {
  const fmt = (iso: string) => {
    const [, month, day] = iso.split('-')
    return `${day}/${month}`
  }
  return `${fmt(start)}–${fmt(end)}`
}

const lastWeekStart = computed(
  () => weekColumns.value[weekColumns.value.length - 1]?.start ?? null,
)
</script>

<template>
  <div class="space-y-3">
    <CollapsiblePanel
      title="Recuperação por campanha"
      hint="Status e % de rake sobre o investimento total"
      :default-open="true"
    >
      <div class="px-2 pb-3 sm:px-3">
        <div v-if="rows.length === 0" class="px-2 py-4 text-sm text-text-muted">
          Nenhuma campanha para exibir.
        </div>
        <ul v-else class="space-y-1.5">
          <li
            v-for="(row, idx) in rows"
            :key="row.campaign.id"
            class="space-y-1 rounded-xl px-2 py-2"
            :class="idx % 2 === 1 ? 'bg-white/[0.04]' : 'bg-transparent'"
          >
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="min-w-0 truncate font-medium text-text-primary">
                {{ row.campaign.name }}
              </span>
              <div class="flex shrink-0 items-center gap-2">
                <CampaignStatusBadge :status="row.metrics.status" />
                <span class="w-16 text-right tabular-nums text-text-secondary">
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
    </CollapsiblePanel>

    <CollapsiblePanel
      v-if="weekColumns.length"
      title="Rake semanal"
      hint="Valores por semana importada — a última coluna é a mais recente"
      :default-open="true"
    >
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="sticky top-0 z-[2] bg-surface/90 text-[11px] uppercase tracking-wide text-text-muted backdrop-blur-sm">
            <tr>
              <th
                class="sticky left-0 z-[3] bg-surface/95 px-3 py-2.5 font-medium shadow-[2px_0_8px_-6px_rgba(0,0,0,0.65)]"
              >
                Campanha
              </th>
              <th
                v-for="col in weekColumns"
                :key="col.start"
                class="whitespace-nowrap px-3 py-2.5 text-right font-medium"
                :class="col.start === lastWeekStart ? 'text-accent/90' : ''"
                :title="store.formatPeriodLabel(col.start, col.end)"
              >
                {{ shortPeriod(col.start, col.end) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, idx) in rows"
              :key="row.campaign.id"
              class="border-t border-border-subtle/40 transition-colors hover:bg-white/[0.06]"
              :class="idx % 2 === 1 ? 'bg-white/[0.04]' : 'bg-transparent'"
            >
              <td
                class="sticky left-0 z-[1] max-w-[12rem] truncate px-3 py-2 font-medium text-text-primary shadow-[2px_0_8px_-6px_rgba(0,0,0,0.55)]"
                :class="idx % 2 === 1 ? 'bg-board-elevated' : 'bg-board'"
                :title="row.campaign.name"
              >
                {{ row.campaign.name }}
              </td>
              <td
                v-for="col in weekColumns"
                :key="col.start"
                class="px-3 py-2 text-right tabular-nums"
                :class="[
                  weekRake(row.campaign, col.start) == null
                    ? 'text-text-muted/70'
                    : 'text-text-secondary',
                  col.start === lastWeekStart ? 'font-medium text-text-primary' : '',
                ]"
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
    </CollapsiblePanel>
  </div>
</template>
