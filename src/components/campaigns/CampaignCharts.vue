<script setup lang="ts">
import { computed } from 'vue'
import type { Campaign, CampaignMonthlyResult } from '../../types/campaigns'
import {
  formatCurrency,
  formatMonthYear,
  formatPercent,
  monthName,
} from '../../utils/campaignFormat'
import { buildCampaignMetrics } from '../../utils/campaignMetrics'
import CampaignStatusBadge from './CampaignStatusBadge.vue'

const props = defineProps<{
  campaigns: Campaign[]
  monthlyResults: CampaignMonthlyResult[]
}>()

const rows = computed(() => {
  return [...props.campaigns]
    .map((campaign) => {
      const metrics = buildCampaignMetrics(campaign, props.monthlyResults)
      return {
        campaign,
        metrics,
        recoveryWidth: Math.min(Math.max(metrics.recoveryRate ?? 0, 0), 100),
      }
    })
    .sort(
      (a, b) => (b.metrics.recoveryRate ?? -1) - (a.metrics.recoveryRate ?? -1),
    )
})

const campaignIdSet = computed(() => new Set(props.campaigns.map((c) => c.id)))

const monthColumns = computed(() => {
  const keys = new Set<string>()
  for (const result of props.monthlyResults) {
    if (!campaignIdSet.value.has(result.campaignId)) continue
    keys.add(
      `${result.referenceYear}-${String(result.referenceMonth).padStart(2, '0')}`,
    )
  }
  return [...keys]
    .sort()
    .slice(-6)
    .map((key) => {
      const [year, month] = key.split('-').map(Number)
      return {
        key,
        year,
        month,
        short: `${monthName(month).slice(0, 3)}/${String(year).slice(2)}`,
        full: formatMonthYear(month, year),
      }
    })
})

const monthlyMatrix = computed(() =>
  props.campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    cells: monthColumns.value.map((col) => {
      const result = props.monthlyResults.find(
        (r) =>
          r.campaignId === campaign.id &&
          r.referenceYear === col.year &&
          r.referenceMonth === col.month,
      )
      return {
        key: col.key,
        value: result?.monthlyRake ?? null,
      }
    }),
  })),
)

const activationRank = computed(() =>
  [...rows.value].sort(
    (a, b) => (b.metrics.activationRate ?? -1) - (a.metrics.activationRate ?? -1),
  ),
)
</script>

