<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronDown, Tag } from '@lucide/vue'
import { LABEL_COLOR_MAP } from '../types/board'
import { useBoardStore } from '../stores/board'

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

const menuStyle = ref<Record<string, string>>({
  top: '0px',
  left: '0px',
})

const label = computed(() => {
  if (!board.labelFilterId) return 'Etiquetas'
  return board.activeLabelFilter?.name ?? 'Etiquetas'
})

function updatePosition() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const menuWidth = 224
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
    await nextTick()
    updatePosition()
  }
}

function choose(labelId: string | null) {
  board.setLabelFilter(labelId)
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
        board.labelFilterId ? 'border-accent/50 text-text-primary' : 'text-text-secondary',
      ]"
      :aria-expanded="open"
      aria-label="Filtrar por etiqueta"
      @click="toggle"
    >
      <span
        v-if="board.activeLabelFilter"
        class="size-2.5 rounded-full"
        :style="{ backgroundColor: LABEL_COLOR_MAP[board.activeLabelFilter.color] }"
      />
      <Tag v-else :size="15" />
      <span v-if="!mini" class="max-w-[7rem] truncate">{{ label }}</span>
      <ChevronDown v-if="!mini" :size="14" class="opacity-60" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        class="fixed z-[200] max-h-72 overflow-y-auto rounded-xl border border-border-subtle bg-board-elevated p-1 shadow-2xl shadow-black/50"
        :style="menuStyle"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
          @click="choose(null)"
        >
          Todas as etiquetas
        </button>
        <button
          v-for="item in board.labels"
          :key="item.id"
          type="button"
          :class="[
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface',
            board.labelFilterId === item.id
              ? 'bg-accent/10 text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          ]"
          @click="choose(item.id)"
        >
          <span
            class="size-2.5 rounded-full"
            :style="{ backgroundColor: LABEL_COLOR_MAP[item.color] }"
          />
          {{ item.name }}
        </button>
        <p
          v-if="!board.labels.length"
          class="px-2.5 py-3 text-center text-xs text-text-muted"
        >
          Nenhuma etiqueta ainda
        </p>
      </div>
    </Teleport>
  </div>
</template>
