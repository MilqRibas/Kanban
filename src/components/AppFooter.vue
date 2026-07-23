<script setup lang="ts">
import { CalendarDays, Columns3, NotebookPen } from '@lucide/vue'

export type NavTab = 'agenda' | 'board' | 'notes'

defineProps<{
  activeTab: NavTab
}>()

const emit = defineEmits<{
  'update:activeTab': [tab: NavTab]
}>()

const tabs: { id: NavTab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'board', label: 'Quadro', icon: Columns3 },
  { id: 'notes', label: 'Notas', icon: NotebookPen },
]
</script>

<template>
  <nav
    class="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"
    aria-label="Navegação principal"
  >
    <div
      class="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border-subtle/80 bg-board-elevated/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-md"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        :class="[
          'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors sm:px-4',
          activeTab === tab.id
            ? 'bg-surface text-text-primary'
            : 'text-text-secondary hover:bg-surface/60 hover:text-text-primary',
        ]"
        @click="emit('update:activeTab', tab.id)"
      >
        <component :is="tab.icon" :size="16" :stroke-width="2" />
        <span>{{ tab.label }}</span>
      </button>
    </div>
  </nav>
</template>
