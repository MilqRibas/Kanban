<script setup lang="ts">
import { computed } from 'vue'
import { formatIsoDay } from '../../utils/biAnalytics'

export type ChartPoint = { label: string; tip: string; value: number | null; end?: string; partial?: boolean }
export type ChartSeries = { id: string; label: string; color: string; points: ChartPoint[] }

const props = defineProps<{
  series: ChartSeries[]
}>()

const width = 720
const height = 280
const pad = { top: 16, right: 16, bottom: 36, left: 56 }

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
  return {
    labels,
    max,
    min,
    xAt,
    yAt,
    lines: series.map((item) => ({
      ...item,
      segments: item.points.reduce<string[]>((segments, point, index) => {
        if (point.value == null) return segments
        const command = `${xAt(index)},${yAt(point.value)}`
        const previous = item.points[index - 1]
        if (!segments.length || previous?.value == null) segments.push(`M ${command}`)
        else segments[segments.length - 1] += ` L ${command}`
        return segments
      }, []),
    })),
  }
})
</script>

<template>
  <div class="overflow-x-auto">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="h-64 w-full min-w-[36rem]"
      role="img"
      aria-label="Gráfico de evolução"
    >
      <line
        :x1="pad.left"
        :x2="width - pad.right"
        :y1="layout.yAt(0)"
        :y2="layout.yAt(0)"
        class="stroke-white/10"
      />
      <template v-for="line in layout.lines" :key="line.id">
        <path
          v-for="(segment, index) in line.segments"
          :key="`${line.id}-${index}`"
          :d="segment"
          fill="none"
          :stroke="line.color"
          stroke-width="2"
        />
        <circle
          v-for="(point, index) in line.points"
          :key="`${line.id}-p-${index}`"
          v-show="point.value != null"
          :cx="layout.xAt(index)"
          :cy="layout.yAt(point.value ?? 0)"
          r="3"
          :fill="line.color"
        >
          <title>{{ point.tip }}</title>
        </circle>
      </template>
      <text
        v-for="(label, index) in layout.labels"
        v-show="index % Math.max(1, Math.ceil(layout.labels.length / 6)) === 0"
        :key="`${label}-${index}`"
        :x="layout.xAt(index)"
        :y="height - 10"
        class="fill-current text-[10px] text-text-muted"
      >
        {{ formatIsoDay(label) }}
      </text>
    </svg>
    <ul class="mt-2 flex flex-wrap gap-3 text-xs text-text-secondary">
      <li v-for="line in layout.lines" :key="line.id" class="inline-flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full" :style="{ background: line.color }" />
        {{ line.label }}
      </li>
    </ul>
  </div>
</template>
