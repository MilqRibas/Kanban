<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Percent,
  TrendingUp,
  X,
} from '@lucide/vue'
import {
  entryProgress,
  leafTodos,
  parseDateKey,
  startOfWeek,
  toDateKey,
  useDailyStore,
} from '../stores/dailyTodos'
import { useBoardStore } from '../stores/board'

type MetricRange = 'daily' | 'weekly' | 'monthly'

const daily = useDailyStore()
const board = useBoardStore()
const range = ref<MetricRange>('daily')

/** Filtro por calendário: intervalo inclusivo (YYYY-MM-DD) */
const filterFrom = ref<string | null>(null)
const filterTo = ref<string | null>(null)
const rangePickStep = ref<'from' | 'to'>('from')
const calendarMonth = ref(startOfMonth(new Date()))

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

const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function daysBetween(fromKey: string, toKey: string) {
  const from = parseDateKey(fromKey)
  const to = parseDateKey(toKey)
  return Math.round((to.getTime() - from.getTime()) / 86400000)
}

function eachDateKey(fromKey: string, toKey: string) {
  const keys: string[] = []
  let cursor = parseDateKey(fromKey)
  const end = parseDateKey(toKey)
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toDateKey(cursor))
    cursor = addDays(cursor, 1)
  }
  return keys
}

function formatShort(dateKey: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(parseDateKey(dateKey))
}

function formatDayMonth(dateKey: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(parseDateKey(dateKey))
}

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

const hasCustomRange = computed(
  () => Boolean(filterFrom.value && filterTo.value),
)

const effectiveRange = computed(() => {
  if (filterFrom.value && filterTo.value) {
    return { from: filterFrom.value, to: filterTo.value }
  }
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  if (range.value === 'daily') {
    return {
      from: toDateKey(addDays(today, -6)),
      to: toDateKey(today),
    }
  }
  if (range.value === 'weekly') {
    const thisWeekStart = startOfWeek(today)
    return {
      from: toDateKey(addDays(thisWeekStart, -7 * 7)),
      to: toDateKey(addDays(thisWeekStart, 6)),
    }
  }
  const monthAnchor = startOfMonth(today)
  const fromMonth = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth() - 5,
    1,
  )
  return {
    from: toDateKey(fromMonth),
    to: toDateKey(endOfMonth(monthAnchor)),
  }
})

const todayKey = computed(() => toDateKey(new Date()))

type ChartBar = {
  key: string
  label: string
  sublabel?: string
  done: number
  total: number
  percent: number
}

const chartBars = computed((): ChartBar[] => {
  const { from, to } = effectiveRange.value
  const keys = eachDateKey(from, to)

  if (range.value === 'daily') {
    const slice = keys.length > 31 ? keys.slice(-31) : keys
    return slice.map((key) => {
      const date = parseDateKey(key)
      const stats = byDate.value.get(key) ?? { done: 0, total: 0 }
      return {
        key,
        label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(
          date,
        ),
        sublabel: new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        }).format(date),
        done: stats.done,
        total: stats.total,
        percent: stats.total
          ? Math.round((stats.done / stats.total) * 100)
          : 0,
      }
    })
  }

  if (range.value === 'weekly') {
    const weekMap = new Map<
      string,
      { done: number; total: number; start: Date }
    >()
    for (const key of keys) {
      const date = parseDateKey(key)
      const weekStart = startOfWeek(date)
      const weekKey = toDateKey(weekStart)
      const stats = byDate.value.get(key)
      const current = weekMap.get(weekKey) ?? {
        done: 0,
        total: 0,
        start: weekStart,
      }
      if (stats) {
        current.done += stats.done
        current.total += stats.total
      }
      weekMap.set(weekKey, current)
    }
    return [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, stats]) => {
        const weekEnd = addDays(stats.start, 6)
        return {
          key,
          label: `${stats.start.getDate()}/${stats.start.getMonth() + 1}`,
          sublabel: `– ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`,
          done: stats.done,
          total: stats.total,
          percent: stats.total
            ? Math.round((stats.done / stats.total) * 100)
            : 0,
        }
      })
  }

  const monthMap = new Map<
    string,
    { done: number; total: number; start: Date }
  >()
  for (const key of keys) {
    const date = parseDateKey(key)
    const monthStart = startOfMonth(date)
    const monthKey = toDateKey(monthStart)
    const stats = byDate.value.get(key)
    const current = monthMap.get(monthKey) ?? {
      done: 0,
      total: 0,
      start: monthStart,
    }
    if (stats) {
      current.done += stats.done
      current.total += stats.total
    }
    monthMap.set(monthKey, current)
  }
  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, stats]) => ({
      key,
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(
        stats.start,
      ),
      sublabel: String(stats.start.getFullYear()),
      done: stats.done,
      total: stats.total,
      percent: stats.total
        ? Math.round((stats.done / stats.total) * 100)
        : 0,
    }))
})

