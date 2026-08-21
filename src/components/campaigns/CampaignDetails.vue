<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Archive,
  ArrowLeft,
  ArrowDown,
  Copy,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Search,
  ChevronDown,
  Eye,
  Users,
  MessageCircle,
  Headphones,
  Building2,
  Coins,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
} from '@lucide/vue'
import type { Campaign } from '../../types/campaigns'
import { ACQUISITION_NATURE_LABELS } from '../../types/campaigns'
import { useAuthStore } from '../../stores/auth'
import { useCampaignsStore } from '../../stores/campaigns'
import { useEphemeralDismiss } from '../../composables/useEphemeralDismiss'
import { useDebouncedValue } from '../../composables/useDebouncedValue'
import { buildSearchHaystack, matchesSearch } from '../../utils/search'
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatDateTime,
} from '../../utils/campaignFormat'
import { campaignUsesWeeklySnapshot } from '../../utils/campaignWeeklyMetrics'
import {
  buildJourneyEdges,
  formatMetaServiceDivergenceLabel,
} from '../../utils/campaignFunnelMetrics'
import CampaignStatusBadge from './CampaignStatusBadge.vue'
import CollapsiblePanel from './CollapsiblePanel.vue'

const props = defineProps<{
  campaign: Campaign
}>()

const emit = defineEmits<{
  back: []
  edit: [id: string]
}>()

const auth = useAuthStore()
const store = useCampaignsStore()
const menuOpen = ref(false)
type DetailTab =
  | 'overview'
  | 'funnel'
  | 'evolution'
  | 'transactions'
  | 'rake-health'
  | 'game-profile'
  | 'players'
  | 'table-details'
  | 'history'
const activeTab = ref<DetailTab>('overview')

const rakeHealthMode = ref<'accumulated' | 'period'>('accumulated')
const selectedRakeHealthPeriod = ref<string | null>(null)
const gameProfilePeriod = ref<string | null>(null)
const tableDetailsPeriod = ref<string | null>(null)
const depositWeeklyMode = ref<'volume' | 'depositors' | 'deposits'>('volume')

const playerSearch = ref('')
const playerSearchQuery = useDebouncedValue(() => playerSearch.value, 150)
const playerSortKey = ref<'rake' | 'weeks' | 'first' | 'last'>('rake')
const playerSortAsc = ref(false)

const selectedPlayerId = ref<string | null>(null)

const tableDetailsLoaded = ref(false)

useEphemeralDismiss({
  isOpen: () => menuOpen.value,
  onClose: () => {
    menuOpen.value = false
  },
})

const agent = computed(() => store.findAgent(props.campaign.agentId))
const agentPeriods = computed(() => store.agentPeriodsForCampaign(props.campaign))
const cohortWeeklyPeriods = computed(() =>
  store.cohortWeeklyPeriodsFor(props.campaign),
)
const playerPeriods = computed(() => store.playerPeriodsForCampaign(props.campaign))
const cohortMembers = computed(() => store.cohortMembersFor(props.campaign))
const metrics = computed(() => store.metricsFor(props.campaign))
const funnel = computed(() =>
  activeTab.value === 'funnel' ? store.funnelFor(props.campaign) : null,
)
const purchasePower = computed(() =>
  activeTab.value === 'overview' || activeTab.value === 'transactions'
    ? store.purchasePowerFor(props.campaign)
    : null,
)
const history = computed(() =>
  store.history
    .filter((h) => h.campaignId === props.campaign.id)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
)
const importsForAgent = computed(() =>
  store.imports.filter(
    (i) =>
      i.status === 'completed' &&
      agentPeriods.value.some((p) => p.importId === i.id),
  ),
)

const periodOptions = computed(() => {
  const options = cohortWeeklyPeriods.value.map((p) => ({
    value: p.periodStart,
    label: store.formatPeriodLabel(p.periodStart, p.periodEnd),
  }))
  return options.reverse()
})

const rakeHealth = computed(() => {
  if (activeTab.value !== 'rake-health') return null
  const periodStart = rakeHealthMode.value === 'period' ? selectedRakeHealthPeriod.value : null
  return store.rakeHealthFor(props.campaign, periodStart)
})

const gameProfile = computed(() => {
  const acquiredAtByPlayer = new Map(
    cohortMembers.value.map((m) => [m.playerId, m.acquiredAt]),
  )
  const tables = tableDetailsLoaded.value
    ? store.tableDetailsCache.filter((t) => {
        if (t.agentId !== props.campaign.agentId) return false
        const acquiredAt = acquiredAtByPlayer.get(t.playerId)
        if (!acquiredAt || t.periodStart < acquiredAt) return false
        if (gameProfilePeriod.value && t.periodStart !== gameProfilePeriod.value) {
          return false
        }
        return true
      })
    : []
  return store.gameProfileFor(props.campaign, tables, gameProfilePeriod.value)
})

const tableDetails = computed(() => {
  if (!tableDetailsLoaded.value) return []
  const acquiredAtByPlayer = new Map(
    cohortMembers.value.map((m) => [m.playerId, m.acquiredAt]),
  )
  return store.tableDetailsCache
    .filter((t) => {
      if (t.agentId !== props.campaign.agentId) return false
      const acquiredAt = acquiredAtByPlayer.get(t.playerId)
      if (!acquiredAt || t.periodStart < acquiredAt) return false
      if (tableDetailsPeriod.value && t.periodStart !== tableDetailsPeriod.value) {
        return false
      }
      return true
    })
    .sort((a, b) => b.rake - a.rake)
})

const uniquePlayers = computed(() => {
  if (activeTab.value !== 'players') return []
  const map = new Map<
    string,
    {
      playerId: string
      name: string
      nickname: string
      rake: number
      weekStarts: Set<string>
      firstStart: string
      lastStart: string
    }
  >()
  for (const p of playerPeriods.value) {
    const prev = map.get(p.playerId)
    if (prev) {
      prev.rake += p.weeklyRake
      prev.weekStarts.add(p.periodStart)
      if (p.periodStart < prev.firstStart) prev.firstStart = p.periodStart
      if (p.periodStart > prev.lastStart) prev.lastStart = p.periodStart
    } else {
      map.set(p.playerId, {
        playerId: p.playerId,
        name: p.playerName,
        nickname: p.nickname,
        rake: p.weeklyRake,
        weekStarts: new Set([p.periodStart]),
        firstStart: p.periodStart,
        lastStart: p.periodStart,
      })
    }
  }
  // Semanas distintas: o jogador pode ter 2 linhas na mesma semana (trocou de agente)
  return [...map.values()].map(({ weekStarts, ...player }) => ({
    ...player,
    weeks: weekStarts.size,
  }))
})

const filteredPlayers = computed(() => {
  let list = uniquePlayers.value
  const q = playerSearchQuery.value
  if (q.trim()) {
    list = list.filter((p) =>
      matchesSearch(
        buildSearchHaystack([p.name, p.nickname, p.playerId]),
        q,
      ),
    )
  }
  list.sort((a, b) => {
    const asc = playerSortAsc.value ? 1 : -1
    if (playerSortKey.value === 'rake') return (b.rake - a.rake) * asc
    if (playerSortKey.value === 'weeks') return (b.weeks - a.weeks) * asc
    if (playerSortKey.value === 'first')
      return a.firstStart.localeCompare(b.firstStart) * asc
    if (playerSortKey.value === 'last')
      return b.lastStart.localeCompare(a.lastStart) * asc
    return 0
  })
  return list
})

