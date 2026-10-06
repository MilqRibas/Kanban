<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useCrmStore } from '../../stores/crm'
import { usePipelinesStore } from '../../stores/pipelines'
import { useToastStore } from '../../stores/toast'
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
const pipelines = usePipelinesStore()
const toast = useToastStore()
const player360 = usePlayer360()
const searchInput = ref('')
const debouncedSearch = useDebouncedValue(() => searchInput.value, 250)
const addPlayerId = ref<string | null>(null)
const addPipelineId = ref('')
const adding = ref(false)

onMounted(() => {
  void crm.init()
  if (!pipelines.ready) void pipelines.init()
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

async function onClubChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as 'all' | 'sx_club' | 'xtreme_pro'
  await crm.setClubFilter(value)
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

function openAdd(playerId: string) {
  addPlayerId.value = playerId
  addPipelineId.value = pipelines.rows[0]?.id ?? ''
}

async function confirmAdd() {
  if (!addPlayerId.value || !addPipelineId.value || adding.value) return
  adding.value = true
  try {
    const result = await pipelines.addPlayerFromBase(addPipelineId.value, addPlayerId.value)
    if (result === 'exists') {
      toast.info('Este jogador já está nesse pipeline.')
    } else {
      toast.success('Jogador adicionado ao primeiro estágio do pipeline.')
    }
    addPlayerId.value = null
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Falha ao adicionar ao pipeline.')
  } finally {
    adding.value = false
  }
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
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <label class="flex flex-col gap-1 text-[11px] text-text-muted sm:col-span-2 xl:col-span-3">
          Busca
          <input
            v-model="searchInput"
            type="search"
            placeholder="Player ID, nick, nome ou agente"
            aria-label="Buscar jogador"
            class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none ring-accent/40 placeholder:text-text-muted focus:ring-2"
          />
        </label>
        <label class="flex flex-col gap-1 text-[11px] text-text-muted">
          Clube
          <select
            class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
            :value="crm.clubFilter"
            @change="onClubChange"
          >
            <option value="all">Todos</option>
            <option value="sx_club">SX Club</option>
            <option value="xtreme_pro">Xtreme Pro</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[11px] text-text-muted">
          Origem
          <select
            class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
            :value="crm.campaignFilter"
            @change="onFilterChange"
          >
            <option value="all">Todas</option>
            <option value="with_campaign">Com campanha</option>
            <option value="without_campaign">Sem campanha</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[11px] text-text-muted">
          Incentivo disponível
          <select
            class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
            :value="crm.incentiveAvailableFilter"
            @change="onAvailableFilterChange"
          >
            <option value="all">Todos</option>
            <option value="positive">Maior que zero</option>
            <option value="zero">Igual a zero</option>
            <option value="negative">Menor que zero</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[11px] text-text-muted">
          Incentivo recebido
          <select
            class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
            :value="crm.incentiveReceivedFilter"
            @change="onReceivedFilterChange"
          >
            <option value="all">Todos</option>
            <option value="received">Já recebeu</option>
            <option value="never">Nunca recebeu</option>
            <option value="pending_classification">Classificação pendente</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[11px] text-text-muted">
          Ordenar por
          <select
            class="rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
            :value="crm.sort"
            @change="onSortChange"
          >
            <option value="last_activity_desc">Última atividade, mais recente</option>
            <option value="last_activity_asc">Última atividade, mais antiga</option>
            <option value="rake_desc">Maior rake</option>
            <option value="rake_asc">Menor rake</option>
            <option value="limite_desc">Maior limite de incentivo</option>
            <option value="limite_asc">Menor limite de incentivo</option>
            <option value="disponivel_desc">Maior incentivo disponível</option>
            <option value="disponivel_asc">Menor incentivo disponível</option>
            <option value="enviado_desc">Maior incentivo enviado</option>
            <option value="enviado_asc">Menor incentivo enviado</option>
            <option value="player_id_asc">Player ID A–Z</option>
            <option value="player_id_desc">Player ID Z–A</option>
          </select>
        </label>
      </div>
      <p class="text-[11px] text-text-muted">
        Clique em um jogador para abrir a ficha. Use “No pipeline” para colocá-lo num fluxo, mesmo fora do segmento.
      </p>

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
                <th class="px-3 py-2 font-semibold">Pipeline</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="crm.loading">
                <td colspan="10" class="px-3 py-8 text-center text-text-muted">
                  Carregando jogadores…
                </td>
              </tr>
              <tr v-else-if="crm.rows.length === 0">
                <td colspan="10" class="px-3 py-8 text-center text-text-muted">
                  Nenhum Player ID encontrado com os filtros atuais.
                </td>
              </tr>
              <tr
                v-for="(row, idx) in crm.rows"
                :key="row.playerId"
                class="cursor-pointer border-t border-white/5 transition-colors hover:bg-white/5"
                :class="idx % 2 === 1 ? 'bg-white/[0.02]' : ''"
                tabindex="0"
                @click="player360.open(row.playerId)"
                @keydown.enter="player360.open(row.playerId)"
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
                <td class="px-3 py-2" @click.stop @keydown.enter.stop>
                  <button
                    type="button"
                    class="rounded-lg border border-white/10 px-2 py-1 text-[11px] font-medium text-text-primary hover:bg-white/5"
                    @click.stop="openAdd(row.playerId)"
                  >
                    No pipeline
                  </button>
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

    <div
      v-if="addPlayerId"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      @click.self="addPlayerId = null"
    >
      <div
        class="w-full max-w-sm space-y-3 rounded-2xl border border-white/10 bg-board p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-pipeline-title"
      >
        <h3 id="add-pipeline-title" class="text-sm font-semibold text-text-primary">
          Adicionar ao pipeline
        </h3>
        <p class="font-mono text-xs text-text-muted">{{ addPlayerId }}</p>
        <label class="block text-xs text-text-muted">
          Pipeline
          <select
            v-model="addPipelineId"
            class="mt-1 h-10 w-full rounded-xl border border-white/10 bg-board-elevated px-3 text-sm text-text-primary"
          >
            <option v-if="pipelines.rows.length === 0" value="" disabled>
              Nenhum pipeline
            </option>
            <option v-for="pipe in pipelines.rows" :key="pipe.id" :value="pipe.id">
              {{ pipe.name }}
            </option>
          </select>
        </label>
        <p class="text-[11px] text-text-muted">
          O jogador entra no primeiro estágio, mesmo que esteja fora do segmento.
        </p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="h-9 rounded-xl border border-white/10 px-3 text-sm text-text-secondary hover:bg-white/5"
            @click="addPlayerId = null"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="h-9 rounded-xl bg-accent px-3 text-sm font-semibold text-board disabled:opacity-40"
            :disabled="!addPipelineId || adding"
            @click="confirmAdd"
          >
            {{ adding ? 'Adicionando…' : 'Adicionar' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