<template>
  <div class="space-y-2.5">
    <!-- Ranking denso: uma linha por campanha no desktop -->
    <section class="panel-glass rounded-2xl p-2.5 sm:p-3">
      <div class="mb-2 flex flex-wrap items-end justify-between gap-1">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">
            Desempenho por campanha
          </h3>
          <p class="text-[11px] text-text-muted">
            Ordenado por recuperação · invest. × rake na barra
          </p>
        </div>
      </div>

      <div v-if="rows.length" class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="text-[10px] uppercase tracking-wide text-text-muted">
            <tr class="border-b border-border-subtle/60">
              <th class="py-1.5 pr-3 font-medium">Campanha</th>
              <th class="hidden py-1.5 pr-3 font-medium sm:table-cell">Status</th>
              <th class="min-w-[10rem] py-1.5 pr-3 font-medium lg:min-w-[14rem]">
                Recuperação
              </th>
              <th class="py-1.5 pr-3 text-right font-medium">Invest.</th>
              <th class="py-1.5 pr-3 text-right font-medium">Rake</th>
              <th class="hidden py-1.5 pr-3 text-right font-medium md:table-cell">
                Ativação
              </th>
              <th class="hidden py-1.5 pr-3 text-right font-medium lg:table-cell">
                Cap.
              </th>
              <th class="hidden py-1.5 text-right font-medium lg:table-cell">
                Ativos
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.campaign.id"
              class="border-b border-border-subtle/40 last:border-0"
            >
              <td class="max-w-[8rem] truncate py-2 pr-3 font-medium text-text-primary sm:max-w-[12rem]">
                {{ row.campaign.name }}
                <div class="mt-0.5 sm:hidden">
                  <CampaignStatusBadge :status="row.metrics.status" />
                </div>
              </td>
              <td class="hidden py-2 pr-3 sm:table-cell">
                <CampaignStatusBadge :status="row.metrics.status" />
              </td>
              <td class="py-2 pr-3">
                <div class="flex items-center gap-2">
                  <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-board/70">
                    <div
                      class="h-full rounded-full bg-accent"
                      :style="{ width: `${row.recoveryWidth}%` }"
                    />
                  </div>
                  <span class="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-accent">
                    {{ formatPercent(row.metrics.recoveryRate) }}
                  </span>
                </div>
              </td>
              <td class="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text-secondary">
                {{ formatCurrency(row.campaign.investment) }}
              </td>
              <td class="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text-primary">
                {{ formatCurrency(row.metrics.accumulatedRake) }}
              </td>
              <td class="hidden whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text-secondary md:table-cell">
                {{ formatPercent(row.metrics.activationRate) }}
              </td>
              <td class="hidden py-2 pr-3 text-right tabular-nums text-text-secondary lg:table-cell">
                {{ row.campaign.capturedPlayers }}
              </td>
              <td class="hidden py-2 text-right tabular-nums text-text-secondary lg:table-cell">
                {{ row.campaign.activePlayers }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="py-3 text-sm text-text-muted">
        Nenhuma campanha nos filtros atuais.
      </p>
    </section>

    <!-- Secundário: ativação + rake mensal (abaixo da dobra principal) -->
    <div class="grid gap-2.5 lg:grid-cols-2">
      <section class="panel-glass rounded-2xl p-2.5 sm:p-3">
        <h3 class="mb-2 text-sm font-semibold text-text-primary">
          Taxa de ativação
        </h3>
        <div v-if="activationRank.length" class="space-y-1.5">
          <div
            v-for="row in activationRank"
            :key="row.campaign.id"
            class="flex items-center gap-2"
          >
            <span class="w-24 shrink-0 truncate text-xs text-text-secondary sm:w-32">
              {{ row.campaign.name }}
            </span>
            <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-board/70">
              <div
                class="h-full rounded-full bg-accent/80"
                :style="{
                  width: `${Math.min(Math.max(row.metrics.activationRate ?? 0, 0), 100)}%`,
                }"
              />
            </div>
            <span class="w-14 shrink-0 text-right text-xs tabular-nums text-text-primary">
              {{ formatPercent(row.metrics.activationRate) }}
            </span>
          </div>
        </div>
        <p v-else class="text-sm text-text-muted">Sem dados.</p>
      </section>

      <section class="panel-glass rounded-2xl p-2.5 sm:p-3">
        <h3 class="mb-2 text-sm font-semibold text-text-primary">
          Rake mensal
        </h3>
        <div
          v-if="monthColumns.length && monthlyMatrix.length"
          class="overflow-x-auto"
        >
          <table class="min-w-full text-left text-xs">
            <thead>
              <tr class="text-text-muted">
                <th class="py-1 pr-3 font-medium">
                  Campanha
                </th>
                <th
                  v-for="col in monthColumns"
                  :key="col.key"
                  class="whitespace-nowrap px-2 py-1 text-right font-medium"
                  :title="col.full"
                >
                  {{ col.short }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in monthlyMatrix"
                :key="row.id"
                class="border-t border-border-subtle/40"
              >
                <td
                  class="max-w-[7rem] truncate py-1.5 pr-3 font-medium text-text-primary sm:max-w-[9rem]"
                >
                  {{ row.name }}
                </td>
                <td
                  v-for="cell in row.cells"
                  :key="cell.key"
                  class="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-text-secondary"
                >
                  {{
                    cell.value === null
                      ? '—'
                      : formatCurrency(cell.value).replace(/\s/g, '\u00a0')
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-sm text-text-muted">
          Sem lançamentos mensais ainda.
        </p>
      </section>
    </div>
  </div>
</template>
