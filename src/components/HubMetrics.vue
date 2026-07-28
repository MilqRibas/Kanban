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
  Math.max(1, ...chartBars.value.map((bar) => bar.done)),
)

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
          {{ maxDone === 1 && chartBars.every((b) => b.done === 0) ? 0 : maxDone }}
        </p>
        <p class="mt-0.5 text-xs text-text-muted">máx. no gráfico</p>
      </div>
    </div>

    <div class="panel-glass rounded-2xl p-4 sm:p-5">
      <div class="mb-4 flex items-center justify-between gap-2">
        <h4 class="text-sm font-semibold text-text-primary">
          {{ chartTitle }}
        </h4>
        <p class="text-[11px] text-text-muted">
          <span class="inline-block size-2 rounded-full bg-accent align-middle" />
          concluídas
        </p>
      </div>

      <div
        class="flex h-44 items-end gap-1.5 sm:h-52 sm:gap-2"
        role="img"
        :aria-label="chartTitle"
      >
        <div
          v-for="bar in chartBars"
          :key="bar.key"
          class="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
        >
          <span
            class="text-[10px] font-medium tabular-nums text-text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:text-[11px]"
          >
            {{ bar.done }}
          </span>
          <div
            class="relative flex w-full max-w-[2.75rem] flex-1 items-end justify-center"
          >
            <div
              class="w-full rounded-t-md bg-accent/85 transition-[height] duration-300 ease-out group-hover:bg-accent"
              :style="{
                height: `${Math.max(bar.done ? 8 : 2, (bar.done / maxDone) * 100)}%`,
              }"
              :title="`${bar.label}: ${bar.done}/${bar.total} (${bar.percent}%)`"
            />
          </div>
          <div class="text-center leading-tight">
            <p class="truncate text-[10px] font-medium capitalize text-text-secondary sm:text-[11px]">
              {{ bar.label }}
            </p>
            <p
              v-if="bar.sublabel"
              class="truncate text-[9px] text-text-muted sm:text-[10px]"
            >
              {{ bar.sublabel }}
            </p>
          </div>
        </div>
      </div>

      <p
        v-if="rangeTotals.total === 0 && todayStats.total === 0"
        class="mt-4 text-center text-xs text-text-muted"
      >
        Sem tarefas registradas neste período. Crie afazeres na aba Tarefas.
      </p>
    </div>
  </section>
</template>
