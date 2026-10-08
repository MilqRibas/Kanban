<script setup lang="ts">
import { ref, watch } from 'vue'
import { BarChart3, ContactRound, Filter } from '@lucide/vue'
import { useCrmStore } from '../stores/crm'
import { usePipelinesStore } from '../stores/pipelines'
import { useSegmentsStore } from '../stores/segments'
import CrmBiView from './crm/CrmBiView.vue'
import CrmPipelinesView from './crm/CrmPipelinesView.vue'
import SegmentsView from './segments/SegmentsView.vue'

type CrmArea = 'segments' | 'crm' | 'bi'

const area = ref<CrmArea>('crm')
const crm = useCrmStore()
const segments = useSegmentsStore()
const pipelines = usePipelinesStore()

const areaTabs: { id: CrmArea; label: string; icon: typeof ContactRound }[] = [
  { id: 'segments', label: 'Segmentações', icon: Filter },
  { id: 'crm', label: 'CRM', icon: ContactRound },
  { id: 'bi', label: 'BI', icon: BarChart3 },
]

async function ensureArea(next: CrmArea) {
  if (next === 'crm' || next === 'bi') {
    if (!crm.ready) await crm.init()
  }
  if (next === 'segments') {
    if (!segments.ready) await segments.init()
  }
  if (next === 'crm') {
    if (!pipelines.ready) await pipelines.init()
  }
}

watch(area, (next) => {
  void ensureArea(next)
}, { immediate: true })
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="page-shell shrink-0 space-y-3 pt-1.5 sm:pt-2">
      <header>
        <h2 class="text-lg font-semibold tracking-tight text-text-primary sm:text-2xl">
          CRM
        </h2>
      </header>
      <div
        class="flex w-full gap-1 overflow-x-auto rounded-2xl border border-border-subtle bg-board-elevated/80 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="CRM e segmentações"
      >
        <button
          v-for="tab in areaTabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="area === tab.id"
          :class="[
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
            area === tab.id
              ? 'bg-accent text-board shadow-sm'
              : 'text-text-secondary hover:bg-surface hover:text-text-primary',
          ]"
          @click="area = tab.id"
        >
          <component :is="tab.icon" :size="15" class="shrink-0" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-footer-pad sm:mt-3">
      <div v-if="area === 'segments'" class="page-shell pb-3">
        <SegmentsView />
      </div>
      <div v-else-if="area === 'bi'" class="page-shell pb-3">
        <CrmBiView />
      </div>
      <div v-else class="page-shell pb-3">
        <CrmPipelinesView />
      </div>
    </div>
  </div>
</template>
