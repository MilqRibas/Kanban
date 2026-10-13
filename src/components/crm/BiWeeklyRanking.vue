<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Loader2 } from '@lucide/vue'
import { useAuthStore } from '../../stores/auth'
import { usePlayer360 } from '../../composables/usePlayer360'
import { formatCurrency } from '../../utils/campaignFormat'
import {
  formatIsoDay,
  RANKING_CATEGORY_LABEL,
  type RankingCategory,
} from '../../utils/biAnalytics'
import {
  loadSxWeeks,
  loadWeeklyPrizes,
  loadWeeklyRanking,
  saveWeeklyPrize,
  type BiPrize,
  type BiRankRow,
  type BiWeek,
} from '../../services/biApi'

const auth = useAuthStore()
const player360 = usePlayer360()
const weeks = ref<BiWeek[]>([])
const selected = ref('')
const rows = ref<BiRankRow[]>([])
const prizes = ref<BiPrize[]>([])
const loading = ref(false)
const error = ref('')
const saving = ref(false)
const form = ref({
  category: 'cash' as RankingCategory,
  playerId: '',
  placement: 1,
  amount: 0,
  status: 'registrada' as BiPrize['status'],
  note: '',
})

const week = computed(() => weeks.value.find((item) => item.periodStart === selected.value) ?? null)
const completeWeeks = computed(() => weeks.value.filter((item) => item.complete))

const categories: RankingCategory[] = ['cash', 'torneio', 'spin']

function rowsOf(category: RankingCategory) {
  return rows.value.filter((row) => row.category === category)
}

function categoryNote(category: RankingCategory): string | null {
  if (!week.value) return null
  if (category === 'spin') {
    if (!week.value.spinPlayers) return 'Não há taxa spin individual nesta semana.'
    return 'Spin usa a taxa spin do jogador na semana. O rake das mesas Spin não entra, porque está zerado.'
  }
  if (!week.value.tablesLoaded) return 'Cobertura incompleta: esta semana não tem o detalhe de Cash e Torneio.'
  if (category === 'torneio') return 'Torneio soma MTT e SNG. OFC, Rodeo e TLT ficam de fora.'
  return 'Cash é só Ring Game.'
}

async function refresh() {
  if (!selected.value) return
  loading.value = true
  error.value = ''
  try {
    const [ranking, prizeRows] = await Promise.all([
      loadWeeklyRanking(selected.value),
      loadWeeklyPrizes(selected.value),
    ])
    rows.value = ranking
    prizes.value = prizeRows
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Falha ao carregar o ranking.'
  } finally {
    loading.value = false
  }
}

function prefill(row: BiRankRow) {
  form.value = {
    category: row.category,
    playerId: row.playerId,
    placement: row.placement,
    amount: 0,
    status: 'registrada',
    note: '',
  }
}

async function submitPrize() {
  if (!selected.value || !form.value.playerId) return
  saving.value = true
  error.value = ''
  try {
    await saveWeeklyPrize({
      periodStart: selected.value,
      category: form.value.category,
      playerId: form.value.playerId.trim(),
      placement: form.value.placement,
      amount: Number(form.value.amount) || 0,
      status: form.value.status,
      note: form.value.note,
      createdBy: auth.memberId,
    })
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Falha ao registrar a premiação.'
  } finally {
    saving.value = false
  }
}

function currentRake(prize: BiPrize): number | null {
  return rows.value.find((row) => row.category === prize.category && row.playerId === prize.playerId)?.rake ?? null
}

