<script setup lang="ts">
import { computed, ref } from 'vue'
import { Trash2 } from '@lucide/vue'
import { useBoardStore } from '../../stores/board'
import { useCampaignsStore } from '../../stores/campaigns'
import { formatDateTime } from '../../utils/campaignFormat'

const store = useCampaignsStore()
const board = useBoardStore()
const deletingId = ref<string | null>(null)

const rows = computed(() =>
  [...store.imports].sort(
    (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
  ),
)

function memberName(memberId: string | null) {
  if (!memberId) return '—'
  return board.members.find((m) => m.id === memberId)?.name ?? memberId
}

async function onDelete(id: string) {
  const item = store.imports.find((i) => i.id === id)
  if (!item) return
  const confirmed = window.confirm(
    `Excluir a importação "${item.originalFilename}" (${store.formatPeriodLabel(item.periodStart, item.periodEnd)})?\n\nOs dados dessa semana saem do acumulado das campanhas.`,
  )
  if (!confirmed) return
  deletingId.value = id
  try {
    await store.removeImport(id)
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-baseline justify-between gap-2">
      <h3 class="text-base font-semibold text-text-primary sm:text-lg">
        Importações
      </h3>
      <span class="text-xs text-text-muted">
        {{ rows.length }}
        {{ rows.length === 1 ? 'arquivo' : 'arquivos' }}
      </span>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-border-subtle">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-surface/60 text-xs uppercase tracking-wide text-text-muted">
          <tr>
            <th class="px-3 py-2 font-medium">Arquivo</th>
            <th class="px-3 py-2 font-medium">Período</th>
            <th class="px-3 py-2 font-medium">Importado em</th>
            <th class="px-3 py-2 font-medium">Por</th>
            <th class="px-3 py-2 text-right font-medium">Agentes</th>
            <th class="px-3 py-2 text-right font-medium">Jogadores</th>
            <th class="px-3 py-2 font-medium">Status</th>
            <th class="px-3 py-2 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in rows"
            :key="item.id"
            class="border-t border-border-subtle"
          >
            <td class="max-w-[16rem] truncate px-3 py-2.5 text-text-primary" :title="item.originalFilename">
              {{ item.originalFilename || item.id }}
            </td>
            <td class="whitespace-nowrap px-3 py-2.5 text-text-secondary">
              {{ store.formatPeriodLabel(item.periodStart, item.periodEnd) }}
            </td>
            <td class="whitespace-nowrap px-3 py-2.5 text-text-secondary">
              {{ formatDateTime(item.importedAt) }}
            </td>
            <td class="whitespace-nowrap px-3 py-2.5 text-text-secondary">
              {{ memberName(item.importedBy) }}
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums text-text-primary">
              {{ item.agentsCount }}
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums text-text-primary">
              {{ item.playersCount }}
            </td>
            <td class="px-3 py-2.5 text-text-secondary">
              {{ item.status === 'completed' ? 'Concluído' : item.status }}
            </td>
            <td class="px-3 py-2.5 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
                :disabled="deletingId === item.id || store.importing"
                @click="onDelete(item.id)"
              >
                <Trash2 :size="14" />
                {{ deletingId === item.id ? 'Excluindo…' : 'Excluir' }}
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="8" class="px-3 py-10 text-center text-sm text-text-muted">
              Nenhuma importação ainda. Use “Importar relatório” para adicionar uma semana.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
