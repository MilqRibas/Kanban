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
  Layers,
} from '@lucide/vue'
import type { OverviewKpis } from '../../utils/campaignMetrics'
import { LEAGUE_FEE_RATE } from '../../utils/crmIncentiveEconomics'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/campaignFormat'

defineProps<{
  kpis: OverviewKpis
  slotRake: number
  slotPeriodLabel: string
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

function cardHint(card: (typeof cards)[number], kpis: OverviewKpis): string {
  if (card.key === 'totalAccumulatedRake') {
    const liquid = formatCurrency((kpis.totalAccumulatedRake || 0) * (1 - LEAGUE_FEE_RATE))
    if ((kpis.organicAccumulatedRake ?? 0) > 0.009) {
      return `Líquido ${liquid} · Org. ${formatCurrency(kpis.organicAccumulatedRake)}`
    }
    return `Líquido ${liquid}`
  }
  if (card.key === 'recoveryRate') return 'Base líquida (−18% liga)'
  return '\u00a0'
}

/** Bordas internas: 2 colunas no celular, 5 a partir de sm. */
function kpiCellClass(visualIndex: number) {
  return [
    'border-border-subtle/70',
    visualIndex % 2 === 0 ? 'border-r' : 'border-r-0',
    visualIndex < 8 ? 'border-b' : 'border-b-0',
    visualIndex % 5 === 4 ? 'sm:border-r-0' : 'sm:border-r',
    visualIndex < 5 ? 'sm:border-b' : 'sm:border-b-0',
  ]
}

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
  <div class="panel-glass grid grid-cols-2 overflow-hidden rounded-2xl sm:grid-cols-5">
    <div
      class="min-w-0 px-3 py-2.5"
      :class="kpiCellClass(0)"
      title="Todo o rake do SX Club nas semanas do mês, com ou sem campanha. A semana entra no mês em que começa. Inclui Taxa Spin."
    >
      <div class="flex items-center gap-1.5 text-text-muted">
        <Layers :size="12" class="shrink-0 text-accent" />
        <span class="truncate text-[10px] font-medium uppercase tracking-wide">
          Rake do slot
        </span>
      </div>
      <p class="mt-1 truncate text-sm font-semibold tabular-nums leading-tight text-text-primary">
        {{ formatCurrency(slotRake) }}
      </p>
      <p class="mt-0.5 truncate text-[10px] text-text-muted">
        {{ slotPeriodLabel }}
      </p>
    </div>
    <div
      v-for="(card, index) in cards"
      :key="card.key"
      class="min-w-0 px-3 py-2.5"
      :class="kpiCellClass(index + 1)"
      :title="card.hint || card.label"
    >
      <div class="flex items-center gap-1.5 text-text-muted">
        <component :is="card.icon" :size="12" class="shrink-0 text-accent" />
        <span class="truncate text-[10px] font-medium uppercase tracking-wide">
          {{ card.shortLabel }}
        </span>
      </div>
      <p class="mt-1 truncate text-sm font-semibold tabular-nums leading-tight text-text-primary">
        {{ display(kpis[card.key], card.format) }}
      </p>
      <p class="mt-0.5 truncate text-[10px] text-text-muted">
        {{ cardHint(card, kpis) }}
      </p>
    </div>
  </div>
</template>
