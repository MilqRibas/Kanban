<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Loader2 } from '@lucide/vue'
import {
  fetchClubCaseInvestment,
  fetchXtremeCaseSummary,
  saveClubCaseInvestment,
  type XtremeCaseSummary,
} from '../../services/clubCaseApi'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/campaignFormat'
import { consolidateXtremeCase, LEAGUE_FEE_RATE } from '../../utils/clubDimension'

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const summary = ref<XtremeCaseSummary | null>(null)
const investment = ref('0')
const activation = ref('0')

const economics = computed(() => {
  const agencies = summary.value?.agencies ?? []
  return consolidateXtremeCase({
    agencies,
    investment: Number(investment.value) || 0,
    activation: Number(activation.value) || 0,
  })
})

const distinctPlayers = computed(() => summary.value?.players ?? 0)
const distinctActive = computed(() => summary.value?.activePlayers ?? 0)
const deposits = computed(() => summary.value?.deposits ?? 0)

onMounted(async () => {
  loading.value = true
  error.value = null
  try {
    const [caseRow, snap] = await Promise.all([
      fetchClubCaseInvestment('xtreme_pro'),
      fetchXtremeCaseSummary(),
    ])
    investment.value = String(caseRow.investment)
    activation.value = String(caseRow.activationCost)
    summary.value = snap
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Falha ao carregar o case Xtreme Pro.'
  } finally {
    loading.value = false
  }
})

async function onSave() {
  const investmentValue = Number(investment.value)
  const activationValue = Number(activation.value)
  if (!Number.isFinite(investmentValue) || investmentValue < 0) {
    error.value = 'Investimento inválido.'
    return
  }
  if (!Number.isFinite(activationValue) || activationValue < 0) {
    error.value = 'Ativação inválida.'
    return
  }
  saving.value = true
  error.value = null
  try {
    await saveClubCaseInvestment({
      clubCode: 'xtreme_pro',
      investment: investmentValue,
      activationCost: activationValue,
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Falha ao salvar o investimento.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="rounded-2xl border border-white/10 bg-board-elevated/60 p-3 sm:p-4">
    <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 class="text-sm font-semibold text-text-primary">Xtreme Pro</h3>
        <p class="text-xs text-text-muted">
          Case histórico encerrado. As agências do relatório entram num único agregado.
          O detalhe de cada agência permanece nos fatos importados.
        </p>
      </div>
      <p class="text-[11px] text-text-muted">
        Taxa da liga {{ formatPercent(LEAGUE_FEE_RATE * 100) }}
      </p>
    </div>

    <p v-if="loading" class="mt-3 inline-flex items-center gap-2 text-xs text-text-muted">
      <Loader2 :size="14" class="animate-spin" />
      Carregando case…
    </p>
    <p v-else-if="error" class="mt-3 text-xs text-rose-200">{{ error }}</p>

    <template v-else>
      <p
        v-if="!summary?.hasActivity"
        class="mt-3 rounded-xl border border-white/10 bg-board/40 px-3 py-2 text-xs text-text-muted"
      >
        Nenhum relatório Xtreme Pro importado. Rake, jogadores e incentivos deste clube ficam zerados até a primeira importação.
      </p>

      <div class="mt-3 grid gap-2 sm:grid-cols-2">
        <label class="block text-xs text-text-muted">
          Investimento total
          <input
            v-model="investment"
            type="number"
            min="0"
            step="0.01"
            class="mt-1 w-full rounded-xl border border-white/10 bg-board px-3 py-2 text-sm text-text-primary outline-none ring-accent/40 focus:ring-2"
          />
        </label>
        <label class="block text-xs text-text-muted">
          Ativação
          <input
            v-model="activation"
            type="number"
            min="0"
            step="0.01"
            class="mt-1 w-full rounded-xl border border-white/10 bg-board px-3 py-2 text-sm text-text-primary outline-none ring-accent/40 focus:ring-2"
          />
        </label>
      </div>
      <button
        type="button"
        class="mt-2 inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-board hover:bg-accent-hover disabled:opacity-60"
        :disabled="saving"
        @click="onSave"
      >
        {{ saving ? 'Salvando…' : 'Salvar investimento' }}
      </button>

      <dl class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <dt class="text-text-muted">Custo total</dt>
          <dd class="font-medium text-text-primary">{{ formatCurrency(economics.totalCost) }}</dd>
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
          <dd class="font-medium text-text-primary">{{ formatCurrency(economics.rakeBruto) }}</dd>
        </div>
        <div>
          <dt class="text-text-muted">Rake líquido</dt>
          <dd class="font-medium text-text-primary">{{ formatCurrency(economics.rakeLiquido) }}</dd>
        </div>
        <div>
          <dt class="text-text-muted">Recuperação</dt>
          <dd class="font-medium text-text-primary">
            {{ economics.recovery == null ? '—' : formatPercent(economics.recovery * 100) }}
          </dd>
        </div>
        <div>
          <dt class="text-text-muted">Payback</dt>
          <dd class="font-medium text-text-primary">
            {{ economics.totalCost <= 0 ? '—' : economics.payback ? 'Atingido' : 'Ainda não' }}
          </dd>
        </div>
      </dl>

      <p v-if="economics.agencyCount > 0" class="mt-2 text-[11px] text-text-muted">
        {{ economics.agencyCount }}
        {{ economics.agencyCount === 1 ? 'agência preservada no fato' : 'agências preservadas no fato' }},
        consolidadas como XTREME PRO.
      </p>
    </template>
  </section>
</template>