const selectedPlayerDetail = computed(() => {
  if (!selectedPlayerId.value) return null
  const player = uniquePlayers.value.find((p) => p.playerId === selectedPlayerId.value)
  if (!player) return null
  // Agrega por semana: duas linhas na mesma semana (troca de agente) viram uma só
  const byWeek = new Map<
    string,
    { periodStart: string; periodEnd: string; weeklyRake: number }
  >()
  for (const p of playerPeriods.value) {
    if (p.playerId !== selectedPlayerId.value) continue
    const prev = byWeek.get(p.periodStart)
    if (prev) {
      prev.weeklyRake += p.weeklyRake
      if (p.periodEnd > prev.periodEnd) prev.periodEnd = p.periodEnd
    } else {
      byWeek.set(p.periodStart, {
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        weeklyRake: p.weeklyRake,
      })
    }
  }
  const periods = [...byWeek.values()].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  )
  let acc = 0
  const series = periods.map((p) => {
    acc += p.weeklyRake
    return {
      label: store.formatPeriodLabel(p.periodStart, p.periodEnd),
      weeklyRake: p.weeklyRake,
      accumulated: acc,
    }
  })
  // Escopo da campanha: só depósitos feitos nesta agência desde a aquisição,
  // para que a soma dos individuais bata com o total da campanha.
  const deposits = store.playerDepositStats(
    selectedPlayerId.value,
    props.campaign.agentId,
    {
      startDate:
        cohortMembers.value.find((m) => m.playerId === selectedPlayerId.value)
          ?.acquiredAt ?? props.campaign.startDate,
      endDate: null,
    },
  )
  return { player, series, deposits }
})

const overviewCards = computed(() => {
  const m = metrics.value
  const pp = purchasePower.value
  return [
    {
      label: 'Investimento Campanha',
      value: formatCurrency(m.campaignInvestment),
    },
    { label: 'Ativação', value: formatCurrency(m.activationInvestment) },
    { label: 'Investimento Total', value: formatCurrency(m.totalInvestment) },
    { label: 'Jogadores', value: formatNumber(m.agencyPlayers) },
    { label: 'Ativos', value: formatNumber(m.uniqueActivePlayers) },
    { label: 'Ativação %', value: formatPercent(m.activationRate) },
    { label: 'Custo / jogador (funil)', value: formatCurrency(m.costPerPlayerFunnel) },
    { label: 'Custo / ativo', value: formatCurrency(m.costPerActive) },
    { label: 'Rake acumulado', value: formatCurrency(m.accumulatedRake) },
    { label: 'Recuperação', value: formatPercent(m.recoveryRate) },
    { label: 'Volume depositado', value: formatCurrency(pp?.depositedVolume) },
    { label: 'Depositantes', value: formatNumber(pp?.uniqueDepositors) },
  ]
})

const FUNNEL_STEP_META: Record<
  string,
  { hint: string; icon: typeof Eye }
> = {
  impressions: { hint: 'Total de impressões', icon: Eye },
  reach: { hint: 'Pessoas alcançadas', icon: Users },
  metaConversations: { hint: 'Conversas iniciadas na Meta', icon: MessageCircle },
  serviceConversations: {
    hint: 'Conversas no atendimento',
    icon: Headphones,
  },
  clubConversions: { hint: 'Entraram no clube', icon: Building2 },
  clubFichasConversions: {
    hint: 'Clube + vínculo Fichas',
    icon: Coins,
  },
  activePlayers: { hint: 'Ativos pela regra da campanha', icon: UserCheck },
}

const funnelVisualRows = computed(() => {
  const steps = funnel.value?.steps ?? []
  const edges = funnelEdges.value
  const n = steps.length
  const maxValue = Math.max(
    1,
    ...steps.map((s) => (s.value != null && s.value > 0 ? s.value : 0)),
  )

  const widthFor = (idx: number) => {
    if (idx >= n) {
      const last = steps[n - 1]
      const lastW =
        last?.value != null && last.value > 0
          ? Math.max(28, Math.round((last.value / maxValue) * 100))
          : 28
      return lastW
    }
    const step = steps[idx]
    if (step.value == null || step.value <= 0) {
      // Etapas sem dado ainda afunilam visualmente
      return Math.max(28, Math.round(100 - (idx / Math.max(1, n - 1)) * 55))
    }
    // Mistura proporção real + afunilamento visual mínimo
    const dataW = Math.max(28, Math.round((step.value / maxValue) * 100))
    const visualW = Math.round(100 - (idx / Math.max(1, n - 1)) * 48)
    return Math.round(dataW * 0.55 + visualW * 0.45)
  }

  return steps.map((step, idx) => {
    const edge = idx > 0 ? edges[idx - 1] : null
    const meta = FUNNEL_STEP_META[step.key] ?? {
      hint: step.label,
      icon: Users,
    }
    const topW = widthFor(idx)
    const bottomW = idx === n - 1 ? topW : widthFor(idx + 1)
    const insetTop = (100 - topW) / 2
    const insetBottom = (100 - bottomW) / 2
    const clipPath = `polygon(${insetTop}% 0%, ${100 - insetTop}% 0%, ${100 - insetBottom}% 100%, ${insetBottom}% 100%)`
    // Monocromático accent: topo mais saturado → base mais clara
    const mix = Math.round(92 - (idx / Math.max(1, n - 1)) * 52)
    const background = `color-mix(in srgb, var(--color-accent) ${mix}%, var(--color-board-elevated))`

    return {
      ...step,
      hint: meta.hint,
      icon: meta.icon,
      clipPath,
      background,
      rate: edge?.rate ?? null,
      loss: edge?.loss ?? null,
      isBottleneck:
        worstFunnelEdgeKey.value ===
        (edge ? `${edge.from.key}->${edge.to.key}` : null),
    }
  })
})

const funnelFooterStats = computed(() => {
  const steps = funnel.value?.steps ?? []
  const first = steps[0]?.value ?? null
  const last = steps[steps.length - 1]?.value ?? null
  const totalRate =
    first != null && last != null && first > 0 ? (last / first) * 100 : null
  const totalLoss =
    first != null && last != null ? Math.max(0, first - last) : null
  return { totalRate, totalLoss, last, first }
})

const funnelFinanceStrip = computed(() => {
  const m = metrics.value
  const k = funnel.value?.kpis
  return {
    campaignInvestment: formatCurrency(m.campaignInvestment),
    activationInvestment: formatCurrency(m.activationInvestment),
    totalInvestment: formatCurrency(m.totalInvestment),
    accumulatedRake: formatCurrency(m.accumulatedRake),
    cpm: formatCurrency(k?.cpm),
    frequency: formatNumber(k?.frequency),
  }
})

const funnelEdges = computed(() =>
  buildJourneyEdges(funnel.value?.steps ?? []),
)

const worstFunnelEdgeKey = computed(() => {
  const edges = funnelEdges.value.filter((e) => e.rate != null)
  if (!edges.length) return null
  const worst = [...edges].sort((a, b) => (a.rate ?? 999) - (b.rate ?? 999))[0]
  return `${worst.from.key}->${worst.to.key}`
})

