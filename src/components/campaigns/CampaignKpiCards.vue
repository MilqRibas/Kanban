<script setup lang="ts">
import type { Component } from 'vue'
import {
  Activity,
  Banknote,
  CircleDollarSign,
  Percent,
  Target,
  TrendingUp,
  Users,
  UserCheck,
} from '@lucide/vue'
import type { OverviewKpis } from '../../utils/campaignMetrics'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/campaignFormat'

defineProps<{
  kpis: OverviewKpis
}>()

const cards: {
  key: keyof OverviewKpis
  label: string
  shortLabel: string
  icon: Component
  format: 'currency' | 'number' | 'percent' | 'count'
}[] = [
  {
    key: 'totalInvestment',
    label: 'Investimento total',
    shortLabel: 'Investimento',
    icon: Banknote,
    format: 'currency',
  },
  {
    key: 'totalAccumulatedRake',
    label: 'Rake acumulado',
    shortLabel: 'Rake acum.',
    icon: CircleDollarSign,
    format: 'currency',
  },
  {
    key: 'totalCaptured',
    label: 'Jogadores captados',
    shortLabel: 'Captados',
    icon: Users,
    format: 'number',
  },
  {
    key: 'totalActive',
    label: 'Jogadores ativos',
    shortLabel: 'Ativos',
    icon: UserCheck,
    format: 'number',
  },
  {
    key: 'activationRate',
    label: 'Taxa de ativação',
    shortLabel: 'Ativação',
    icon: Percent,
    format: 'percent',
  },
  {
    key: 'recoveryRate',
    label: 'Recuperação',
    shortLabel: 'Recuperação',
    icon: TrendingUp,
    format: 'percent',
  },
  {
    key: 'paybackCount',
    label: 'Com payback',
    shortLabel: 'Payback',
    icon: Target,
    format: 'count',
  },
  {
    key: 'costPerActive',
    label: 'Custo por ativo',
    shortLabel: 'Custo/ativo',
    icon: Activity,
    format: 'currency',
  },
]

function display(value: number | null, format: (typeof cards)[number]['format']) {
  if (format === 'currency') return formatCurrency(value)
  if (format === 'percent') return formatPercent(value)
  if (format === 'count') return formatNumber(value ?? 0)
  return formatNumber(value)
}
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-4">
    <div
      v-for="card in cards"
      :key="card.key"
      class="panel-glass rounded-xl px-2.5 py-2.5 sm:rounded-2xl sm:px-3.5 sm:py-3"
    >
      <div class="flex items-center gap-1.5 text-text-muted">
        <component :is="card.icon" :size="13" class="text-accent" />
        <span class="truncate text-[10px] font-medium uppercase tracking-wide sm:text-[11px]">
          <span class="sm:hidden">{{ card.shortLabel }}</span>
          <span class="hidden sm:inline">{{ card.label }}</span>
        </span>
      </div>
      <p
        class="mt-1.5 text-base font-semibold tabular-nums leading-tight text-text-primary sm:mt-2 sm:text-xl md:text-2xl"
      >
        {{ display(kpis[card.key], card.format) }}
      </p>
    </div>
  </div>
</template>
