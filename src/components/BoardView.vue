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
    class="board-scroll flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden px-2 pb-[4.75rem] pt-3 sm:gap-5 sm:px-5 sm:pb-20 sm:pt-4"
  >
    <draggable
      v-model="boardColumns"
      group="columns"
      item-key="id"
      :animation="180"
      handle=".column-drag-handle"
      filter=".column-menu-btn"
      :prevent-on-filter="true"
      ghost-class="column-ghost"
      class="flex h-full gap-3 sm:gap-5"
    >
      <template #item="{ element }">
        <BoardColumn :column="element" />
      </template>
    </draggable>

    <div class="h-fit w-[min(85vw,20rem)] shrink-0 sm:w-80">
      <form
        v-if="isAddingList"
        class="rounded-2xl bg-column/90 p-3"
        @submit.prevent="confirmAddList"
      >
        <input
          ref="listInputRef"
          v-model="newListTitle"
          type="text"
          placeholder="Digite o título da lista…"
          class="mb-3 w-full rounded-lg border border-border-subtle bg-card px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
          @keydown.escape="cancelAddList"
        />
        <div class="flex items-center gap-2">
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
        class="flex w-full items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
        @click="startAddList"
      >
        <Plus :size="16" :stroke-width="2" />
        Adicionar outra lista
      </button>
    </div>
  </div>
</template>
