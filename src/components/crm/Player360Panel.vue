<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useCrmStore } from '../../stores/crm'
import { usePlayer360 } from '../../composables/usePlayer360'
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from '../../utils/campaignFormat'
import { buildCampaignPlayerAlerts } from '../../utils/campaignPlayerAlerts'
import { useCampaignsStore } from '../../stores/campaigns'
import { crmDisplayName } from '../../utils/crmPlayerIdentity'
import {
  INCENTIVE_CLASSIFICATIONS,
  type IncentiveClassification,
} from '../../utils/crmIncentiveEconomics'
import type { CrmIncentiveHistoryItem } from '../../types/crm'

const crm = useCrmStore()
const player360Api = usePlayer360()
const campaigns = useCampaignsStore()

const isOpen = computed(
  () => player360Api.isOpen.value || crm.player360Loading || Boolean(crm.player360),
)
const data = computed(() => crm.player360)

const displayName = computed(() => {
  const p = data.value
  if (!p) return ''
  return crmDisplayName(p)
})

const classificationLabels: Record<IncentiveClassification, string> = {
  ativacao: 'Ativação',
  relacionamento: 'Relacionamento',
  acao: 'Ação',
  pendente: 'Pendente',
}

const editingTxId = ref<string | null>(null)
const editForm = reactive({
  classification: 'pendente' as IncentiveClassification,
  product: '',
  purpose: '',
  notes: '',
})

function moneyClass(value: number): string {
  return value < 0 ? 'text-rose-300' : 'text-text-primary'
}

function classificationLabel(value: IncentiveClassification | null): string {
  if (!value) return '—'
  return classificationLabels[value] ?? value
}

function detectionLabel(item: CrmIncentiveHistoryItem): string | null {
  const d = item.detection
  if (d === 'mkt_gt') return 'MKT GT'
  if (d === 'bonus') return 'Bônus'
  if (d === 'mkt_gt_bonus') return 'MKT GT + Bônus'
  if (item.senderPlayerId === '1092502' && item.isBonus) return 'MKT GT + Bônus'
  if (item.senderPlayerId === '1092502') return 'MKT GT'
  if (item.isBonus) return 'Bônus'
  return null
}

function startEdit(item: CrmIncentiveHistoryItem) {
  editingTxId.value = item.externalTransactionId
  editForm.classification = item.classification ?? 'pendente'
  editForm.product = item.product ?? ''
  editForm.purpose = item.purpose ?? ''
  editForm.notes = item.notes ?? ''
}

function cancelEdit() {
  editingTxId.value = null
}

async function saveEdit() {
  const txId = editingTxId.value
  if (!txId) return
  try {
    await crm.updateIncentiveClassification(txId, {
      classification: editForm.classification,
      product: editForm.product.trim() || null,
      purpose: editForm.purpose.trim() || null,
      notes: editForm.notes.trim() || null,
    })
    editingTxId.value = null
  } catch {
    // toast already handled in store
  }
}

watch(
  () => data.value?.playerId,
  () => {
    editingTxId.value = null
  },
)

const relatedAlerts = computed(() => {
  const p = data.value
  if (!p || !campaigns.ready) return []
  const out: Array<{
    campaignName: string
    priority: string
    title: string
    details: string
  }> = []
  for (const ref of p.campaigns) {
    const campaign = campaigns.campaigns.find((c) => c.id === ref.campaignId)
    if (!campaign) continue
    const periods = campaigns.playerPeriodsForCampaign(campaign).filter(
      (row) => row.playerId === p.playerId,
    )
    const members = campaigns
      .cohortMembersFor(campaign)
      .filter((row) => row.playerId === p.playerId)
    const weeklies = campaigns.cohortWeeklyPeriodsFor(campaign)
    const lastWeek = weeklies[weeklies.length - 1]
    const alerts = buildCampaignPlayerAlerts({
      periods,
      members,
      referencePeriodEnd: lastWeek?.periodEnd ?? lastWeek?.periodStart ?? null,
    })
    for (const alert of alerts) {
      if (alert.playerId !== p.playerId) continue
      out.push({
        campaignName: campaign.name,
        priority: alert.priority,
        title: alert.title,
        details: alert.details.map((d) => `${d.label}: ${d.value}`).join(' · '),
      })
    }
  }
  return out.slice(0, 20)
})

