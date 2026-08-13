<script setup lang="ts">
import { computed, ref } from 'vue'
import { Trash2 } from '@lucide/vue'
import { useBoardStore } from '../../stores/board'
import { useCampaignsStore } from '../../stores/campaigns'
import { formatDateTime } from '../../utils/campaignFormat'

type UnifiedImportRow = {
  id: string
  kind: 'rake' | 'transactions'
  originalFilename: string
  periodStart: string
  periodEnd: string
  importedAt: string
  importedBy: string | null
  status: string
  agentsCount: number
  playersCount: number
  extraLabel: string
}

const store = useCampaignsStore()
const board = useBoardStore()
const deletingId = ref<string | null>(null)

const rows = computed<UnifiedImportRow[]>(() => {
  const rake = store.imports.map((item) => ({
    id: item.id,
    kind: 'rake' as const,
    originalFilename: item.originalFilename,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    importedAt: item.importedAt,
    importedBy: item.importedBy,
    status: item.status,
    agentsCount: item.agentsCount,
    playersCount: item.playersCount,
    extraLabel: `${item.tableRowsCount} mesas`,
  }))
  const txs = store.transactionImports.map((item) => ({
    id: item.id,
    kind: 'transactions' as const,
    originalFilename: item.originalFilename,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    importedAt: item.importedAt,
    importedBy: item.importedBy,
    status: item.status,
    agentsCount: item.agentsCount,
    playersCount: item.playersCount,
    extraLabel: `${item.transactionsCount} txs · ${item.depositsCount} dep.`,
  }))
  return [...rake, ...txs].sort(
    (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
  )
})

function memberName(memberId: string | null) {
  if (!memberId) return '—'
  return board.members.find((m) => m.id === memberId)?.name ?? memberId
}

async function onDelete(row: UnifiedImportRow) {
  const confirmed = window.confirm(
    row.kind === 'rake'
      ? `Excluir a importação de rake "${row.originalFilename}" (${store.formatPeriodLabel(row.periodStart, row.periodEnd)})?\n\nOs dados dessa semana saem do acumulado das campanhas.`
      : `Excluir a importação de transações "${row.originalFilename}" (${store.formatPeriodLabel(row.periodStart, row.periodEnd)})?\n\nDepósitos e bônus desse arquivo serão removidos.`,
  )
  if (!confirmed) return
  deletingId.value = row.id
  try {
    if (row.kind === 'rake') {
      await store.removeImport(row.id)
    } else {
      await store.removeTransactionImport(row.id)
    }
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
            <th class="px-3 py-2 font-medium">Tipo</th>
            <th class="px-3 py-2 font-medium">Arquivo</th>
            <th class="px-3 py-2 font-medium">Período</th>
            <th class="px-3 py-2 font-medium">Importado em</th>
            <th class="px-3 py-2 font-medium">Por</th>
            <th class="px-3 py-2 text-right font-medium">Agentes</th>
            <th class="px-3 py-2 text-right font-medium">Jogadores</th>
            <th class="px-3 py-2 font-medium">Detalhe</th>
            <th class="px-3 py-2 font-medium">Status</th>
            <th class="px-3 py-2 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in rows"
            :key="`${item.kind}-${item.id}`"
            class="border-t border-border-subtle"
          >
            <td class="px-3 py-2.5">
              <span
                class="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                :class="
                  item.kind === 'rake'
                    ? 'bg-accent/20 text-accent'
                    : 'bg-emerald-500/20 text-emerald-300'
                "
              >
                {{ item.kind === 'rake' ? 'Rake' : 'Transações' }}
              </span>
            </td>
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
            <td class="whitespace-nowrap px-3 py-2.5 text-text-secondary">
              {{ item.extraLabel }}
            </td>
            <td class="px-3 py-2.5 text-text-secondary">
              {{
                item.status === 'completed'
                  ? 'Concluído'
                  : item.status === 'replaced'
                    ? 'Substituído'
                    : item.status
              }}
            </td>
            <td class="px-3 py-2.5 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
                :disabled="deletingId === item.id || store.importing || item.status === 'replaced'"
                @click="onDelete(item)"
              >
                <Trash2 :size="14" />
                {{ deletingId === item.id ? 'Excluindo…' : 'Excluir' }}
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="10" class="px-3 py-10 text-center text-sm text-text-muted">
              Nenhuma importação ainda. Use “Importar relatório” para adicionar rake ou transações.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
