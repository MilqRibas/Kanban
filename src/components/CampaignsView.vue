<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { FileUp, Loader2, Plus } from '@lucide/vue'
import { useCampaignsStore } from '../stores/campaigns'
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

type CampaignScreen = 'overview' | 'list' | 'comparison' | 'imports'

const store = useCampaignsStore()
const bootstrapping = ref(false)
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

const tabs: { id: CampaignScreen; label: string }[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'list', label: 'Campanhas' },
  { id: 'comparison', label: 'Comparativo' },
  { id: 'imports', label: 'Imports' },
]

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

const years = computed(() => {
  const set = new Set<number>()
  for (const campaign of store.campaigns) {
    set.add(campaign.acquisitionYear)
  }
  return [...set].sort((a, b) => b - a)
})

const filteredCampaigns = computed(() => {
  const nameQuery = filters.value.name.trim().toLowerCase()
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
      campaign.campaignType !== filters.value.campaignType
    ) {
      return false
    }
    if (
      filters.value.nature !== 'all' &&
      campaign.acquisitionNature !== filters.value.nature
    ) {
      return false
    }
    if (nameQuery && !campaign.name.toLowerCase().includes(nameQuery)) {
      return false
    }
    if (filters.value.status !== 'all') {
      const metrics = store.metricsFor(campaign)
      if (metrics.status !== filters.value.status) return false
    }
    return true
  })
})

const overviewKpis = computed(() => store.overviewKpis())

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

    <div
      v-else
      class="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-footer-pad pt-1.5 sm:pt-2"
    >
      <div class="page-shell flex flex-col gap-2 sm:gap-3">
        <header class="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-wide text-accent/90">
              Aquisição
            </p>
            <h2 class="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
              Campanhas
            </h2>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-board-elevated px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface sm:px-3.5 sm:py-2"
              @click="importOpen = true"
            >
              <FileUp :size="16" />
              <span class="sm:hidden">Importar</span>
              <span class="hidden sm:inline">Importar relatório</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-board hover:bg-accent-hover sm:px-3.5 sm:py-2"
              @click="openCreate"
            >
              <Plus :size="16" />
              <span class="sm:hidden">Nova</span>
              <span class="hidden sm:inline">Nova campanha</span>
            </button>
          </div>
        </header>

        <div
          class="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 sm:mx-0 sm:inline-flex sm:flex-wrap sm:gap-1 sm:overflow-visible sm:rounded-xl sm:border sm:border-border-subtle sm:bg-board-elevated/80 sm:p-1"
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
              'shrink-0 rounded-lg px-3 py-1.5 text-xs transition-all sm:text-sm',
              screen === tab.id
                ? 'bg-accent/20 text-text-primary ring-1 ring-accent/45'
                : 'bg-board-elevated/80 text-text-secondary hover:bg-surface hover:text-text-primary sm:bg-transparent',
            ]"
            @click="screen = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <CampaignFilters
          v-if="screen !== 'imports'"
          v-model="filters"
          :years="years"
          :show-archived="store.showArchived"
          @update:show-archived="store.setShowArchived"
        />

        <p
          v-if="store.error"
          class="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200"
        >
          {{ store.error }}
        </p>

        <section v-if="screen === 'overview'" class="space-y-2.5">
          <CampaignKpiCards :kpis="overviewKpis" />
          <CampaignCharts :campaigns="filteredCampaigns" />
        </section>

        <section v-else-if="screen === 'list'" class="space-y-3">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="text-base font-semibold text-text-primary sm:text-lg">
              Lista de campanhas
            </h3>
            <span class="text-xs text-text-muted">
              {{ filteredCampaigns.length }}
              {{ filteredCampaigns.length === 1 ? 'campanha' : 'campanhas' }}
            </span>
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

    <CampaignFormModal
      v-model:open="formOpen"
      :campaign-id="editingId"
      @saved="onSaved"
    />
    <CampaignImportModal v-model:open="importOpen" />
  </div>
</template>