watch(
  () => data.value?.hasCampaign,
  (hasCampaign) => {
    if (hasCampaign && !campaigns.ready && !campaigns.loading) {
      void campaigns.init()
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[80] flex justify-end bg-black/50"
      @click.self="player360Api.close()"
    >
      <aside
        class="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-board shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Player 360"
      >
        <header
          class="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3"
        >
          <div class="min-w-0">
            <p class="text-[11px] uppercase tracking-wide text-text-muted">Player 360º</p>
            <h2 class="truncate text-lg font-semibold text-text-primary">
              {{ displayName || 'Carregando…' }}
            </h2>
            <p v-if="data" class="font-mono text-xs text-accent">{{ data.playerId }}</p>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary"
            aria-label="Fechar"
            @click="player360Api.close()"
          >
            <X :size="18" />
          </button>
        </header>

        <div v-if="crm.player360Loading" class="flex flex-1 items-center justify-center text-sm text-text-muted">
          Carregando consolidação…
        </div>

        <div v-else-if="crm.player360Error" class="flex flex-1 items-center justify-center px-4 text-center text-sm text-rose-300">
          {{ crm.player360Error }}
        </div>

        <div v-else-if="data" class="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <!-- Identidade -->
          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">Identidade</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Nome</p>
                <p class="text-text-primary">{{ data.name || '—' }}</p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Nickname</p>
                <p class="text-text-primary">{{ data.nickname || '—' }}</p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2 col-span-2">
                <p class="text-[11px] text-text-muted">Agente atual / mais recente</p>
                <p class="text-text-primary">
                  <template v-if="data.currentAgentId">
                    {{ data.currentAgentName || data.currentAgentId }}
                    <span class="text-text-muted">({{ data.currentAgentId }})</span>
                  </template>
                  <template v-else>—</template>
                </p>
              </div>
            </div>
          </section>

          <!-- Origem / Campanhas -->
          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">Origem</h3>
            <p
              class="inline-flex rounded-md px-2 py-0.5 text-[11px]"
              :class="data.hasCampaign ? 'bg-sky-500/15 text-sky-200' : 'bg-white/10 text-text-muted'"
            >
              {{ data.hasCampaign ? 'Com campanha relacionada' : 'Base Geral — sem campanha identificada' }}
            </p>
            <ul v-if="data.campaigns.length" class="space-y-1.5">
              <li
                v-for="c in data.campaigns"
                :key="c.campaignId"
                class="rounded-xl bg-white/5 px-3 py-2 text-sm"
              >
                <p class="font-medium text-text-primary">{{ c.campaignName || c.campaignId }}</p>
                <p class="text-xs text-text-muted">
                  Agente: {{ c.agentId || '—' }}
                  · Aquisição: {{ c.acquiredAt ? formatDate(c.acquiredAt) : '—' }}
                </p>
              </li>
            </ul>
          </section>

          <!-- Incentivos -->
          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Incentivos
            </h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Rake bruto histórico</p>
                <p class="tabular-nums font-semibold text-text-primary">
                  {{ formatCurrency(data.incentives.rakeBrutoHistorico) }}
                </p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Taxa da liga</p>
                <p class="tabular-nums font-semibold text-text-primary">
                  {{ formatCurrency(data.incentives.taxaLiga) }}
                </p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Rake líquido histórico</p>
                <p class="tabular-nums font-semibold text-text-primary">
                  {{ formatCurrency(data.incentives.rakeLiquidoHistorico) }}
                </p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Percentual do limite</p>
                <p class="tabular-nums font-semibold text-text-primary">
                  {{ formatPercent(data.incentives.percentualLimite * 100) }}
                </p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Limite de Incentivo</p>
                <p class="tabular-nums font-semibold text-text-primary">
                  {{ formatCurrency(data.incentives.limiteIncentivo) }}
                </p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Incentivo Enviado</p>
                <p class="tabular-nums font-semibold text-text-primary">
                  {{ formatCurrency(data.incentives.incentivoEnviado) }}
                </p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2 col-span-2">
                <p class="text-[11px] text-text-muted">Incentivo Disponível</p>
                <p
                  class="tabular-nums font-semibold"
                  :class="moneyClass(data.incentives.incentivoDisponivel)"
                >
                  {{ formatCurrency(data.incentives.incentivoDisponivel) }}
                </p>
              </div>
            </div>
            <div class="rounded-xl border border-white/10 px-3 py-2 text-[11px] text-text-secondary">
              <div>
                Rake atualizado até:
                <span class="tabular-nums text-text-primary">
                  {{ data.freshness.rakeUpdatedThrough ? formatDate(data.freshness.rakeUpdatedThrough) : '—' }}
                </span>
              </div>
              <div>
                Transações atualizadas até:
                <span class="tabular-nums text-text-primary">
                  {{
                    data.freshness.transactionsUpdatedThrough
                      ? formatDate(data.freshness.transactionsUpdatedThrough)
                      : '—'
                  }}
                </span>
              </div>
            </div>
          </section>

          <!-- Histórico de incentivos -->
          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Histórico de incentivos
            </h3>
            <p
              v-if="data.incentiveHistory.length === 0"
              class="text-xs text-text-muted"
            >
              Nenhuma transferência de incentivo (MKT GT ou Bônus) registrada para este Player ID.
            </p>
            <ul v-else class="space-y-2">
              <li
                v-for="item in data.incentiveHistory"
                :key="item.externalTransactionId"
                class="rounded-xl bg-white/5 px-3 py-2 text-xs"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 space-y-0.5">
                    <p class="tabular-nums text-text-secondary">
                      {{ item.occurredAt ? formatDateTime(item.occurredAt) : '—' }}
                      <span class="text-text-muted">
                        · {{ classificationLabel(item.classification) }}
                      </span>
                      <span
                        v-if="detectionLabel(item)"
                        class="text-text-muted"
                      >
                        · {{ detectionLabel(item) }}
                      </span>
                    </p>
                    <p class="truncate font-mono text-[10px] text-text-muted">
                      {{ item.externalTransactionId }}
                    </p>
                    <p v-if="item.product || item.purpose" class="text-text-secondary">
                      <span v-if="item.product">Produto: {{ item.product }}</span>
                      <span v-if="item.product && item.purpose"> · </span>
                      <span v-if="item.purpose">Finalidade: {{ item.purpose }}</span>
                    </p>
                    <p v-if="item.notes" class="text-text-muted">{{ item.notes }}</p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="tabular-nums font-semibold text-text-primary">
                      {{ formatCurrency(item.amount) }}
                    </p>
                    <button
                      v-if="editingTxId !== item.externalTransactionId"
                      type="button"
                      class="mt-1 text-[11px] text-accent hover:underline disabled:opacity-40"
                      :disabled="crm.incentiveUpdating"
                      @click="startEdit(item)"
                    >
                      Classificar
                    </button>
                  </div>
                </div>

                <form
                  v-if="editingTxId === item.externalTransactionId"
                  class="mt-2 space-y-2 border-t border-white/10 pt-2"
                  @submit.prevent="saveEdit"
                >
                  <label class="block space-y-1">
                    <span class="text-[11px] text-text-muted">Classificação</span>
                    <select
                      v-model="editForm.classification"
                      class="w-full rounded-lg border border-white/10 bg-board-elevated px-2 py-1.5 text-sm text-text-primary"
                    >
                      <option
                        v-for="opt in INCENTIVE_CLASSIFICATIONS"
                        :key="opt"
                        :value="opt"
                      >
                        {{ classificationLabels[opt] }}
                      </option>
                    </select>
                  </label>
                  <label class="block space-y-1">
                    <span class="text-[11px] text-text-muted">Produto</span>
                    <input
                      v-model="editForm.product"
                      type="text"
                      class="w-full rounded-lg border border-white/10 bg-board-elevated px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label class="block space-y-1">
                    <span class="text-[11px] text-text-muted">Finalidade</span>
                    <input
                      v-model="editForm.purpose"
                      type="text"
                      class="w-full rounded-lg border border-white/10 bg-board-elevated px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label class="block space-y-1">
                    <span class="text-[11px] text-text-muted">Observações</span>
                    <textarea
                      v-model="editForm.notes"
                      rows="2"
                      class="w-full rounded-lg border border-white/10 bg-board-elevated px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <div class="flex justify-end gap-2">
                    <button
                      type="button"
                      class="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-text-secondary"
                      :disabled="crm.incentiveUpdating"
                      @click="cancelEdit"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      class="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-board disabled:opacity-40"
                      :disabled="crm.incentiveUpdating"
                    >
                      {{ crm.incentiveUpdating ? 'Salvando…' : 'Salvar' }}
                    </button>
                  </div>
                </form>
              </li>
            </ul>
          </section>

          <!-- Rake -->
          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">Rake</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Acumulado confirmado</p>
                <p class="tabular-nums font-semibold text-text-primary">
                  {{ formatCurrency(data.rake.accumulatedRake) }}
                </p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Períodos</p>
                <p class="tabular-nums font-semibold text-text-primary">
                  {{ formatNumber(data.rake.periodsCount) }}
                </p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2 col-span-2">
                <p class="text-[11px] text-text-muted">Último período com rake</p>
                <p class="tabular-nums text-text-primary">
                  <template v-if="data.rake.lastPeriodStart">
                    {{ formatDate(data.rake.lastPeriodStart) }}
                    <span v-if="data.rake.lastPeriodEnd">
                      → {{ formatDate(data.rake.lastPeriodEnd) }}
                    </span>
                  </template>
                  <template v-else>—</template>
                </p>
              </div>
            </div>
            <ul v-if="data.weeklyRake.length" class="max-h-48 space-y-1 overflow-y-auto">
              <li
                v-for="w in data.weeklyRake"
                :key="`${w.periodStart}-${w.agentId}`"
                class="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs"
              >
                <span class="text-text-secondary">
                  {{ formatDate(w.periodStart) }}
                  <span class="text-text-muted">· {{ w.agentId }}</span>
                </span>
                <span class="tabular-nums text-text-primary">{{ formatCurrency(w.weeklyRake) }}</span>
              </li>
            </ul>
          </section>

          <!-- Perfil de jogo -->
          <section v-if="data.gameProfile.length" class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Perfil de jogo
            </h3>
            <ul class="space-y-1">
              <li
                v-for="g in data.gameProfile"
                :key="g.gameType"
                class="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <span class="text-text-primary">{{ g.gameType }}</span>
                <span class="tabular-nums text-text-secondary">
                  {{ formatCurrency(g.rake) }}
                  <span class="text-text-muted">· {{ formatNumber(g.hands) }} mãos</span>
                </span>
              </li>
            </ul>
          </section>

          <!-- Transações -->
          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Transações
            </h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Depósitos</p>
                <p class="tabular-nums text-text-primary">
                  {{ formatNumber(data.transactions.depositCount) }}
                  · {{ formatCurrency(data.transactions.depositedVolume) }}
                </p>
              </div>
              <div class="rounded-xl bg-white/5 px-3 py-2">
                <p class="text-[11px] text-text-muted">Bônus</p>
                <p class="tabular-nums text-text-primary">
                  {{ formatNumber(data.transactions.bonusCount) }}
                  · {{ formatCurrency(data.transactions.bonusVolume) }}
                </p>
              </div>
            </div>
            <ul v-if="data.transactions.recent.length" class="max-h-56 space-y-1 overflow-y-auto">
              <li
                v-for="t in data.transactions.recent"
                :key="t.id"
                class="rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs"
              >
                <div class="flex justify-between gap-2">
                  <span class="text-text-secondary">
                    {{ t.occurredAt ? formatDateTime(t.occurredAt) : (t.periodStart ? formatDate(t.periodStart) : '—') }}
                    <span class="text-text-muted">
                      · {{ t.isDeposit ? 'Depósito' : t.isBonus ? 'Bônus' : (t.transactionType || 'TX') }}
                    </span>
                  </span>
                  <span class="tabular-nums text-text-primary">{{ formatCurrency(t.amount) }}</span>
                </div>
              </li>
            </ul>
            <p v-else class="text-xs text-text-muted">Nenhuma transação registrada para este Player ID.</p>
          </section>

          <!-- Alertas existentes -->
          <section v-if="relatedAlerts.length" class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Alertas (regras atuais de Campanhas)
            </h3>
            <ul class="space-y-1.5">
              <li
                v-for="(a, idx) in relatedAlerts"
                :key="`${a.campaignName}-${idx}`"
                class="rounded-xl border border-white/10 px-3 py-2 text-xs"
              >
                <p class="font-medium text-text-primary">{{ a.title }}</p>
                <p class="text-text-muted">{{ a.campaignName }} · {{ a.priority }}</p>
                <p class="mt-0.5 text-text-secondary">{{ a.details }}</p>
              </li>
            </ul>
          </section>

          <!-- Freshness -->
          <section class="rounded-xl border border-white/10 px-3 py-2 text-[11px] text-text-secondary">
            <div>
              Rake atualizado até:
              <span class="tabular-nums text-text-primary">
                {{ data.freshness.rakeUpdatedThrough ? formatDate(data.freshness.rakeUpdatedThrough) : '—' }}
              </span>
            </div>
            <div>
              Transações atualizadas até:
              <span class="tabular-nums text-text-primary">
                {{
                  data.freshness.transactionsUpdatedThrough
                    ? formatDate(data.freshness.transactionsUpdatedThrough)
                    : '—'
                }}
              </span>
            </div>
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
