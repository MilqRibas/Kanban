<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import BoardView from './components/BoardView.vue'
import AgendaView from './components/AgendaView.vue'
import NotesView from './components/NotesView.vue'
import DailyView from './components/DailyView.vue'
import CardDetailPanel from './components/CardDetailPanel.vue'
import AuthView from './components/AuthView.vue'
import type { NavTab } from './components/AppFooter.vue'
import { Loader2 } from '@lucide/vue'
import boardBg from './assets/brand/bg-board.png'
import { useAuthStore } from './stores/auth'
import { useBoardStore } from './stores/board'
import { useNotesStore } from './stores/notes'
import { useDailyStore } from './stores/dailyTodos'

const auth = useAuthStore()
const board = useBoardStore()
const notes = useNotesStore()
const daily = useDailyStore()
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
      notesReady.value = false
      dailyReady.value = false
      return
    }
    bootstrapping.value = true
    try {
      // Só o quadro no boot — notas/tarefas sob demanda
      await board.init()
    } finally {
      bootstrapping.value = false
    }
  },
  { immediate: true },
)

watch(activeTab, async (tab) => {
  if (!auth.isAuthenticated || auth.passwordRecovery) return
  if (tab === 'notes' && !notesReady.value) {
    await notes.init()
    notesReady.value = true
  }
  if (tab === 'daily' && !dailyReady.value) {
    await daily.init()
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
    class="flex h-full min-h-0 items-center justify-center bg-board"
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
    class="relative flex h-full min-h-0 flex-col bg-board bg-cover bg-center bg-no-repeat"
    :style="{ backgroundImage: `url(${boardBg})` }"
  >
    <div class="pointer-events-none absolute inset-0 bg-board/45" />
    <div class="relative z-10 flex h-full min-h-0 flex-col">
      <AppHeader />
      <main class="flex min-h-0 flex-1 flex-col">
        <BoardView v-if="activeTab === 'board'" />
        <AgendaView v-else-if="activeTab === 'agenda'" />
        <DailyView v-else-if="activeTab === 'daily'" />
        <NotesView v-else />
      </main>
      <AppFooter v-model:active-tab="activeTab" />
      <CardDetailPanel />
    </div>
  </div>
</template>