const rangeTotals = computed(() => {
  let done = 0
  let total = 0
  for (const key of eachDateKey(
    effectiveRange.value.from,
    effectiveRange.value.to,
  )) {
    const stats = byDate.value.get(key)
    if (!stats) continue
    done += stats.done
    total += stats.total
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
  if (peak <= 4) return 4
  if (peak <= 8) return 8
  if (peak <= 12) return 12
  if (peak <= 20) return Math.ceil(peak / 5) * 5
  return Math.ceil(peak / 10) * 10
})

const chartSvg = computed(() => {
  const bars = chartBars.value
  const n = Math.max(bars.length, 1)
  const width = Math.min(720, Math.max(280, n * 68 + 56))
  const height = 260
  const pad = { top: 28, right: 12, bottom: 48, left: 32 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const maxY = chartScale.value
  const slot = plotW / n
  const barW = Math.min(44, Math.max(20, slot * 0.64))
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
        totalH: Math.max(totalH, bar.total > 0 ? 6 : 0),
        doneY: pad.top + plotH - doneH,
        doneH: Math.max(doneH, bar.done > 0 ? 6 : 0),
        valueY: pad.top + plotH - Math.max(doneH, totalH) - 10,
      }
    }),
  }
})

const chartTitle = computed(() => {
  if (hasCustomRange.value) {
    const span = daysBetween(filterFrom.value!, filterTo.value!) + 1
    if (filterFrom.value === filterTo.value) {
      return `Concluídas em ${formatDayMonth(filterFrom.value!)}`
    }
    return `${formatShort(filterFrom.value!)} – ${formatShort(filterTo.value!)} · ${span} dias`
  }
  if (range.value === 'daily') return 'Últimos 7 dias'
  if (range.value === 'weekly') return 'Últimas 8 semanas'
  return 'Últimos 6 meses'
})

const memberCount = computed(() => board.members.length)

const periodHint = computed(() => {
  if (hasCustomRange.value) return 'Período'
  if (range.value === 'daily') return 'Hoje'
  return 'Período'
})

const focusDayKey = computed((): string => {
  if (
    hasCustomRange.value &&
    filterFrom.value &&
    filterFrom.value === filterTo.value
  ) {
    return filterFrom.value
  }
  return todayKey.value
})

const focusDayStats = computed(() => {
  const stats = byDate.value.get(focusDayKey.value) ?? { done: 0, total: 0 }
  return {
    done: stats.done,
    total: stats.total,
    percent: stats.total ? Math.round((stats.done / stats.total) * 100) : 0,
  }
})

const completedTasks = computed(() => {
  const { from, to } = effectiveRange.value
  const items: {
    id: string
    text: string
    dateKey: string
    memberName: string
  }[] = []

  for (const entry of daily.entries) {
    if (entry.dateKey < from || entry.dateKey > to) continue
    const member = board.getMemberById(entry.memberId)
    for (const todo of leafTodos(entry.todos)) {
      if (!todo.completed || !todo.text.trim()) continue
      items.push({
        id: `${entry.id}-${todo.id}`,
        text: todo.text.trim(),
        dateKey: entry.dateKey,
        memberName: member?.name ?? 'Membro',
      })
    }
  }

  return items.sort((a, b) => b.dateKey.localeCompare(a.dateKey))
})

const calendarMonthLabel = computed(() =>
  new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(calendarMonth.value),
)

const calendarDays = computed(() => {
  const year = calendarMonth.value.getFullYear()
  const month = calendarMonth.value.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: {
    day: number | null
    dateKey: string | null
    isToday: boolean
    inRange: boolean
    isEdge: boolean
    done: number
  }[] = []

  for (let i = 0; i < firstDay; i++) {
    cells.push({
      day: null,
      dateKey: null,
      isToday: false,
      inRange: false,
      isEdge: false,
      done: 0,
    })
  }

  const from = filterFrom.value
  const to = filterTo.value
  const today = todayKey.value

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const inRange = Boolean(from && to && dateKey >= from && dateKey <= to)
    const isEdge = dateKey === from || dateKey === to
    cells.push({
      day,
      dateKey,
      isToday: dateKey === today,
      inRange,
      isEdge,
      done: byDate.value.get(dateKey)?.done ?? 0,
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      day: null,
      dateKey: null,
      isToday: false,
      inRange: false,
      isEdge: false,
      done: 0,
    })
  }

  return cells
})

