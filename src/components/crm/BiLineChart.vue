<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatIsoDay } from '../../utils/biAnalytics'

export type ChartPoint = {
  label: string
  value: number | null
  end?: string
  partial?: boolean
  scope: string
  period: string
  display: string
}
export type ChartSeries = { id: string; label: string; color: string; metricLabel: string; points: ChartPoint[] }

const props = defineProps<{
  series: ChartSeries[]
}>()

const width = 720
const height = 208
const pad = { top: 8, right: 8, bottom: 22, left: 44 }

function tickLabel(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: value >= 100 ? 0 : 1 })
}

/** Curva monotônica no eixo X, no mesmo espírito do type="monotone". */
function monotonePath(points: { x: number; y: number }[]): string {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0]!.x},${points[0]!.y}`
  const count = points.length
  const delta: number[] = []
  const slope: number[] = []
  for (let index = 0; index < count - 1; index += 1) {
    delta[index] = points[index + 1]!.x - points[index]!.x || 1
    slope[index] = (points[index + 1]!.y - points[index]!.y) / delta[index]!
  }
  const tangent = Array.from({ length: count }, () => 0)
  tangent[0] = slope[0]!
  tangent[count - 1] = slope[count - 2]!
  for (let index = 1; index < count - 1; index += 1) {
    tangent[index] = slope[index - 1]! * slope[index]! <= 0 ? 0 : (slope[index - 1]! + slope[index]!) / 2
  }
  for (let index = 0; index < count - 1; index += 1) {
    if (Math.abs(slope[index]!) < 1e-6) {
      tangent[index] = 0
      tangent[index + 1] = 0
      continue
    }
    const left = tangent[index]! / slope[index]!
    const right = tangent[index + 1]! / slope[index]!
    const scale = Math.hypot(left, right)
    if (scale > 3) {
      const limit = 3 / scale
      tangent[index] = limit * left * slope[index]!
      tangent[index + 1] = limit * right * slope[index]!
    }
  }
  let path = `M ${points[0]!.x},${points[0]!.y}`
  for (let index = 0; index < count - 1; index += 1) {
    const start = points[index]!
    const end = points[index + 1]!
    const span = delta[index]!
    path += ` C ${start.x + span / 3},${start.y + (tangent[index]! * span) / 3} ${end.x - span / 3},${end.y - (tangent[index + 1]! * span) / 3} ${end.x},${end.y}`
  }
  return path
}

const layout = computed(() => {
  const series = props.series.filter((item) => item.points.length)
  const labels = series[0]?.points.map((point) => point.label) ?? []
  const values = series.flatMap((item) => item.points.map((point) => point.value)).filter((value): value is number => value != null)
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const xAt = (index: number) => {
    if (labels.length <= 1) return pad.left + plotW / 2
    return pad.left + (index / (labels.length - 1)) * plotW
  }
  const yAt = (value: number) => pad.top + ((max - value) / span) * plotH
  const ticks = Array.from({ length: 4 }, (_, index) => min + (span * (3 - index)) / 3)
  const lines = series.map((item) => {
    const runs: { d: string; area: string }[] = []
    let current: { index: number; value: number }[] = []
    const flush = () => {
      if (!current.length) return
      const coords = current.map((point) => ({ x: xAt(point.index), y: yAt(point.value) }))
      const line = monotonePath(coords)
      const last = coords[coords.length - 1]!
      const first = coords[0]!
      runs.push({
        d: line,
        area: `${line} L ${last.x},${yAt(0)} L ${first.x},${yAt(0)} Z`,
      })
      current = []
    }
    item.points.forEach((point, index) => {
      if (point.value == null) flush()
      else current.push({ index, value: point.value })
    })
    flush()
    return { ...item, runs }
  })
  return { labels, ticks, xAt, yAt, lines }
})

const hoverIndex = ref<number | null>(null)

const hover = computed(() => {
  const index = hoverIndex.value
  if (index == null || !layout.value.labels.length) return null
  const rows = layout.value.lines
    .map((line) => {
      const point = line.points[index]
      if (!point) return null
      const missing = point.value == null
      return {
        label: line.label,
        color: line.color,
        metric: line.metricLabel,
        scope: point.scope,
        period: point.period,
        display: missing ? 'Sem dados' : point.display,
        partial: Boolean(point.partial) && !missing,
        missing,
        x: layout.value.xAt(index),
        y: missing ? null : layout.value.yAt(point.value ?? 0),
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
  if (!rows.length) return null
  const anchor = rows.find((row) => row.y != null)?.y ?? pad.top + 24
  return {
    x: rows[0]!.x,
    metric: rows[0]!.metric,
    rows,
    anchor,
  }
})

const liveText = computed(() => {
  const current = hover.value
  if (!current) return ''
  return current.rows
    .map((row) => {
      const partial = row.partial ? ' Período parcial.' : ''
      return `${row.metric}. ${row.label}. ${row.scope}. ${row.period}. ${row.display}.${partial}`
    })
    .join(' ')
})

const tooltipShift = computed(() => {
  const x = hover.value?.x ?? 0
  if (x > width * 0.72) return 'translate(-100%, calc(-100% - 10px))'
  if (x < width * 0.28) return 'translate(0, calc(-100% - 10px))'
  return 'translate(-50%, calc(-100% - 10px))'
})

function indexAt(clientX: number, svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect()
  const viewX = ((clientX - rect.left) / rect.width) * width
  const labels = layout.value.labels
  if (!labels.length) return null
  let nearest = 0
  let best = Infinity
  labels.forEach((_, index) => {
    const distance = Math.abs(layout.value.xAt(index) - viewX)
    if (distance < best) {
      best = distance
      nearest = index
    }
  })
  return nearest
}

function onMove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  hoverIndex.value = indexAt(event.clientX, svg)
}

function onLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  hoverIndex.value = null
}

function onKey(event: KeyboardEvent) {
  const count = layout.value.labels.length
  if (!count) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    hoverIndex.value = Math.min(count - 1, (hoverIndex.value ?? -1) + 1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    hoverIndex.value = Math.max(0, (hoverIndex.value ?? 0) - 1)
  } else if (event.key === 'Escape' || event.key === 'Home') {
    event.preventDefault()
    hoverIndex.value = event.key === 'Home' ? 0 : null
  } else if (event.key === 'End') {
    event.preventDefault()
    hoverIndex.value = count - 1
  }
}
</script>

<template>
  <div class="relative h-52 w-full">
    <p class="sr-only" aria-live="polite">{{ liveText }}</p>
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="h-full w-full outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
      role="img"
      tabindex="0"
      aria-label="Gráfico de evolução. Use as setas para ler cada período."
      @pointermove="onMove"
      @pointerdown="onMove"
      @pointerleave="onLeave"
      @keydown="onKey"
      @blur="hoverIndex = null"
    >
      <defs>
        <linearGradient
          v-for="line in layout.lines"
          :id="`areaFade-${line.id}`"
          :key="`fill-${line.id}`"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" :stop-color="line.color" stop-opacity="0.3" />
          <stop offset="100%" :stop-color="line.color" stop-opacity="0" />
        </linearGradient>
      </defs>

      <line
        v-for="tick in layout.ticks"
        :key="tick"
        :x1="pad.left"
        :x2="width - pad.right"
        :y1="layout.yAt(tick)"
        :y2="layout.yAt(tick)"
        stroke="rgba(255,255,255,0.08)"
        stroke-dasharray="3 3"
      />
      <text
        v-for="tick in layout.ticks"
        :key="`t-${tick}`"
        :x="pad.left - 8"
        :y="layout.yAt(tick) + 3"
        text-anchor="end"
        fill="#7d90a4"
        font-size="10"
      >
        {{ tickLabel(tick) }}
      </text>
      <text
        v-for="(label, index) in layout.labels"
        v-show="index % Math.max(1, Math.ceil(layout.labels.length / 6)) === 0"
        :key="`${label}-${index}`"
        :x="layout.xAt(index)"
        :y="height - 4"
        text-anchor="middle"
        fill="#7d90a4"
        font-size="11"
      >
        {{ formatIsoDay(label) }}
      </text>

      <template v-for="line in layout.lines" :key="line.id">
        <path
          v-for="(run, index) in line.runs"
          :key="`${line.id}-area-${index}`"
          :d="run.area"
          :fill="`url(#areaFade-${line.id})`"
        />
        <path
          v-for="(run, index) in line.runs"
          :key="`${line.id}-line-${index}`"
          :d="run.d"
          fill="none"
          :stroke="line.color"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle
          v-for="(point, index) in line.points"
          v-show="point.value != null"
          :key="`${line.id}-dot-${index}`"
          :cx="layout.xAt(index)"
          :cy="layout.yAt(point.value ?? 0)"
          r="3.5"
          :fill="line.color"
        />
      </template>

      <line
        v-if="hover"
        :x1="hover.x"
        :x2="hover.x"
        :y1="pad.top"
        :y2="height - pad.bottom"
        stroke="#7d90a4"
        stroke-opacity="0.45"
      />
      <template v-if="hover">
        <circle
          v-for="row in hover.rows"
          v-show="row.y != null"
          :key="row.label"
          :cx="row.x"
          :cy="row.y ?? 0"
          r="5"
          :fill="row.color"
        />
      </template>
    </svg>
    <div
      v-if="hover"
      role="tooltip"
      class="pointer-events-none absolute z-10 w-max max-w-[18rem] rounded-xl border border-white/10 bg-board-elevated px-3 py-2 shadow-xl shadow-black/40"
      :style="{ left: `${(hover.x / width) * 100}%`, top: `${(hover.anchor / height) * 100}%`, transform: tooltipShift }"
    >
      <p class="text-[10px] uppercase tracking-wide text-text-muted">{{ hover.metric }}</p>
      <div
        v-for="(row, index) in hover.rows"
        :key="row.label"
        :class="index ? 'mt-1.5 border-t border-white/10 pt-1.5' : 'mt-1'"
      >
        <p class="flex items-center gap-1.5 text-[13px] font-bold leading-snug" :style="{ color: row.color }">
          <span class="inline-block h-2 w-2 shrink-0 rounded-full" :style="{ background: row.color }" />
          {{ row.label }}
        </p>
        <p class="text-[11px] text-text-secondary">{{ row.scope }}</p>
        <p class="text-[11px] text-text-muted">{{ row.period }}</p>
        <p class="text-sm font-semibold tabular-nums text-text-primary">{{ row.display }}</p>
        <p v-if="row.missing" class="text-[11px] text-text-muted">Ausência de dados. Não é zero.</p>
        <p v-else-if="row.partial" class="text-[11px] text-amber-200">Período parcial. Valor integral do bucket, sem rateio.</p>
      </div>
    </div>
  </div>
</template>
