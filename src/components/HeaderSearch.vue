<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search, X } from '@lucide/vue'
import { useBoardStore } from '../stores/board'

const board = useBoardStore()
const expanded = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

async function openSearch() {
  expanded.value = true
  await nextTick()
  inputRef.value?.focus()
}

function closeSearch() {
  expanded.value = false
  board.setSearchQuery('')
}

function onDocPointer(event: PointerEvent) {
  if (!expanded.value) return
  const target = event.target as Node
  if (rootRef.value?.contains(target)) return
  if (!board.searchQuery.trim()) {
    expanded.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && expanded.value) {
    closeSearch()
  }
}

watch(
  () => board.searchQuery,
  (value) => {
    if (value.trim() && !expanded.value) expanded.value = true
  },
)

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
  <div ref="rootRef" class="relative flex items-center">
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <label
        v-if="expanded"
        class="flex h-8 items-center gap-1.5 rounded-full border border-accent/45 bg-white/5 pl-2.5 pr-1 shadow-lg shadow-black/20 backdrop-blur-md"
      >
        <Search :size="15" class="shrink-0 text-accent" :stroke-width="2.25" />
        <input
          ref="inputRef"
          :value="board.searchQuery"
          type="search"
          placeholder="Pesquisar tarefas…"
          class="w-[9.5rem] bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted sm:w-[14rem]"
          aria-label="Pesquisar tarefas"
          @input="
            board.setSearchQuery(($event.target as HTMLInputElement).value)
          "
          @keydown.escape.prevent="closeSearch"
        />
        <button
          type="button"
          class="inline-flex size-6 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary"
          title="Fechar busca"
          aria-label="Fechar busca"
          @click="closeSearch"
        >
          <X :size="14" />
        </button>
      </label>
    </transition>

    <button
      v-if="!expanded"
      type="button"
      class="inline-flex size-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
      title="Pesquisar tarefas"
      aria-label="Pesquisar tarefas"
      @click="openSearch"
    >
      <Search :size="17" :stroke-width="2.25" />
    </button>
  </div>
</template>