const funnelKpiGroups = computed(() => {
  const k = funnel.value?.kpis
  if (!k) return []
  return [
    {
      title: 'Mídia',
      items: [
        { label: 'CPM', value: formatCurrency(k.cpm), warn: false },
        { label: 'Frequência', value: formatNumber(k.frequency), warn: false },
        {
          label: 'Alcance → Meta',
          value: formatPercent(k.reachToMetaRate),
          warn: false,
        },
        {
          label: 'Custo / Conversa Meta',
          value: formatCurrency(k.costPerMetaConversation),
          warn: false,
        },
      ],
    },
    {
      title: 'Atendimento',
      items: [
        {
          label: 'Meta → Atendimento',
          value: formatPercent(k.metaToServiceRate),
          warn: false,
        },
        {
          label: 'Divergência Meta / Atendimento',
          value: formatMetaServiceDivergenceLabel(k) ?? '—',
          warn: Boolean(
            k.metaServiceAbsoluteDiff != null && k.metaServiceAbsoluteDiff !== 0,
          ),
        },
        {
          label: 'Custo / Atendimento',
          value: formatCurrency(k.costPerServiceConversation),
          warn: false,
        },
      ],
    },
    {
      title: 'Conversão',
      items: [
        {
          label: 'Atendimento → Clube',
          value: formatPercent(k.serviceToClubRate),
          warn: false,
        },
        {
          label: 'Clube → Fichas',
          value: formatPercent(k.clubToFichasRate),
          warn: false,
        },
      ],
    },
    {
      title: 'Eficiência final',
      items: [
        {
          label: 'Custo / Jogador',
          value: formatCurrency(k.costPerPlayer),
          warn: false,
        },
        {
          label: 'Custo / Jogador Ativo',
          value: formatCurrency(k.costPerActive),
          warn: false,
        },
      ],
    },
  ]
})

const funnelSoftMessages = computed(() => {
  const w = funnel.value?.warnings
  if (!w) return [] as string[]
  const messages: string[] = []
  if (w.reachGtImpressions)
    messages.push('Alcance maior que impressões — verificar origem/conciliação.')
  if (w.serviceGtMeta)
    messages.push(
      'Conversas de atendimento maiores que Meta — divergência possível.',
    )
  if (w.fichasGtClub)
    messages.push('Conversões Clube+Fichas maiores que Clube — conferir dados.')
  return messages
})

const purchasePowerSummary = computed(() => {
  const pp = purchasePower.value
  if (!pp) return []
  return [
    { label: 'Volume depositado', value: formatCurrency(pp.depositedVolume) },
    { label: 'Depositantes', value: formatNumber(pp.uniqueDepositors) },
    { label: 'Depósitos', value: formatNumber(pp.depositCount) },
    { label: 'Ticket médio', value: formatCurrency(pp.avgTicket) },
    { label: 'Média / depositante', value: formatCurrency(pp.avgPerDepositor) },
  ]
})

const activationBonusRows = computed(() => {
  if (activeTab.value !== 'transactions') return []
  const importsById = new Map(
    store.transactionImports.map((item) => [item.id, item.originalFilename]),
  )
  const agentsById = new Map(
    store.agents.map((agent) => [agent.agentId, agent.name]),
  )
  return [...store.activationBonusesFor(props.campaign)].sort((a, b) => {
    const da = a.occurredAt || a.periodStart
    const db = b.occurredAt || b.periodStart
    return db.localeCompare(da)
  }).map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt || row.periodStart,
    playerId: row.receiverPlayerId,
    agentId: row.agentId,
    agency: row.agentId
      ? agentsById.get(row.agentId) || row.agentNickname || row.agentId
      : '—',
    campaignName: props.campaign.name,
    amount: Math.abs(Number(row.amount) || 0),
    importName: importsById.get(row.importId) || row.importId,
  }))
})

const purchasePowerDistribution = computed(() => {
  const pp = purchasePower.value
  if (!pp) return []
  return [
    { label: 'Mediana / depositante', value: formatCurrency(pp.medianPerDepositor) },
    { label: 'Maior depósito', value: formatCurrency(pp.maxDeposit) },
    {
      label: 'Top 1',
      value: pp.top1Share != null ? formatPercent(pp.top1Share * 100) : '—',
    },
    {
      label: 'Top 3',
      value: pp.top3Share != null ? formatPercent(pp.top3Share * 100) : '—',
    },
    {
      label: 'Top 10',
      value: pp.top10Share != null ? formatPercent(pp.top10Share * 100) : '—',
    },
    { label: 'Semanas com depósito', value: formatNumber(pp.weeksWithDeposit) },
  ]
})

const depositWeeklyMax = computed(() => {
  const weekly = purchasePower.value?.weekly ?? []
  if (!weekly.length) return 1
  if (depositWeeklyMode.value === 'volume') {
    return Math.max(1, ...weekly.map((w) => w.volume))
  }
  if (depositWeeklyMode.value === 'depositors') {
    return Math.max(1, ...weekly.map((w) => w.depositors))
  }
  return Math.max(1, ...weekly.map((w) => w.deposits))
})

const evolutionRows = computed(() => {
  let acc = 0
  const sorted = cohortWeeklyPeriods.value
    .slice()
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
  const maxRake = Math.max(1, ...sorted.map((p) => p.weeklyRake))
  const totalInv = metrics.value.totalInvestment
  return sorted.map((p) => {
    acc += p.weeklyRake
    const recoveryRate =
      totalInv != null && totalInv > 0 ? (acc / totalInv) * 100 : null
    return {
      label: store.formatPeriodLabel(p.periodStart, p.periodEnd),
      weeklyRake: p.weeklyRake,
      accumulated: acc,
      recovery: recoveryRate,
      uniquePlayers: p.uniquePlayers ?? 0,
      weekWidth: (p.weeklyRake / maxRake) * 100,
    }
  })
})

const hasAgent = computed(() => !!props.campaign.agentId)
const hasCohort = computed(() => cohortMembers.value.length > 0)
const hasWeeks = computed(
  () => metrics.value.weeksTracked > 0 || cohortWeeklyPeriods.value.length > 0,
)
const weeklySnapshotWarning = computed(() =>
  campaignUsesWeeklySnapshot(props.campaign, cohortWeeklyPeriods.value),
)
const natureLabel = computed(
  () =>
    ACQUISITION_NATURE_LABELS[props.campaign.acquisitionNature] ??
    props.campaign.acquisitionNature,
)

function canDelete() {
  return store.canDeleteCampaign(props.campaign)
}

async function onDuplicate() {
  menuOpen.value = false
  const copy = await store.duplicate(props.campaign.id)
  if (copy) store.open(copy.id)
}

async function onArchive() {
  menuOpen.value = false
  await store.archive(props.campaign.id)
}

async function onRestore() {
  menuOpen.value = false
  await store.restore(props.campaign.id)
}

async function onDelete() {
  menuOpen.value = false
  if (!canDelete()) return
  const confirmed = window.confirm(
    `Excluir a campanha "${props.campaign.name}"? Esta ação não pode ser desfeita.`,
  )
  if (!confirmed) return
  const ok = await store.remove(props.campaign.id)
  if (ok) emit('back')
}

function sortPlayers(key: typeof playerSortKey.value) {
  if (playerSortKey.value === key) {
    playerSortAsc.value = !playerSortAsc.value
  } else {
    playerSortKey.value = key
    playerSortAsc.value = false
  }
}

function openPlayerDetail(playerId: string) {
  selectedPlayerId.value = playerId
}

function closePlayerDetail() {
  selectedPlayerId.value = null
}

