<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useCrmStore } from '../../stores/crm'
import { useDebouncedValue } from '../../composables/useDebouncedValue'
import { usePlayer360 } from '../../composables/usePlayer360'
import { formatCurrency, formatDate } from '../../utils/campaignFormat'
import type {
  CrmCampaignFilter,
  CrmIncentiveAvailableFilter,
  CrmIncentiveReceivedFilter,
  CrmPlayerSort,
} from '../../types/crm'
import { crmDisplayName } from '../../utils/crmPlayerIdentity'

withDefaults(
  defineProps<{
    /** Quando true, CRM está dentro de Campanhas — BI/Pipelines sobem para a área pai. */
    embedded?: boolean
  }>(),
  { embedded: false },
)

const crm = useCrmStore()
const player360 = usePlayer360()
const searchInput = ref('')
const debouncedSearch = useDebouncedValue(() => searchInput.value, 250)

onMounted(() => {
  void crm.init()
})

watch(debouncedSearch, (value) => {
  if (value === crm.search) return
  void crm.setSearch(value)
})

const freshnessLabel = computed(() => {
  const f = crm.freshness
  if (!f) return null
  return {
    rake: f.rakeUpdatedThrough
      ? formatDate(f.rakeUpdatedThrough)
      : '—',
    tx: f.transactionsUpdatedThrough
      ? formatDate(f.transactionsUpdatedThrough)
      : '—',
  }
})

function displayName(row: { name: string | null; nickname: string | null; playerId: string }) {
  return crmDisplayName(row)
}

function moneyClass(value: number): string {
  return value < 0 ? 'text-rose-300' : 'text-text-primary'
}

async function onFilterChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as CrmCampaignFilter
  await crm.setCampaignFilter(value)
}

async function onAvailableFilterChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as CrmIncentiveAvailableFilter
  await crm.setIncentiveAvailableFilter(value)
}

async function onReceivedFilterChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as CrmIncentiveReceivedFilter
  await crm.setIncentiveReceivedFilter(value)
}