function exportCsv() {
  const header = ['semana_inicio', 'semana_fim', 'categoria', 'colocacao', 'player_id', 'nickname', 'rake_bruto', 'empate']
  const lines = rows.value.map((row) =>
    [
      selected.value,
      week.value?.periodEnd ?? '',
      row.category,
      row.placement,
      row.playerId,
      row.nickname ?? '',
      row.rake,
      row.tied ? 'sim' : 'nao',
    ].join(','),
  )
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `ranking-sx-${selected.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  try {
    weeks.value = await loadSxWeeks()
    selected.value = completeWeeks.value[0]?.periodStart ?? ''
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Falha ao listar semanas.'
  }
})
</script>

<template>
  <div class="space-y-4">
    <header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 class="text-base font-semibold text-text-primary">Ranking semanal</h3>
        <p class="text-xs text-text-muted">
          Top 3 de rake bruto por modalidade no SX Club. Semana de segunda a domingo.
          Empate fica com o menor Player ID, sem alterar o valor.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-xs text-text-muted" for="ranking-week">Semana</label>
        <select
          id="ranking-week"
          v-model="selected"
          class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm"
          @change="refresh"
        >
          <option v-for="item in completeWeeks" :key="item.periodStart" :value="item.periodStart">
            {{ formatIsoDay(item.periodStart) }} – {{ formatIsoDay(item.periodEnd) }}
          </option>
        </select>
        <button type="button" class="rounded-xl border border-white/10 px-3 py-2 text-sm" @click="exportCsv">
          Exportar CSV
        </button>
      </div>
    </header>

    <p v-if="week" class="text-xs text-text-secondary">
      Semana de referência: {{ formatIsoDay(week.periodStart) }} a {{ formatIsoDay(week.periodEnd) }}.
      Semanas ainda abertas não entram nesta lista.
    </p>
    <p v-if="error" class="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
      {{ error }}
    </p>
    <p v-if="loading" class="inline-flex items-center gap-2 text-sm text-text-muted">
      <Loader2 class="animate-spin" :size="16" /> Carregando…
    </p>

    <div class="grid gap-3 lg:grid-cols-3">
      <section v-for="category in categories" :key="category" class="panel-glass rounded-2xl p-3">
        <h4 class="text-sm font-semibold text-text-primary">{{ RANKING_CATEGORY_LABEL[category] }}</h4>
        <p class="mt-1 text-[11px] text-text-muted">{{ categoryNote(category) }}</p>
        <p v-if="category !== 'spin' && week && !week.tablesLoaded" class="mt-4 text-sm text-text-secondary">
          Ranking não exibido.
        </p>
        <ol v-else class="mt-3 space-y-2">
          <li v-if="!rowsOf(category).length" class="text-sm text-text-muted">Sem jogadores nesta modalidade.</li>
          <li
            v-for="row in rowsOf(category)"
            :key="row.playerId"
            class="rounded-xl border border-white/10 px-3 py-2"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-sm text-text-primary">{{ row.placement }}º · {{ row.nickname || 'Sem nick' }}</p>
                <button type="button" class="font-mono text-xs text-accent" @click="player360.open(row.playerId)">
                  {{ row.playerId }}
                </button>
                <p v-if="row.tied" class="text-[11px] text-amber-200">Empate no valor. Desempate pelo Player ID.</p>
              </div>
              <p class="text-sm tabular-nums text-text-primary">{{ formatCurrency(row.rake) }}</p>
            </div>
            <button type="button" class="mt-2 text-xs text-text-secondary underline" @click="prefill(row)">
              Registrar premiação
            </button>
          </li>
        </ol>
      </section>
    </div>

    <section class="panel-glass rounded-2xl p-3">
      <h4 class="text-sm font-semibold text-text-primary">Registrar premiação</h4>
      <p class="mt-1 text-[11px] text-text-muted">
        O registro não envia fichas e não entra como incentivo. Status enviado é só operacional.
      </p>
      <form class="mt-3 grid gap-2 sm:grid-cols-3" @submit.prevent="submitPrize">
        <select v-model="form.category" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" aria-label="Categoria">
          <option value="cash">Cash</option>
          <option value="torneio">Torneio</option>
          <option value="spin">Spin</option>
        </select>
        <input v-model="form.playerId" required class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" placeholder="Player ID" aria-label="Player ID" />
        <select v-model.number="form.placement" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" aria-label="Colocação">
          <option :value="1">1º</option>
          <option :value="2">2º</option>
          <option :value="3">3º</option>
        </select>
        <input v-model.number="form.amount" type="number" min="0" step="0.01" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" placeholder="Valor" aria-label="Valor" />
        <select v-model="form.status" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" aria-label="Status">
          <option value="planejada">Planejada</option>
          <option value="registrada">Registrada</option>
          <option value="enviada">Enviada</option>
        </select>
        <input v-model="form.note" class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm" placeholder="Observação" aria-label="Observação" />
        <button type="submit" class="rounded-xl bg-accent px-3 py-2 text-sm text-board disabled:opacity-50" :disabled="saving">
          Salvar
        </button>
      </form>
      <ul class="mt-3 space-y-2 text-sm">
        <li v-if="!prizes.length" class="text-text-muted">Nenhuma premiação nesta semana.</li>
        <li v-for="prize in prizes" :key="prize.id" class="rounded-xl border border-white/10 px-3 py-2">
          {{ RANKING_CATEGORY_LABEL[prize.category] }} · {{ prize.placement }}º · {{ prize.playerId }}
          · {{ formatCurrency(prize.amount) }} · {{ prize.status }}
          <p
            v-if="currentRake(prize) != null && Math.abs((currentRake(prize) ?? 0) - prize.rakeSnapshot) > 0.01"
            class="text-[11px] text-amber-200"
          >
            Revisão: na gravação o rake era {{ formatCurrency(prize.rakeSnapshot) }}; agora está {{ formatCurrency(currentRake(prize)) }}.
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
