<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowDownUp, GripVertical, MoreHorizontal, Pencil, Plus, Trash2, X } from '@lucide/vue'
import draggable from 'vuedraggable'
import type { Card, Column } from '../types/board'
import { useBoardStore } from '../stores/board'
import KanbanCard from './KanbanCard.vue'

const props = defineProps<{
  column: Column
}>()

const board = useBoardStore()
const isAdding = ref(false)
const isRenaming = ref(false)
const menuOpen = ref(false)
const newCardTitle = ref('')
const draftTitle = ref(props.column.title)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const renameRef = ref<HTMLInputElement | null>(null)
const menuBtnRef = ref<HTMLButtonElement | null>(null)
const menuPanelRef = ref<HTMLElement | null>(null)

const menuStyle = ref<Record<string, string>>({
  top: '0px',
  left: '0px',
})

const columnSortMode = computed(() => board.getColumnDateSort(props.column.id))

const columnCards = computed({
  get: () => board.cardsByColumn[props.column.id] ?? [],
  set: (value: Card[]) => board.setColumnCards(props.column.id, value),
})

watch(
  () => props.column.title,
  (title) => {
    if (!isRenaming.value) draftTitle.value = title
  },
)

function updateMenuPosition() {
  const btn = menuBtnRef.value
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  const width = 176
  let left = rect.right - width
  if (left < 8) left = 8
  menuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${left}px`,
    width: `${width}px`,
  }
}

async function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    await nextTick()
    updateMenuPosition()
  }
}

async function startAdd() {
  isAdding.value = true
  menuOpen.value = false
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

async function startRename() {
  menuOpen.value = false
  draftTitle.value = props.column.title
  isRenaming.value = true
  await nextTick()
  renameRef.value?.focus()
  renameRef.value?.select()
}

function cancelRename() {
  isRenaming.value = false
  draftTitle.value = props.column.title
}

function confirmRename() {
  if (!isRenaming.value) return
  const title = draftTitle.value.trim()
  if (!title) {
    cancelRename()
    return
  }
  board.renameColumn(props.column.id, title)
  isRenaming.value = false
}

function removeColumn() {
  menuOpen.value = false
  const count = columnCards.value.length
  const message =
    count > 0
      ? `Excluir a lista “${props.column.title}” e seus ${count} cartão(ões)?`
      : `Excluir a lista “${props.column.title}”?`
  if (!window.confirm(message)) return
  board.deleteColumn(props.column.id)
}

function onDocPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (menuBtnRef.value?.contains(target) || menuPanelRef.value?.contains(target)) {
    return
  }
  menuOpen.value = false
}

function onWindowChange() {
  if (menuOpen.value) updateMenuPosition()
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocPointerDown)
    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', onWindowChange, true)
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown)
    window.removeEventListener('resize', onWindowChange)
    window.removeEventListener('scroll', onWindowChange, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>

<template>
  <section
    class="column-glass flex max-h-full w-[min(78vw,18.5rem)] shrink-0 flex-col rounded-2xl sm:w-72"
  >
    <header class="flex items-center gap-1 px-3 pb-3 pt-4">
      <button
        type="button"
        class="column-drag-handle cursor-grab rounded-md p-1 text-text-muted transition-colors hover:bg-column-hover hover:text-text-secondary active:cursor-grabbing"
        aria-label="Arrastar lista"
      >
        <GripVertical :size="16" :stroke-width="2" />
      </button>

      <div class="min-w-0 flex-1">
        <input
          v-if="isRenaming"
          ref="renameRef"
          v-model="draftTitle"
          type="text"
          class="w-full rounded-md border border-accent bg-card px-2 py-1 text-sm font-semibold text-text-primary outline-none"
          @blur="confirmRename"
          @keydown.enter.prevent="confirmRename"
          @keydown.escape.prevent="cancelRename"
        />
        <button
          v-else
          type="button"
          class="w-full truncate rounded-md px-2 py-1 text-left text-sm font-semibold text-text-primary hover:bg-column-hover"
          title="Clique para renomear"
          @click="startRename"
        >
          {{ column.title }}
        </button>
      </div>

      <button
        type="button"
        :class="[
          'column-menu-btn relative rounded-md p-1 transition-colors',
          columnSortMode === 'manual'
            ? 'text-text-muted hover:bg-column-hover hover:text-text-secondary'
            : 'bg-accent/15 text-accent hover:bg-accent/25',
        ]"
        :title="
          columnSortMode === 'manual'
            ? 'Ordenar esta coluna por data'
            : columnSortMode === 'dueAsc'
              ? 'Data: mais próxima primeiro (clique para inverter)'
              : 'Data: mais distante primeiro (clique para ordem manual)'
        "
        aria-label="Ordenar cartões desta coluna por data"
        @pointerdown.stop
        @click.stop="board.cycleColumnDateSort(column.id)"
      >
        <ArrowDownUp :size="14" :stroke-width="2" />
      </button>

      <span class="rounded-md bg-surface px-1.5 py-0.5 text-xs text-text-muted">
        {{ columnCards.length }}
      </span>

      <button
        ref="menuBtnRef"
        type="button"
        class="column-menu-btn rounded-md p-1 text-text-muted transition-colors hover:bg-column-hover hover:text-text-secondary"
        aria-label="Opções da lista"
        :aria-expanded="menuOpen"
        @pointerdown.stop
        @click.stop="toggleMenu"
      >
        <MoreHorizontal :size="16" :stroke-width="2" />
      </button>
    </header>

    <Teleport to="body">
      <div
        v-if="menuOpen"
        ref="menuPanelRef"
        class="fixed z-[220] overflow-hidden rounded-xl border border-border-subtle bg-board-elevated shadow-xl shadow-black/50"
        role="menu"
        :style="menuStyle"
        @pointerdown.stop
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
          role="menuitem"
          @click="startRename"
        >
          <Pencil :size="14" />
          Renomear lista
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-danger transition-colors hover:bg-danger/10"
          role="menuitem"
          @click="removeColumn"
        >
          <Trash2 :size="14" />
          Excluir lista
        </button>
      </div>
    </Teleport>

    <draggable
      v-model="columnCards"
      group="cards"
      item-key="id"
      :disabled="columnSortMode !== 'manual'"
      :animation="180"
      ghost-class="card-ghost"
      drag-class="card-drag"
      class="flex min-h-12 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-2"
      :class="{ 'pb-3': columnCards.length === 0 }"
    >
      <template #item="{ element }">
        <KanbanCard :card="element" />
      </template>
    </draggable>

    <footer class="p-3 pt-1">
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
          class="w-full resize-none rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
          @keydown="onAddKeydown"
        />
        <div class="flex items-center gap-2">
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
        class="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-text-secondary transition-colors hover:bg-column-hover hover:text-text-primary"
        @click="startAdd"
      >
        <Plus :size="16" :stroke-width="2" />
        Adicionar um cartão
      </button>
    </footer>
  </section>
</template>