watch(activeTab, async (tab) => {
  if (tab === 'game-profile' && !tableDetailsLoaded.value) {
    tableDetailsLoaded.value = true
    await store.loadCampaignTableDetails(
      props.campaign,
      gameProfilePeriod.value ?? undefined,
    )
  }
  if (tab === 'table-details' && !tableDetailsLoaded.value) {
    tableDetailsLoaded.value = true
    await store.loadCampaignTableDetails(
      props.campaign,
      tableDetailsPeriod.value ?? undefined,
    )
  }
})

watch(gameProfilePeriod, async (period) => {
  if (activeTab.value === 'game-profile') {
    await store.loadCampaignTableDetails(props.campaign, period ?? undefined)
  }
})

watch(tableDetailsPeriod, async (period) => {
  if (activeTab.value === 'table-details') {
    await store.loadCampaignTableDetails(props.campaign, period ?? undefined)
  }
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-footer-pad pt-2 sm:pt-3">
    <div class="page-shell flex flex-col gap-3 sm:gap-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 space-y-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
            @click="emit('back')"
          >
            <ArrowLeft :size="16" />
            Voltar
          </button>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              {{ campaign.name }}
            </h2>
            <CampaignStatusBadge :status="metrics.status" />
          </div>
          <p class="text-sm text-text-muted">
            <span class="mr-2 rounded-md bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
              {{ natureLabel }}
            </span>
            <template v-if="agent">
              Agência {{ agent.name }} ({{ campaign.agentId }})
            </template>
            <template v-else-if="campaign.agentId">
              Agente {{ campaign.agentId }}
            </template>
            <template v-else>
              Sem agente vinculado
            </template>
          </p>
          <p
            v-if="weeklySnapshotWarning"
            class="max-w-xl text-xs text-amber-200/90"
          >
            O relatório é semanal. O rake exibido é da semana que contém o dia do
            evento, não só dessa data.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary hover:bg-card"
            @click="emit('edit', campaign.id)"
          >
            <Pencil :size="15" />
            Editar
          </button>
          <div class="relative">
            <button
              type="button"
              data-ephemeral-menu
              class="rounded-xl border border-border-subtle bg-surface p-2 text-text-secondary hover:text-text-primary"
              title="Mais ações"
              @click.stop="menuOpen = !menuOpen"
            >
              <MoreHorizontal :size="16" />
            </button>
            <div
              v-if="menuOpen"
              data-ephemeral-menu
              class="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border-subtle bg-board-elevated py-1 shadow-xl"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                @click="onDuplicate"
              >
                <Copy :size="14" />
                Duplicar
              </button>
              <button
                v-if="!campaign.isArchived && auth.isAdmin"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                @click="onArchive"
              >
                <Archive :size="14" />
                Arquivar
              </button>
              <button
                v-if="campaign.isArchived && auth.isAdmin"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                @click="onRestore"
              >
                <RotateCcw :size="14" />
                Restaurar
              </button>
              <button
                v-if="canDelete()"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                @click="onDelete"
              >
                <Trash2 :size="14" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-glass rounded-2xl p-3 sm:p-4">
        <div class="flex flex-wrap gap-2 border-b border-border-subtle pb-2">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="activeTab === 'overview' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'overview'"
          >
            Visão Geral
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="activeTab === 'funnel' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'funnel'"
          >
            Funil de Desempenho
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="activeTab === 'evolution' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'evolution'"
          >
            Evolução
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="activeTab === 'transactions' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'transactions'"
          >
            Transações
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="activeTab === 'rake-health' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'rake-health'"
          >
            Saúde do Rake
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="activeTab === 'game-profile' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'game-profile'"
          >
            Perfil de Jogo
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="activeTab === 'players' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'players'"
          >
            Jogadores
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="activeTab === 'table-details' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'table-details'"
          >
            Detalhes de Mesa
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="activeTab === 'history' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'history'"
          >
            Histórico
          </button>
        </div>

        <div class="mt-4">
          <div v-if="activeTab === 'overview'">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <CampaignStatusBadge :status="metrics.status" />
              <span
                v-if="metrics.organicFixedPayback"
                class="text-xs text-text-muted"
              >
                Captação orgânica sem investimento — payback fixo 100%.
              </span>
            </div>
            <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              <div
                v-for="card in overviewCards"
                :key="card.label"
                class="rounded-xl bg-surface/40 px-3 py-2.5"
              >
                <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  {{ card.label }}
                </p>
                <p class="mt-1 text-base font-semibold tabular-nums text-text-primary">
                  {{ card.value }}
                </p>
              </div>
            </div>
          </div>

          <div v-else-if="activeTab === 'funnel' && funnel" class="space-y-4">
            <!-- Contexto financeiro -->
            <div class="rounded-2xl border border-border-subtle/70 bg-surface/35 p-3 sm:p-4">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Contexto financeiro
              </p>
              <div class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div>
                  <p class="text-[11px] text-text-muted">Investimento da Campanha</p>
                  <p class="mt-0.5 text-base font-semibold tabular-nums text-text-primary sm:text-lg">
                    {{ funnelFinanceStrip.campaignInvestment }}
                  </p>
                  <p class="mt-1 text-[11px] text-text-muted">
                    CPM
                    <span class="tabular-nums text-text-secondary">{{ funnelFinanceStrip.cpm }}</span>
                    <span class="mx-1.5 text-border-subtle">·</span>
                    Freq.
                    <span class="tabular-nums text-text-secondary">{{ funnelFinanceStrip.frequency }}</span>
                  </p>
                </div>
                <div>
                  <p class="text-[11px] text-text-muted">Investimento de Ativação</p>
                  <p class="mt-0.5 text-base font-semibold tabular-nums text-text-primary sm:text-lg">
                    {{ funnelFinanceStrip.activationInvestment }}
                  </p>
                </div>
                <div>
                  <p class="text-[11px] text-text-muted">Investimento Total</p>
                  <p class="mt-0.5 text-base font-semibold tabular-nums text-accent sm:text-lg">
                    {{ funnelFinanceStrip.totalInvestment }}
                  </p>
                </div>
                <div>
                  <p class="text-[11px] text-text-muted">Rake acumulado</p>
                  <p class="mt-0.5 text-base font-semibold tabular-nums text-text-primary sm:text-lg">
                    {{ funnelFinanceStrip.accumulatedRake }}
                  </p>
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <div class="overflow-hidden rounded-2xl border border-border-subtle/70 bg-board-elevated/40">
                <div class="grid items-start lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.95fr)]">
                  <!-- Funil -->
                  <div class="border-b border-border-subtle/60 p-3 sm:p-5 lg:border-b-0 lg:border-r">
                    <div class="mb-3">
                      <h4 class="text-sm font-semibold text-text-primary">Jornada de conversão</h4>
                      <p class="text-xs text-text-muted">
                        Funil contínuo entre populações — investimento só no contexto financeiro.
                      </p>
                    </div>

                    <div
                      class="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(10rem,0.95fr)_minmax(0,1.35fr)_4.5rem_5rem]"
                    >
                      <div
                        class="col-span-full mb-2 hidden grid-cols-subgrid gap-x-2 border-b border-border-subtle/50 pb-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted lg:grid"
                      >
                        <span>Etapa</span>
                        <span class="text-center">Volume</span>
                        <span class="text-right">Conv.</span>
                        <span class="text-right">Perda</span>
                      </div>

                      <template v-for="(row, idx) in funnelVisualRows" :key="row.key">
                        <div class="flex min-w-0 items-center gap-2 py-1 lg:py-0">
                          <span
                            class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent"
                          >
                            <component :is="row.icon" :size="14" />
                          </span>
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium text-text-primary">
                              {{ row.label }}
                            </p>
                            <p class="truncate text-[11px] text-text-muted">{{ row.hint }}</p>
                          </div>
                        </div>

                        <div class="relative flex items-stretch justify-center">
                          <div
                            class="relative flex w-full max-w-md items-center justify-center"
                            :style="{
                              height: '42px',
                              clipPath: row.clipPath,
                              background: row.background,
                            }"
                          >
                            <span
                              class="relative z-[1] px-2 text-sm font-bold tabular-nums text-board drop-shadow-sm sm:text-base"
                            >
                              {{ formatNumber(row.value) }}
                            </span>
                          </div>
                        </div>

                        <div class="flex items-center justify-end py-0.5 lg:py-0">
                          <div
                            v-if="idx === 0"
                            class="text-xs tabular-nums text-text-muted"
                          >
                            —
                          </div>
                          <div
                            v-else
                            class="inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums"
                            :class="row.isBottleneck ? 'text-danger' : 'text-text-secondary'"
                          >
                            <ArrowDown :size="11" class="opacity-60" />
                            {{ row.rate != null ? formatPercent(row.rate) : '—' }}
                          </div>
                        </div>

                        <div class="mb-2 flex items-center justify-end border-b border-border-subtle/25 pb-1.5 lg:mb-0 lg:border-0 lg:pb-0">
                          <span
                            class="text-xs tabular-nums"
                            :class="
                              row.loss != null && row.loss > 0
                                ? row.isBottleneck
                                  ? 'font-semibold text-danger'
                                  : 'text-text-secondary'
                                : 'text-text-muted'
                            "
                          >
                            {{
                              idx === 0
                                ? '—'
                                : row.loss != null && row.loss > 0
                                  ? formatNumber(row.loss)
                                  : '—'
                            }}
                          </span>
                        </div>
                      </template>
                    </div>

                    <div
                      class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle/50 pt-3 text-xs text-text-secondary"
                    >
                      <span>
                        Conversão total:
                        <strong class="tabular-nums text-text-primary">
                          {{ formatPercent(funnelFooterStats.totalRate) }}
                        </strong>
                      </span>
                      <span>
                        Chegada final:
                        <strong class="tabular-nums text-text-primary">
                          {{ formatNumber(funnelFooterStats.last) }}
                        </strong>
                      </span>
                      <span>
                        Perda acumulada:
                        <strong class="tabular-nums text-text-primary">
                          {{ formatNumber(funnelFooterStats.totalLoss) }}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <!-- KPIs compactos numa coluna única -->
                  <div class="divide-y divide-border-subtle/50 p-3 sm:p-4">
                    <div
                      v-for="group in funnelKpiGroups"
                      :key="group.title"
                      class="py-3 first:pt-0 last:pb-0"
                    >
                      <p class="text-[11px] font-semibold uppercase tracking-wide text-accent/90">
                        {{ group.title }}
                      </p>
                      <ul class="mt-2 space-y-1.5">
                        <li
                          v-for="item in group.items"
                          :key="item.label"
                          class="flex items-start justify-between gap-2 text-sm"
                        >
                          <span class="text-text-secondary">{{ item.label }}</span>
                          <span
                            class="max-w-[55%] shrink-0 text-right text-xs font-semibold tabular-nums sm:text-sm"
                            :class="item.warn ? 'text-danger' : 'text-text-primary'"
                          >
                            {{ item.value }}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Diagnóstico em faixa integrada -->
              <div
                v-if="funnel?.diagnosis?.blocks?.length || funnelSoftMessages.length"
                class="rounded-2xl border border-border-subtle/70 bg-surface/25 p-3 sm:p-4"
              >
                <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      Diagnóstico da campanha
                    </p>
                    <p class="text-xs text-text-muted">
                      Comparação relativa entre etapas — sem benchmarks externos.
                    </p>
                  </div>
                </div>

                <div
                  v-if="funnel?.diagnosis?.blocks?.length"
                  class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                >
                  <div
                    v-for="(block, i) in funnel?.diagnosis?.blocks"
                    :key="i"
                    class="rounded-xl border px-3 py-2.5 text-sm"
                    :class="{
                      'border-danger/35 bg-danger/10': block.kind === 'bottleneck',
                      'border-emerald-400/25 bg-emerald-500/10': block.kind === 'positive',
                      'border-amber-400/25 bg-amber-500/10': block.kind === 'attention',
                    }"
                  >
                    <div class="flex items-start gap-2">
                      <AlertTriangle
                        v-if="block.kind === 'bottleneck'"
                        :size="15"
                        class="mt-0.5 shrink-0 text-danger"
                      />
                      <CheckCircle2
                        v-else-if="block.kind === 'positive'"
                        :size="15"
                        class="mt-0.5 shrink-0 text-emerald-300"
                      />
                      <Info
                        v-else
                        :size="15"
                        class="mt-0.5 shrink-0 text-amber-200"
                      />
                      <div class="min-w-0">
                        <p
                          class="font-medium"
                          :class="{
                            'text-danger': block.kind === 'bottleneck',
                            'text-emerald-200': block.kind === 'positive',
                            'text-amber-100': block.kind === 'attention',
                          }"
                        >
                          {{ block.title }}
                        </p>
                        <p class="mt-0.5 text-xs leading-relaxed text-text-secondary">
                          {{ block.detail }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <ul
                  v-if="funnelSoftMessages.length"
                  class="mt-3 space-y-1 border-t border-border-subtle/40 pt-2 text-xs text-text-muted"
                >
                  <li v-for="(msg, i) in funnelSoftMessages" :key="i">{{ msg }}</li>
                </ul>
              </div>
            </div>
          </div>

          <div v-else-if="activeTab === 'evolution'">
            <template v-if="!hasAgent || !hasWeeks">
              <p class="text-sm text-text-muted">
                {{ !hasAgent ? 'Nenhum agente vinculado.' : 'Nenhuma semana importada ainda.' }}
              </p>
            </template>
            <template v-else>
              <div class="space-y-3">
                <table class="w-full text-left text-sm">
                  <thead class="border-b border-border-subtle text-xs uppercase text-text-muted">
                    <tr>
                      <th class="pb-2">Semana</th>
                      <th class="pb-2 text-right">Ativos</th>
                      <th class="pb-2 text-right">Rake semana</th>
                      <th class="pb-2 text-right">Rake acumulado</th>
                      <th class="pb-2 text-right">Recuperação</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle/50">
                    <tr
                      v-for="row in evolutionRows"
                      :key="row.label"
                      class="text-text-secondary"
                    >
                      <td class="py-2 font-medium text-text-primary">{{ row.label }}</td>
                      <td class="py-2 text-right tabular-nums">{{ row.uniquePlayers }}</td>
                      <td class="py-2 text-right tabular-nums">{{ formatCurrency(row.weeklyRake) }}</td>
                      <td class="py-2 text-right tabular-nums">{{ formatCurrency(row.accumulated) }}</td>
                      <td class="py-2 text-right tabular-nums">{{ formatPercent(row.recovery) }}</td>
                    </tr>
                  </tbody>
                </table>

                <div v-if="importsForAgent.length" class="mt-5 space-y-2">
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Importações
                  </h4>
                  <ul class="space-y-1.5">
                    <li
                      v-for="imp in importsForAgent"
                      :key="imp.id"
                      class="rounded-lg bg-surface/40 px-3 py-2 text-xs text-text-secondary"
                    >
                      <span class="font-medium text-text-primary">{{ imp.originalFilename }}</span>
                      — {{ store.formatPeriodLabel(imp.periodStart, imp.periodEnd) }}
                    </li>
                  </ul>
                </div>
              </div>
            </template>
          </div>

          <div v-else-if="activeTab === 'transactions' && purchasePower" class="space-y-5">
            <template v-if="!hasAgent">
              <p class="text-sm text-text-muted">Nenhum agente vinculado.</p>
            </template>
            <template v-else>
              <section class="space-y-2">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Resumo de poder de compra
                </h4>
                <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                  <div
                    v-for="card in purchasePowerSummary"
                    :key="card.label"
                    class="rounded-xl bg-surface/40 px-3 py-2.5"
                  >
                    <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      {{ card.label }}
                    </p>
                    <p class="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                      {{ card.value }}
                    </p>
                  </div>
                </div>
              </section>

              <section class="space-y-2">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Distribuição
                </h4>
                <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                  <div
                    v-for="card in purchasePowerDistribution"
                    :key="card.label"
                    class="rounded-xl bg-surface/30 px-3 py-2.5"
                  >
                    <p class="text-[11px] text-text-muted">{{ card.label }}</p>
                    <p class="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                      {{ card.value }}
                    </p>
                  </div>
                </div>
              </section>

              <section class="space-y-2">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Evolução
                </h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="mode in [
                      { id: 'volume' as const, label: 'Volume' },
                      { id: 'depositors' as const, label: 'Depositantes' },
                      { id: 'deposits' as const, label: 'Depósitos' },
                    ]"
                    :key="mode.id"
                    type="button"
                    class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                    :class="
                      depositWeeklyMode === mode.id
                        ? 'bg-accent/20 text-accent'
                        : 'text-text-secondary hover:bg-surface'
                    "
                    @click="depositWeeklyMode = mode.id"
                  >
                    {{ mode.label }}
                  </button>
                </div>
                <ul v-if="purchasePower.weekly.length" class="space-y-1.5">
                  <li
                    v-for="week in purchasePower.weekly"
                    :key="week.periodStart"
                    class="rounded-lg bg-surface/40 px-3 py-2 text-xs"
                  >
                    <div class="mb-1 flex justify-between gap-2">
                      <span class="text-text-primary">
                        {{ store.formatPeriodLabel(week.periodStart, week.periodEnd) }}
                      </span>
                      <span class="tabular-nums text-text-secondary">
                        <template v-if="depositWeeklyMode === 'volume'">
                          {{ formatCurrency(week.volume) }}
                        </template>
                        <template v-else-if="depositWeeklyMode === 'depositors'">
                          {{ week.depositors }}
                        </template>
                        <template v-else>
                          {{ week.deposits }}
                        </template>
                      </span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full bg-black/30">
                      <div
                        class="h-full rounded-full bg-accent/70"
                        :style="{
                          width: `${
                            ((depositWeeklyMode === 'volume'
                              ? week.volume
                              : depositWeeklyMode === 'depositors'
                                ? week.depositors
                                : week.deposits) /
                              depositWeeklyMax) *
                            100
                          }%`,
                        }"
                      />
                    </div>
                  </li>
                </ul>
                <p v-else class="text-sm text-text-muted">
                  Nenhum depósito importado para esta agência.
                </p>
              </section>

              <section class="space-y-2">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Ativação × depósito
                </h4>
                <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div class="rounded-xl bg-surface/40 px-3 py-2.5">
                    <p class="text-[11px] uppercase text-text-muted">Depositou e ativo</p>
                    <p class="mt-1 font-semibold tabular-nums">
                      {{ purchasePower.activationCross.depositedAndActive }}
                    </p>
                  </div>
                  <div class="rounded-xl bg-surface/40 px-3 py-2.5">
                    <p class="text-[11px] uppercase text-text-muted">Depositou sem ativo</p>
                    <p class="mt-1 font-semibold tabular-nums">
                      {{ purchasePower.activationCross.depositedNotActive }}
                    </p>
                  </div>
                  <div class="rounded-xl bg-surface/40 px-3 py-2.5">
                    <p class="text-[11px] uppercase text-text-muted">Ativo e depositou</p>
                    <p class="mt-1 font-semibold tabular-nums">
                      {{ purchasePower.activationCross.activeAndDeposited }}
                    </p>
                  </div>
                  <div class="rounded-xl bg-surface/40 px-3 py-2.5">
                    <p class="text-[11px] uppercase text-text-muted">Ativo sem depósito</p>
                    <p class="mt-1 font-semibold tabular-nums">
                      {{ purchasePower.activationCross.activeWithoutDeposit }}
                    </p>
                  </div>
                </div>
              </section>

              <section class="space-y-2">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Custo de ativação
                </h4>
                <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <div class="rounded-xl border border-border-subtle/50 bg-surface/30 px-3 py-2.5">
                    <p class="text-[11px] text-text-muted">Investimento de Ativação</p>
                    <p class="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                      {{ formatCurrency(purchasePower.activationInvestment) }}
                    </p>
                  </div>
                  <div class="rounded-xl border border-border-subtle/50 bg-surface/30 px-3 py-2.5">
                    <p class="text-[11px] text-text-muted">Bônus</p>
                    <p class="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                      {{ formatNumber(purchasePower.bonusCount) }}
                    </p>
                  </div>
                  <div class="rounded-xl border border-border-subtle/50 bg-surface/30 px-3 py-2.5">
                    <p class="text-[11px] text-text-muted">Rake / depósito</p>
                    <p class="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                      {{ formatNumber(purchasePower.rakeToDepositRatio) }}
                    </p>
                    <p class="mt-0.5 text-[10px] text-text-muted">
                      Comportamental — não é payback
                    </p>
                  </div>
                </div>
              </section>

              <section class="space-y-2">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Transações de ativação
                </h4>
                <p class="text-[11px] text-text-muted">
                  Bônus que formam o card ATIVAÇÃO desta campanha
                  ({{ formatCurrency(metrics.activationInvestment) }}).
                </p>
                <div v-if="activationBonusRows.length" class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="border-b border-border-subtle text-[10px] uppercase text-text-muted">
                      <tr>
                        <th class="pb-2 pr-2">Data</th>
                        <th class="pb-2 pr-2">Receiver Player ID</th>
                        <th class="pb-2 pr-2">Agência</th>
                        <th class="pb-2 pr-2">Campanha</th>
                        <th class="pb-2 pr-2 text-right">Bônus</th>
                        <th class="pb-2">Importação</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border-subtle/50">
                      <tr
                        v-for="row in activationBonusRows"
                        :key="row.id"
                        class="text-text-secondary"
                      >
                        <td class="py-1.5 pr-2 whitespace-nowrap">
                          {{ formatDateTime(row.occurredAt) }}
                        </td>
                        <td class="py-1.5 pr-2 font-mono">{{ row.playerId }}</td>
                        <td class="py-1.5 pr-2">
                          {{ row.agency }}
                          <span v-if="row.agentId" class="block font-mono text-[10px] text-text-muted">
                            {{ row.agentId }}
                          </span>
                        </td>
                        <td class="py-1.5 pr-2">{{ row.campaignName }}</td>
                        <td class="py-1.5 pr-2 text-right tabular-nums text-text-primary">
                          {{ formatCurrency(row.amount) }}
                        </td>
                        <td class="py-1.5 text-text-muted">{{ row.importName }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="text-sm text-text-muted">
                  Nenhum bônus atribuído a jogadores desta campanha.
                </p>
              </section>
            </template>
          </div>

          <div v-else-if="activeTab === 'rake-health'">
            <template v-if="!hasAgent || !hasWeeks">
              <p class="text-sm text-text-muted">
                {{ !hasAgent ? 'Nenhum agente vinculado.' : 'Nenhuma semana importada ainda.' }}
              </p>
            </template>
            <template v-else>
              <div class="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  :class="rakeHealthMode === 'accumulated' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-surface'"
                  @click="rakeHealthMode = 'accumulated'; selectedRakeHealthPeriod = null"
                >
                  Acumulado
                </button>
                <button
                  v-if="periodOptions.length"
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  :class="rakeHealthMode === 'period' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-surface'"
                  @click="rakeHealthMode = 'period'; selectedRakeHealthPeriod = periodOptions[0]?.value ?? null"
                >
                  Por período
                </button>
                <select
                  v-if="rakeHealthMode === 'period' && periodOptions.length"
                  v-model="selectedRakeHealthPeriod"
                  class="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text-primary"
                >
                  <option
                    v-for="opt in periodOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>

              <div v-if="rakeHealth" class="space-y-4">
                <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div class="rounded-xl bg-surface/40 px-3 py-2.5">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      Rake total
                    </p>
                    <p class="mt-1 text-base font-semibold tabular-nums text-text-primary">
                      {{ formatCurrency(rakeHealth.totalRake) }}
                    </p>
                  </div>
                  <div class="rounded-xl bg-surface/40 px-3 py-2.5">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      Jogadores
                    </p>
                    <p class="mt-1 text-base font-semibold tabular-nums text-text-primary">
                      {{ formatNumber(rakeHealth.uniquePlayers) }}
                    </p>
                  </div>
                  <div class="rounded-xl bg-surface/40 px-3 py-2.5">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      Rake médio
                    </p>
                    <p class="mt-1 text-base font-semibold tabular-nums text-text-primary">
                      {{ formatCurrency(rakeHealth.averageRake) }}
                    </p>
                  </div>
                  <div class="rounded-xl bg-surface/40 px-3 py-2.5">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      Rake mediano
                    </p>
                    <p class="mt-1 text-base font-semibold tabular-nums text-text-primary">
                      {{ formatCurrency(rakeHealth.medianRake) }}
                    </p>
                  </div>
                </div>

                <div
                  class="rounded-xl p-4"
                  :class="{
                    'bg-emerald-500/10': rakeHealth.classification === 'distributed',
                    'bg-amber-500/10': rakeHealth.classification === 'attention',
                    'bg-danger/10': rakeHealth.classification === 'concentrated',
                  }"
                >
                  <p
                    class="text-sm font-semibold"
                    :class="{
                      'text-emerald-300': rakeHealth.classification === 'distributed',
                      'text-amber-200': rakeHealth.classification === 'attention',
                      'text-danger': rakeHealth.classification === 'concentrated',
                    }"
                  >
                    {{ rakeHealth.classificationLabel }}
                  </p>
                  <p class="mt-1 text-sm text-text-secondary">
                    {{ rakeHealth.classificationReason }}
                  </p>
                </div>

                <div v-if="rakeHealth.ranking.length" class="space-y-2">
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Ranking Pareto (Top {{ Math.min(10, rakeHealth.ranking.length) }})
                  </h4>
                  <ul class="space-y-1.5">
                    <li
                      v-for="player in rakeHealth.ranking.slice(0, 10)"
                      :key="player.playerId"
                      class="flex items-center justify-between rounded-lg bg-surface/40 px-3 py-2 text-sm"
                    >
                      <span class="flex-1 truncate text-text-primary">
                        {{ player.rank }}. {{ player.name || player.nickname || player.playerId }}
                      </span>
                      <span class="ml-2 tabular-nums text-text-secondary">
                        {{ formatCurrency(player.rake) }}
                        <span class="text-xs text-text-muted">({{ formatPercent(player.share * 100) }})</span>
                      </span>
                    </li>
                  </ul>
                </div>

                <div class="space-y-2">
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Bandas de rake
                  </h4>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div
                      v-for="band in rakeHealth.bands"
                      :key="band.min"
                      class="rounded-lg bg-surface/40 px-3 py-2 text-xs"
                    >
                      <p class="text-text-muted">Acima de {{ formatCurrency(band.min) }}</p>
                      <p class="mt-0.5 text-base font-semibold text-text-primary">
                        {{ band.count }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div v-else-if="activeTab === 'game-profile'">
            <template v-if="!hasAgent || !hasWeeks">
              <p class="text-sm text-text-muted">
                {{ !hasAgent ? 'Nenhum agente vinculado.' : 'Nenhuma semana importada ainda.' }}
              </p>
            </template>
            <template v-else>
              <div class="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  :class="!gameProfilePeriod ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-surface'"
                  @click="gameProfilePeriod = null"
                >
                  Acumulado
                </button>
                <select
                  v-if="periodOptions.length"
                  v-model="gameProfilePeriod"
                  class="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text-primary"
                >
                  <option :value="null">Acumulado</option>
                  <option
                    v-for="opt in periodOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>

              <div class="space-y-4">
                <p class="text-sm text-text-secondary">
                  <span class="font-semibold text-text-primary">Perfil predominante:</span>
                  {{ gameProfile.predominantLabel }}
                </p>

                <div v-if="gameProfile.slices.length" class="space-y-2">
                  <div
                    v-for="slice in gameProfile.slices"
                    :key="slice.code"
                    class="rounded-lg bg-surface/40 px-3 py-3"
                  >
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-semibold text-text-primary">{{ slice.label }}</span>
                      <span class="text-sm tabular-nums text-text-secondary">
                        {{ formatCurrency(slice.rake) }}
                        <span class="text-xs text-text-muted">({{ formatPercent((slice.rakeShare ?? 0) * 100) }})</span>
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-text-muted">
                      {{ slice.uniquePlayers }} {{ slice.uniquePlayers === 1 ? 'jogador' : 'jogadores' }}
                    </p>
                  </div>
                </div>
                <p v-else class="text-sm text-text-muted">
                  Nenhum dado de mesa carregado.
                </p>
              </div>
            </template>
          </div>

          <div v-else-if="activeTab === 'players'">
            <template v-if="!hasAgent || !hasCohort">
              <p class="text-sm text-text-muted">
                {{
                  !hasAgent
                    ? 'Nenhum agente vinculado.'
                    : 'Nenhum jogador adquirido na janela desta campanha.'
                }}
              </p>
            </template>
            <template v-else>
              <div class="mb-4 flex items-center gap-2">
                <div class="relative flex-1">
                  <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    v-model="playerSearch"
                    type="text"
                    placeholder="Buscar por nome, nickname ou ID..."
                    class="w-full rounded-lg border border-border-subtle bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <CollapsiblePanel
                v-if="filteredPlayers.length"
                title="Jogadores"
                :hint="`${filteredPlayers.length} na coorte`"
                :default-open="true"
              >
                <div class="overflow-x-auto px-3 pb-3">
                <table class="w-full text-left text-sm">
                  <thead class="border-b border-border-subtle text-xs uppercase text-text-muted">
                    <tr>
                      <th class="pb-2">Jogador</th>
                      <th
                        class="cursor-pointer pb-2 text-right hover:text-text-primary"
                        @click="sortPlayers('rake')"
                      >
                        <div class="inline-flex items-center gap-1">
                          Rake
                          <ChevronDown
                            v-if="playerSortKey === 'rake'"
                            :size="14"
                            :class="{ 'rotate-180': playerSortAsc }"
                          />
                        </div>
                      </th>
                      <th
                        class="cursor-pointer pb-2 text-right hover:text-text-primary"
                        @click="sortPlayers('weeks')"
                      >
                        <div class="inline-flex items-center gap-1">
                          Semanas
                          <ChevronDown
                            v-if="playerSortKey === 'weeks'"
                            :size="14"
                            :class="{ 'rotate-180': playerSortAsc }"
                          />
                        </div>
                      </th>
                      <th
                        class="cursor-pointer pb-2 text-right hover:text-text-primary"
                        @click="sortPlayers('first')"
                      >
                        <div class="inline-flex items-center gap-1">
                          Primeira
                          <ChevronDown
                            v-if="playerSortKey === 'first'"
                            :size="14"
                            :class="{ 'rotate-180': playerSortAsc }"
                          />
                        </div>
                      </th>
                      <th
                        class="cursor-pointer pb-2 text-right hover:text-text-primary"
                        @click="sortPlayers('last')"
                      >
                        <div class="inline-flex items-center gap-1">
                          Última
                          <ChevronDown
                            v-if="playerSortKey === 'last'"
                            :size="14"
                            :class="{ 'rotate-180': playerSortAsc }"
                          />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle/50">
                    <tr
                      v-for="player in filteredPlayers"
                      :key="player.playerId"
                      class="cursor-pointer text-text-secondary hover:bg-surface/50"
                      @click="openPlayerDetail(player.playerId)"
                    >
                      <td class="py-2 font-medium text-text-primary">
                        {{ player.name || player.nickname || player.playerId }}
                      </td>
                      <td class="py-2 text-right tabular-nums">{{ formatCurrency(player.rake) }}</td>
                      <td class="py-2 text-right tabular-nums">{{ player.weeks }}</td>
                      <td class="py-2 text-right text-xs">{{ store.formatPeriodLabel(player.firstStart, player.firstStart).split(' ')[0] }}</td>
                      <td class="py-2 text-right text-xs">{{ store.formatPeriodLabel(player.lastStart, player.lastStart).split(' ')[0] }}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </CollapsiblePanel>
              <p v-else class="text-sm text-text-muted">
                Nenhum jogador encontrado.
              </p>
            </template>
          </div>

          <div v-else-if="activeTab === 'table-details'">
            <template v-if="!hasAgent || !hasWeeks">
              <p class="text-sm text-text-muted">
                {{ !hasAgent ? 'Nenhum agente vinculado.' : 'Nenhuma semana importada ainda.' }}
              </p>
            </template>
            <template v-else>
              <div class="mb-4">
                <select
                  v-model="tableDetailsPeriod"
                  class="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary"
                >
                  <option :value="null">Todos os períodos</option>
                  <option
                    v-for="opt in periodOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>

              <CollapsiblePanel
                v-if="tableDetails.length"
                title="Detalhes de mesa"
                :hint="`${tableDetails.length} linhas`"
                :default-open="true"
              >
                <div class="overflow-x-auto px-3 pb-3">
                <table class="w-full text-left text-sm">
                  <thead class="border-b border-border-subtle text-xs uppercase text-text-muted">
                    <tr>
                      <th class="pb-2">Mesa</th>
                      <th class="pb-2">Tipo</th>
                      <th class="pb-2 text-right">Mãos</th>
                      <th class="pb-2 text-right">Rake</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle/50">
                    <tr
                      v-for="t in tableDetails.slice(0, 100)"
                      :key="t.id"
                      class="text-text-secondary"
                    >
                      <td class="py-2 font-medium text-text-primary">{{ t.tableName || t.tableId }}</td>
                      <td class="py-2">{{ t.gameType }}</td>
                      <td class="py-2 text-right tabular-nums">{{ t.hands }}</td>
                      <td class="py-2 text-right tabular-nums">{{ formatCurrency(t.rake) }}</td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="tableDetails.length > 100" class="mt-2 px-3 pb-3 text-xs text-text-muted">
                  Mostrando 100 de {{ tableDetails.length }} resultados.
                </p>
                </div>
              </CollapsiblePanel>
              <p v-else class="text-sm text-text-muted">
                Nenhum detalhe de mesa encontrado.
              </p>
            </template>
          </div>

          <div v-else-if="activeTab === 'history'">
            <div v-if="history.length" class="space-y-3">
              <div
                v-for="entry in history.slice(0, 50)"
                :key="entry.id"
                class="border-b border-border-subtle/50 pb-3 last:border-0 last:pb-0"
              >
                <p class="text-xs text-text-muted">
                  {{ new Date(entry.createdAt).toLocaleString('pt-BR') }}
                </p>
                <p class="mt-0.5 text-sm text-text-secondary">
                  {{ entry.description }}
                </p>
              </div>
            </div>
            <p v-else class="text-sm text-text-muted">
              Nenhuma alteração registrada.
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="campaign.notes"
        class="panel-glass space-y-2 rounded-2xl p-4 text-sm text-text-secondary"
      >
        <h3 class="font-semibold text-text-primary">Observações</h3>
        <p>{{ campaign.notes }}</p>
      </div>
    </div>

    <div
      v-if="selectedPlayerDetail"
      class="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-board-elevated shadow-2xl"
    >
      <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-board-elevated p-4">
        <h3 class="text-lg font-semibold text-text-primary">
          {{ selectedPlayerDetail.player.name || selectedPlayerDetail.player.nickname || selectedPlayerDetail.player.playerId }}
        </h3>
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-text-primary"
          @click="closePlayerDetail"
        >
          <ArrowLeft :size="18" />
        </button>
      </div>

      <div class="p-4 space-y-4">
        <div class="grid grid-cols-2 gap-2.5">
          <div class="rounded-xl bg-surface/40 px-3 py-2.5">
            <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Rake total
            </p>
            <p class="mt-1 text-base font-semibold tabular-nums text-text-primary">
              {{ formatCurrency(selectedPlayerDetail.player.rake) }}
            </p>
          </div>
          <div class="rounded-xl bg-surface/40 px-3 py-2.5">
            <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Semanas ativas
            </p>
            <p class="mt-1 text-base font-semibold tabular-nums text-text-primary">
              {{ selectedPlayerDetail.player.weeks }}
            </p>
          </div>
          <div class="rounded-xl bg-surface/40 px-3 py-2.5">
            <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Volume depositado
            </p>
            <p class="mt-1 text-base font-semibold tabular-nums text-text-primary">
              {{ formatCurrency(selectedPlayerDetail.deposits.depositedVolume) }}
            </p>
          </div>
          <div class="rounded-xl bg-surface/40 px-3 py-2.5">
            <p class="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Depósitos
            </p>
            <p class="mt-1 text-base font-semibold tabular-nums text-text-primary">
              {{ formatNumber(selectedPlayerDetail.deposits.depositCount) }}
            </p>
          </div>
        </div>

        <div class="space-y-2">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Histórico semanal
          </h4>
          <ul class="space-y-1.5">
            <li
              v-for="week in selectedPlayerDetail.series"
              :key="week.label"
              class="rounded-lg bg-surface/40 px-3 py-2 text-xs"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium text-text-primary">{{ week.label }}</span>
                <span class="tabular-nums text-text-secondary">{{ formatCurrency(week.weeklyRake) }}</span>
              </div>
              <p class="mt-0.5 text-text-muted">
                Acumulado: {{ formatCurrency(week.accumulated) }}
              </p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
