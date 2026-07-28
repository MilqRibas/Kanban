<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { CalendarDays, ChevronDown } from '@lucide/vue'
import {
  DATE_FILTER_OPTIONS,
  type DateFilterMode,
  useBoardStore,
} from '../stores/board'

withDefaults(
  defineProps<{
    compact?: boolean
    mini?: boolean
  }>(),
  { compact: false, mini: false },
)

const board = useBoardStore()
const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

const draftFrom = ref(board.dateFilterFrom)
const draftTo = ref(board.dateFilterTo)

const menuStyle = ref<Record<string, string>>({
  top: '0px',
  left: '0px',
})

const label = computed(() => {
  if (!board.dateFilterMode) return 'Data'
  if (board.dateFilterMode === 'custom') {
    const from = board.dateFilterFrom
    const to = board.dateFilterTo
    if (from && to) {
      return `${formatShort(from)} – ${formatShort(to)}`
    }
    if (from) return `De ${formatShort(from)}`
    if (to) return `Até ${formatShort(to)}`
    return 'Período'
  }
  return (
    DATE_FILTER_OPTIONS.find((o) => o.id === board.dateFilterMode)?.label ??
    'Data'
  )
})

function formatShort(ymd: string) {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}`
}

function updatePosition() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const menuWidth = 260
  const padding = 8
  let left = rect.left
  if (left + menuWidth > window.innerWidth - padding) {
    left = Math.max(padding, rect.right - menuWidth)
  }
  menuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${left}px`,
    width: `${Math.max(rect.width, menuWidth)}px`,
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    draftFrom.value = board.dateFilterFrom
    draftTo.value = board.dateFilterTo
    await nextTick()
    updatePosition()
  }
}

function choose(mode: DateFilterMode) {
  if (mode === 'custom') {
    board.setDateFilter('custom', draftFrom.value, draftTo.value)
    return
  }
  board.setDateFilter(mode)
  open.value = false
}

function applyCustom() {
  board.setDateFilter('custom', draftFrom.value, draftTo.value)
  open.value = false
}

function onDocClick(event: MouseEvent) {
  const target = event.target as Node
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) {
    return
  }
  open.value = false
}

function onWindowChange() {
  if (open.value) updatePosition()
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', onDocClick)
    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', onWindowChange, true)
  } else {
    document.removeEventListener('click', onDocClick)
    window.removeEventListener('resize', onWindowChange)
    window.removeEventListener('scroll', onWindowChange, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      :class="[
        'inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 text-sm transition-colors hover:bg-white/10',
        mini ? 'size-8 justify-center px-0' : 'px-2.5 py-1.5',
        board.dateFilterMode
          ? 'border-accent/50 text-text-primary'
          : 'text-text-secondary',
      ]"
      :aria-expanded="open"
      aria-label="Filtrar por data"
      @click="toggle"
    >
      <CalendarDays :size="15" />
      <span v-if="!mini" class="max-w-[8.5rem] truncate">{{ label }}</span>
      <ChevronDown v-if="!mini" :size="14" class="opacity-60" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        class="fixed z-[200] max-h-80 overflow-y-auto rounded-xl border border-border-subtle bg-board-elevated p-1 shadow-2xl shadow-black/50"
        :style="menuStyle"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
          @click="choose(null)"
        >
          Todas as datas
        </button>
        <button
          v-for="option in DATE_FILTER_OPTIONS"
          :key="option.id"
          type="button"
          :class="[
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface',
            board.dateFilterMode === option.id
              ? 'bg-accent/10 text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          ]"
          @click="choose(option.id)"
        >
          {{ option.label }}
        </button>

        <div class="my-1 border-t border-border-subtle" />

        <div class="space-y-2 px-2.5 py-2">
          <p class="text-xs font-medium text-text-muted">Período personalizado</p>
          <label class="block space-y-1">
            <span class="text-[11px] text-text-muted">De</span>
            <input
              v-model="draftFrom"
              type="date"
              class="w-full rounded-lg border border-white/10 bg-surface px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
              @focus="board.setDateFilter('custom', draftFrom, draftTo)"
            />
          </label>
          <label class="block space-y-1">
            <span class="text-[11px] text-text-muted">Até</span>
            <input
              v-model="draftTo"
              type="date"
              class="w-full rounded-lg border border-white/10 bg-surface px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
              @focus="board.setDateFilter('custom', draftFrom, draftTo)"
            />
          </label>
          <button
            type="button"
            class="w-full rounded-lg bg-accent/15 px-2.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-40"
            :disabled="!draftFrom && !draftTo"
            @click="applyCustom"
          >
            Aplicar período
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
