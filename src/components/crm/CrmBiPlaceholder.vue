<script setup lang="ts">
import { BarChart3 } from '@lucide/vue'
</script>

<template>
  <section
    class="rounded-2xl border border-dashed border-white/15 bg-board-elevated/40 px-4 py-10 text-center"
  >
    <div class="mx-auto flex max-w-md flex-col items-center gap-3">
      <div class="rounded-full bg-white/5 p-3 text-text-muted">
        <BarChart3 :size="22" />
      </div>
      <h2 class="text-base font-semibold text-text-primary">BI — em preparação</h2>
      <p class="text-sm text-text-secondary">
        Esta área existe apenas como entrada estrutural da navegação Campanhas · CRM · BI.
        Dashboards e segmentações avançadas entram em etapas futuras.
      </p>
    </div>
  </section>
</template>
