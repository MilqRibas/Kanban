<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { Loader2, Pencil, X } from '@lucide/vue'
import {
  fetchClubCaseInvestment,
  fetchXtremeCaseSummary,
  parseMoneyInput,
  saveClubCaseInvestment,
  type XtremeCaseSummary,
} from '../../services/clubCaseApi'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/campaignFormat'
import { consolidateXtremeCase } from '../../utils/clubDimension'
import CollapsiblePanel from './CollapsiblePanel.vue'

const props = defineProps<{
  /** null = todas as agências; lista = restringe ao filtro da visão. */
  agentIds?: string[] | null
}>()

const loading = ref(true)
const saving = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saveOk = ref(false)
const summary = ref<XtremeCaseSummary | null>(null)
/** Valor persistido (somente leitura na UI até clicar no lápis). */
const savedInvestment = ref('0')
/** Draft enquanto edita. */
const investmentDraft = ref('0')
const editingInvestment = ref(false)
const investmentInputEl = ref<HTMLInputElement | null>(null)

const investment = computed(() =>
  editingInvestment.value ? investmentDraft.value : savedInvestment.value,
)

const activation = computed(() => summary.value?.incentiveSent ?? 0)

const filterAgentIds = computed(() => {
  if (!props.agentIds) return null
  return new Set(props.agentIds)
})

/** Agências Xtreme que batem com o filtro de campanhas. */
const matchedAgencies = computed(() => {
  const all = summary.value?.agencies ?? []
  const ids = filterAgentIds.value
  if (!ids) return null
  return all.filter((a) => a.agentId && ids.has(a.agentId))
})

/**
 * Se o filtro de campanhas (ex.: natureza Orgânica) não cruza nenhuma agência
 * do relatório Xtreme, não zerar o case — o filtro não se aplica a este clube.
 */
const filteredAgencies = computed(() => {
  const all = summary.value?.agencies ?? []
  const matched = matchedAgencies.value
  if (matched == null) return all
  if (matched.length === 0) return all
  return matched
})

const filterActive = computed(() => {
  const matched = matchedAgencies.value
  if (matched == null) return false
  const total = summary.value?.agencies.length ?? 0
  return matched.length > 0 && matched.length < total
})

const filterIgnored = computed(() => {
  const matched = matchedAgencies.value
  return matched != null && matched.length === 0
})

const economics = computed(() =>
  consolidateXtremeCase({
    agencies: filteredAgencies.value,
    investment: parseMoneyInput(investment.value) ?? 0,
    activation: activation.value,
  }),
)

const distinctPlayers = computed(() => {
  if (!filterActive.value) return summary.value?.players ?? 0
  return economics.value.players
})
const distinctActive = computed(() => {
  if (!filterActive.value) return summary.value?.activePlayers ?? 0
  return economics.value.activePlayers
})
const deposits = computed(() => {
  if (!filterActive.value) return summary.value?.deposits ?? 0
  return economics.value.deposits
})

onMounted(async () => {
  loading.value = true
  loadError.value = null
  try {
    const [caseRow, snap] = await Promise.all([
      fetchClubCaseInvestment('xtreme_pro'),
      fetchXtremeCaseSummary(),
    ])
    const value = String(caseRow.investment)
    savedInvestment.value = value
    investmentDraft.value = value
    editingInvestment.value = false
    summary.value = snap
  } catch (err) {
    loadError.value =
      err instanceof Error ? err.message : 'Falha ao carregar o case Xtreme Pro.'
  } finally {
    loading.value = false
  }
})

async function startEditInvestment() {
  investmentDraft.value = savedInvestment.value
  editingInvestment.value = true
  saveOk.value = false
  saveError.value = null
  await nextTick()
  investmentInputEl.value?.focus()
  investmentInputEl.value?.select()
}

function cancelEditInvestment() {
  investmentDraft.value = savedInvestment.value
  editingInvestment.value = false
  saveError.value = null
}

