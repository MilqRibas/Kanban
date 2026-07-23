<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Plus, X } from '@lucide/vue'
import draggable from 'vuedraggable'
import type { Column } from '../types/board'
import { useBoardStore } from '../stores/board'
import BoardColumn from './BoardColumn.vue'

const board = useBoardStore()
const isAddingList = ref(false)
const newListTitle = ref('')
const listInputRef = ref<HTMLInputElement | null>(null)

const boardColumns = computed({
  get: () => board.sortedColumns,
  set: (value: Column[]) => board.reorderColumns(value),
})

async function startAddList() {
  isAddingList.value = true
  await nextTick()
  listInputRef.value?.focus()
}

function cancelAddList() {
  isAddingList.value = false
  newListTitle.value = ''
}

function confirmAddList() {
  const title = newListTitle.value.trim()
  if (!title) {
    cancelAddList()
    return
  }
  board.addColumn(title)
  newListTitle.value = ''
  nextTick(() => listInputRef.value?.focus())
}
</script>

<template>
  <div
    class="board-scroll flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-4 pb-24 pt-4"
  >
    <draggable
      v-model="boardColumns"
      group="columns"
      item-key="id"
      :animation="180"
      handle=".column-drag-handle"
      ghost-class="column-ghost"
      class="flex h-full gap-3"
    >
      <template #item="{ element }">
        <BoardColumn :column="element" />
      </template>
    </draggable>

    <div class="h-fit w-72 shrink-0">
      <form
        v-if="isAddingList"
        class="rounded-xl bg-column p-2"
        @submit.prevent="confirmAddList"
      >
        <input
          ref="listInputRef"
          v-model="newListTitle"
          type="text"
          placeholder="Digite o título da lista…"
          class="mb-2 w-full rounded-lg border border-border-subtle bg-card px-2.5 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
          @keydown.escape="cancelAddList"
        />
        <div class="flex items-center gap-1.5">
          <button
            type="submit"
            class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-board hover:bg-accent-hover"
          >
            Adicionar lista
          </button>
          <button
            type="button"
            class="rounded-md p-1.5 text-text-secondary hover:bg-column-hover"
            aria-label="Cancelar"
            @click="cancelAddList"
          >
            <X :size="16" :stroke-width="2" />
          </button>
        </div>
      </form>

      <button
        v-else
        type="button"
        class="flex w-full items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
        @click="startAddList"
      >
        <Plus :size="16" :stroke-width="2" />
        Adicionar outra lista
      </button>
    </div>
  </div>
</template>
