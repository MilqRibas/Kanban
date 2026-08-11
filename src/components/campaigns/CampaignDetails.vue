<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Archive,
  ArrowLeft,
  Copy,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Search,
  ChevronDown,
} from '@lucide/vue'
import type { Campaign } from '../../types/campaigns'
import { useAuthStore } from '../../stores/auth'
import { useCampaignsStore } from '../../stores/campaigns'
import { useEphemeralDismiss } from '../../composables/useEphemeralDismiss'
import {
  formatCurrency,
  formatPercent,
  formatNumber,
} from '../../utils/campaignFormat'
import CampaignStatusBadge from './CampaignStatusBadge.vue'

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
const activeTab = ref<'overview' | 'evolution' | 'rake-health' | 'game-profile' | 'players' | 'table-details' | 'history'>('overview')

const rakeHealthMode = ref<'accumulated' | 'period'>('accumulated')
const selectedRakeHealthPeriod = ref<string | null>(null)
const gameProfilePeriod = ref<string | null>(null)
const tableDetailsPeriod = ref<string | null>(null)

const playerSearch = ref('')
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
const agentPeriods = computed(() => store.agentPeriodsFor(props.campaign.agentId))
const playerPeriods = computed(() => store.playerPeriodsForAgent(props.campaign.agentId))
const metrics = computed(() => store.metricsFor(props.campaign))
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
  const options = agentPeriods.value.map((p) => ({
    value: p.periodStart,
    label: store.formatPeriodLabel(p.periodStart, p.periodEnd),
  }))
  return options.reverse()
})

const rakeHealth = computed(() => {
  const periodStart = rakeHealthMode.value === 'period' ? selectedRakeHealthPeriod.value : null
  return store.rakeHealthFor(props.campaign, periodStart)
})

const gameProfile = computed(() => {
  const tables = tableDetailsLoaded.value
    ? store.tableDetailsCache.filter(
        (t) =>
          t.agentId === props.campaign.agentId &&
          (!gameProfilePeriod.value || t.periodStart === gameProfilePeriod.value),
      )
    : []
  return store.gameProfileFor(props.campaign, tables, gameProfilePeriod.value)
})

const tableDetails = computed(() => {
  if (!tableDetailsLoaded.value) return []
  return store.tableDetailsCache
    .filter(
      (t) =>
        t.agentId === props.campaign.agentId &&
        (!tableDetailsPeriod.value || t.periodStart === tableDetailsPeriod.value),
    )
    .sort((a, b) => b.rake - a.rake)
})

const uniquePlayers = computed(() => {
  const map = new Map<
    string,
    {
      playerId: string
      name: string
      nickname: string
      rake: number
      weeks: number
      firstStart: string
      lastStart: string
    }
  >()
  for (const p of playerPeriods.value) {
    const prev = map.get(p.playerId)
    if (prev) {
      prev.rake += p.weeklyRake
      prev.weeks += 1
      if (p.periodStart < prev.firstStart) prev.firstStart = p.periodStart
      if (p.periodStart > prev.lastStart) prev.lastStart = p.periodStart
    } else {
      map.set(p.playerId, {
        playerId: p.playerId,
        name: p.playerName,
        nickname: p.nickname,
        rake: p.weeklyRake,
        weeks: 1,
        firstStart: p.periodStart,
        lastStart: p.periodStart,
      })
    }
  }
  return [...map.values()]
})

const filteredPlayers = computed(() => {
  let list = uniquePlayers.value
  const q = playerSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.nickname.toLowerCase().includes(q) ||
        p.playerId.toLowerCase().includes(q),
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
  const periods = playerPeriods.value
    .filter((p) => p.playerId === selectedPlayerId.value)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
  let acc = 0
  const series = periods.map((p) => {
    acc += p.weeklyRake
    return {
      label: store.formatPeriodLabel(p.periodStart, p.periodEnd),
      weeklyRake: p.weeklyRake,
      accumulated: acc,
    }
  })
  return { player, series }
})

