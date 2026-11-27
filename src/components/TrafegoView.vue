<script setup lang="ts">
/** Dashboard de projeção de orçamento de tráfego (assets em /public/trafego). */
</script>

<template>
  <section
    class="flex min-h-0 flex-1 flex-col overflow-hidden bg-board"
    aria-label="Projeção de orçamento de tráfego"
  >
    <iframe
      src="/trafego/index.html"
      title="Projeção de Orçamento — Tráfego"
      class="min-h-0 w-full flex-1 border-0 bg-board"
      loading="eager"
      referrerpolicy="same-origin"
    />
  </section>
</template>
