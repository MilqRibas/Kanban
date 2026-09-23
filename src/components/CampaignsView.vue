<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BarChart3, ContactRound, FileUp, Filter, Loader2, Megaphone, Plus } from '@lucide/vue'
import { useCampaignsStore } from '../stores/campaigns'
import { useCrmStore } from '../stores/crm'
import { useSegmentsStore } from '../stores/segments'
import { usePipelinesStore } from '../stores/pipelines'
import CampaignFilters, {
  type CampaignFiltersState,
} from './campaigns/CampaignFilters.vue'
import CampaignFormModal from './campaigns/CampaignFormModal.vue'
import CampaignImportModal from './campaigns/CampaignImportModal.vue'
import CampaignKpiCards from './campaigns/CampaignKpiCards.vue'
import CampaignTable from './campaigns/CampaignTable.vue'
import CampaignDetails from './campaigns/CampaignDetails.vue'
import CampaignCharts from './campaigns/CampaignCharts.vue'
import CampaignComparison from './campaigns/CampaignComparison.vue'
import CampaignImportsAdmin from './campaigns/CampaignImportsAdmin.vue'
import CampaignXtremeCase from './campaigns/CampaignXtremeCase.vue'
import CrmPipelinesView from './crm/CrmPipelinesView.vue'
import CrmBiView from './crm/CrmBiView.vue'
import SegmentsView from './segments/SegmentsView.vue'
import { buildSearchHaystack, matchesSearch } from '../utils/search'
import type { Campaign } from '../types/campaigns'

type EcosystemArea = 'campaigns' | 'segments' | 'crm' | 'bi'
type CampaignScreen = 'overview' | 'list' | 'comparison' | 'imports'

/** Torneio no filtro também encontra legado Outro + campaign_type_other. */
function matchesCampaignTypeFilter(campaign: Campaign, selected: string) {
  if (campaign.campaignType === selected) return true
  if (
    selected === 'Torneio' &&
    campaign.campaignType === 'Outro' &&
    (campaign.campaignTypeOther || '').trim().toLowerCase() === 'torneio'
  ) {
    return true
  }
  return false
}

const store = useCampaignsStore()
const crm = useCrmStore()
const segments = useSegmentsStore()
const pipelines = usePipelinesStore()
const bootstrapping = ref(false)
const area = ref<EcosystemArea>('campaigns')
const screen = ref<CampaignScreen>('overview')
const formOpen = ref(false)
const importOpen = ref(false)
const editingId = ref<string | null>(null)

const filters = ref<CampaignFiltersState>({
  year: 'all',
  month: 'all',
  status: 'all',
  name: '',
  campaignType: 'all',
  nature: 'all',
})

const areaTabs: { id: EcosystemArea; label: string; icon: typeof ContactRound }[] = [
  { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
  { id: 'segments', label: 'Segmentações', icon: Filter },
  { id: 'crm', label: 'CRM', icon: ContactRound },
  { id: 'bi', label: 'BI', icon: BarChart3 },
]

const tabs: { id: CampaignScreen; label: string }[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'list', label: 'Lista' },
  { id: 'comparison', label: 'Comparativo' },
  { id: 'imports', label: 'Imports' },
]

const areaTitle = computed(() => {
  const found = areaTabs.find((t) => t.id === area.value)
  return found?.label ?? 'Campanhas'
})

onMounted(async () => {
  if (!store.ready) {
    bootstrapping.value = true
    try {
      await store.init()
    } finally {
      bootstrapping.value = false
    }
  }
})

watch(area, async (next) => {
  if (next === 'crm' || next === 'bi') {
    if (!crm.ready) await crm.init()
  }
  if (next === 'segments') {
    if (!segments.ready) await segments.init()
  }
  if (next === 'crm') {
    if (!pipelines.ready) await pipelines.init()
  }
})

/** Lista/Comparativo: períodos SX + bônus (ativação entra no payback). */
watch(screen, (next) => {
  if (next === 'list' || next === 'comparison') {
    void store.ensurePeriodsLoaded()
    void store.ensureBonusTransactionsLoaded()
  }
})

