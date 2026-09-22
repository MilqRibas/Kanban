<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FileUp, Loader2, X } from '@lucide/vue'
import { useEscapeKey } from '../../composables/useEscapeKey'
import { useToastStore } from '../../stores/toast'
import {
  useCampaignsStore,
  type CommitReportResult,
  type CommitTransactionResult,
  type ReportPreview,
  type TransactionReportPreview,
} from '../../stores/campaigns'
import { formatCurrency } from '../../utils/campaignFormat'
import { formatPeriodLabel } from '../../utils/campaignWeeklyMetrics'
import {
  CLUB_FILTER_OPTIONS,
  type ClubCode,
} from '../../utils/clubDimension'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  imported: [result: CommitReportResult | CommitTransactionResult]
}>()

type QueueStatus =
  | 'ready'
  | 'needs_replace'
  | 'importing'
  | 'done'
  | 'error'
  | 'skipped'

type QueueItem = {
  id: string
  file: File
  replaceConfirmed: boolean
  status: QueueStatus
  error: string | null
  rakePreview: ReportPreview | null
  txPreview: TransactionReportPreview | null
  rakeResult: CommitReportResult | null
  txResult: CommitTransactionResult | null
}

const store = useCampaignsStore()
const toast = useToastStore()
const fileInput = ref<HTMLInputElement | null>(null)
const importKind = ref<'rake' | 'transactions'>('rake')
const queue = ref<QueueItem[]>([])
const parsing = ref(false)
const batchRunning = ref(false)
const stepError = ref<string | null>(null)
const importClub = ref<ClubCode>('sx_club')
const replaceAllConflicts = ref(false)

useEscapeKey(
  () => props.open && !store.importing && !batchRunning.value,
  () => close(),
)

function resetQueueState() {
  queue.value = []
  replaceAllConflicts.value = false
  stepError.value = null
  batchRunning.value = false
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      resetQueueState()
      importKind.value = 'rake'
    }
  },
)

watch(importKind, () => {
  resetQueueState()
})

watch(importClub, async () => {
  if (importKind.value !== 'rake' || !queue.value.length || batchRunning.value) return
  parsing.value = true
  try {
    for (const item of queue.value) {
      if (item.status === 'done' || item.status === 'importing') continue
      const preview = await store.previewReport(item.file, importClub.value)
      if (!preview) {
        item.status = 'error'
        item.error = 'Não foi possível revalidar o arquivo com o clube selecionado.'
        item.rakePreview = null
        continue
      }
      item.rakePreview = preview
      item.replaceConfirmed = false
      item.error = null
      item.status = preview.conflict ? 'needs_replace' : 'ready'
    }
    flagIntraBatchConflicts()
    replaceAllConflicts.value = false
  } finally {
    parsing.value = false
  }
})

watch(replaceAllConflicts, (value) => {
  if (!value) return
  for (const item of queue.value) {
    if (item.status === 'needs_replace' || itemHasConflict(item)) {
      item.replaceConfirmed = true
      if (item.status === 'needs_replace') item.status = 'ready'
    }
  }
})

function close() {
  if (batchRunning.value || store.importing) return
  emit('update:open', false)
}

function itemHasConflict(item: QueueItem): boolean {
  if (importKind.value === 'rake') return Boolean(item.rakePreview?.conflict)
  return Boolean(item.txPreview?.conflict)
}

function itemPeriodLabel(item: QueueItem): string {
  const period =
    importKind.value === 'rake'
      ? item.rakePreview?.parsed.period
      : item.txPreview?.parsed.period
  if (!period) return '—'
  return formatPeriodLabel(period.start, period.end)
}

function statusLabel(status: QueueStatus): string {
  switch (status) {
    case 'ready':
      return 'Pronto'
    case 'needs_replace':
      return 'Conflito'
    case 'importing':
      return 'Importando…'
    case 'done':
      return 'Importado'
    case 'error':
      return 'Erro'
    case 'skipped':
      return 'Pulado'
    default:
      return status
  }
}

