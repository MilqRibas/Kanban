<script setup lang="ts">
import type { CampaignInsight } from '../../utils/campaignMetrics'
import { Lightbulb } from '@lucide/vue'

defineProps<{
  insights: CampaignInsight[]
  title?: string
}>()
</script>

<template>
  <div class="panel-glass rounded-2xl p-4 sm:p-5">
    <div class="mb-3 flex items-center gap-2">
      <Lightbulb :size="16" class="text-accent" />
      <h3 class="text-sm font-semibold text-text-primary">
        {{ title || 'Insights automáticos' }}
      </h3>
    </div>
    <ul v-if="insights.length" class="space-y-2">
      <li
        v-for="insight in insights"
        :key="insight.id"
        class="rounded-xl bg-surface/50 px-3 py-2 text-sm text-text-secondary"
      >
        {{ insight.text }}
      </li>
    </ul>
    <p v-else class="text-sm text-text-muted">
      Ainda não há insights suficientes para esta seleção.
    </p>
  </div>
</template>
