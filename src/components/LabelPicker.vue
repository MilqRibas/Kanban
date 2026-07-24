<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import type { Label, LabelColor } from '../types/board'
import { LABEL_COLOR_MAP } from '../types/board'
import { useBoardStore } from '../stores/board'
import { useEphemeralDismiss } from '../composables/useEphemeralDismiss'

const props = defineProps<{
  selectedIds: string[]
  labels: Label[]
  cardId?: string
}>()

const emit = defineEmits<{
  toggle: [labelId: string]
}>()

const board = useBoardStore()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const newName = ref('')
const newColor = ref<LabelColor>('blue')
const creating = ref(false)

const colorOptions = Object.keys(LABEL_COLOR_MAP) as LabelColor[]

useEphemeralDismiss({
  isOpen: open,
  onClose: () => {
    open.value = false
  },
  roots: [rootRef],
  delayMs: 4000,
})

const selected = () =>
  props.selectedIds
    .map((id) => props.labels.find((label) => label.id === id))
    .filter((label): label is Label => Boolean(label))

async function toggleOpen() {
  open.value = !open.value
  if (open.value) await nextTick()
}

async function createLabel() {
  const name = newName.value.trim()
  if (!name || creating.value) return
  creating.value = true
  try {
    const label = await board.createLabel(name, newColor.value, props.cardId)
    if (label) {
      newName.value = ''
      newColor.value = 'blue'
    }
  } finally {
    creating.value = false
  }
}

async function removeLabel(labelId: string, event: Event) {
  event.stopPropagation()
  if (!window.confirm('Excluir esta etiqueta do quadro?')) return
  await board.deleteLabel(labelId)
}
</script>

<template>
  <div ref="rootRef" class="relative" data-ephemeral-menu>
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
        title="Adicionar ou criar etiqueta"
        :aria-expanded="open"
        @click="toggleOpen"
      >
        <Plus :size="14" />
      </button>
    </div>

    <div
      v-if="open"
      class="absolute left-0 top-[calc(100%+6px)] z-40 w-64 overflow-hidden rounded-xl border border-white/10 bg-board-elevated shadow-xl shadow-black/50"
      role="listbox"
      aria-label="Etiquetas"
    >
      <div class="max-h-44 space-y-1 overflow-y-auto p-1.5">
        <div
          v-for="label in labels"
          :key="label.id"
          role="option"
          :aria-selected="selectedIds.includes(label.id)"
          class="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left"
        >
          <button
            type="button"
            class="h-7 min-w-0 flex-1 truncate rounded-md px-2.5 text-left text-xs font-semibold leading-7 text-board"
            :style="{ backgroundColor: LABEL_COLOR_MAP[label.color] }"
            @click="emit('toggle', label.id)"
          >
            {{ label.name }}
          </button>
          <span
            v-if="selectedIds.includes(label.id)"
            class="text-[10px] font-medium text-[#39bcff]"
          >
            ✓
          </span>
          <button
            type="button"
            class="rounded p-1 text-text-muted hover:bg-danger/15 hover:text-danger"
            title="Excluir etiqueta"
            @click="removeLabel(label.id, $event)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
        <p
          v-if="!labels.length"
          class="px-2 py-3 text-center text-xs text-text-muted"
        >
          Nenhuma etiqueta ainda. Crie a primeira abaixo.
        </p>
      </div>

      <form
        class="space-y-2 border-t border-white/10 p-2.5"
        @submit.prevent="createLabel"
      >
        <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Criar etiqueta
        </p>
        <input
          v-model="newName"
          type="text"
          maxlength="40"
          placeholder="Nome da etiqueta"
          class="w-full rounded-lg border border-border-subtle bg-column px-2.5 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
        />
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="color in colorOptions"
            :key="color"
            type="button"
            :class="[
              'size-5 rounded-full transition-transform',
              newColor === color
                ? 'scale-110 ring-2 ring-white ring-offset-1 ring-offset-board-elevated'
                : 'opacity-80 hover:opacity-100',
            ]"
            :style="{ backgroundColor: LABEL_COLOR_MAP[color] }"
            :title="color"
            :aria-label="`Cor ${color}`"
            @click="newColor = color"
          />
        </div>
        <button
          type="submit"
          class="w-full rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-board hover:bg-accent-hover disabled:opacity-50"
          :disabled="creating || !newName.trim()"
        >
          {{ creating ? 'Criando…' : 'Criar e adicionar' }}
        </button>
      </form>
    </div>
  </div>
</template>
