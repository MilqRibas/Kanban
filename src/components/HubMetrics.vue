<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CheckCircle2,
  ListChecks,
  Percent,
  TrendingUp,
} from '@lucide/vue'
import {
  entryProgress,
  startOfWeek,
  toDateKey,
  useDailyStore,
} from '../stores/dailyTodos'
import { useBoardStore } from '../stores/board'

type MetricRange = 'daily' | 'weekly' | 'monthly'

const daily = useDailyStore()
const board = useBoardStore()
const range = ref<MetricRange>('daily')

onMounted(async () => {
  if (!daily.ready) {
    await daily.init()
    daily.sanitizeDetailMember()
  }
})

const ranges: { id: MetricRange; label: string }[] = [
  { id: 'daily', label: 'Diário' },
  { id: 'weekly', label: 'Semanal' },
  { id: 'monthly', label: 'Mensal' },
]

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/** Agrega done/total por dateKey (só entradas com tarefas) */
const byDate = computed(() => {
  const map = new Map<string, { done: number; total: number }>()
  for (const entry of daily.entries) {
    const progress = entryProgress(entry)
    if (progress.total === 0) continue
    const current = map.get(entry.dateKey) ?? { done: 0, total: 0 }
    current.done += progress.done
    current.total += progress.total
    map.set(entry.dateKey, current)
  }
  return map
})

const todayKey = computed(() => toDateKey(new Date()))

const todayStats = computed(() => {
  const today = byDate.value.get(todayKey.value) ?? { done: 0, total: 0 }
  return {
    done: today.done,
    total: today.total,
    percent: today.total ? Math.round((today.done / today.total) * 100) : 0,
  }
})

type ChartBar = {
  key: string
  label: string
  sublabel?: string
  done: number
  total: number
  percent: number
}

const chartBars = computed((): ChartBar[] => {
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  if (range.value === 'daily') {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(today, index - 6)
      const key = toDateKey(date)
      const stats = byDate.value.get(key) ?? { done: 0, total: 0 }
      return {
        key,
        label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date),
        sublabel: new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        }).format(date),
        done: stats.done,
        total: stats.total,
        percent: stats.total ? Math.round((stats.done / stats.total) * 100) : 0,
      }
    })
  }

  if (range.value === 'weekly') {
    const thisWeekStart = startOfWeek(today)
    return Array.from({ length: 8 }, (_, index) => {
      const weekStart = addDays(thisWeekStart, (index - 7) * 7)
      let done = 0
      let total = 0
      for (let d = 0; d < 7; d++) {
        const key = toDateKey(addDays(weekStart, d))
        const stats = byDate.value.get(key)
        if (!stats) continue
        done += stats.done
        total += stats.total
      }
      const weekEnd = addDays(weekStart, 6)
      return {
        key: toDateKey(weekStart),
        label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
        sublabel: `– ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`,
        done,
        total,
        percent: total ? Math.round((done / total) * 100) : 0,
      }
    })
  }

  // monthly — últimos 6 meses
  const monthAnchor = startOfMonth(today)
  return Array.from({ length: 6 }, (_, index) => {
    const monthStart = new Date(
      monthAnchor.getFullYear(),
      monthAnchor.getMonth() - (5 - index),
      1,
    )
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    )
    let done = 0
    let total = 0
    for (let day = 1; day <= monthEnd.getDate(); day++) {
      const key = toDateKey(
        new Date(monthStart.getFullYear(), monthStart.getMonth(), day),
      )
      const stats = byDate.value.get(key)
      if (!stats) continue
      done += stats.done
      total += stats.total
    }
    return {
      key: toDateKey(monthStart),
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(
        monthStart,
      ),
      sublabel: String(monthStart.getFullYear()),
      done,
      total,
      percent: total ? Math.round((done / total) * 100) : 0,
    }
  })
})

const rangeTotals = computed(() => {
  let done = 0
  let total = 0
  for (const bar of chartBars.value) {
    done += bar.done
    total += bar.total
  }
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
  }
})

const maxDone = computed(() =>
  Math.max(0, ...chartBars.value.map((bar) => bar.done)),
)

const chartScale = computed(() => {
  const peak = Math.max(
    1,
    ...chartBars.value.map((bar) => Math.max(bar.done, bar.total)),
  )
  // Arredonda para escala legível (múltiplos de 2/5/10)
  if (peak <= 4) return 4
  if (peak <= 8) return 8
  if (peak <= 12) return 12
  if (peak <= 20) return Math.ceil(peak / 5) * 5
  return Math.ceil(peak / 10) * 10
})

