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
  const maxMoney = Math.max(
    1,
    ...props.campaigns.map((c) => c.investment),
    ...props.campaigns.map((c) => {
      const m = buildCampaignMetrics(c, props.monthlyResults)
      return m.accumulatedRake
    }),
  )

  return [...props.campaigns]
    .map((campaign) => {
      const metrics = buildCampaignMetrics(campaign, props.monthlyResults)
      return {
        campaign,
        metrics,
        invWidth: (campaign.investment / maxMoney) * 100,
        rakeWidth: (metrics.accumulatedRake / maxMoney) * 100,
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
  <div class="space-y-3">
    <!-- Ranking principal: recuperação + investimento vs rake -->
    <section class="panel-glass rounded-2xl p-3 sm:p-4">
      <div class="mb-3">
        <h3 class="text-sm font-semibold text-text-primary">
          Desempenho por campanha
        </h3>
        <p class="mt-0.5 text-xs text-text-muted">
          Ordenado por recuperação do investimento
        </p>
      </div>

      <div v-if="rows.length" class="space-y-2.5">
        <article
          v-for="row in rows"
          :key="row.campaign.id"
          class="rounded-xl bg-surface/40 px-3 py-2.5 sm:px-3.5 sm:py-3"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-text-primary">
                {{ row.campaign.name }}
              </p>
              <div class="mt-1">
                <CampaignStatusBadge :status="row.metrics.status" />
              </div>
            </div>
            <p class="shrink-0 text-sm font-semibold tabular-nums text-accent">
              {{ formatPercent(row.metrics.recoveryRate) }}
            </p>
          </div>

          <div class="mt-2.5 space-y-1">
            <div class="flex justify-between gap-2 text-[11px] text-text-muted">
              <span>Recuperação</span>
              <span class="tabular-nums">
                {{ formatCurrency(row.metrics.accumulatedRake) }}
                /
                {{ formatCurrency(row.campaign.investment) }}
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-board/70">
              <div
                class="h-full rounded-full bg-accent transition-all"
                :style="{ width: `${row.recoveryWidth}%` }"
              />
            </div>
          </div>

          <div class="mt-2.5 space-y-1">
            <div class="flex justify-between gap-2 text-[11px] text-text-muted">
              <span class="inline-flex items-center gap-1.5">
                <span class="h-1.5 w-1.5 rounded-sm bg-text-muted/70" />
                Investimento
              </span>
              <span class="tabular-nums text-text-secondary">
                {{ formatCurrency(row.campaign.investment) }}
              </span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-board/70">
              <div
                class="h-full rounded-full bg-text-muted/55"
                :style="{ width: `${row.invWidth}%` }"
              />
            </div>
            <div class="flex justify-between gap-2 text-[11px] text-text-muted">
              <span class="inline-flex items-center gap-1.5">
                <span class="h-1.5 w-1.5 rounded-sm bg-accent/80" />
                Rake acumulado
              </span>
              <span class="tabular-nums text-text-secondary">
                {{ formatCurrency(row.metrics.accumulatedRake) }}
              </span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-board/70">
              <div
                class="h-full rounded-full bg-accent/75"
                :style="{ width: `${row.rakeWidth}%` }"
              />
            </div>
          </div>

          <div
            class="mt-2.5 grid grid-cols-3 gap-2 border-t border-border-subtle/50 pt-2 text-center"
          >
            <div>
              <p class="text-[10px] uppercase tracking-wide text-text-muted">
                Ativação
              </p>
              <p class="mt-0.5 text-xs font-medium tabular-nums text-text-primary">
                {{ formatPercent(row.metrics.activationRate) }}
              </p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wide text-text-muted">
                Captados
              </p>
              <p class="mt-0.5 text-xs font-medium tabular-nums text-text-primary">
                {{ row.campaign.capturedPlayers }}
              </p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wide text-text-muted">
                Ativos
              </p>
              <p class="mt-0.5 text-xs font-medium tabular-nums text-text-primary">
                {{ row.campaign.activePlayers }}
              </p>
            </div>
          </div>
        </article>
      </div>
      <p v-else class="text-sm text-text-muted">
        Nenhuma campanha nos filtros atuais.
      </p>
    </section>

    <div class="grid gap-3 md:grid-cols-2">
      <!-- Ativação -->
      <section class="panel-glass rounded-2xl p-3 sm:p-4">
        <h3 class="mb-2.5 text-sm font-semibold text-text-primary">
          Taxa de ativação
        </h3>
        <div v-if="activationRank.length" class="space-y-2">
          <div
            v-for="row in activationRank"
            :key="row.campaign.id"
            class="space-y-1"
          >
            <div class="flex items-center justify-between gap-2 text-xs">
              <span class="truncate text-text-secondary">{{ row.campaign.name }}</span>
              <span class="shrink-0 tabular-nums text-text-primary">
                {{ formatPercent(row.metrics.activationRate) }}
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-board/70">
              <div
                class="h-full rounded-full bg-accent/80"
                :style="{
                  width: `${Math.min(Math.max(row.metrics.activationRate ?? 0, 0), 100)}%`,
                }"
              />
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-text-muted">Sem dados.</p>
      </section>

      <!-- Rake mensal em tabela compacta -->
      <section class="panel-glass rounded-2xl p-3 sm:p-4">
        <h3 class="mb-2.5 text-sm font-semibold text-text-primary">
          Rake mensal
        </h3>
        <div
          v-if="monthColumns.length && monthlyMatrix.length"
          class="overflow-x-auto"
        >
          <table class="min-w-full text-left text-xs">
            <thead>
              <tr class="text-text-muted">
                <th class="sticky left-0 bg-board-elevated/95 py-1.5 pr-3 font-medium">
                  Campanha
                </th>
                <th
                  v-for="col in monthColumns"
                  :key="col.key"
                  class="whitespace-nowrap px-2 py-1.5 text-right font-medium"
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
                  class="sticky left-0 max-w-[7rem] truncate bg-board-elevated/95 py-2 pr-3 font-medium text-text-primary sm:max-w-[9rem]"
                >
                  {{ row.name }}
                </td>
                <td
                  v-for="cell in row.cells"
                  :key="cell.key"
                  class="whitespace-nowrap px-2 py-2 text-right tabular-nums text-text-secondary"
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