function createQueueId() {
  return `q-${crypto.randomUUID().slice(0, 8)}`
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return

  resetQueueState()
  parsing.value = true
  try {
    const next: QueueItem[] = []
    for (const file of files) {
      const item: QueueItem = {
        id: createQueueId(),
        file,
        replaceConfirmed: false,
        status: 'ready',
        error: null,
        rakePreview: null,
        txPreview: null,
        rakeResult: null,
        txResult: null,
      }

      if (importKind.value === 'rake') {
        const preview = await store.previewReport(file, importClub.value)
        if (!preview) {
          item.status = 'error'
          item.error = 'Não foi possível validar o arquivo.'
        } else {
          item.rakePreview = preview
          item.status = preview.conflict ? 'needs_replace' : 'ready'
        }
      } else {
        const preview = await store.previewTransactionReport(file)
        if (!preview) {
          item.status = 'error'
          item.error = 'Não foi possível validar o arquivo de transações.'
        } else {
          item.txPreview = preview
          item.status = preview.conflict ? 'needs_replace' : 'ready'
        }
      }
      next.push(item)
    }
    queue.value = next
    flagIntraBatchConflicts()
    if (next.every((item) => item.status === 'error')) {
      stepError.value = 'Nenhum arquivo válido neste lote.'
    }
  } finally {
    parsing.value = false
  }
}

function itemPeriodKey(item: QueueItem): string | null {
  const period =
    importKind.value === 'rake'
      ? item.rakePreview?.parsed.period
      : item.txPreview?.parsed.period
  if (!period) return null
  return `${period.start}_${period.end}`
}

/** Arquivos do mesmo período no lote: o segundo em diante precisa de replace. */
function flagIntraBatchConflicts() {
  const seen = new Map<string, string>()
  for (const item of queue.value) {
    if (item.status === 'error') continue
    const key = itemPeriodKey(item)
    if (!key) continue
    const firstId = seen.get(key)
    if (!firstId) {
      seen.set(key, item.id)
      continue
    }
    if (item.status === 'ready' && !itemHasConflict(item)) {
      item.status = 'needs_replace'
      item.error =
        'Outro arquivo deste lote cobre o mesmo período. Confirme a substituição se quiser reprocessar.'
    }
  }
}

function removeItem(id: string) {
  if (batchRunning.value) return
  queue.value = queue.value.filter((item) => item.id !== id)
  for (const item of queue.value) {
    if (
      item.status === 'needs_replace' &&
      !itemHasConflict(item) &&
      item.error?.includes('Outro arquivo deste lote')
    ) {
      item.status = 'ready'
      item.error = null
      item.replaceConfirmed = false
    }
  }
  flagIntraBatchConflicts()
}

function onItemReplaceToggle(item: QueueItem, checked: boolean) {
  item.replaceConfirmed = checked
  if (checked && item.status === 'needs_replace') {
    item.status = 'ready'
    item.error = null
  } else if (!checked && itemHasConflict(item) && item.status === 'ready') {
    item.status = 'needs_replace'
  }
}

const conflictCount = computed(
  () =>
    queue.value.filter(
      (item) =>
        item.status === 'needs_replace' ||
        (itemHasConflict(item) && !item.replaceConfirmed),
    ).length,
)

const pendingCount = computed(
  () =>
    queue.value.filter(
      (item) => item.status === 'ready' || item.status === 'needs_replace',
    ).length,
)

const doneCount = computed(
  () => queue.value.filter((item) => item.status === 'done').length,
)

const errorCount = computed(
  () =>
    queue.value.filter(
      (item) => item.status === 'error' || item.status === 'skipped',
    ).length,
)

const batchFinished = computed(
  () =>
    queue.value.length > 0 &&
    queue.value.every((item) =>
      ['done', 'error', 'skipped'].includes(item.status),
    ),
)