const hasChartData = computed(() =>
  chartBars.value.some((bar) => bar.total > 0 || bar.done > 0),
)

const pickHint = computed(() => {
  if (!hasCustomRange.value && rangePickStep.value === 'from') {
    return 'Selecione o dia inicial'
  }
  if (rangePickStep.value === 'to') {
    return 'Agora o dia final'
  }
  if (filterFrom.value && filterTo.value) {
    if (filterFrom.value === filterTo.value) {
      return `Filtrando ${formatDayMonth(filterFrom.value)}`
    }
    return `${formatShort(filterFrom.value)} → ${formatShort(filterTo.value)}`
  }
  return 'Selecione um período'
})

function prevMonth() {
  calendarMonth.value = new Date(
    calendarMonth.value.getFullYear(),
    calendarMonth.value.getMonth() - 1,
    1,
  )
}

function nextMonth() {
  calendarMonth.value = new Date(
    calendarMonth.value.getFullYear(),
    calendarMonth.value.getMonth() + 1,
    1,
  )
}

function pickDay(dateKey: string | null) {
  if (!dateKey) return

  if (rangePickStep.value === 'from' || !filterFrom.value) {
    filterFrom.value = dateKey
    filterTo.value = dateKey
    rangePickStep.value = 'to'
    return
  }

  if (dateKey < filterFrom.value) {
    filterTo.value = filterFrom.value
    filterFrom.value = dateKey
  } else {
    filterTo.value = dateKey
  }
  rangePickStep.value = 'from'
}

function clearFilter() {
  filterFrom.value = null
  filterTo.value = null
  rangePickStep.value = 'from'
}