const chartSvg = computed(() => {
  const bars = chartBars.value
  const n = Math.max(bars.length, 1)
  const width = 720
  const height = 240
  const pad = { top: 28, right: 16, bottom: 48, left: 40 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const maxY = chartScale.value
  const slot = plotW / n
  const barW = Math.min(42, Math.max(18, slot * 0.52))
  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((maxY * i) / tickCount),
  )

  return {
    width,
    height,
    pad,
    plotH,
    maxY,
    ticks,
    bars: bars.map((bar, index) => {
      const centerX = pad.left + slot * index + slot / 2
      const totalH = bar.total > 0 ? (bar.total / maxY) * plotH : 0
      const doneH = bar.done > 0 ? (bar.done / maxY) * plotH : 0
      return {
        ...bar,
        centerX,
        barW,
        x: centerX - barW / 2,
        totalY: pad.top + plotH - totalH,
        totalH: Math.max(totalH, bar.total > 0 ? 4 : 0),
        doneY: pad.top + plotH - doneH,
        doneH: Math.max(doneH, bar.done > 0 ? 4 : 0),
        valueY: pad.top + plotH - Math.max(doneH, totalH) - 8,
      }
    }),
  }
})

const chartTitle = computed(() => {
  if (range.value === 'daily') return 'Concluídas nos últimos 7 dias'
  if (range.value === 'weekly') return 'Concluídas nas últimas 8 semanas'
  return 'Concluídas nos últimos 6 meses'
})

const memberCount = computed(() => board.members.length)

const periodHint = computed(() => {
  if (range.value === 'daily') return 'Hoje'
  if (range.value === 'weekly') return 'Período'
  return 'Período'
})

