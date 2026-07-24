<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Plus } from '@lucide/vue'
import type { Label } from '../types/board'
import { LABEL_COLOR_MAP } from '../types/board'

const props = defineProps<{
  selectedIds: string[]
  labels: Label[]
}>()

const emit = defineEmits<{
  toggle: [labelId: string]
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const selected = () =>
  props.selectedIds
    .map((id) => props.labels.find((label) => label.id === id))
    .filter((label): label is Label => Boolean(label))

function onDocPointer(event: PointerEvent) {
  const target = event.target as Node
  if (rootRef.value?.contains(target)) return
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

async function toggleOpen() {
  open.value = !open.value
  if (open.value) await nextTick()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootRef" class="relative">
    <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
      Etiquetas
    </p>

    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="label in selected()"
        :key="label.id"
        type="button"
        class="rounded-md px-2.5 py-1 text-xs font-semibold text-board transition-opacity hover:opacity-80"
        :style="{ backgroundColor: LABEL_COLOR_MAP[label.color] }"
        :title="`Remover ${label.name}`"
        @click="emit('toggle', label.id)"
      >
        {{ label.name }}
      </button>

      <button
        type="button"
        class="inline-flex size-7 items-center justify-center rounded-md border border-white/20 text-text-muted transition-colors hover:border-[#39bcff] hover:bg-[#39bcff]/10 hover:text-[#39bcff]"
        title="Adicionar etiqueta"
        :aria-expanded="open"
        @click="toggleOpen"
      >
        <Plus :size="14" />
      </button>
    </div>

    <div
      v-if="open"
      class="absolute left-0 top-[calc(100%+6px)] z-40 max-h-56 w-56 overflow-y-auto rounded-xl border border-white/10 bg-board-elevated p-1.5 shadow-xl shadow-black/50"
      role="listbox"
      aria-label="Selecionar etiquetas"
    >
      <button
        v-for="label in labels"
        :key="label.id"
        type="button"
        role="option"
        :aria-selected="selectedIds.includes(label.id)"
        class="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left last:mb-0"
        @click="emit('toggle', label.id)"
      >
        <span
          class="h-7 flex-1 rounded-md px-2.5 text-xs font-semibold leading-7 text-board"
          :style="{ backgroundColor: LABEL_COLOR_MAP[label.color] }"
        >
          {{ label.name }}
        </span>
        <span
          v-if="selectedIds.includes(label.id)"
          class="text-[10px] font-medium text-[#39bcff]"
        >
          ✓
        </span>
      </button>
      <p
        v-if="!labels.length"
        class="px-2 py-3 text-center text-xs text-text-muted"
      >
        Nenhuma etiqueta no quadro
      </p>
    </div>
  </div>
</template>