const canCommit = computed(() => {
  if (parsing.value || batchRunning.value || store.importing) return false
  if (!queue.value.length) return false
  if (batchFinished.value) return false
  const actionable = queue.value.filter(
    (item) => item.status === 'ready' || item.status === 'needs_replace',
  )
  if (!actionable.length) return false
  return actionable.every(
    (item) => item.status === 'ready' && (!itemHasConflict(item) || item.replaceConfirmed),
  )
})

const hasAnyConflictNeedingConfirm = computed(() =>
  queue.value.some(
    (item) =>
      (item.status === 'needs_replace' || item.status === 'ready') &&
      itemHasConflict(item) &&
      !item.replaceConfirmed,
  ),
)

async function confirmImport() {
  if (!canCommit.value) return
  stepError.value = null
  batchRunning.value = true
  let lastResult: CommitReportResult | CommitTransactionResult | null = null
  let imported = 0
  let failed = 0

  try {
    for (const item of queue.value) {
      if (item.status !== 'ready') continue

      item.status = 'importing'
      item.error = null

      try {
        if (importKind.value === 'rake') {
          const fresh = await store.previewReport(item.file, importClub.value)
          if (!fresh) {
            item.status = 'error'
            item.error = 'Falha ao revalidar o arquivo antes do commit.'
            failed += 1
            continue
          }
          item.rakePreview = fresh
          if (fresh.conflict && !item.replaceConfirmed) {
            item.status = 'skipped'
            item.error =
              'Conflito detectado após outro arquivo do lote. Confirme a substituição e tente de novo.'
            failed += 1
            continue
          }
          const committed = await store.commitReport({
            preview: fresh,
            replace: Boolean(fresh.conflict && item.replaceConfirmed),
            clubCode: importClub.value,
            quiet: true,
          })
          if (!committed) {
            item.status = 'error'
            item.error = 'Falha ao processar o relatório.'
            failed += 1
            continue
          }
          item.rakeResult = committed
          item.status = 'done'
          imported += 1
          lastResult = committed
          emit('imported', committed)
        } else {
          const fresh = await store.previewTransactionReport(item.file)
          if (!fresh) {
            item.status = 'error'
            item.error = 'Falha ao revalidar o arquivo antes do commit.'
            failed += 1
            continue
          }
          item.txPreview = fresh
          if (fresh.conflict && !item.replaceConfirmed) {
            item.status = 'skipped'
            item.error =
              'Conflito detectado após outro arquivo do lote. Confirme a substituição e tente de novo.'
            failed += 1
            continue
          }
          const committed = await store.commitTransactionReport({
            preview: fresh,
            replace: Boolean(fresh.conflict && item.replaceConfirmed),
            clubCode: importClub.value,
            quiet: true,
          })
          if (!committed) {
            item.status = 'error'
            item.error = 'Falha ao processar as transações.'
            failed += 1
            continue
          }
          item.txResult = committed
          item.status = 'done'
          imported += 1
          lastResult = committed
          emit('imported', committed)
        }
      } catch (err) {
        item.status = 'error'
        item.error =
          err instanceof Error ? err.message : 'Falha ao processar o arquivo.'
        failed += 1
      }
    }
  } finally {
    batchRunning.value = false
  }

  if (imported > 0 && failed === 0) {
    toast.success(
      imported === 1
        ? '1 relatório importado.'
        : `${imported} relatórios importados.`,
    )
  } else if (imported > 0 && failed > 0) {
    toast.success(`${imported} importado(s), ${failed} com problema.`)
  } else if (failed > 0) {
    stepError.value = 'Nenhum arquivo do lote foi importado.'
    toast.error(stepError.value)
  }

  void lastResult
}

