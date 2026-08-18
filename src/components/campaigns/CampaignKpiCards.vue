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
    label: 'Rake das pagas',
    shortLabel: 'Rake pagas',
    icon: CircleDollarSign,
    format: 'currency',
  },
  {
    key: 'totalCaptured',
    label: 'Jogadores nas agências',
    shortLabel: 'Na agência',
    icon: Users,
    format: 'number',
  },
  {
    key: 'totalActive',
    label: 'Ativos únicos',
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
  <div class="grid grid-cols-2 gap-1.5 sm:gap-2 md:grid-cols-4 xl:grid-cols-8">
    <div
      v-for="card in cards"
      :key="card.key"
      class="panel-glass rounded-xl px-2.5 py-2 sm:px-3 sm:py-2.5"
    >
      <div class="flex items-center gap-1.5 text-text-muted">
        <component :is="card.icon" :size="12" class="shrink-0 text-accent" />
        <span class="truncate text-[10px] font-medium uppercase tracking-wide">
          <span class="xl:hidden">{{ card.shortLabel }}</span>
          <span class="hidden xl:inline">{{ card.shortLabel }}</span>
        </span>
      </div>
      <p class="mt-1 text-sm font-semibold tabular-nums leading-tight text-text-primary sm:text-base lg:text-lg">
        {{ display(kpis[card.key], card.format) }}
      </p>
      <p
        v-if="card.key === 'totalAccumulatedRake' && (kpis.organicAccumulatedRake ?? 0) > 0.009"
        class="mt-0.5 truncate text-[10px] text-text-muted"
      >
        Orgânicas {{ formatCurrency(kpis.organicAccumulatedRake) }}
      </p>
    </div>
  </div>
</template>