watch(
  () => filters.value.status,
  (status) => {
    if (status !== 'all') void store.ensurePeriodsLoaded()
  },
)

const years = computed(() => {
  const set = new Set<number>()
  for (const campaign of store.campaigns) {
    set.add(campaign.acquisitionYear)
  }
  return [...set].sort((a, b) => b - a)
})

const campaignSearchIndex = computed(() => {
  const map = new Map<string, string>()
  for (const campaign of store.campaigns) {
    const agent = store.findAgent(campaign.agentId)
    map.set(
      campaign.id,
      buildSearchHaystack([
        campaign.name,
        campaign.agency,
        campaign.agentId,
        agent?.name,
        campaign.campaignType,
        campaign.campaignTypeOther,
      ]),
    )
  }
  return map
})

const filteredCampaigns = computed(() => {
  const nameQuery = filters.value.name
  const statusFilter = filters.value.status
  return store.campaigns.filter((campaign) => {
    if (!store.showArchived && campaign.isArchived) return false
    if (filters.value.year !== 'all' && campaign.acquisitionYear !== filters.value.year) {
      return false
    }
    if (
      filters.value.month !== 'all' &&
      campaign.acquisitionMonth !== filters.value.month
    ) {
      return false
    }
    if (
      filters.value.campaignType !== 'all' &&
      !matchesCampaignTypeFilter(campaign, filters.value.campaignType)
    ) {
      return false
    }
    if (
      filters.value.nature !== 'all' &&
      campaign.acquisitionNature !== filters.value.nature
    ) {
      return false
    }
    if (
      nameQuery.trim() &&
      !matchesSearch(campaignSearchIndex.value.get(campaign.id) ?? '', nameQuery)
    ) {
      return false
    }
    if (statusFilter !== 'all') {
      const metrics = store.metricsFor(campaign)
      if (metrics.status !== statusFilter) return false
    }
    return true
  })
})

const overviewKpis = computed(() => store.overviewKpis(filteredCampaigns.value))