async function onSave() {
  const investmentValue = parseMoneyInput(investmentDraft.value)
  if (investmentValue == null || investmentValue < 0) {
    saveError.value = 'Investimento inválido.'
    saveOk.value = false
    return
  }
  saving.value = true
  saveError.value = null
  saveOk.value = false
  try {
    const saved = await saveClubCaseInvestment({
      clubCode: 'xtreme_pro',
      investment: investmentValue,
    })
    const value = String(saved.investment)
    savedInvestment.value = value
    investmentDraft.value = value
    editingInvestment.value = false
    summary.value = await fetchXtremeCaseSummary()
    saveOk.value = true
  } catch (err) {
    saveOk.value = false
    saveError.value =
      err instanceof Error
        ? err.message
        : 'Não foi possível salvar o investimento. Tente novamente.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <CollapsiblePanel
    title="Xtreme Pro"
    hint="Case histórico · custo = investimento salvo · líquido = bruto − investimento − ativação"
    :default-open="false"
  >
    <div class="space-y-3 px-3 pb-3 sm:px-4">
      <p class="text-xs text-text-muted">
        As agências do relatório entram num único agregado. O detalhe de cada agência
        permanece nos fatos importados.
        <span v-if="filterActive">
          Métricas de rake/jogadores/depósitos seguem o filtro de campanhas
          ({{ filteredAgencies.length }} de {{ summary?.agencies.length ?? 0 }} agências).
        </span>
        <span v-else-if="filterIgnored">
          O filtro atual de campanhas não cruza agências Xtreme — exibindo o case completo
          ({{ summary?.agencies.length ?? 0 }} agências).
        </span>
      </p>

      <p v-if="loading" class="inline-flex items-center gap-2 text-xs text-text-muted">
        <Loader2 :size="14" class="animate-spin" />
        Carregando case…
      </p>
      <p v-else-if="loadError" class="text-xs text-rose-200">{{ loadError }}</p>

      <template v-else>
        <p
          v-if="!summary?.hasActivity"
          class="rounded-xl border border-white/10 bg-board/40 px-3 py-2 text-xs text-text-muted"
        >
          Nenhum relatório Xtreme Pro importado. Rake, jogadores e incentivos deste clube
          ficam zerados até a primeira importação.
        </p>

        <div class="grid gap-2 sm:grid-cols-2">
          <div class="block text-xs text-text-muted">
            <div class="flex items-center justify-between gap-2">
              <span>Investimento total</span>
              <button
                v-if="!editingInvestment"
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
                title="Editar investimento"
                aria-label="Editar investimento"
                @click="startEditInvestment"
              >
                <Pencil :size="14" />
              </button>
              <button
                v-else
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
                title="Cancelar edição"
                aria-label="Cancelar edição"
                :disabled="saving"
                @click="cancelEditInvestment"
              >
                <X :size="14" />
              </button>
            </div>
            <input
              v-if="editingInvestment"
              ref="investmentInputEl"
              v-model="investmentDraft"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              class="mt-1 w-full rounded-xl border border-white/10 bg-board px-3 py-2 text-sm text-text-primary outline-none ring-accent/40 focus:ring-2"
            />
            <p
              v-else
              class="mt-1 w-full rounded-xl border border-dashed border-white/10 bg-transparent px-3 py-2 text-sm font-medium text-text-primary"
            >
              {{ formatCurrency(parseMoneyInput(savedInvestment) ?? 0) }}
            </p>
          </div>
          <div class="block text-xs text-text-muted">
            Ativação
            <p
              class="mt-1 w-full rounded-xl border border-dashed border-white/10 bg-transparent px-3 py-2 text-sm font-medium text-text-primary"
              title="Soma automática do Incentivo Enviado Xtreme (sender 1092502 OU bônus)"
            >
              {{ formatCurrency(activation) }}
            </p>
            <p class="mt-1 text-[11px] text-text-muted">
              Calculada pelo motor de incentivos (somente leitura). Diferente de Ativos
              ({{ formatNumber(distinctActive) }} jogadores).
            </p>
          </div>
        </div>
        <div v-if="editingInvestment" class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-board hover:bg-accent-hover disabled:opacity-60"
            :disabled="saving"
            @click="onSave"
          >
            {{ saving ? 'Salvando…' : 'Salvar investimento' }}
          </button>
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-text-secondary hover:bg-white/5 disabled:opacity-60"
            :disabled="saving"
            @click="cancelEditInvestment"
          >
            Cancelar
          </button>
          <p v-if="saveError" class="text-xs text-rose-200">{{ saveError }}</p>
        </div>
        <p v-else-if="saveOk" class="text-xs text-emerald-300">Investimento salvo.</p>
        <p v-else-if="saveError" class="text-xs text-rose-200">{{ saveError }}</p>

        <dl class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <dt class="text-text-muted">Custo total</dt>
            <dd class="font-medium text-text-primary">
              {{ formatCurrency(economics.totalCost) }}
            </dd>
            <p class="mt-0.5 text-[10px] text-text-muted">= investimento salvo</p>
          </div>
          <div>
            <dt class="text-text-muted">Ativação</dt>
            <dd class="font-medium text-text-primary">
              {{ formatCurrency(economics.activation) }}
            </dd>
          </div>
          <div>
            <dt class="text-text-muted">Jogadores</dt>
            <dd class="font-medium text-text-primary">{{ formatNumber(distinctPlayers) }}</dd>
          </div>
          <div>
            <dt class="text-text-muted">Ativos</dt>
            <dd class="font-medium text-text-primary">{{ formatNumber(distinctActive) }}</dd>
          </div>
          <div>
            <dt class="text-text-muted">Depósitos</dt>
            <dd class="font-medium text-text-primary">{{ formatCurrency(deposits) }}</dd>
          </div>
          <div>
            <dt class="text-text-muted">Rake bruto</dt>
            <dd class="font-medium text-text-primary">
              {{ formatCurrency(economics.rakeBruto) }}
            </dd>
          </div>
          <div>
            <dt class="text-text-muted">Rake líquido</dt>
            <dd class="font-medium text-text-primary">
              {{ formatCurrency(economics.rakeLiquido) }}
            </dd>
            <p class="mt-0.5 text-[10px] text-text-muted">bruto − inv. − ativação</p>
          </div>
          <div>
            <dt class="text-text-muted">Recuperação</dt>
            <dd class="font-medium text-text-primary">
              {{
                economics.recovery == null
                  ? '—'
                  : formatPercent(economics.recovery * 100)
              }}
            </dd>
            <p class="mt-0.5 text-[10px] text-text-muted">líquido / investimento</p>
          </div>
          <div>
            <dt class="text-text-muted">Payback</dt>
            <dd class="font-medium text-text-primary">
              {{
                economics.spendTotal <= 0
                  ? '—'
                  : economics.payback
                    ? 'Atingido'
                    : 'Ainda não'
              }}
            </dd>
          </div>
        </dl>

        <div
          v-if="filteredAgencies.length > 0"
          class="overflow-x-auto rounded-xl border border-white/10"
        >
          <table class="min-w-full text-left text-xs">
            <thead class="bg-white/[0.03] text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">Agência</th>
                <th class="px-3 py-2 text-right font-medium">Rake</th>
                <th class="px-3 py-2 text-right font-medium">Jogadores</th>
                <th class="px-3 py-2 text-right font-medium">Ativos</th>
                <th class="px-3 py-2 text-right font-medium">Depósitos</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(ag, idx) in filteredAgencies"
                :key="ag.agentId"
                class="border-t border-white/5"
                :class="idx % 2 === 1 ? 'bg-white/[0.02]' : ''"
              >
                <td class="max-w-[14rem] truncate px-3 py-2 font-medium text-text-primary">
                  {{ ag.agentName || ag.agentId }}
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-text-secondary">
                  {{ formatCurrency(ag.weeklyRake) }}
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-text-secondary">
                  {{ formatNumber(ag.players) }}
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-text-secondary">
                  {{ formatNumber(ag.activePlayers) }}
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-text-secondary">
                  {{ formatCurrency(ag.deposits) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="economics.agencyCount > 0" class="text-[11px] text-text-muted">
          {{ economics.agencyCount }}
          {{
            economics.agencyCount === 1
              ? 'agência no recorte'
              : 'agências no recorte'
          }},
          consolidadas como XTREME PRO.
        </p>
      </template>
    </div>
  </CollapsiblePanel>
</template>
