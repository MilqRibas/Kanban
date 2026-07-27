<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from '@lucide/vue'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()

const icons = {
  error: XCircle,
  success: CheckCircle2,
  info: Info,
} as const

const styles = {
  error: 'border-red-400/35 bg-red-950/90 text-red-100',
  success: 'border-emerald-400/35 bg-emerald-950/90 text-emerald-100',
  info: 'border-accent/35 bg-board-elevated/95 text-text-primary',
} as const
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 top-3 z-[300] flex flex-col items-center gap-2 px-3 sm:top-4 sm:items-end sm:px-4"
      aria-live="polite"
    >
      <div
        v-for="item in toast.items"
        :key="item.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-3 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-md"
        :class="styles[item.kind]"
        role="status"
      >
        <component
          :is="icons[item.kind]"
          :size="16"
          class="mt-0.5 shrink-0 opacity-90"
        />
        <p class="min-w-0 flex-1 text-sm leading-snug">{{ item.message }}</p>
        <button
          type="button"
          class="rounded-md p-0.5 opacity-70 hover:bg-white/10 hover:opacity-100"
          aria-label="Fechar"
          @click="toast.dismiss(item.id)"
        >
          <X :size="14" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
