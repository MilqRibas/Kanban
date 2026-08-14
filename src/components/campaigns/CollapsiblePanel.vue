<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    title: string
    hint?: string
    defaultOpen?: boolean
  }>(),
  { defaultOpen: true },
)

const open = ref(props.defaultOpen)
</script>

<template>
  <section class="panel-glass overflow-hidden rounded-2xl">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="min-w-0">
        <span class="block text-sm font-semibold text-text-primary sm:text-base">
          {{ title }}
        </span>
        <span v-if="hint" class="mt-0.5 block text-[11px] text-text-muted">
          {{ hint }}
        </span>
      </span>
      <ChevronDown
        :size="18"
        class="shrink-0 text-text-muted transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>
    <div v-show="open">
      <slot />
    </div>
  </section>
</template>
