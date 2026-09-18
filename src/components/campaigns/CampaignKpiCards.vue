<script setup lang="ts">
import type { Component } from 'vue'
import {
  Activity,
  Banknote,
  CircleDollarSign,
  Clock,
  Percent,
  Target,
  TrendingUp,
  Users,
  UserCheck,
} from '@lucide/vue'
import type { OverviewKpis } from '../../utils/campaignMetrics'
import { LEAGUE_FEE_RATE } from '../../utils/crmIncentiveEconomics'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/campaignFormat'

defineProps<{
  kpis: OverviewKpis
}>()

const cards: {
  key: keyof OverviewKpis
  label: string
  shortLabel: string
  icon: Component
  format: 'currency' | 'number' | 'percent' | 'count' | 'days'
  hint?: string
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
    label: 'Rake bruto',
    shortLabel: 'Rake bruto',
    icon: CircleDollarSign,
    format: 'currency',
    hint: 'Fato importado · recuperação usa líquido (−18%)',
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
    shortLabel: '% Ativação',
    icon: Percent,
    format: 'percent',
  },
  {
    key: 'recoveryRate',
    label: 'Recuperação líquida',
    shortLabel: '% Recuperação',
    icon: TrendingUp,
    format: 'percent',
    hint: 'Rake líquido ÷ (investimento + ativação)',
  },
  {
    key: 'paybackCount',
    label: 'Com payback',
    shortLabel: 'Payback',
    icon: Target,
    format: 'count',
  },
  {
    key: 'averagePaybackDays',
    label: 'Tempo de payback médio',
    shortLabel: 'Payback médio',
    icon: Clock,
    format: 'days',
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
  if (format === 'days') {
    if (value == null || !Number.isFinite(value)) return '—'
    return `${formatNumber(value)} dias`
  }
  if (format === 'count') return formatNumber(value ?? 0)
  return formatNumber(value)
}
</script>

<template>
  <div class="grid grid-cols-2 gap-1.5 sm:gap-2 md:grid-cols-3 xl:grid-cols-9">
    <div
      v-for="card in cards"
      :key="card.key"
      class="panel-glass rounded-xl px-2.5 py-2 sm:px-3 sm:py-2.5"
      :title="card.hint || card.label"
    >
      <div class="flex items-center gap-1.5 text-text-muted">
        <component :is="card.icon" :size="12" class="shrink-0 text-accent" />
        <span class="truncate text-[10px] font-medium uppercase tracking-wide">
          {{ card.shortLabel }}
        </span>
      </div>
      <p class="mt-1 text-sm font-semibold tabular-nums leading-tight text-text-primary sm:text-base lg:text-lg">
        {{ display(kpis[card.key], card.format) }}
      </p>
      <p
        v-if="card.key === 'totalAccumulatedRake'"
        class="mt-0.5 truncate text-[10px] text-text-muted"
      >
        Líquido {{ formatCurrency((kpis.totalAccumulatedRake || 0) * (1 - LEAGUE_FEE_RATE)) }}
        <span v-if="(kpis.organicAccumulatedRake ?? 0) > 0.009">
          · Org. {{ formatCurrency(kpis.organicAccumulatedRake) }}
        </span>
      </p>
      <p
        v-else-if="card.key === 'recoveryRate'"
        class="mt-0.5 truncate text-[10px] text-text-muted"
      >
        Base líquida (−18% liga)
      </p>
    </div>
  </div>
</template>
