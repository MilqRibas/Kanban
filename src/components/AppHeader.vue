<script setup lang="ts">
import {
  Star,
  Users,
  Filter,
  Bolt,
  MoreHorizontal,
  Share2,
  LayoutGrid,
} from '@lucide/vue'
import { useBoardStore } from '../stores/board'
import { computed } from 'vue'

const board = useBoardStore()
const avatars = computed(() => board.members.slice(0, 3))
</script>

<template>
  <header
    class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle/60 bg-board-elevated/90 px-4 backdrop-blur-md"
  >
    <div class="flex min-w-0 items-center gap-3">
      <div
        class="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent"
      >
        <LayoutGrid :size="18" :stroke-width="2" />
      </div>
      <h1 class="truncate text-lg font-semibold tracking-tight text-text-primary">
        {{ board.title }}
      </h1>
      <button
        type="button"
        class="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        aria-label="Favoritar quadro"
      >
        <Star :size="16" :stroke-width="2" />
      </button>
      <button
        type="button"
        class="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary sm:inline-flex"
      >
        <Users :size="15" :stroke-width="2" />
        <span>Espaço de trabalho</span>
      </button>
    </div>

    <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <div class="mr-1 flex items-center -space-x-2">
        <div
          v-for="avatar in avatars"
          :key="avatar.id"
          :class="[
            avatar.avatarColor,
            'flex size-7 items-center justify-center rounded-full border-2 border-board-elevated text-[10px] font-semibold text-white',
          ]"
          :title="avatar.name"
        >
          {{ avatar.initials }}
        </div>
        <button
          v-if="board.members.length > avatars.length"
          type="button"
          class="flex size-7 items-center justify-center rounded-full border-2 border-board-elevated bg-surface text-xs font-medium text-text-secondary transition-colors hover:bg-card hover:text-text-primary"
          aria-label="Ver membros"
        >
          +{{ board.members.length - avatars.length }}
        </button>
      </div>

      <button
        type="button"
        class="rounded-md p-2 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        aria-label="Filtros"
      >
        <Filter :size="16" :stroke-width="2" />
      </button>
      <button
        type="button"
        class="rounded-md p-2 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        aria-label="Automações"
      >
        <Bolt :size="16" :stroke-width="2" />
      </button>
      <button
        type="button"
        class="rounded-md p-2 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        aria-label="Mais opções"
      >
        <MoreHorizontal :size="16" :stroke-width="2" />
      </button>

      <button
        type="button"
        class="ml-1 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-board transition-colors hover:bg-accent-hover"
      >
        <Share2 :size="15" :stroke-width="2.25" />
        <span class="hidden sm:inline">Compartilhar</span>
        <span class="sm:hidden">+</span>
      </button>
    </div>
  </header>
</template>
