<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from '@lucide/vue'
import { useCrmStore } from '../../stores/crm'
import { useDebouncedValue } from '../../composables/useDebouncedValue'
import { usePlayer360 } from '../../composables/usePlayer360'
import { formatCurrency } from '../../utils/campaignFormat'
import { crmDisplayName } from '../../utils/crmPlayerIdentity'
import type { CrmPlayerSort } from '../../types/crm'

type BiSortColumn = 'player_id' | 'rake' | 'limite' | 'enviado' | 'disponivel'

const COLUMN_SORTS: Record<BiSortColumn, { asc: CrmPlayerSort; desc: CrmPlayerSort }> = {
  player_id: { asc: 'player_id_asc', desc: 'player_id_desc' },
  rake: { asc: 'rake_asc', desc: 'rake_desc' },
  limite: { asc: 'limite_asc', desc: 'limite_desc' },
  enviado: { asc: 'enviado_asc', desc: 'enviado_desc' },
  disponivel: { asc: 'disponivel_asc', desc: 'disponivel_desc' },
}

const crm = useCrmStore()
const player360 = usePlayer360()
const searchInput = ref('')
const debouncedSearch = useDebouncedValue(() => searchInput.value, 250)

onMounted(async () => {
  if (!crm.ready) await crm.init()
  if (!crm.sort.startsWith('disponivel') && !crm.sort.startsWith('limite') && !crm.sort.startsWith('enviado') && !crm.sort.startsWith('rake') && !crm.sort.startsWith('player_id')) {
    await crm.setSort('disponivel_desc')
  }
})

watch(debouncedSearch, (value) => {
  if (value === crm.search) return
  void crm.setSearch(value)
})

async function onBiClubChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as 'all' | 'sx_club' | 'xtreme_pro'
  await crm.setClubFilter(value)
}

const activeColumn = computed<BiSortColumn | null>(() => {
  const s = crm.sort
  if (s.startsWith('player_id')) return 'player_id'
  if (s.startsWith('rake')) return 'rake'
  if (s.startsWith('limite')) return 'limite'
  if (s.startsWith('enviado')) return 'enviado'
  if (s.startsWith('disponivel')) return 'disponivel'
  return null
})

const isAsc = computed(() => crm.sort.endsWith('_asc'))

function sortIcon(column: BiSortColumn) {
  if (activeColumn.value !== column) return ArrowUpDown
  return isAsc.value ? ArrowUp : ArrowDown
}

async function toggleSort(column: BiSortColumn) {
  const pair = COLUMN_SORTS[column]
  const next: CrmPlayerSort =
    activeColumn.value === column && !isAsc.value ? pair.asc : pair.desc
  await crm.setSort(next)
}

function moneyClass(value: number): string {
  return value < 0 ? 'text-rose-300' : 'text-text-primary'
}
</script>

<template>
  <div class="space-y-3">
    <header class="flex flex-col gap-1">
      <h3 class="text-base font-semibold text-text-primary">BI operacional</h3>
      <p class="text-xs text-text-muted">
        Visão rápida de rake histórico e economia de incentivo por jogador.
      </p>
    </header>

    <input
      v-model="searchInput"
      type="search"
      placeholder="Buscar Player ID, nick ou nome…"
      class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none ring-accent/40 placeholder:text-text-muted focus:ring-2"
    />
    <select
      class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary sm:w-auto"
      :value="crm.clubFilter"
      @change="onBiClubChange"
    >
      <option value="all">Clube: todos</option>
      <option value="sx_club">SX Club</option>
      <option value="xtreme_pro">Xtreme Pro</option>
    </select>

    <p
      v-if="crm.error"
      class="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200"
    >
      {{ crm.error }}
    </p>

    <div class="panel-glass overflow-hidden rounded-2xl">
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-white/5 text-[11px] uppercase tracking-wide text-text-muted">
            <tr>
              <th class="px-3 py-2 font-semibold">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 hover:text-text-primary"
                  :class="activeColumn === 'player_id' ? 'text-accent' : ''"
                  @click="toggleSort('player_id')"
                >
                  Player ID
                  <component :is="sortIcon('player_id')" :size="13" class="shrink-0 opacity-80" />
                </button>
              </th>
              <th class="px-3 py-2 font-semibold">Nick</th>
              <th class="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary"
                  :class="activeColumn === 'rake' ? 'text-accent' : ''"
                  @click="toggleSort('rake')"
                >
                  Rake Histórico
                  <component :is="sortIcon('rake')" :size="13" class="shrink-0 opacity-80" />
                </button>
              </th>
              <th class="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary"
                  :class="activeColumn === 'limite' ? 'text-accent' : ''"
                  @click="toggleSort('limite')"
                >
                  Limite
                  <component :is="sortIcon('limite')" :size="13" class="shrink-0 opacity-80" />
                </button>
              </th>
              <th class="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary"
                  :class="activeColumn === 'enviado' ? 'text-accent' : ''"
                  @click="toggleSort('enviado')"
                >
                  Enviado
                  <component :is="sortIcon('enviado')" :size="13" class="shrink-0 opacity-80" />
                </button>
              </th>
              <th class="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary"
                  :class="activeColumn === 'disponivel' ? 'text-accent' : ''"
                  @click="toggleSort('disponivel')"
                >
                  Disponível
                  <component :is="sortIcon('disponivel')" :size="13" class="shrink-0 opacity-80" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="crm.loading && !crm.rows.length">
              <td colspan="6" class="px-3 py-10 text-center text-text-muted">
                <span class="inline-flex items-center gap-2">
                  <Loader2 class="animate-spin" :size="16" />
                  Carregando…
                </span>
              </td>
            </tr>
            <tr v-else-if="crm.rows.length === 0">
              <td colspan="6" class="px-3 py-10 text-center text-text-muted">
                Nenhum jogador encontrado.
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
              <td class="px-3 py-2 text-text-primary">{{ crmDisplayName(row) }}</td>
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
  </div>
</template>
