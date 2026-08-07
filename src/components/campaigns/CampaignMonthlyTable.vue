<script setup lang="ts">
import { computed } from 'vue'
import { Pencil } from '@lucide/vue'
import type { Campaign, CampaignMonthlyResult } from '../../types/campaigns'
import { useBoardStore } from '../../stores/board'
import {
  formatCurrency,
  formatMonthYear,
  formatPercent,
} from '../../utils/campaignFormat'
import { calculateInvestmentRecovery } from '../../utils/campaignMetrics'

const props = defineProps<{
  campaign: Campaign
  results: CampaignMonthlyResult[]
}>()

const emit = defineEmits<{
  edit: [id: string]
}>()

const board = useBoardStore()

const rows = computed(() => {
  let accumulated = 0
  return props.results.map((result) => {
    accumulated += result.monthlyRake
    return {
      result,
      accumulated,
      recovery: calculateInvestmentRecovery(accumulated, props.campaign.investment),
      responsible:
        board.members.find((m) => m.id === result.createdBy)?.name ?? '—',
    }
  })
})
</script>

<template>
  <div class="panel-glass overflow-hidden rounded-2xl">
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-border-subtle bg-surface/60 text-xs uppercase tracking-wide text-text-muted">
          <tr>
            <th class="px-3 py-3 font-medium">Mês</th>
            <th class="px-3 py-3 font-medium text-right">Rake do mês</th>
            <th class="px-3 py-3 font-medium text-right">Rake acumulado</th>
            <th class="px-3 py-3 font-medium text-right">Ativos no mês</th>
            <th class="px-3 py-3 font-medium text-right">Recuperação</th>
            <th class="px-3 py-3 font-medium">Responsável</th>
            <th class="px-3 py-3 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.result.id"
            class="border-b border-border-subtle/60 hover:bg-surface/40"
          >
            <td class="whitespace-nowrap px-3 py-3 text-text-primary">
              {{
                formatMonthYear(row.result.referenceMonth, row.result.referenceYear)
              }}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-right tabular-nums">
              {{ formatCurrency(row.result.monthlyRake) }}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-right tabular-nums">
              {{ formatCurrency(row.accumulated) }}
            </td>
            <td class="px-3 py-3 text-right tabular-nums text-text-secondary">
              {{
                row.result.monthlyActivePlayers != null
                  ? row.result.monthlyActivePlayers
                  : '—'
              }}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-right tabular-nums">
              {{ formatPercent(row.recovery) }}
            </td>
            <td class="px-3 py-3 text-text-secondary">
              {{ row.responsible }}
            </td>
            <td class="px-3 py-3 text-right">
              <button
                type="button"
                class="rounded-lg p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
                title="Editar"
                @click="emit('edit', row.result.id)"
              >
                <Pencil :size="15" />
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="7" class="px-3 py-8 text-center text-sm text-text-muted">
              Nenhum lançamento mensal ainda.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
