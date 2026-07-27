<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
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

const AgendaView = defineAsyncComponent(
  () => import('./components/AgendaView.vue'),
)
const DailyView = defineAsyncComponent(
  () => import('./components/DailyView.vue'),
)
const NotesView = defineAsyncComponent(
  () => import('./components/NotesView.vue'),
)
const HubView = defineAsyncComponent(() => import('./components/HubView.vue'))

const auth = useAuthStore()
const board = useBoardStore()
const notes = useNotesStore()
const daily = useDailyStore()
const notifications = useNotificationsStore()
const community = useCommunityStore()
const hubSections = useHubSectionsStore()
const activeTab = ref<NavTab>('board')
const bootstrapping = ref(false)
const notesReady = ref(false)
const dailyReady = ref(false)

onMounted(async () => {
  await auth.init()
})

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
      notesReady.value = false
      dailyReady.value = false
      return
    }
    bootstrapping.value = true
    try {
      // Só o quadro no boot — notas/tarefas sob demanda
      await board.init()
      await notifications.init()
    } finally {
      bootstrapping.value = false
    }
  },
  { immediate: true },
)

watch(activeTab, async (tab) => {
  board.closeCard()
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
      <main class="flex min-h-0 flex-1 flex-col">
        <BoardView v-if="activeTab === 'board'" />
        <Suspense v-else-if="activeTab === 'agenda'">
          <AgendaView />
          <template #fallback>
            <div class="flex flex-1 items-center justify-center">
              <Loader2 class="animate-spin text-accent" :size="24" />
            </div>
          </template>
        </Suspense>
        <Suspense v-else-if="activeTab === 'daily'">
          <DailyView />
          <template #fallback>
            <div class="flex flex-1 items-center justify-center">
              <Loader2 class="animate-spin text-accent" :size="24" />
            </div>
          </template>
        </Suspense>
        <Suspense v-else-if="activeTab === 'notes'">
          <NotesView />
          <template #fallback>
            <div class="flex flex-1 items-center justify-center">
              <Loader2 class="animate-spin text-accent" :size="24" />
            </div>
          </template>
        </Suspense>
        <Suspense v-else-if="activeTab === 'hub'">
          <HubView />
          <template #fallback>
            <div class="flex flex-1 items-center justify-center">
              <Loader2 class="animate-spin text-accent" :size="24" />
            </div>
          </template>
        </Suspense>
      </main>
      <AppFooter v-model:active-tab="activeTab" />
      <CardDetailPanel />
    </div>
  </div>

  <ToastHost />
</template>