function goToday() {
  const key = todayKey.value
  filterFrom.value = key
  filterTo.value = key
  rangePickStep.value = 'from'
  calendarMonth.value = startOfMonth(new Date())
}
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
          Filtre pelo calendário e veja o que o time concluiu
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
          <CheckCircle2 :size="14" class="text-accent" />
          <span class="text-[11px] font-medium uppercase tracking-wide">
            {{ periodHint === 'Hoje' ? 'Hoje' : 'Concluídas' }}
          </span>
        </div>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
          {{ periodHint === 'Hoje' ? focusDayStats.done : rangeTotals.done }}
        </p>
        <p class="mt-0.5 text-xs text-text-muted">
          de
          {{ periodHint === 'Hoje' ? focusDayStats.total : rangeTotals.total }}
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
          {{
            periodHint === 'Hoje'
              ? focusDayStats.percent
              : rangeTotals.percent
          }}%
        </p>
        <p class="mt-0.5 text-xs text-text-muted">conclusão</p>
      </div>

      <div class="panel-glass rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div class="flex items-center gap-2 text-text-muted">
          <ListChecks :size="14" class="text-accent" />
          <span class="text-[11px] font-medium uppercase tracking-wide">
            Pendentes
          </span>
        </div>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
          {{
            periodHint === 'Hoje'
              ? Math.max(0, focusDayStats.total - focusDayStats.done)
              : Math.max(0, rangeTotals.total - rangeTotals.done)
          }}
        </p>
        <p class="mt-0.5 text-xs text-text-muted">ainda abertas</p>
      </div>

      <div class="panel-glass rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div class="flex items-center gap-2 text-text-muted">
          <TrendingUp :size="14" class="text-accent" />
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

    <!-- Calendário + gráfico lado a lado -->
    <div class="grid gap-3 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
      <div class="panel-glass rounded-2xl p-3.5 sm:p-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
            aria-label="Mês anterior"
            @click="prevMonth"
          >
            <ChevronLeft :size="16" />
          </button>
          <p class="text-sm font-semibold capitalize text-text-primary">
            {{ calendarMonthLabel }}
          </p>
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
            aria-label="Próximo mês"
            @click="nextMonth"
          >
            <ChevronRight :size="16" />
          </button>
        </div>

        <p class="mb-2 text-center text-[11px] text-text-muted">
          {{ pickHint }}
        </p>

        <div class="mb-1 grid grid-cols-7 gap-0.5">
          <span
            v-for="(day, i) in weekDays"
            :key="`${day}-${i}`"
            class="py-1 text-center text-[10px] font-medium text-text-muted"
          >
            {{ day }}
          </span>
        </div>

        <div class="grid grid-cols-7 gap-0.5">
          <button
            v-for="(cell, index) in calendarDays"
            :key="index"
            type="button"
            :disabled="!cell.dateKey"
            :class="[
              'relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-colors',
              !cell.dateKey
                ? 'pointer-events-none'
                : cell.isEdge
                  ? 'bg-accent font-semibold text-board'
                  : cell.inRange
                    ? 'bg-accent/20 text-text-primary'
                    : cell.isToday
                      ? 'ring-1 ring-accent/50 text-text-primary'
                      : 'text-text-secondary hover:bg-white/10 hover:text-text-primary',
            ]"
            @click="pickDay(cell.dateKey)"
          >
            <span v-if="cell.day">{{ cell.day }}</span>
            <span
              v-if="cell.done > 0"
              :class="[
                'mt-0.5 size-1 rounded-full',
                cell.isEdge ? 'bg-board/80' : 'bg-accent',
              ]"
            />
          </button>
        </div>

        <div class="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-xs text-text-secondary hover:bg-white/10 hover:text-text-primary"
            @click="goToday"
          >
            Hoje
          </button>
          <button
            v-if="hasCustomRange"
            type="button"
            class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-white/10 hover:text-text-primary"
            @click="clearFilter"
          >
            <X :size="12" />
            Limpar
          </button>
        </div>
      </div>

      <div class="panel-glass flex min-w-0 flex-col rounded-2xl p-4 sm:p-5">
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

        <div
          class="relative flex min-h-0 flex-1 items-center justify-center overflow-x-auto"
          role="img"
          :aria-label="chartTitle"
        >
          <svg
            class="mx-auto block h-[14rem] w-full sm:h-[15.5rem]"
            :style="{ maxWidth: `${chartSvg.width}px` }"
            :viewBox="`0 0 ${chartSvg.width} ${chartSvg.height}`"
            preserveAspectRatio="xMidYMid meet"
          >
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

            <g v-for="bar in chartSvg.bars" :key="bar.key">
              <rect
                v-if="bar.totalH > 0"
                :x="bar.x"
                :y="bar.totalY"
                :width="bar.barW"
                :height="bar.totalH"
                rx="7"
                ry="7"
                fill="rgba(255,255,255,0.1)"
              />
              <rect
                v-if="bar.doneH > 0"
                :x="bar.x"
                :y="bar.doneY"
                :width="bar.barW"
                :height="bar.doneH"
                rx="7"
                ry="7"
                fill="#39bcff"
              >
                <title>
                  {{ bar.label }}: {{ bar.done }}/{{ bar.total }} ({{
                    bar.percent
                  }}%)
                </title>
              </rect>
              <rect
                v-if="bar.totalH === 0 && bar.doneH === 0"
                :x="bar.x"
                :y="chartSvg.pad.top + chartSvg.plotH - 5"
                :width="bar.barW"
                height="5"
                rx="2.5"
                ry="2.5"
                fill="rgba(255,255,255,0.06)"
              />
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
          class="mt-2 text-center text-xs text-text-muted"
        >
          Sem tarefas neste período. Crie afazeres na aba Tarefas.
        </p>
      </div>
    </div>

    <div
      v-if="completedTasks.length"
      class="panel-glass rounded-2xl p-4 sm:p-5"
    >
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h4 class="text-sm font-semibold text-text-primary">
          Tarefas realizadas
        </h4>
        <span class="text-xs text-text-muted">
          {{ completedTasks.length }}
          {{ completedTasks.length === 1 ? 'item' : 'itens' }}
        </span>
      </div>
      <ul class="max-h-56 space-y-1.5 overflow-y-auto">
        <li
          v-for="task in completedTasks"
          :key="task.id"
          class="flex items-start gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-white/5"
        >
          <CheckCircle2 :size="15" class="mt-0.5 shrink-0 text-success" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-text-primary">{{ task.text }}</p>
            <p class="mt-0.5 text-[11px] text-text-muted">
              {{ formatShort(task.dateKey) }} · {{ task.memberName }}
            </p>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
