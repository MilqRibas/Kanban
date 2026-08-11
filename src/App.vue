<script setup lang="ts">
import {
  defineAsyncComponent,
  markRaw,
  onMounted,
  provide,
  type Component,
  ref,
  watch,
} from 'vue'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import BoardView from './components/BoardView.vue'
import CardDetailPanel from './components/CardDetailPanel.vue'
import AuthView from './components/AuthView.vue'
import ToastHost from './components/ToastHost.vue'
import type { NavTab } from './components/AppFooter.vue'
import { Loader2 } from '@lucide/vue'
import { useAuthStore } from './stores/auth'
import { useBoardStore } from './stores/board'
import { useNotesStore } from './stores/notes'
import { useDailyStore } from './stores/dailyTodos'
import { useNotificationsStore } from './stores/notifications'
import { useCommunityStore } from './stores/community'
import { useHubSectionsStore } from './stores/hubSections'
import { useCampaignsStore } from './stores/campaigns'

const TAB_STORAGE_KEY = 'b2c-active-tab'
const NAV_TABS: readonly NavTab[] = [
  'agenda',
  'board',
  'daily',
  'notes',
  'hub',
  'community',
  'campaigns',
]

function readStoredTab(): NavTab {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY)
    if (raw && (NAV_TABS as readonly string[]).includes(raw)) {
      return raw as NavTab
    }
  } catch {
    // ignore storage failures
  }
  return 'board'
}

const asyncOpts = { delay: 320 }

const AgendaView = defineAsyncComponent({
  loader: () => import('./components/AgendaView.vue'),
  ...asyncOpts,
})
const DailyView = defineAsyncComponent({
  loader: () => import('./components/DailyView.vue'),
  ...asyncOpts,
})
const NotesView = defineAsyncComponent({
  loader: () => import('./components/NotesView.vue'),
  ...asyncOpts,
})
const HubView = defineAsyncComponent({
  loader: () => import('./components/HubView.vue'),
  ...asyncOpts,
})
const CampaignsView = defineAsyncComponent({
  loader: () => import('./components/CampaignsView.vue'),
  ...asyncOpts,
})

const tabViews: Record<NavTab, Component> = {
  board: markRaw(BoardView),
  agenda: markRaw(AgendaView),
  daily: markRaw(DailyView),
  notes: markRaw(NotesView),
  hub: markRaw(HubView),
  community: markRaw(HubView),
  campaigns: markRaw(CampaignsView),
}

const auth = useAuthStore()
const board = useBoardStore()
const notes = useNotesStore()
const daily = useDailyStore()
const notifications = useNotificationsStore()
const community = useCommunityStore()
const hubSections = useHubSectionsStore()
const campaigns = useCampaignsStore()
const activeTab = ref<NavTab>(readStoredTab())
const bootstrapping = ref(false)
const notesReady = ref(false)
const dailyReady = ref(false)
const campaignsReady = ref(false)
const hubReady = ref(false)
const chunksPrefetched = ref(false)

function goToTab(tab: NavTab) {
  activeTab.value = tab
}

provide('setActiveTab', goToTab)

onMounted(async () => {
  await auth.init()
})

function prefetchTabChunks() {
  if (chunksPrefetched.value) return
  chunksPrefetched.value = true
  void import('./components/AgendaView.vue')
  void import('./components/DailyView.vue')
  void import('./components/NotesView.vue')
  void import('./components/HubView.vue')
  void import('./components/CampaignsView.vue')
}

async function ensureTabData(tab: NavTab) {
  if (!auth.isAuthenticated || auth.passwordRecovery) return
  if (tab === 'notes' && !notesReady.value) {
    await notes.init()
    notesReady.value = true
  }
  if (tab === 'daily' && !dailyReady.value) {
    await daily.init()
    daily.sanitizeDetailMember()
    dailyReady.value = true
  }
  if ((tab === 'hub' || tab === 'community') && !dailyReady.value) {
    await daily.init()
    daily.sanitizeDetailMember()
    dailyReady.value = true
  }
  if ((tab === 'hub' || tab === 'community') && !hubReady.value) {
    await Promise.all([community.init(), hubSections.init()])
    hubReady.value = true
  }
  if (tab === 'campaigns' && !campaignsReady.value) {
    await campaigns.init()
    campaignsReady.value = true
  }
}

watch(
  () => [auth.isAuthenticated, auth.passwordRecovery] as const,
  async ([authenticated, recovering]) => {
    if (!authenticated || recovering) {
      board.reset()
      notes.reset()
      daily.reset()
      notifications.reset()
      community.reset()
      hubSections.reset()
      campaigns.reset()
      notesReady.value = false
      dailyReady.value = false
      campaignsReady.value = false
      hubReady.value = false
      return
    }
    bootstrapping.value = true
    try {
      await board.init()
      prefetchTabChunks()
      await ensureTabData(activeTab.value)
    } finally {
      bootstrapping.value = false
    }
  },
  { immediate: true },
)

watch(
  () => auth.memberId,
  (memberId) => {
    if (memberId && auth.isAuthenticated && !auth.passwordRecovery) {
      void notifications.init()
      return
    }
    notifications.reset()
  },
  { immediate: true },
)

watch(activeTab, async (tab) => {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    // ignore storage failures
  }
  board.closeCard()
  await ensureTabData(tab)
})
</script>

<template>
  <AuthView
    v-if="!auth.loading && (!auth.isAuthenticated || auth.passwordRecovery)"
  />

  <div
    v-else-if="auth.loading || bootstrapping || !board.ready"
    class="app-bg flex h-full min-h-0 items-center justify-center"
  >
    <Loader2
      class="animate-spin text-accent"
      :size="28"
      :stroke-width="2"
      aria-label="Carregando"
    />
  </div>

  <div
    v-else
    class="app-bg relative flex h-full min-h-0 flex-col"
  >
    <div class="relative z-10 flex h-full min-h-0 flex-col">
      <AppHeader />
      <main
        class="tab-stage relative flex min-h-0 flex-1 flex-col overflow-hidden pb-[var(--footer-clearance)]"
      >
        <Transition name="tab-fade">
          <KeepAlive :max="8">
            <component
              :is="tabViews[activeTab]"
              :key="activeTab"
              v-bind="
                activeTab === 'community'
                  ? { entry: 'conteudo' }
                  : activeTab === 'hub'
                    ? { entry: 'home' }
                    : {}
              "
              class="tab-panel flex min-h-0 w-full flex-1 flex-col"
            />
          </KeepAlive>
        </Transition>
      </main>
      <AppFooter v-model:active-tab="activeTab" />
      <CardDetailPanel />
    </div>
  </div>

  <ToastHost />
</template>
