<script setup lang="ts">
import { CalendarDays, Columns3, ListChecks, NotebookPen } from '@lucide/vue'

export type NavTab = 'agenda' | 'board' | 'daily' | 'notes'

defineProps<{
  activeTab: NavTab
}>()

const emit = defineEmits<{
  'update:activeTab': [tab: NavTab]
}>()

const tabs: { id: NavTab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'board', label: 'Quadro', icon: Columns3 },
  { id: 'daily', label: 'Tarefas', icon: ListChecks },
  { id: 'notes', label: 'Notas', icon: NotebookPen },
]
</script>

<template>
  <nav
    class="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 pb-[env(safe-area-inset-bottom)] sm:bottom-4 sm:px-4"
    aria-label="Navegação principal"
  >
    <div
      class="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#39bcff]/70 bg-board-elevated/95 px-2 py-1.5 shadow-2xl shadow-black/40 backdrop-blur-md sm:gap-2 sm:px-2.5 sm:py-2"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        :class="[
          'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs transition-colors sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm',
          activeTab === tab.id
            ? 'bg-surface text-text-primary'
            : 'text-text-secondary hover:bg-surface/60 hover:text-text-primary',
        ]"
        @click="emit('update:activeTab', tab.id)"
      >
        <component :is="tab.icon" :size="17" :stroke-width="2" />
        <span>{{ tab.label }}</span>
      </button>
    </div>
  </nav>
</template>