const hasChartData = computed(() =>
  chartBars.value.some((bar) => bar.total > 0 || bar.done > 0),
)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-wide text-accent/90">
          Produtividade
        </p>
        <h3 class="mt-0.5 text-lg font-semibold tracking-tight text-text-primary">
          Tarefas concluídas
        </h3>
        <p class="mt-1 text-sm text-text-muted">
          Com base nos afazeres diários do time
          <span v-if="memberCount"> · {{ memberCount }} membros</span>
        </p>
      </div>

      <div class="flex rounded-xl border border-border-subtle/70 bg-board-elevated/90 p-1">
        <button
          v-for="item in ranges"
          :key="item.id"
          type="button"
          :class="[
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            range === item.id
              ? 'bg-surface text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          ]"
          @click="range = item.id"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <div class="panel-glass rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div class="flex items-center gap-2 text-text-muted">
          <CheckCircle2 :size="14" class="text-success" />
          <span class="text-[11px] font-medium uppercase tracking-wide">
            {{ periodHint === 'Hoje' ? 'Hoje' : 'Concluídas' }}
          </span>
        </div>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
          {{ range === 'daily' ? todayStats.done : rangeTotals.done }}
        </p>
        <p class="mt-0.5 text-xs text-text-muted">
          de
          {{ range === 'daily' ? todayStats.total : rangeTotals.total }}
          tarefas
        </p>
      </div>

      <div class="panel-glass rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div class="flex items-center gap-2 text-text-muted">
          <Percent :size="14" class="text-accent" />
          <span class="text-[11px] font-medium uppercase tracking-wide">
            Taxa
          </span>
        </div>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
          {{ range === 'daily' ? todayStats.percent : rangeTotals.percent }}%
        </p>
        <p class="mt-0.5 text-xs text-text-muted">conclusão</p>
      </div>

      <div class="panel-glass rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div class="flex items-center gap-2 text-text-muted">
          <ListChecks :size="14" class="text-amber-300" />
          <span class="text-[11px] font-medium uppercase tracking-wide">
            Pendentes
          </span>
        </div>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
          {{
            range === 'daily'
              ? Math.max(0, todayStats.total - todayStats.done)
              : Math.max(0, rangeTotals.total - rangeTotals.done)
          }}
        </p>
        <p class="mt-0.5 text-xs text-text-muted">ainda abertas</p>
      </div>

      <div class="panel-glass rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div class="flex items-center gap-2 text-text-muted">
          <TrendingUp :size="14" class="text-sky-300" />
          <span class="text-[11px] font-medium uppercase tracking-wide">
            Pico
          </span>
        </div>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
          {{ maxDone }}
        </p>
        <p class="mt-0.5 text-xs text-text-muted">máx. no gráfico</p>
      </div>
    </div>

    <div class="panel-glass rounded-2xl p-4 sm:p-5">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-sm font-semibold text-text-primary">
          {{ chartTitle }}
        </h4>
        <div class="flex items-center gap-3 text-[11px] text-text-muted">
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block size-2.5 rounded-sm bg-white/15" />
            total
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block size-2.5 rounded-sm bg-accent" />
            concluídas
          </span>
        </div>
      </div>

      <div class="relative w-full overflow-hidden" role="img" :aria-label="chartTitle">
        <svg
          class="h-56 w-full sm:h-64"
          :viewBox="`0 0 ${chartSvg.width} ${chartSvg.height}`"
          preserveAspectRatio="xMidYMid meet"
        >
          <!-- Grade horizontal -->
          <g>
            <line
              v-for="tick in chartSvg.ticks"
              :key="`grid-${tick}`"
              :x1="chartSvg.pad.left"
              :x2="chartSvg.width - chartSvg.pad.right"
              :y1="
                chartSvg.pad.top +
                chartSvg.plotH -
                (tick / chartSvg.maxY) * chartSvg.plotH
              "
              :y2="
                chartSvg.pad.top +
                chartSvg.plotH -
                (tick / chartSvg.maxY) * chartSvg.plotH
              "
              stroke="rgba(255,255,255,0.06)"
              stroke-width="1"
            />
            <text
              v-for="tick in chartSvg.ticks"
              :key="`label-${tick}`"
              :x="chartSvg.pad.left - 8"
              :y="
                chartSvg.pad.top +
                chartSvg.plotH -
                (tick / chartSvg.maxY) * chartSvg.plotH +
                4
              "
              text-anchor="end"
              fill="#7d90a4"
              font-size="11"
            >
              {{ tick }}
            </text>
          </g>

          <!-- Barras -->
          <g v-for="bar in chartSvg.bars" :key="bar.key">
            <!-- Total (fundo) -->
            <rect
              v-if="bar.totalH > 0"
              :x="bar.x"
              :y="bar.totalY"
              :width="bar.barW"
              :height="bar.totalH"
              rx="6"
              ry="6"
              fill="rgba(255,255,255,0.1)"
            />
            <!-- Concluídas -->
            <rect
              v-if="bar.doneH > 0"
              :x="bar.x"
              :y="bar.doneY"
              :width="bar.barW"
              :height="bar.doneH"
              rx="6"
              ry="6"
              fill="#39bcff"
            >
              <title>
                {{ bar.label }}: {{ bar.done }}/{{ bar.total }} ({{ bar.percent }}%)
              </title>
            </rect>
            <!-- Placeholder quando vazio -->
            <rect
              v-if="bar.totalH === 0 && bar.doneH === 0"
              :x="bar.x"
              :y="chartSvg.pad.top + chartSvg.plotH - 4"
              :width="bar.barW"
              height="4"
              rx="2"
              ry="2"
              fill="rgba(255,255,255,0.06)"
            />
            <!-- Valor no topo -->
            <text
              v-if="bar.done > 0"
              :x="bar.centerX"
              :y="bar.valueY"
              text-anchor="middle"
              fill="#a8b9cb"
              font-size="11"
              font-weight="600"
            >
              {{ bar.done }}
            </text>
            <!-- Labels do eixo X -->
            <text
              :x="bar.centerX"
              :y="chartSvg.height - 22"
              text-anchor="middle"
              fill="#a8b9cb"
              font-size="11"
              class="capitalize"
            >
              {{ bar.label }}
            </text>
            <text
              v-if="bar.sublabel"
              :x="bar.centerX"
              :y="chartSvg.height - 8"
              text-anchor="middle"
              fill="#7d90a4"
              font-size="10"
            >
              {{ bar.sublabel }}
            </text>
          </g>
        </svg>
      </div>

      <p
        v-if="!hasChartData"
        class="mt-1 text-center text-xs text-text-muted"
      >
        Sem tarefas registradas neste período. Crie afazeres na aba Tarefas.
      </p>
    </div>
  </section>
</template>
