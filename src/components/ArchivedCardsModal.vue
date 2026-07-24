<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Archive, RotateCcw, Trash2, X } from '@lucide/vue'
import { useAuthStore } from '../stores/auth'
import { useBoardStore } from '../stores/board'

const auth = useAuthStore()
const board = useBoardStore()
const open = ref(false)

const archived = computed(() => board.archivedCards)

function openModal() {
  open.value = true
}

function closeModal() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) closeModal()
}

async function restore(cardId: string) {
  await board.unarchiveCard(cardId)
}

async function remove(cardId: string, title: string) {
  if (!window.confirm(`Apagar permanentemente “${title}”?`)) return
  await board.deleteCard(cardId)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

defineExpose({ openModal })

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && auth.isAdmin"
      class="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cartões arquivados"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Fechar"
        @click="closeModal"
      />
      <div
        class="relative z-10 flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-board-elevated shadow-2xl"
      >
        <header class="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Archive :size="16" class="text-text-muted" />
          <h2 class="flex-1 text-sm font-semibold text-text-primary">
            Arquivados
            <span class="ml-1 font-normal text-text-muted">
              ({{ archived.length }})
            </span>
          </h2>
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
            aria-label="Fechar"
            @click="closeModal"
          >
            <X :size="18" />
          </button>
        </header>

        <ul class="flex-1 space-y-2 overflow-y-auto p-3">
          <li
            v-for="card in archived"
            :key="card.id"
            class="rounded-xl border border-white/5 bg-column/60 px-3 py-2.5"
          >
            <div class="flex items-start gap-2">
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                @click="board.openCard(card.id); closeModal()"
              >
                <p class="truncate text-sm font-medium text-text-primary">
                  {{ card.title }}
                </p>
                <p class="mt-0.5 text-[11px] text-text-muted">
                  Arquivado em
                  {{ card.archivedAt ? formatDate(card.archivedAt) : '—' }}
                </p>
              </button>
              <button
                type="button"
                class="rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-[#39bcff]"
                title="Restaurar"
                @click="restore(card.id)"
              >
                <RotateCcw :size="14" />
              </button>
              <button
                type="button"
                class="rounded-lg p-1.5 text-text-muted hover:bg-danger/15 hover:text-danger"
                title="Apagar permanentemente"
                @click="remove(card.id, card.title)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </li>
          <li
            v-if="!archived.length"
            class="py-10 text-center text-sm text-text-muted"
          >
            Nenhum cartão arquivado.
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>
