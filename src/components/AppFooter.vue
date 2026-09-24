<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BarChart3,
  CalendarDays,
  Columns3,
  Ellipsis,
  ListChecks,
  Megaphone,
  NotebookPen,
  Plus,
  Star,
  Users,
  type LucideIcon,
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

const SX_PLAYER_URL = 'https://sxplayer.vercel.app/admin'
const TRAFFIC_REPORT_URL = 'https://dash-performance-trafego.vercel.app/'

type ExternalId = 'sx-player' | 'trafego'
type FooterNavId = NavTab | ExternalId

type TabItem = {
  kind: 'tab'
  id: NavTab
  label: string
  icon: LucideIcon
  /** Se false, só ícone (ex.: HUB como +). */
  showLabel?: boolean
  /** Estilo especial: botão circular com stroke. */
  variant?: 'default' | 'hubPlus'
}

type ExternalItem = {
  kind: 'external'
  id: string
  label: string
  href: string
  icon: LucideIcon
}

type FooterItem = TabItem | ExternalItem

/** Ordem visual: HUB (+) por último; links externos antes do HUB. */
const ALL_ITEMS: FooterItem[] = [
  { kind: 'tab', id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { kind: 'tab', id: 'campaigns', label: 'Campanhas', icon: Megaphone },
  { kind: 'tab', id: 'community', label: 'Comunidade', icon: Users },
  { kind: 'tab', id: 'notes', label: 'Notas', icon: NotebookPen },
  { kind: 'tab', id: 'board', label: 'Quadro', icon: Columns3 },
  { kind: 'tab', id: 'daily', label: 'Tarefas', icon: ListChecks },
  {
    kind: 'external',
    id: 'sx-player',
    label: 'SX Player',
    href: SX_PLAYER_URL,
    icon: Star,
  },
  {
    kind: 'external',
    id: 'trafego',
    label: 'Tráfego',
    href: TRAFFIC_REPORT_URL,
    icon: BarChart3,
  },
  {
    kind: 'tab',
    id: 'hub',
    label: 'HUB',
    icon: Plus,
    showLabel: false,
    variant: 'hubPlus',
  },
]

const items = computed(() => {
  const allowed = new Set(auth.allowedTabs as readonly string[])
  return ALL_ITEMS.filter((item) => {
    if (item.kind === 'external') return !auth.isCampaignsOnly
    return allowed.has(item.id)
  })
})

/** Abas principais no mobile (resto vai em "Mais") */
const PRIMARY_IDS: FooterNavId[] = [
  'agenda',
  'board',
  'daily',
  'notes',
  'campaigns',
  'sx-player',
  'trafego',
  'hub',
]
const MORE_IDS: FooterNavId[] = ['community']

const navRef = ref<HTMLElement | null>(null)
const pillRef = ref<HTMLElement | null>(null)
const moreOpen = ref(false)
const useMoreMenu = ref(false)

function itemKey(item: FooterItem) {
  return item.kind === 'tab' ? item.id : item.id
}

const primaryItems = computed(() => {
  const visible = items.value
  if (!useMoreMenu.value) return visible
  const primary = visible.filter((item) =>
    PRIMARY_IDS.includes(itemKey(item) as FooterNavId),
  )
  if (primary.length === 0) return visible
  return primary
})

const moreItems = computed(() => {
  if (!useMoreMenu.value) return []
  const visible = items.value
  const primary = visible.filter((item) =>
    PRIMARY_IDS.includes(itemKey(item) as FooterNavId),
  )
  if (primary.length === 0) return []
  return visible.filter((item) => MORE_IDS.includes(itemKey(item) as FooterNavId))
})

const moreActive = computed(() =>
  moreItems.value.some(
    (item) => item.kind === 'tab' && item.id === props.activeTab,
  ),
)
const showMoreMenu = computed(() => moreItems.value.length > 0)

let resizeObserver: ResizeObserver | null = null
let mediaQuery: MediaQueryList | null = null

function updateClearance() {
  const pill = pillRef.value
  if (!pill) return
  const rect = pill.getBoundingClientRect()
  const gap = 12
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

function closeMoreMenu() {
  moreOpen.value = false
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
      class="pointer-events-auto relative flex max-w-full items-center gap-0.5 rounded-2xl border border-accent/60 bg-board-elevated/95 px-1.5 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-md sm:gap-1.5 sm:px-2.5 sm:py-2"
    >
      <template v-for="item in primaryItems" :key="itemKey(item)">
        <!-- HUB: + circular com stroke -->
        <button
          v-if="item.kind === 'tab' && item.variant === 'hubPlus'"
          type="button"
          :aria-current="activeTab === item.id ? 'page' : undefined"
          :aria-label="item.label"
          :title="item.label"
          :class="[
            'inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-out sm:size-10',
            activeTab === item.id
              ? 'border-accent bg-accent/20 text-text-primary'
              : 'border-accent/55 text-text-secondary hover:border-accent hover:bg-surface hover:text-text-primary',
          ]"
          @click="selectTab(item.id)"
        >
          <Plus :size="18" :stroke-width="2.25" />
        </button>

        <!-- Aba normal -->
        <button
          v-else-if="item.kind === 'tab'"
          type="button"
          :aria-current="activeTab === item.id ? 'page' : undefined"
          :aria-label="item.label"
          :title="item.label"
          :class="[
            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs transition-all duration-300 ease-out sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-sm',
            activeTab === item.id
              ? 'bg-accent/20 text-text-primary ring-1 ring-accent/45'
              : 'text-text-secondary hover:bg-surface hover:text-text-primary',
          ]"
          @click="selectTab(item.id)"
        >
          <component :is="item.icon" :size="17" :stroke-width="2" />
          <span v-if="item.showLabel !== false" class="hidden sm:inline">{{ item.label }}</span>
        </button>

        <!-- Link externo (SX Player) — <a> real evita bloqueio de popup -->
        <a
          v-else
          :href="item.href"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="item.label"
          :title="item.label"
          class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs text-text-secondary transition-all duration-300 ease-out hover:bg-surface hover:text-text-primary sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-sm"
          @click="closeMoreMenu"
        >
          <component :is="item.icon" :size="17" :stroke-width="2" />
          <span class="hidden sm:inline">{{ item.label }}</span>
        </a>
      </template>

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
          class="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[11rem] overflow-hidden rounded-2xl border border-border-subtle bg-board-elevated py-1 shadow-2xl shadow-black/50"
          role="menu"
        >
          <template v-for="item in moreItems" :key="itemKey(item)">
            <button
              v-if="item.kind === 'tab'"
              type="button"
              role="menuitem"
              :aria-current="activeTab === item.id ? 'page' : undefined"
              :class="[
                'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors',
                activeTab === item.id
                  ? 'bg-accent/15 text-text-primary'
                  : 'text-text-secondary hover:bg-surface hover:text-text-primary',
              ]"
              @click="selectTab(item.id)"
            >
              <component :is="item.icon" :size="16" :stroke-width="2" />
              {{ item.label }}
            </button>
            <a
              v-else
              role="menuitem"
              :href="item.href"
              target="_blank"
              rel="noopener noreferrer"
              class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              @click="closeMoreMenu"
            >
              <component :is="item.icon" :size="16" :stroke-width="2" />
              {{ item.label }}
            </a>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>
