<script setup lang="ts">
import type { CampaignInsight } from '../../utils/campaignMetrics'
import { Lightbulb } from '@lucide/vue'

defineProps<{
  insights: CampaignInsight[]
  title?: string
}>()
</script>

<template>
  <div class="panel-glass rounded-2xl p-3 sm:p-3.5">
    <div class="mb-2 flex items-center gap-2">
      <Lightbulb :size="15" class="text-accent" />
      <h3 class="text-sm font-semibold text-text-primary">
        {{ title || 'Insights automáticos' }}
      </h3>
    </div>
    <ul v-if="insights.length" class="space-y-1.5">
      <li
        v-for="insight in insights"
        :key="insight.id"
        class="rounded-lg bg-surface/50 px-2.5 py-1.5 text-xs text-text-secondary sm:text-sm"
      >
        {{ insight.text }}
      </li>
    </ul>
    <p v-else class="text-sm text-text-muted">
      Ainda não há insights suficientes para esta seleção.
    </p>
  </div>
</template>