/** Só restringe agências Xtreme quando o filtro da visão está estreito. */
const xtremeAgentIds = computed(() => {
  const f = filters.value
  const narrowed =
    f.year !== 'all' ||
    f.month !== 'all' ||
    f.status !== 'all' ||
    f.campaignType !== 'all' ||
    f.nature !== 'all' ||
    f.name.trim() !== ''
  if (!narrowed) return null
  return [
    ...new Set(
      filteredCampaigns.value
        .map((c) => c.agentId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
})

const selectedCampaign = computed(() => store.selectedCampaign)

function openCreate() {
  editingId.value = null
  formOpen.value = true
}

function onView(id: string) {
  store.open(id)
}

function onEdit(id: string) {
  editingId.value = id
  formOpen.value = true
}

function onSaved(id: string) {
  if (screen.value === 'overview') screen.value = 'list'
  if (!store.selectedCampaignId) store.open(id)
}

function onBackFromDetails() {
  store.close()
}
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      v-if="bootstrapping || (store.loading && !store.ready)"
      class="flex min-h-0 flex-1 items-center justify-center"
    >
      <Loader2
        class="animate-spin text-accent"
        :size="28"
        :stroke-width="2"
        aria-label="Carregando campanhas"
      />
    </div>

    <CampaignDetails
      v-else-if="selectedCampaign"
      :campaign="selectedCampaign"
      @back="onBackFromDetails"
      @edit="onEdit"
    />

    <template v-else>
      <!-- Chrome: área do ecossistema (1ª linha) → subvisão de Campanhas (2ª linha) -->
      <div class="page-shell shrink-0 space-y-3 pt-1.5 sm:pt-2">
        <header class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold tracking-tight text-text-primary sm:text-2xl">
              {{ areaTitle }}
            </h2>
          </div>
          <div v-if="area === 'campaigns'" class="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              class="inline-flex size-9 items-center justify-center rounded-xl border border-border-subtle bg-board-elevated text-text-primary hover:bg-surface sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-sm sm:font-medium"
              title="Importar relatório"
              aria-label="Importar relatório"
              @click="importOpen = true"
            >
              <FileUp :size="16" />
              <span class="hidden sm:inline">Importar relatório</span>
            </button>
            <button
              type="button"
              class="inline-flex h-9 items-center gap-1 rounded-xl bg-accent px-2.5 text-sm font-semibold text-board hover:bg-accent-hover sm:h-auto sm:gap-1.5 sm:px-3.5 sm:py-2"
              @click="openCreate"
            >
              <Plus :size="16" />
              <span class="sm:hidden">Nova</span>
              <span class="hidden sm:inline">Nova campanha</span>
            </button>
          </div>
        </header>

        <!-- Nível 1: módulos do ecossistema (sempre full-width, empilhados) -->
        <div
          class="flex w-full gap-1 overflow-x-auto rounded-2xl border border-border-subtle bg-board-elevated/80 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Áreas do ecossistema"
        >
          <button
            v-for="tab in areaTabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="area === tab.id"
            :class="[
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
              area === tab.id
                ? 'bg-accent text-board shadow-sm'
                : 'text-text-secondary hover:bg-surface hover:text-text-primary',
            ]"
            @click="area = tab.id"
          >
            <component :is="tab.icon" :size="15" class="shrink-0" />
            {{ tab.label }}
          </button>
        </div>

        <!-- Nível 2: só dentro de Campanhas — visual secundário -->
        <div
          v-if="area === 'campaigns'"
          class="flex w-full gap-0.5 overflow-x-auto border-b border-border-subtle [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Visões de campanhas"
        >
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="screen === tab.id"
            :class="[
              'shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
              screen === tab.id
                ? 'border-accent text-text-primary font-medium'
                : 'border-transparent text-text-muted hover:text-text-secondary',
            ]"
            @click="screen = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <CampaignFilters
          v-if="area === 'campaigns' && screen !== 'imports'"
          v-model="filters"
          :years="years"
          :show-archived="store.showArchived"
          @update:show-archived="store.setShowArchived"
        />

        <p
          v-if="area === 'campaigns' && store.error"
          class="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200"
        >
          {{ store.error }}
        </p>
      </div>

      <!-- Conteúdo com scroll próprio até a barra flutuante -->
      <div
        class="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-footer-pad sm:mt-3"
      >
        <div v-if="area === 'segments'" class="page-shell pb-3">
          <SegmentsView />
        </div>
        <div v-else-if="area === 'crm'" class="page-shell pb-3">
          <CrmPipelinesView />
        </div>
        <div v-else-if="area === 'bi'" class="page-shell pb-3">
          <CrmBiView />
        </div>
        <div v-else class="page-shell pb-3">
          <section v-if="screen === 'overview'" class="space-y-3">
            <p class="px-0.5 text-xs text-text-muted">
              Nos KPIs de campanha, recuperação e payback usam
              <span class="text-text-secondary">rake líquido</span>
              (bruto − 18% taxa da liga). No case Xtreme Pro, o líquido é
              <span class="text-text-secondary">bruto − investimento − ativação</span>.
            </p>
            <CampaignKpiCards :kpis="overviewKpis" />
            <CampaignCharts :campaigns="filteredCampaigns" @view="onView" />
            <CampaignXtremeCase :agent-ids="xtremeAgentIds" />
          </section>

          <section v-else-if="screen === 'list'" class="min-w-0 space-y-2">
            <div class="flex items-baseline justify-between gap-2 px-0.5">
              <h3 class="text-sm font-semibold text-text-primary">
                Lista de campanhas
              </h3>
              <p class="text-[11px] text-text-muted">
                {{ filteredCampaigns.length }}
                {{ filteredCampaigns.length === 1 ? 'campanha' : 'campanhas' }}
              </p>
            </div>

            <CampaignTable
              :campaigns="filteredCampaigns"
              @view="onView"
              @edit="onEdit"
            />
          </section>

          <section v-else-if="screen === 'comparison'">
            <CampaignComparison :campaigns="filteredCampaigns" />
          </section>

          <section v-else>
            <CampaignImportsAdmin />
          </section>
        </div>
      </div>
    </template>

    <CampaignFormModal
      v-model:open="formOpen"
      :campaign-id="editingId"
      @saved="onSaved"
    />
    <CampaignImportModal v-model:open="importOpen" />
  </div>
</template>
