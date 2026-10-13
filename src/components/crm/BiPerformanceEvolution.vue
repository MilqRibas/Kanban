<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Loader2 } from '@lucide/vue'
import BiLineChart, { type ChartSeries } from './BiLineChart.vue'
import { formatCurrency, formatNumber } from '../../utils/campaignFormat'
import {
  BI_METRIC_LABEL,
  formatIsoDay,
  grainBlockReason,
  metricAllowsGrain,
  periodPreset,
  previousWindow,
  saoPauloToday,
  variationPercent,
  type BiGrain,
  type BiMetric,
} from '../../utils/biAnalytics'
import {
  loadEvolutionOptions,
  loadPerformanceSeries,
  searchBiPlayers,
  type BiOption,
  type BiPlayerHit,
  type BiPoint,
} from '../../services/biApi'

type Mode = 'single' | 'cuts' | 'periods'
type Cut = { club: string; agentId: string; campaignId: string; playerId: string }

const colors = ['#7dd3fc', '#fbbf24', '#f472b6']
const mode = ref<Mode>('single')
const metric = ref<BiMetric>('rake_bruto')
const grain = ref<BiGrain>('week')
const preset = ref('30')
const from = ref(periodPreset('30')?.from ?? '')
const to = ref(periodPreset('30')?.to ?? saoPauloToday())
const club = ref('all')
const agentId = ref('')
const campaignId = ref('')
const playerId = ref('')
const playerQuery = ref('')
const playerHits = ref<BiPlayerHit[]>([])
const options = ref<BiOption[]>([])
const loading = ref(false)
const error = ref('')
const series = ref<ChartSeries[]>([])
const totals = ref<{ label: string; total: number | null }[]>([])
const compareFrom = ref('')
const compareTo = ref('')
const usePrevious = ref(true)
const cuts = ref<Cut[]>([
  { club: 'sx_club', agentId: '', campaignId: '', playerId: '' },
  { club: 'xtreme_pro', agentId: '', campaignId: '', playerId: '' },
  { club: '', agentId: '', campaignId: '', playerId: '' },
])
const optionsByClub = ref<Record<string, BiOption[]>>({})
let request = 0

const agents = computed(() => options.value.filter((item) => item.kind === 'agent'))
const campaigns = computed(() =>
  options.value.filter((item) => item.kind === 'campaign' && (!agentId.value || item.parentId === agentId.value)),
)

function agentsOf(clubCode: string) {
  return (optionsByClub.value[clubCode || 'all'] ?? []).filter((item) => item.kind === 'agent')
}

function campaignsOf(cut: Cut) {
  return (optionsByClub.value[cut.club || 'all'] ?? []).filter(
    (item) => item.kind === 'campaign' && (!cut.agentId || item.parentId === cut.agentId),
  )
}

function resetCutScope(cut: Cut) {
  cut.agentId = ''
  cut.campaignId = ''
  cut.playerId = ''
}
const grainHint = computed(() => grainBlockReason(metric.value, 'day'))
const moneyMetric = computed(() => metric.value === 'rake_bruto' || metric.value === 'rake_liquido' || metric.value === 'incentivos')

function formatValue(value: number) {
  return moneyMetric.value ? formatCurrency(value) : formatNumber(value)
}

function applyPreset() {
  const next = periodPreset(preset.value)
  if (!next) return
  from.value = next.from
  to.value = next.to
}

function cutLabel(cut: Cut, index: number) {
  const clubName = cut.club === 'sx_club' ? 'SX Club' : cut.club === 'xtreme_pro' ? 'Xtreme Pro' : 'Todos'
  const agent = options.value.find((item) => item.kind === 'agent' && item.id === cut.agentId)
  const campaign = options.value.find((item) => item.kind === 'campaign' && item.id === cut.campaignId)
  return [clubName, agent?.label, campaign?.label, cut.playerId].filter(Boolean).join(' · ') || `Recorte ${index + 1}`
}

function toChart(points: BiPoint[], label: string, color: string, id: string): ChartSeries {
  return {
    id,
    label,
    color,
    points: points.map((point) => ({
      label: point.bucketStart,
      value: point.hasData ? point.value : null,
      end: point.bucketEnd,
      partial: point.partial,
      tip: point.hasData
        ? `${label}: ${formatIsoDay(point.bucketStart)} a ${formatIsoDay(point.bucketEnd)} · ${formatValue(point.value ?? 0)}${point.partial ? ' · período parcial' : ''}`
        : `${label}: ${formatIsoDay(point.bucketStart)} sem dados`,
    })),
  }
}

