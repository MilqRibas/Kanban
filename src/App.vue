<script setup lang="ts">
import { ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import BoardView from './components/BoardView.vue'
import AgendaView from './components/AgendaView.vue'
import NotesView from './components/NotesView.vue'
import CardDetailPanel from './components/CardDetailPanel.vue'
import type { NavTab } from './components/AppFooter.vue'

const activeTab = ref<NavTab>('board')
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-board">
    <AppHeader />
    <main class="flex min-h-0 flex-1 flex-col">
      <BoardView v-if="activeTab === 'board'" />
      <AgendaView v-else-if="activeTab === 'agenda'" />
      <NotesView v-else />
    </main>
    <AppFooter v-model:active-tab="activeTab" />
    <CardDetailPanel />
  </div>
</template>
