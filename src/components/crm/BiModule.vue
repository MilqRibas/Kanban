<script setup lang="ts">
import { ref } from 'vue'
import CrmBiView from './CrmBiView.vue'
import BiWeeklyRanking from './BiWeeklyRanking.vue'
import BiPerformanceEvolution from './BiPerformanceEvolution.vue'

type BiTab = 'operacional' | 'ranking' | 'evolucao'
const tab = ref<BiTab>('operacional')
const tabs: { id: BiTab; label: string }[] = [
  { id: 'operacional', label: 'Operacional' },
  { id: 'ranking', label: 'Ranking semanal' },
  { id: 'evolucao', label: 'Evolução' },
]
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-1 overflow-x-auto" role="tablist" aria-label="BI">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="tab === item.id"
        class="rounded-lg px-3 py-1.5 text-sm"
        :class="tab === item.id ? 'bg-white/10 text-text-primary' : 'text-text-secondary'"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </div>
    <CrmBiView v-if="tab === 'operacional'" />
    <BiWeeklyRanking v-else-if="tab === 'ranking'" />
    <BiPerformanceEvolution v-else />
  </div>
</template>