function additiveTotal(points: BiPoint[]): number | null {
  const known = points.filter((point) => point.hasData && point.value != null)
  if (!known.length) return null
  return known.reduce((sum, point) => sum + (point.value ?? 0), 0)
}

async function totalOf(cut: Cut, rangeFrom: string, rangeTo: string): Promise<number | null> {
  if (metric.value === 'ativos') {
    const [point] = await loadPerformanceSeries({
      metric: 'ativos',
      grain: 'range',
      from: rangeFrom,
      to: rangeTo,
      club: cut.club,
      agentId: cut.agentId,
      campaignId: cut.campaignId,
      playerId: cut.playerId,
    })
    return point?.hasData ? point.value : null
  }
  const points = await loadPerformanceSeries({
    metric: metric.value,
    grain: grain.value === 'day' ? 'day' : 'week',
    from: rangeFrom,
    to: rangeTo,
    club: cut.club,
    agentId: cut.agentId,
    campaignId: cut.campaignId,
    playerId: cut.playerId,
  })
  return additiveTotal(points)
}

async function load() {
  if (from.value > to.value) {
    error.value = 'A data inicial precisa ser anterior ou igual à final.'
    return
  }
  if (!metricAllowsGrain(metric.value, grain.value)) {
    grain.value = 'week'
  }
  const token = ++request
  loading.value = true
  error.value = ''
  try {
    const activeCuts: Cut[] =
      mode.value === 'cuts'
        ? cuts.value.filter((cut) => cut.club)
        : [{ club: club.value, agentId: agentId.value, campaignId: campaignId.value, playerId: playerId.value }]
    const charts: ChartSeries[] = []
    const summary: { label: string; total: number | null }[] = []
    for (let index = 0; index < activeCuts.length; index += 1) {
      const cut = activeCuts[index]!
      const points = await loadPerformanceSeries({
        metric: metric.value,
        grain: grain.value,
        from: from.value,
        to: to.value,
        club: cut.club,
        agentId: cut.agentId,
        campaignId: cut.campaignId,
        playerId: cut.playerId,
      })
      if (token !== request) return
      const label = mode.value === 'cuts' ? cutLabel(cut, index) : 'Período principal'
      charts.push(toChart(points, label, colors[index] ?? colors[0]!, `cut-${index}`))
      summary.push({ label, total: await totalOf(cut, from.value, to.value) })
    }
    if (mode.value === 'periods') {
      const other = usePrevious.value ? previousWindow(from.value, to.value) : { from: compareFrom.value, to: compareTo.value }
      if (other.from > other.to) throw new Error('O período de comparação está invertido.')
      const cut = activeCuts[0]!
      const points = await loadPerformanceSeries({
        metric: metric.value,
        grain: grain.value,
        from: other.from,
        to: other.to,
        club: cut.club,
        agentId: cut.agentId,
        campaignId: cut.campaignId,
        playerId: cut.playerId,
      })
      if (token !== request) return
      charts.push({
        id: 'compare',
        label: `Comparação ${formatIsoDay(other.from)} – ${formatIsoDay(other.to)}`,
        color: colors[1]!,
        points: points.map((point, index) => ({
          label: charts[0]?.points[index]?.label ?? point.bucketStart,
          end: point.bucketEnd,
          partial: point.partial,
          value: point.hasData ? point.value : null,
          tip: point.hasData
            ? `Comparação: ${formatIsoDay(point.bucketStart)} a ${formatIsoDay(point.bucketEnd)} · ${formatValue(point.value ?? 0)}${point.partial ? ' · período parcial' : ''}`
            : `Comparação: ${formatIsoDay(point.bucketStart)} sem dados`,
        })),
      })
      summary.push({ label: 'Período de comparação', total: await totalOf(cut, other.from, other.to) })
    }
    if (token !== request) return
    series.value = charts
    totals.value = summary
  } catch (cause) {
    if (token !== request) return
    error.value = cause instanceof Error ? cause.message : 'Falha ao calcular a evolução.'
    series.value = []
    totals.value = []
  } finally {
    if (token === request) loading.value = false
  }
}

const variation = computed(() => {
  if (mode.value !== 'periods' || totals.value.length < 2) return null
  const current = totals.value[0]?.total
  const previous = totals.value[1]?.total
  if (current == null || previous == null) return null
  return { absolute: current - previous, percent: variationPercent(current, previous) }
})