async function onSortChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as CrmPlayerSort
  await crm.setSort(value)
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 pb-[calc(var(--footer-clearance)+0.5rem)] pt-3 sm:px-4">
    <header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-lg font-semibold text-text-primary">
          {{ embedded ? 'Base de Jogadores' : 'CRM' }}
        </h1>
        <p class="text-xs text-text-muted">
          Visão auxiliar de Player IDs — pipelines ficam na aba Pipelines.
        </p>
      </div>
      <div
        v-if="freshnessLabel"
        class="rounded-xl border border-white/10 bg-board-elevated/60 px-3 py-2 text-[11px] text-text-secondary"
      >
        <div>Rake atualizado até: <span class="tabular-nums text-text-primary">{{ freshnessLabel.rake }}</span></div>
        <div>Transações atualizadas até: <span class="tabular-nums text-text-primary">{{ freshnessLabel.tx }}</span></div>
      </div>
    </header>

    <section class="space-y-3">
      <div class="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <input
          v-model="searchInput"
          type="search"
          placeholder="Buscar Player ID, nick, nome ou agente…"
          class="w-full min-w-[12rem] flex-1 rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none ring-accent/40 placeholder:text-text-muted focus:ring-2"
        />
        <select
          class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
          :value="crm.campaignFilter"
          @change="onFilterChange"
        >
          <option value="all">Todas as origens</option>
          <option value="with_campaign">Com campanha</option>
          <option value="without_campaign">Sem campanha (Base Geral)</option>
        </select>
        <select
          class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
          :value="crm.incentiveAvailableFilter"
          @change="onAvailableFilterChange"
        >
          <option value="all">Incentivo disponível: todos</option>
          <option value="positive">Disponível &gt; 0</option>
          <option value="zero">Disponível = 0</option>
          <option value="negative">Disponível &lt; 0</option>
        </select>
        <select
          class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
          :value="crm.incentiveReceivedFilter"
          @change="onReceivedFilterChange"
        >
          <option value="all">Incentivo recebido: todos</option>
          <option value="received">Já recebeu MKT GT</option>
          <option value="never">Nunca recebeu</option>
          <option value="pending_classification">Classificação pendente</option>
        </select>
        <select
          class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
          :value="crm.sort"
          @change="onSortChange"
        >
          <option value="last_activity_desc">Última atividade ↓</option>
          <option value="last_activity_asc">Última atividade ↑</option>
          <option value="rake_desc">Rake ↓</option>
          <option value="rake_asc">Rake ↑</option>
          <option value="limite_desc">Limite de Incentivo ↓</option>
          <option value="limite_asc">Limite de Incentivo ↑</option>
          <option value="disponivel_desc">Incentivo Disponível ↓</option>
          <option value="disponivel_asc">Incentivo Disponível ↑</option>
          <option value="enviado_desc">Incentivo Enviado ↓</option>
          <option value="enviado_asc">Incentivo Enviado ↑</option>
          <option value="player_id_asc">Player ID A–Z</option>
          <option value="player_id_desc">Player ID Z–A</option>
        </select>
      </div>

      <div class="overflow-hidden rounded-2xl border border-white/10 bg-board-elevated/50">
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="bg-white/5 text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th class="px-3 py-2 font-semibold">Player ID</th>
                <th class="px-3 py-2 font-semibold">Nome / Nick</th>
                <th class="px-3 py-2 font-semibold">Agente</th>
                <th class="px-3 py-2 font-semibold text-right">Rake acum.</th>
                <th class="px-3 py-2 font-semibold text-right">Limite de Incentivo</th>
                <th class="px-3 py-2 font-semibold text-right">Incentivo Enviado</th>
                <th class="px-3 py-2 font-semibold text-right">Incentivo Disponível</th>
                <th class="px-3 py-2 font-semibold">Última atividade</th>
                <th class="px-3 py-2 font-semibold">Origem</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="crm.loading">
                <td colspan="9" class="px-3 py-8 text-center text-text-muted">
                  Carregando jogadores…
                </td>
              </tr>
              <tr v-else-if="crm.rows.length === 0">
                <td colspan="9" class="px-3 py-8 text-center text-text-muted">
                  Nenhum Player ID encontrado com os filtros atuais.
                </td>
              </tr>
              <tr
                v-for="(row, idx) in crm.rows"
                :key="row.playerId"
                class="cursor-pointer border-t border-white/5 transition-colors hover:bg-white/5"
                :class="idx % 2 === 1 ? 'bg-white/[0.02]' : ''"
                @click="player360.open(row.playerId)"
              >
                <td class="px-3 py-2 font-mono text-xs text-accent">{{ row.playerId }}</td>
                <td class="px-3 py-2 text-text-primary">{{ displayName(row) }}</td>
                <td class="px-3 py-2 text-text-secondary">
                  <span v-if="row.currentAgentId">
                    {{ row.currentAgentName || row.currentAgentId }}
                    <span class="text-[10px] text-text-muted">({{ row.currentAgentId }})</span>
                  </span>
                  <span v-else class="text-text-muted">—</span>
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-text-primary">
                  {{ formatCurrency(row.accumulatedRake) }}
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-text-primary">
                  {{ formatCurrency(row.limiteIncentivo) }}
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-text-primary">
                  {{ formatCurrency(row.incentivoEnviado) }}
                </td>
                <td
                  class="px-3 py-2 text-right tabular-nums"
                  :class="moneyClass(row.incentivoDisponivel)"
                >
                  {{ formatCurrency(row.incentivoDisponivel) }}
                </td>
                <td class="px-3 py-2 tabular-nums text-text-secondary">
                  {{ row.lastActivityDate ? formatDate(row.lastActivityDate) : '—' }}
                </td>
                <td class="px-3 py-2">
                  <span
                    class="inline-flex rounded-md px-2 py-0.5 text-[11px]"
                    :class="
                      row.hasCampaign
                        ? 'bg-sky-500/15 text-sky-200'
                        : 'bg-white/10 text-text-muted'
                    "
                  >
                    {{ row.originLabel }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          class="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-text-secondary"
        >
          <span>
            {{ crm.total }} jogador{{ crm.total === 1 ? '' : 'es' }}
            · página {{ crm.page }}/{{ crm.pageCount }}
          </span>
          <div class="flex gap-1">
            <button
              type="button"
              class="rounded-lg border border-white/10 px-2.5 py-1 disabled:opacity-40"
              :disabled="!crm.hasPrev || crm.loading"
              @click="crm.prevPage()"
            >
              Anterior
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/10 px-2.5 py-1 disabled:opacity-40"
              :disabled="!crm.hasNext || crm.loading"
              @click="crm.nextPage()"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