const footerCommitLabel = computed(() => {
  if (hasAnyConflictNeedingConfirm.value) return 'Confirme os conflitos'
  if (pendingCount.value <= 1) {
    return conflictCount.value > 0 ? 'Substituir e processar' : 'Confirmar importação'
  }
  return conflictCount.value > 0
    ? `Substituir e processar ${pendingCount.value}`
    : `Confirmar ${pendingCount.value} arquivos`
})
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
        :disabled="batchRunning || store.importing"
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
              Escolha o tipo e envie um ou mais arquivos XLSX do mesmo tipo
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary disabled:opacity-50"
            aria-label="Fechar"
            :disabled="batchRunning || store.importing"
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
              :disabled="parsing || batchRunning || store.importing"
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
              :disabled="parsing || batchRunning || store.importing"
              @click="importKind = 'transactions'"
            >
              Transações
            </button>
          </div>

          <label class="block text-xs text-text-muted">
            Clube deste lote
            <select
              v-model="importClub"
              class="mt-1 w-full rounded-xl border border-border-subtle bg-board px-3 py-2 text-sm text-text-primary"
              :disabled="parsing || batchRunning || store.importing"
            >
              <option
                v-for="opt in CLUB_FILTER_OPTIONS.filter((o) => o.value !== 'all')"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <span class="mt-1 block text-[11px]">
              Um clube por lote. Nome do clube no arquivo prevalece quando existir.
            </span>
          </label>

          <div
            class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-subtle bg-column/40 px-4 py-8"
          >
            <FileUp class="text-accent" :size="28" />
            <p class="text-sm text-text-secondary">
              {{
                importKind === 'rake'
                  ? 'Relatórios semanais (Agentes, Jogadores, Mesas)'
                  : 'Relatórios de transações (depósitos e bônus)'
              }}
            </p>
            <button
              type="button"
              class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-board hover:bg-accent-hover disabled:opacity-50"
              :disabled="parsing || batchRunning || store.importing"
              @click="fileInput?.click()"
            >
              Escolher arquivos .xlsx
            </button>
            <p class="text-[11px] text-text-muted">
              Selecione vários arquivos do mesmo tipo. Não misture rake com transações.
            </p>
            <input
              ref="fileInput"
              type="file"
              multiple
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              class="hidden"
              @change="onFileChange"
            />
          </div>

          <p v-if="parsing" class="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 class="animate-spin" :size="16" />
            Validando lote…
          </p>

          <p
            v-if="stepError"
            class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {{ stepError }}
          </p>

          <div v-if="queue.length" class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs text-text-muted">
                {{ queue.length }} arquivo(s)
                <template v-if="batchFinished">
                  · {{ doneCount }} ok
                  <template v-if="errorCount"> · {{ errorCount }} com problema</template>
                </template>
              </p>
              <label
                v-if="hasAnyConflictNeedingConfirm && !batchFinished"
                class="flex items-center gap-2 text-xs text-amber-100"
              >
                <input
                  v-model="replaceAllConflicts"
                  type="checkbox"
                  class="rounded border-white/20"
                />
                Substituir todos os conflitos
              </label>
            </div>

            <div
              v-for="item in queue"
              :key="item.id"
              class="space-y-2 rounded-xl border border-border-subtle bg-board-elevated/60 p-3"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-text-primary">
                    {{ item.file.name }}
                  </p>
                  <p class="text-xs text-text-muted">
                    Período: {{ itemPeriodLabel(item) }}
                    ·
                    <span
                      :class="{
                        'text-amber-200': item.status === 'needs_replace',
                        'text-success': item.status === 'done',
                        'text-danger': item.status === 'error' || item.status === 'skipped',
                      }"
                    >
                      {{ statusLabel(item.status) }}
                    </span>
                  </p>
                </div>
                <button
                  v-if="!batchFinished && item.status !== 'importing' && !batchRunning"
                  type="button"
                  class="shrink-0 rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-white/10 hover:text-text-primary"
                  @click="removeItem(item.id)"
                >
                  Remover
                </button>
              </div>

              <ul
                v-if="importKind === 'rake' && item.rakePreview"
                class="grid grid-cols-2 gap-1 text-xs text-text-secondary sm:grid-cols-4"
              >
                <li>{{ item.rakePreview.parsed.agents.length }} agências</li>
                <li>{{ item.rakePreview.parsed.uniquePlayerIds.length }} jogadores</li>
                <li>{{ item.rakePreview.parsed.tables.length }} mesas</li>
                <li>
                  {{ item.rakePreview.conciliatedCount }} conciliadas
                  <span v-if="item.rakePreview.divergenceCount" class="text-amber-200">
                    · {{ item.rakePreview.divergenceCount }} diverg.
                  </span>
                </li>
              </ul>

              <ul
                v-else-if="importKind === 'transactions' && item.txPreview"
                class="grid grid-cols-2 gap-1 text-xs text-text-secondary sm:grid-cols-4"
              >
                <li>{{ item.txPreview.parsed.transactions.length }} transações</li>
                <li>{{ item.txPreview.parsed.depositsCount }} depósitos</li>
                <li>{{ item.txPreview.parsed.bonusesCount }} bônus</li>
                <li>{{ item.txPreview.parsed.uniqueAgentIds.length }} agências</li>
              </ul>

              <div
                v-if="itemHasConflict(item) && !batchFinished && item.status !== 'done'"
                class="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
              >
                <p class="font-medium">
                  {{
                    importKind === 'rake'
                      ? 'Já existem dados deste período e clube (mesmo Slot name).'
                      : 'Já existem transações deste período (ou import inválido).'
                  }}
                </p>
                <label class="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    class="rounded border-white/20"
                    :checked="item.replaceConfirmed"
                    :disabled="batchRunning || item.status === 'importing'"
                    @change="
                      onItemReplaceToggle(
                        item,
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  />
                  Substituir / reprocessar este arquivo
                </label>
              </div>

              <p
                v-if="
                  importKind === 'transactions' &&
                  item.txPreview &&
                  item.txPreview.parsed.uniqueAgentIds.length === 0
                "
                class="text-xs text-danger"
              >
                Nenhum Agente player ID reconhecido neste arquivo.
              </p>

              <p v-if="item.error" class="text-xs text-danger">
                {{ item.error }}
              </p>

              <div
                v-if="item.rakeResult"
                class="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success"
              >
                Rake processado — {{ item.rakeResult.periodLabel }}
                <span v-if="item.rakeResult.replaced"> (substituído)</span>
                · {{ item.rakeResult.agentsCount }} agências
                · {{ item.rakeResult.playersCount }} jogadores
              </div>

              <div
                v-if="item.txResult"
                class="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success"
              >
                Transações processadas — {{ item.txResult.periodLabel }}
                <span v-if="item.txResult.replaced"> (substituído)</span>
                · {{ item.txResult.transactionsCount }} TX
                · {{ item.txResult.depositsCount }} depósitos
                · {{ item.txResult.bonusesCount }} bônus
              </div>

              <div
                v-if="item.rakeResult?.campaignUpdates.length"
                class="space-y-1"
              >
                <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Campanhas atualizadas
                </p>
                <div
                  v-for="upd in item.rakeResult.campaignUpdates"
                  :key="upd.campaignId"
                  class="rounded-lg bg-board/50 px-2 py-1.5 text-xs text-text-secondary"
                >
                  <span class="font-medium text-text-primary">{{ upd.name }}</span>
                  · +{{ formatCurrency(upd.rakeAdded) }} → {{ formatCurrency(upd.rakeAfter) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer class="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <button
            type="button"
            class="rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-white/10 disabled:opacity-50"
            :disabled="batchRunning || store.importing"
            @click="close"
          >
            {{ batchFinished ? 'Fechar' : 'Cancelar' }}
          </button>
          <button
            v-if="queue.length && !batchFinished"
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-board hover:bg-accent-hover disabled:opacity-50"
            :disabled="!canCommit"
            @click="confirmImport"
          >
            <Loader2 v-if="batchRunning || store.importing" class="animate-spin" :size="16" />
            {{ footerCommitLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
