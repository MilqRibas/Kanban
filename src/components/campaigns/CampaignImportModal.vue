<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FileUp, Loader2, X } from '@lucide/vue'
import { useEscapeKey } from '../../composables/useEscapeKey'
import {
  useCampaignsStore,
  type CommitReportResult,
  type CommitTransactionResult,
  type ReportPreview,
  type TransactionReportPreview,
} from '../../stores/campaigns'
import { formatCurrency } from '../../utils/campaignFormat'
import { formatPeriodLabel } from '../../utils/campaignWeeklyMetrics'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  imported: [result: CommitReportResult | CommitTransactionResult]
}>()

const store = useCampaignsStore()
const fileInput = ref<HTMLInputElement | null>(null)
const importKind = ref<'rake' | 'transactions'>('rake')
const preview = ref<ReportPreview | null>(null)
const txPreview = ref<TransactionReportPreview | null>(null)
const result = ref<CommitReportResult | null>(null)
const txResult = ref<CommitTransactionResult | null>(null)
const parsing = ref(false)
const replaceConfirmed = ref(false)
const stepError = ref<string | null>(null)

useEscapeKey(
  () => props.open && !store.importing,
  () => close(),
)

watch(
  () => props.open,
  (open) => {
    if (!open) {
      preview.value = null
      txPreview.value = null
      result.value = null
      txResult.value = null
      replaceConfirmed.value = false
      stepError.value = null
      importKind.value = 'rake'
    }
  },
)

watch(importKind, () => {
  preview.value = null
  txPreview.value = null
  result.value = null
  txResult.value = null
  replaceConfirmed.value = false
  stepError.value = null
})

function close() {
  emit('update:open', false)
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  stepError.value = null
  result.value = null
  txResult.value = null
  replaceConfirmed.value = false
  parsing.value = true
  try {
    if (importKind.value === 'rake') {
      txPreview.value = null
      const next = await store.previewReport(file)
      preview.value = next
      if (!next) stepError.value = 'Não foi possível validar o arquivo.'
    } else {
      preview.value = null
      const next = await store.previewTransactionReport(file)
      txPreview.value = next
      if (!next) stepError.value = 'Não foi possível validar o arquivo de transações.'
    }
  } finally {
    parsing.value = false
  }
}

const activeConflict = computed(() =>
  importKind.value === 'rake'
    ? preview.value?.conflict ?? null
    : txPreview.value?.conflict ?? null,
)

const canCommit = computed(() => {
  if (store.importing) return false
  if (importKind.value === 'rake') {
    if (!preview.value) return false
    if (preview.value.conflict && !replaceConfirmed.value) return false
    return true
  }
  if (!txPreview.value) return false
  if (txPreview.value.conflict && !replaceConfirmed.value) return false
  return true
})

async function confirmImport() {
  stepError.value = null
  if (importKind.value === 'rake') {
    if (!preview.value || !canCommit.value) return
    const committed = await store.commitReport({
      preview: preview.value,
      replace: Boolean(preview.value.conflict && replaceConfirmed.value),
    })
    if (!committed) {
      stepError.value = 'Falha ao processar o relatório.'
      return
    }
    result.value = committed
    emit('imported', committed)
    return
  }

  if (!txPreview.value || !canCommit.value) return
  const committed = await store.commitTransactionReport({
    preview: txPreview.value,
    replace: Boolean(txPreview.value.conflict && replaceConfirmed.value),
  })
  if (!committed) {
    stepError.value = 'Falha ao processar as transações.'
    return
  }
  txResult.value = committed
  emit('imported', committed)
}

