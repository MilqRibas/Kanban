<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { MoreHorizontal, Plus, X } from '@lucide/vue'
import draggable from 'vuedraggable'
import type { Card, Column } from '../types/board'
import { useBoardStore } from '../stores/board'
import KanbanCard from './KanbanCard.vue'

const props = defineProps<{
  column: Column
}>()

const board = useBoardStore()
const isAdding = ref(false)
const newCardTitle = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

const columnCards = computed({
  get: () => board.cardsByColumn[props.column.id] ?? [],
  set: (value: Card[]) => board.setColumnCards(props.column.id, value),
})

async function startAdd() {
  isAdding.value = true
  await nextTick()
  inputRef.value?.focus()
}

function cancelAdd() {
  isAdding.value = false
  newCardTitle.value = ''
}

function confirmAdd() {
  const title = newCardTitle.value.trim()
  if (!title) {
    cancelAdd()
    return
  }
  board.addCard(props.column.id, title)
  newCardTitle.value = ''
  nextTick(() => inputRef.value?.focus())
}

function onAddKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    confirmAdd()
  }
  if (event.key === 'Escape') cancelAdd()
}
</script>

<template>
  <section
    class="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-column"
  >
    <header class="flex items-center gap-2 px-3 pb-2 pt-3">
      <h2 class="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
        {{ column.title }}
      </h2>
      <span class="rounded-md bg-surface px-1.5 py-0.5 text-xs text-text-muted">
        {{ columnCards.length }}
      </span>
      <button
        type="button"
        class="column-drag-handle cursor-grab rounded-md p-1 text-text-muted transition-colors hover:bg-column-hover hover:text-text-secondary active:cursor-grabbing"
        aria-label="Arrastar lista"
      >
        <MoreHorizontal :size="16" :stroke-width="2" />
      </button>
    </header>

    <draggable
      v-model="columnCards"
      group="cards"
      item-key="id"
      :animation="180"
      ghost-class="card-ghost"
      drag-class="card-drag"
      class="flex min-h-10 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-1"
      :class="{ 'pb-2': columnCards.length === 0 }"
    >
      <template #item="{ element }">
        <KanbanCard :card="element" />
      </template>
    </draggable>

    <footer class="p-2">
      <form
        v-if="isAdding"
        class="flex flex-col gap-2"
        @submit.prevent="confirmAdd"
      >
        <textarea
          ref="inputRef"
          v-model="newCardTitle"
          rows="2"
          placeholder="Digite um título para este cartão…"
          class="w-full resize-none rounded-lg border border-border-subtle bg-card px-2.5 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
          @keydown="onAddKeydown"
        />
        <div class="flex items-center gap-1.5">
          <button
            type="submit"
            class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-board hover:bg-accent-hover"
          >
            Adicionar
          </button>
          <button
            type="button"
            class="rounded-md p-1.5 text-text-secondary hover:bg-column-hover hover:text-text-primary"
            aria-label="Cancelar"
            @click="cancelAdd"
          >
            <X :size="16" :stroke-width="2" />
          </button>
        </div>
      </form>

      <button
        v-else
        type="button"
        class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-column-hover hover:text-text-primary"
        @click="startAdd"
      >
        <Plus :size="16" :stroke-width="2" />
        Adicionar um cartão
      </button>
    </footer>
  </section>
</template>
