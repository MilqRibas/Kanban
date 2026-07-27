<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Check, Plus, X } from '@lucide/vue'
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

const canConfirmList = computed(() => Boolean(newListTitle.value.trim()))

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
    listInputRef.value?.focus()
    return
  }
  board.addColumn(title)
  newListTitle.value = ''
  nextTick(() => listInputRef.value?.focus())
}
</script>

<template>
  <div
    class="board-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-[5rem] pt-3 sm:pb-24 sm:pt-4"
  >
    <div
      class="board-track mx-auto flex h-full w-max min-w-full items-start justify-center gap-4 px-5 sm:gap-5 sm:px-8"
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
        class="flex h-full gap-4 sm:gap-5"
      >
        <template #item="{ element }">
          <BoardColumn :column="element" />
        </template>
      </draggable>

      <div class="h-fit w-[min(78vw,18.5rem)] shrink-0 sm:w-72">
        <form
          v-if="isAddingList"
          class="column-glass rounded-2xl p-3"
          @submit.prevent="confirmAddList"
        >
          <label class="mb-2 block text-[11px] font-medium text-text-muted">
            Nome da lista
          </label>
          <div class="flex items-center gap-2">
            <input
              ref="listInputRef"
              v-model="newListTitle"
              type="text"
              placeholder="Digite o título da lista…"
              class="min-w-0 flex-1 rounded-lg border border-border-subtle bg-card px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
              @keydown.escape="cancelAddList"
            />
            <button
              type="submit"
              :disabled="!canConfirmList"
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-board transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              title="Confirmar"
              aria-label="Confirmar nova lista"
            >
              <Check :size="18" :stroke-width="2.5" />
            </button>
            <button
              type="button"
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
              title="Cancelar"
              aria-label="Cancelar"
              @click="cancelAddList"
            >
              <X :size="18" :stroke-width="2.25" />
            </button>
          </div>
          <p class="mt-2 text-[11px] text-text-muted">
            Enter confirma · Esc cancela
          </p>
        </form>

        <button
          v-else
          type="button"
          class="column-glass flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
          @click="startAddList"
        >
          <Plus :size="16" :stroke-width="2" />
          Adicionar outra lista
        </button>
      </div>
    </div>
  </div>
</template>