const overviewCards = computed(() => {
  const m = metrics.value
  const paybackLabel =
    m.payback.reached && m.payback.periodStart && m.payback.periodEnd
      ? `Semana ${store.formatPeriodLabel(m.payback.periodStart, m.payback.periodEnd)} (${m.payback.periodsToPayback} ${m.payback.periodsToPayback === 1 ? 'semana' : 'semanas'})`
      : m.payback.reached
        ? 'Atingido'
        : 'Ainda não'
  return [
    { label: 'Investimento', value: formatCurrency(props.campaign.investment) },
    { label: 'Jogadores na agência', value: formatNumber(m.agencyPlayers) },
    { label: 'Ativos únicos', value: formatNumber(m.uniqueActivePlayers) },
    { label: 'Inativos', value: formatNumber(m.inactivePlayers) },
    { label: 'Taxa de ativação', value: formatPercent(m.activationRate) },
    { label: 'Rake acumulado', value: formatCurrency(m.accumulatedRake) },
    { label: 'Custo / jogador', value: formatCurrency(m.costPerAgencyPlayer) },
    { label: 'Custo / ativo', value: formatCurrency(m.costPerActive) },
    { label: 'Rake médio / ativo', value: formatCurrency(m.averageRakePerActive) },
    { label: 'Recuperação', value: formatPercent(m.recoveryRate) },
    { label: 'Diferença', value: formatCurrency(m.investmentDifference) },
    { label: 'Payback', value: paybackLabel },
    { label: 'Semanas', value: formatNumber(m.weeksTracked) },
    { label: 'Último relatório', value: m.lastPeriodStart ? store.formatPeriodLabel(m.lastPeriodStart, m.lastPeriodEnd ?? m.lastPeriodStart) : '—' },
  ]
})

const evolutionRows = computed(() => {
  let acc = 0
  const sorted = agentPeriods.value.slice().sort((a, b) => a.periodStart.localeCompare(b.periodStart))
  const maxRake = Math.max(1, ...sorted.map((p) => p.weeklyRake))
  return sorted.map((p) => {
    acc += p.weeklyRake
    const recoveryRate = props.campaign.investment > 0 ? (acc / props.campaign.investment) * 100 : null
    return {
      label: store.formatPeriodLabel(p.periodStart, p.periodEnd),
      weeklyRake: p.weeklyRake,
      accumulated: acc,
      recovery: recoveryRate,
      uniquePlayers: p.uniquePlayers,
      weekWidth: (p.weeklyRake / maxRake) * 100,
    }
  })
})

const hasAgent = computed(() => !!props.campaign.agentId)
const hasWeeks = computed(() => metrics.value.weeksTracked > 0)

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
    await store.loadTableDetails(props.campaign.agentId!, gameProfilePeriod.value ?? undefined)
  }
  if (tab === 'table-details' && !tableDetailsLoaded.value) {
    tableDetailsLoaded.value = true
    await store.loadTableDetails(props.campaign.agentId!, tableDetailsPeriod.value ?? undefined)
  }
})

watch(gameProfilePeriod, async (period) => {
  if (activeTab.value === 'game-profile') {
    await store.loadTableDetails(props.campaign.agentId!, period ?? undefined)
  }
})

watch(tableDetailsPeriod, async (period) => {
  if (activeTab.value === 'table-details') {
    await store.loadTableDetails(props.campaign.agentId!, period ?? undefined)
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
            :class="activeTab === 'evolution' ? 'bg-accent text-board' : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
            @click="activeTab = 'evolution'"
          >
            Evolução
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
            <template v-if="!hasAgent || !hasWeeks">
              <p class="text-sm text-text-muted">
                {{ !hasAgent ? 'Nenhum agente vinculado.' : 'Nenhuma semana importada ainda.' }}
              </p>
            </template>
            <template v-else>
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
            </template>
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

              <div class="space-y-4">
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
            <template v-if="!hasAgent || !hasWeeks">
              <p class="text-sm text-text-muted">
                {{ !hasAgent ? 'Nenhum agente vinculado.' : 'Nenhuma semana importada ainda.' }}
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

              <div v-if="filteredPlayers.length" class="overflow-x-auto">
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

              <div v-if="tableDetails.length" class="overflow-x-auto">
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
                <p v-if="tableDetails.length > 100" class="mt-2 text-xs text-text-muted">
                  Mostrando 100 de {{ tableDetails.length }} resultados.
                </p>
              </div>
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
