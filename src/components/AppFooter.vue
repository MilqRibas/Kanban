<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CalendarDays,
  Columns3,
  Ellipsis,
  LayoutGrid,
  ListChecks,
  Megaphone,
  NotebookPen,
  Users,
} from '@lucide/vue'
import { useAuthStore } from '../stores/auth'

export type NavTab =
  | 'agenda'
  | 'board'
  | 'daily'
  | 'notes'
  | 'hub'
  | 'community'
  | 'campaigns'

const props = defineProps<{
  activeTab: NavTab
}>()

const emit = defineEmits<{
  'update:activeTab': [tab: NavTab]
}>()

const auth = useAuthStore()

type TabItem = { id: NavTab; label: string; icon: typeof CalendarDays }

/** Ordem alfabética; as 5 primeiras ficam sempre visíveis no mobile */
const ALL_TABS: TabItem[] = [
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
  { id: 'community', label: 'Comunidade', icon: Users },
  { id: 'hub', label: 'HUB', icon: LayoutGrid },
  { id: 'notes', label: 'Notas', icon: NotebookPen },
  { id: 'board', label: 'Quadro', icon: Columns3 },
  { id: 'daily', label: 'Tarefas', icon: ListChecks },
]

const tabs = computed(() => {
  const allowed = new Set(auth.allowedTabs as readonly string[])
  return ALL_TABS.filter((tab) => allowed.has(tab.id))
})

/** Abas principais no mobile (resto vai em "Mais") */
const PRIMARY_IDS: NavTab[] = ['agenda', 'board', 'daily', 'notes', 'hub']
const MORE_IDS: NavTab[] = ['campaigns', 'community']

const navRef = ref<HTMLElement | null>(null)
const pillRef = ref<HTMLElement | null>(null)
const moreOpen = ref(false)
const useMoreMenu = ref(false)

const primaryTabs = computed(() => {
  const visible = tabs.value
  if (!useMoreMenu.value) return visible
  const primary = visible.filter((tab) => PRIMARY_IDS.includes(tab.id))
  // Papéis com poucas abas (ex.: só Campanhas) — mostra tudo na barra.
  if (primary.length === 0) return visible
  return primary
})
const moreTabs = computed(() => {
  if (!useMoreMenu.value) return []
  const visible = tabs.value
  const primary = visible.filter((tab) => PRIMARY_IDS.includes(tab.id))
  if (primary.length === 0) return []
  return visible.filter((tab) => MORE_IDS.includes(tab.id))
})
const moreActive = computed(
  () => moreTabs.value.some((tab) => tab.id === props.activeTab),
)
const showMoreMenu = computed(() => moreTabs.value.length > 0)

let resizeObserver: ResizeObserver | null = null
let mediaQuery: MediaQueryList | null = null

function updateClearance() {
  const pill = pillRef.value
  if (!pill) return
  const rect = pill.getBoundingClientRect()
  const gap = 12
  // Distância do topo da pill até a base do app (não da janela do browser).
  const appBottom =
    document.getElementById('app')?.getBoundingClientRect().bottom ??
    window.innerHeight
  const clearance = Math.max(
    72,
    Math.ceil(appBottom - rect.top + gap + (window.visualViewport?.offsetTop ?? 0)),
  )
  document.documentElement.style.setProperty('--footer-clearance', `${clearance}px`)
}

function syncMoreMenu(event?: MediaQueryList | MediaQueryListEvent) {
  const matches =
    event && 'matches' in event
      ? event.matches
      : (mediaQuery?.matches ?? window.matchMedia('(max-width: 419px)').matches)
  useMoreMenu.value = matches
  if (!matches) moreOpen.value = false
}

function selectTab(tab: NavTab) {
  moreOpen.value = false
  emit('update:activeTab', tab)
}

function onDocPointerDown(event: PointerEvent) {
  if (!moreOpen.value) return
  const target = event.target as Node | null
  if (pillRef.value?.contains(target)) return
  moreOpen.value = false
}

watch(
  () => props.activeTab,
  () => {
    moreOpen.value = false
  },
)

onMounted(() => {
  updateClearance()
  resizeObserver = new ResizeObserver(() => updateClearance())
  if (pillRef.value) resizeObserver.observe(pillRef.value)
  if (navRef.value) resizeObserver.observe(navRef.value)
  window.addEventListener('resize', updateClearance)

  mediaQuery = window.matchMedia('(max-width: 419px)')
  syncMoreMenu(mediaQuery)
  mediaQuery.addEventListener('change', syncMoreMenu)

  document.addEventListener('pointerdown', onDocPointerDown)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', updateClearance)
  mediaQuery?.removeEventListener('change', syncMoreMenu)
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.documentElement.style.removeProperty('--footer-clearance')
})
</script>

<template>
  <nav
    ref="navRef"
    class="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 pb-[env(safe-area-inset-bottom)] sm:bottom-4 sm:px-4"
    aria-label="Navegação principal"
  >
    <div
      ref="pillRef"
      class="pointer-events-auto relative flex max-w-full items-center gap-0.5 rounded-2xl border border-accent/60 bg-board-elevated/95 px-1.5 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-md sm:gap-2 sm:px-2.5 sm:py-2"
    >
      <button
        v-for="tab in primaryTabs"
        :key="tab.id"
        type="button"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        :aria-label="tab.label"
        :title="tab.label"
        :class="[
          'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs transition-all duration-300 ease-out sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm',
          activeTab === tab.id
            ? 'bg-accent/20 text-text-primary ring-1 ring-accent/45'
            : 'text-text-secondary hover:bg-surface hover:text-text-primary',
        ]"
        @click="selectTab(tab.id)"
      >
        <component :is="tab.icon" :size="17" :stroke-width="2" />
        <span class="hidden sm:inline">{{ tab.label }}</span>
      </button>

      <div v-if="showMoreMenu" class="relative">
        <button
          type="button"
          aria-label="Mais"
          title="Mais"
          :aria-expanded="moreOpen"
          :aria-haspopup="true"
          :class="[
            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs transition-all duration-300 ease-out',
            moreActive || moreOpen
              ? 'bg-accent/20 text-text-primary ring-1 ring-accent/45'
              : 'text-text-secondary hover:bg-surface hover:text-text-primary',
          ]"
          @click="moreOpen = !moreOpen"
        >
          <Ellipsis :size="17" :stroke-width="2" />
        </button>

        <div
          v-if="moreOpen"
          class="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[11rem] overflow-hidden rounded-xl border border-border-subtle bg-board-elevated py-1 shadow-2xl shadow-black/50"
          role="menu"
        >
          <button
            v-for="tab in moreTabs"
            :key="tab.id"
            type="button"
            role="menuitem"
            :aria-current="activeTab === tab.id ? 'page' : undefined"
            :class="[
              'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors',
              activeTab === tab.id
                ? 'bg-accent/15 text-text-primary'
                : 'text-text-secondary hover:bg-surface hover:text-text-primary',
            ]"
            @click="selectTab(tab.id)"
          >
            <component :is="tab.icon" :size="16" :stroke-width="2" />
            {{ tab.label }}
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>
