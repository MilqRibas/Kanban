<script setup lang="ts">
import { computed } from 'vue'
import type { CampaignHistoryEntry } from '../../types/campaigns'
import { useBoardStore } from '../../stores/board'
import { formatDateTime } from '../../utils/campaignFormat'

const props = defineProps<{
  entries: CampaignHistoryEntry[]
}>()

const board = useBoardStore()

const rows = computed(() =>
  props.entries.map((entry) => ({
    entry,
    author:
      board.members.find((m) => m.id === entry.createdBy)?.name ?? 'Alguém',
  })),
)
</script>

<template>
  <div class="panel-glass rounded-2xl p-4 sm:p-5">
    <h3 class="text-sm font-semibold text-text-primary">Histórico de alterações</h3>
    <ul v-if="rows.length" class="mt-3 space-y-3">
      <li
        v-for="row in rows"
        :key="row.entry.id"
        class="border-b border-border-subtle/50 pb-3 last:border-0 last:pb-0"
      >
        <p class="text-xs text-text-muted">
          {{ formatDateTime(row.entry.createdAt) }}
        </p>
        <p class="mt-0.5 text-sm text-text-secondary">
          <span class="font-medium text-text-primary">{{ row.author }}</span>
          — {{ row.entry.description }}
        </p>
      </li>
    </ul>
    <p v-else class="mt-3 text-sm text-text-muted">
      Nenhuma alteração registrada.
    </p>
  </div>
</template>