const hasResult = computed(() => Boolean(result.value || txResult.value))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Importar relatório"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/60"
        aria-label="Fechar"
        @click="close"
      />

      <section
        class="panel-glass footer-sheet-offset relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:rounded-2xl"
      >
        <header class="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
          <div>
            <h3 class="text-base font-semibold text-text-primary">
              Importar relatório
            </h3>
            <p class="text-xs text-text-muted">
              Escolha o tipo e envie o arquivo XLSX correspondente
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
            aria-label="Fechar"
            @click="close"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="space-y-4 overflow-y-auto px-5 py-4">
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              :class="
                importKind === 'rake'
                  ? 'bg-accent text-board'
                  : 'text-text-secondary hover:bg-surface'
              "
              :disabled="parsing || store.importing"
              @click="importKind = 'rake'"
            >
              Rake
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              :class="
                importKind === 'transactions'
                  ? 'bg-accent text-board'
                  : 'text-text-secondary hover:bg-surface'
              "
              :disabled="parsing || store.importing"
              @click="importKind = 'transactions'"
            >
              Transações
            </button>
          </div>

          <div
            class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-subtle bg-column/40 px-4 py-8"
          >
            <FileUp class="text-accent" :size="28" />
            <p class="text-sm text-text-secondary">
              {{
                importKind === 'rake'
                  ? 'Relatório semanal (Agentes, Jogadores, Mesas)'
                  : 'Relatório de transações (depósitos e bônus)'
              }}
            </p>
            <button
              type="button"
              class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-board hover:bg-accent-hover disabled:opacity-50"
              :disabled="parsing || store.importing"
              @click="fileInput?.click()"
            >
              Escolher arquivo .xlsx
            </button>
            <input
              ref="fileInput"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              class="hidden"
              @change="onFileChange"
            />
          </div>

          <p v-if="parsing" class="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 class="animate-spin" :size="16" />
            Validando relatório…
          </p>

          <p v-if="stepError" class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {{ stepError }}
          </p>

          <div
            v-if="preview && !result"
            class="space-y-3 rounded-xl border border-border-subtle bg-board-elevated/60 p-4"
          >
            <div>
              <p class="text-sm font-semibold text-text-primary">
                {{ preview.filename }}
              </p>
              <p class="text-xs text-text-muted">
                Período:
                {{ formatPeriodLabel(preview.parsed.period.start, preview.parsed.period.end) }}
              </p>
            </div>
            <ul class="grid grid-cols-2 gap-2 text-sm text-text-secondary sm:grid-cols-4">
              <li>{{ preview.parsed.agents.length }} agências</li>
              <li>{{ preview.parsed.uniquePlayerIds.length }} jogadores</li>
              <li>{{ preview.parsed.tables.length }} mesas</li>
              <li>{{ preview.parsed.gameTypes.length }} modalidades</li>
            </ul>
            <p class="text-sm text-text-secondary">
              {{ preview.conciliatedCount }} agências conciliadas
              <span v-if="preview.divergenceCount > 0" class="text-amber-200">
                · {{ preview.divergenceCount }} divergência(s)
              </span>
            </p>

            <div
              v-if="preview.conflict"
              class="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100"
            >
              <p class="font-medium">
                Já existem dados para este período
                ({{ preview.conflict.affectedAgentIds.length }} agências).
              </p>
              <p class="mt-1 text-xs text-amber-100/80">
                Substituir recalcula os acumulados sem somar a semana duas vezes.
              </p>
              <label class="mt-3 flex items-center gap-2 text-sm">
                <input v-model="replaceConfirmed" type="checkbox" class="rounded border-white/20" />
                Substituir / reprocessar o período existente
              </label>
            </div>

            <ul
              v-if="preview.parsed.warnings.length"
              class="space-y-1 text-xs text-text-muted"
            >
              <li v-for="(w, i) in preview.parsed.warnings" :key="i">
                {{ w.message }}
              </li>
            </ul>
          </div>

          <div
            v-if="txPreview && !txResult"
            class="space-y-3 rounded-xl border border-border-subtle bg-board-elevated/60 p-4"
          >
            <div>
              <p class="text-sm font-semibold text-text-primary">
                {{ txPreview.filename }}
              </p>
              <p class="text-xs text-text-muted">
                Período:
                {{
                  formatPeriodLabel(
                    txPreview.parsed.period.start,
                    txPreview.parsed.period.end,
                  )
                }}
              </p>
            </div>
            <ul class="grid grid-cols-2 gap-2 text-sm text-text-secondary sm:grid-cols-4">
              <li>{{ txPreview.parsed.transactions.length }} transações</li>
              <li>{{ txPreview.parsed.depositsCount }} depósitos</li>
              <li>{{ txPreview.parsed.bonusesCount }} bônus</li>
              <li>{{ txPreview.parsed.uniqueAgentIds.length }} agências</li>
            </ul>

            <div
              v-if="txPreview.conflict"
              class="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100"
            >
              <p class="font-medium">
                Já existem transações para este período.
              </p>
              <p class="mt-1 text-xs text-amber-100/80">
                Substituir remove o import anterior do período e reinsere (upsert por Transaction ID).
              </p>
              <label class="mt-3 flex items-center gap-2 text-sm">
                <input v-model="replaceConfirmed" type="checkbox" class="rounded border-white/20" />
                Substituir / reprocessar o período existente
              </label>
            </div>

            <ul
              v-if="txPreview.parsed.warnings.length"
              class="space-y-1 text-xs text-text-muted"
            >
              <li v-for="(w, i) in txPreview.parsed.warnings" :key="i">
                {{ w.message }}
              </li>
            </ul>
          </div>

          <div
            v-if="result"
            class="space-y-3 rounded-xl border border-success/30 bg-success/10 p-4"
          >
            <p class="text-sm font-semibold text-success">
              Relatório de rake processado — {{ result.periodLabel }}
            </p>
            <p class="text-sm text-text-secondary">
              {{ result.agentsCount }} agências ·
              {{ result.playersCount }} jogadores ·
              {{ result.tableRowsCount }} mesas ·
              {{ result.conciliatedCount }} conciliadas
              <span v-if="result.divergenceCount">
                · {{ result.divergenceCount }} divergência(s)
              </span>
            </p>
            <div v-if="result.campaignUpdates.length" class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Campanhas atualizadas
              </p>
              <div
                v-for="upd in result.campaignUpdates"
                :key="upd.campaignId"
                class="rounded-lg bg-board/50 px-3 py-2 text-sm"
              >
                <p class="font-medium text-text-primary">{{ upd.name }}</p>
                <p class="text-text-secondary">
                  +{{ formatCurrency(upd.rakeAdded) }} →
                  {{ formatCurrency(upd.rakeAfter) }}
                  <span v-if="upd.recoveryAfter != null">
                    ({{ upd.recoveryBefore?.toFixed(0) ?? '—' }}% →
                    {{ upd.recoveryAfter.toFixed(0) }}%)
                  </span>
                </p>
              </div>
            </div>
            <p v-else class="text-xs text-text-muted">
              Nenhuma campanha vinculada às agências deste relatório.
              Vincule um Agent ID ao criar/editar a campanha.
            </p>
          </div>

          <div
            v-if="txResult"
            class="space-y-3 rounded-xl border border-success/30 bg-success/10 p-4"
          >
            <p class="text-sm font-semibold text-success">
              Transações processadas — {{ txResult.periodLabel }}
            </p>
            <p class="text-sm text-text-secondary">
              {{ txResult.transactionsCount }} transações ·
              {{ txResult.depositsCount }} depósitos ·
              {{ txResult.bonusesCount }} bônus ·
              {{ txResult.agentsCount }} agências
            </p>
            <p class="text-xs text-text-muted">
              {{ txResult.affectedCampaignIds.length }} campanha(s) afetada(s).
            </p>
          </div>
        </div>

        <footer class="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <button
            type="button"
            class="rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-white/10"
            @click="close"
          >
            {{ hasResult ? 'Fechar' : 'Cancelar' }}
          </button>
          <button
            v-if="(preview || txPreview) && !hasResult"
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-board hover:bg-accent-hover disabled:opacity-50"
            :disabled="!canCommit"
            @click="confirmImport"
          >
            <Loader2 v-if="store.importing" class="animate-spin" :size="16" />
            {{ activeConflict ? 'Substituir e processar' : 'Confirmar importação' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