function exportCsv() {
  const header = ['serie', 'inicio', 'fim', 'valor', 'parcial', 'sem_dados', 'metrica', 'agrupamento']
  const lines = series.value.flatMap((item) =>
    item.points.map((point) =>
      [
        `"${item.label.replaceAll('"', '""')}"`,
        point.label,
        point.end ?? '',
        point.value ?? '',
        point.partial ? 'sim' : 'nao',
        point.value == null ? 'sim' : 'nao',
        metric.value,
        grain.value,
      ].join(','),
    ),
  )
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `evolucao-${metric.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

watch(club, async (value) => {
  agentId.value = ''
  campaignId.value = ''
  playerId.value = ''
  const next = await loadEvolutionOptions(value)
  options.value = next
  optionsByClub.value = { ...optionsByClub.value, [value || 'all']: next }
})

watch(playerQuery, async (value) => {
  if (value.trim().length < 2) {
    playerHits.value = []
    return
  }
  playerHits.value = await searchBiPlayers(club.value, agentId.value, value)
})

watch([metric, grain, from, to, club, agentId, campaignId, playerId, mode, usePrevious, compareFrom, compareTo, cuts], () => {
  void load()
}, { deep: true })

onMounted(async () => {
  const [all, sx, xtreme] = await Promise.all([
    loadEvolutionOptions('all'),
    loadEvolutionOptions('sx_club'),
    loadEvolutionOptions('xtreme_pro'),
  ])
  optionsByClub.value = { all, sx_club: sx, xtreme_pro: xtreme }
  options.value = optionsByClub.value[club.value] ?? all
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 class="text-base font-semibold text-text-primary">Evolução de desempenho</h3>
        <p class="text-xs text-text-muted">
          Rake bruto é taxa total mais taxa spin. O líquido usa a taxa da liga já vigente.
          Primeira semana observada não é aquisição.
        </p>
      </div>
      <button type="button" class="rounded-xl border border-white/10 px-3 py-2 text-sm" @click="exportCsv">
        Exportar CSV
      </button>
    </header>

    <div class="flex flex-wrap gap-1" role="tablist" aria-label="Modo da evolução">
      <button v-for="item in [{ id: 'single', label: 'Evolução individual' }, { id: 'cuts', label: 'Comparar recortes' }, { id: 'periods', label: 'Comparar períodos' }]" :key="item.id" type="button" class="rounded-lg px-3 py-1.5 text-sm" :class="mode === item.id ? 'bg-accent text-board' : 'bg-white/5 text-text-secondary'" @click="mode = item.id as Mode">
        {{ item.label }}
      </button>
    </div>

    <div class="grid gap-2 md:grid-cols-4">
      <select v-model="metric" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" aria-label="Métrica">
        <option v-for="(label, key) in BI_METRIC_LABEL" :key="key" :value="key">{{ label }}</option>
      </select>
      <select v-model="grain" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" aria-label="Agrupamento">
        <option value="day" :disabled="!metricAllowsGrain(metric, 'day')">Diário</option>
        <option value="week">Semanal</option>
        <option value="month">Mensal</option>
      </select>
      <select v-model="preset" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" aria-label="Período" @change="applyPreset">
        <option value="7">Últimos 7 dias</option>
        <option value="30">Últimos 30 dias</option>
        <option value="90">Últimos 90 dias</option>
        <option value="month">Mês atual</option>
        <option value="prev-month">Mês anterior</option>
        <option value="custom">Personalizado</option>
      </select>
      <div class="grid grid-cols-2 gap-2">
        <input v-model="from" type="date" class="rounded-xl border border-white/10 bg-board-elevated px-2 py-2 text-sm" aria-label="Data inicial" @change="preset = 'custom'" />
        <input v-model="to" type="date" class="rounded-xl border border-white/10 bg-board-elevated px-2 py-2 text-sm" aria-label="Data final" @change="preset = 'custom'" />
      </div>
    </div>
    <p v-if="grainHint" class="text-[11px] text-text-muted">{{ grainHint }}</p>
    <p v-if="metric === 'primeira_semana'" class="text-[11px] text-text-muted">
      Conta a primeira semana em que o jogador aparece no recorte importado. Não representa aquisição de campanha.
    </p>
    <p v-if="campaignId || cuts.some((cut) => cut.campaignId)" class="text-[11px] text-text-muted">
      O rake da campanha segue a coorte e o agente dela. Comparar campanhas não soma o mesmo jogador entre as séries.
    </p>

    <div v-if="mode !== 'cuts'" class="grid gap-2 md:grid-cols-4">
      <select v-model="club" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" aria-label="Clube">
        <option value="all">Todos os clubes</option>
        <option value="sx_club">SX Club</option>
        <option value="xtreme_pro">Xtreme Pro</option>
      </select>
      <select v-model="agentId" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" aria-label="Agência" @change="campaignId = ''">
        <option value="">Todas as agências</option>
        <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.label }}</option>
      </select>
      <select v-model="campaignId" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" aria-label="Campanha">
        <option value="">Todas as campanhas</option>
        <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">{{ campaign.label }}</option>
      </select>
      <div>
        <input v-model="playerQuery" class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" placeholder="Buscar jogador" aria-label="Buscar jogador" />
        <button v-for="hit in playerHits" :key="hit.playerId" type="button" class="mt-1 block text-left text-xs text-accent" @click="playerId = hit.playerId; playerQuery = hit.nickname || hit.playerId; playerHits = []">
          {{ hit.playerId }} · {{ hit.nickname || hit.name || 'Sem nick' }}
        </button>
        <p v-if="playerId" class="mt-1 text-[11px] text-text-muted">Jogador: {{ playerId }} <button type="button" class="underline" @click="playerId = ''">limpar</button></p>
      </div>
    </div>

    <div v-else class="grid gap-3 lg:grid-cols-3">
      <fieldset v-for="(cut, index) in cuts" :key="index" class="rounded-2xl border border-white/10 p-3">
        <legend class="px-1 text-xs text-text-muted">Recorte {{ index + 1 }}</legend>
        <div class="grid gap-2">
          <select v-model="cut.club" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" :aria-label="`Clube do recorte ${index + 1}`" @change="resetCutScope(cut)">
            <option value="">Não comparar</option>
            <option value="sx_club">SX Club</option>
            <option value="xtreme_pro">Xtreme Pro</option>
            <option value="all">Todos os clubes</option>
          </select>
          <select v-model="cut.agentId" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" :aria-label="`Agência do recorte ${index + 1}`" :disabled="!cut.club" @change="cut.campaignId = ''">
            <option value="">Todas as agências</option>
            <option v-for="agent in agentsOf(cut.club)" :key="agent.id" :value="agent.id">{{ agent.label }}</option>
          </select>
          <select v-model="cut.campaignId" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" :aria-label="`Campanha do recorte ${index + 1}`" :disabled="!cut.club">
            <option value="">Todas as campanhas</option>
            <option v-for="campaign in campaignsOf(cut)" :key="campaign.id" :value="campaign.id">{{ campaign.label }}</option>
          </select>
          <input v-model="cut.playerId" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" placeholder="Player ID, se quiser" :aria-label="`Jogador do recorte ${index + 1}`" :disabled="!cut.club" />
        </div>
      </fieldset>
    </div>

    <label v-if="mode === 'periods'" class="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
      <input v-model="usePrevious" type="checkbox" />
      Comparar com o período anterior de mesma duração
      <input v-if="!usePrevious" v-model="compareFrom" type="date" class="rounded-xl border border-white/10 bg-board-elevated px-2 py-2" aria-label="Início da comparação" />
      <input v-if="!usePrevious" v-model="compareTo" type="date" class="rounded-xl border border-white/10 bg-board-elevated px-2 py-2" aria-label="Fim da comparação" />
    </label>

    <p v-if="error" class="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">{{ error }}</p>
    <p v-if="loading" class="inline-flex items-center gap-2 text-sm text-text-muted"><Loader2 class="animate-spin" :size="16" /> Calculando…</p>

    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="item in totals" :key="item.label" class="panel-glass rounded-2xl px-3 py-2">
        <p class="text-[11px] text-text-muted">{{ item.label }}</p>
        <p class="text-lg tabular-nums text-text-primary">{{ item.total == null ? 'Sem dados' : formatValue(item.total) }}</p>
      </article>
      <article v-if="variation" class="panel-glass rounded-2xl px-3 py-2">
        <p class="text-[11px] text-text-muted">Variação</p>
        <p class="text-lg tabular-nums text-text-primary">{{ formatValue(variation.absolute) }}</p>
        <p class="text-xs text-text-secondary">
          {{ variation.percent == null ? 'Sem base comparável' : `${variation.percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` }}
        </p>
      </article>
    </div>

    <section class="panel-glass rounded-2xl p-3">
      <p v-if="!series.length" class="py-8 text-center text-sm text-text-muted">Nenhum ponto no recorte.</p>
      <BiLineChart v-else :series="series" />
      <p class="mt-2 text-[11px] text-text-muted">Ponto ausente significa semana ou dia sem cobertura. Zero é valor real.</p>
    </section>
  </div>
</template>
