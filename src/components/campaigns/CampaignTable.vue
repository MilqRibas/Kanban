<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Archive,
  ChevronDown,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from '@lucide/vue'
import type { Campaign } from '../../types/campaigns'
import { CAMPAIGN_STATUS_LABELS } from '../../types/campaigns'
import { useAuthStore } from '../../stores/auth'
import { useCampaignsStore } from '../../stores/campaigns'
import {
  formatCurrency,
  formatPercent,
} from '../../utils/campaignFormat'
import CampaignStatusBadge from './CampaignStatusBadge.vue'
import { useEphemeralDismiss } from '../../composables/useEphemeralDismiss'

const props = defineProps<{
  campaigns: Campaign[]
}>()

const emit = defineEmits<{
  view: [id: string]
  edit: [id: string]
}>()

const auth = useAuthStore()
const store = useCampaignsStore()
const menuId = ref<string | null>(null)
useEphemeralDismiss({
  isOpen: () => menuId.value !== null,
  onClose: () => {
    menuId.value = null
  },
})

type SortKey =
  | 'name'
  | 'agency'
  | 'agentId'
  | 'players'
  | 'uniqueActives'
  | 'activation'
  | 'investment'
  | 'rake'
  | 'recovery'
  | 'health'
  | 'status'
  | 'weeks'
  | 'lastReport'

const sortKey = ref<SortKey>('name')
const sortAsc = ref(true)

const TEXT_KEYS: SortKey[] = ['name', 'agency', 'agentId', 'health', 'status']

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
    return
  }
  sortKey.value = key
  sortAsc.value = TEXT_KEYS.includes(key)
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
}

function compareNum(a: number | null | undefined, b: number | null | undefined) {
  const av = a == null || !Number.isFinite(a) ? null : a
  const bv = b == null || !Number.isFinite(b) ? null : b
  if (av === null && bv === null) return 0
  if (av === null) return 1
  if (bv === null) return -1
  return av - bv
}

const rows = computed(() => {
  const mapped = props.campaigns.map((campaign) => {
    const metrics = store.metricsFor(campaign)
    const health = store.rakeHealthFor(campaign)
    const agent = store.findAgent(campaign.agentId)
    return { campaign, metrics, health, agent }
  })
  const key = sortKey.value
  const dir = sortAsc.value ? 1 : -1
  return [...mapped].sort((a, b) => {
    const agencyA = a.agent?.name || a.campaign.agency || ''
    const agencyB = b.agent?.name || b.campaign.agency || ''
    let cmp = 0
    if (key === 'name') cmp = compareText(a.campaign.name, b.campaign.name)
    else if (key === 'agency') cmp = compareText(agencyA, agencyB)
    else if (key === 'agentId')
      cmp = compareText(a.campaign.agentId || '', b.campaign.agentId || '')
    else if (key === 'players')
      cmp = compareNum(a.metrics.agencyPlayers, b.metrics.agencyPlayers)
    else if (key === 'uniqueActives')
      cmp = compareNum(a.metrics.uniqueActivePlayers, b.metrics.uniqueActivePlayers)
    else if (key === 'activation')
      cmp = compareNum(a.metrics.activationRate, b.metrics.activationRate)
    else if (key === 'investment')
      cmp = compareNum(a.campaign.investment, b.campaign.investment)
    else if (key === 'rake')
      cmp = compareNum(a.metrics.accumulatedRake, b.metrics.accumulatedRake)
    else if (key === 'recovery')
      cmp = compareNum(a.metrics.recoveryRate, b.metrics.recoveryRate)
    else if (key === 'health')
      cmp = compareText(
        a.metrics.weeksTracked > 0 ? a.health.classificationLabel : '',
        b.metrics.weeksTracked > 0 ? b.health.classificationLabel : '',
      )
    else if (key === 'status')
      cmp = compareText(
        CAMPAIGN_STATUS_LABELS[a.metrics.status] ?? a.metrics.status,
        CAMPAIGN_STATUS_LABELS[b.metrics.status] ?? b.metrics.status,
      )
    else if (key === 'weeks')
      cmp = compareNum(a.metrics.weeksTracked, b.metrics.weeksTracked)
    else
      cmp = compareText(
        a.metrics.lastPeriodStart || '',
        b.metrics.lastPeriodStart || '',
      )
    if (cmp === 0) cmp = compareText(a.campaign.name, b.campaign.name)
    return cmp * dir
  })
})

function sortAria(key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none'
  return sortAsc.value ? 'ascending' : 'descending'
}

function canDelete(campaign: Campaign) {
  return store.canDeleteCampaign(campaign)
}

function toggleMenu(id: string) {
  menuId.value = menuId.value === id ? null : id
}

async function onDuplicate(id: string) {
  menuId.value = null
  await store.duplicate(id)
}

async function onArchive(id: string) {
  menuId.value = null
  await store.archive(id)
}

async function onRestore(id: string) {
  menuId.value = null
  await store.restore(id)
}

async function onDelete(id: string) {
  menuId.value = null
  const campaign = props.campaigns.find((c) => c.id === id)
  if (!campaign) return
  if (!canDelete(campaign)) return
  const confirmed = window.confirm(
    `Excluir a campanha "${campaign.name}"? Esta ação não pode ser desfeita.`,
  )
  if (!confirmed) return
  await store.remove(id)
}

function typeLabel(campaign: Campaign) {
  if (campaign.campaignType === 'Outro' && campaign.campaignTypeOther) {
    return campaign.campaignTypeOther
  }
  return campaign.campaignType || '—'
}
</script>

<template>
  <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-border-subtle bg-surface/60 text-xs uppercase tracking-wide text-text-muted">
          <tr>
            <th class="px-3 py-3 font-medium" :aria-sort="sortAria('name')">
              <button type="button" class="inline-flex items-center gap-1 hover:text-text-primary" @click="toggleSort('name')">
                Campanha
                <ChevronDown v-if="sortKey === 'name'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium" :aria-sort="sortAria('agency')">
              <button type="button" class="inline-flex items-center gap-1 hover:text-text-primary" @click="toggleSort('agency')">
                Agência
                <ChevronDown v-if="sortKey === 'agency'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium" :aria-sort="sortAria('agentId')">
              <button type="button" class="inline-flex items-center gap-1 hover:text-text-primary" @click="toggleSort('agentId')">
                Agent ID
                <ChevronDown v-if="sortKey === 'agentId'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium text-right" :aria-sort="sortAria('players')">
              <button type="button" class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary" @click="toggleSort('players')">
                Jogadores
                <ChevronDown v-if="sortKey === 'players'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium text-right" :aria-sort="sortAria('uniqueActives')">
              <button type="button" class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary" @click="toggleSort('uniqueActives')">
                Ativos únicos
                <ChevronDown v-if="sortKey === 'uniqueActives'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium text-right" :aria-sort="sortAria('activation')">
              <button type="button" class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary" @click="toggleSort('activation')">
                Ativação
                <ChevronDown v-if="sortKey === 'activation'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium text-right" :aria-sort="sortAria('investment')">
              <button type="button" class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary" @click="toggleSort('investment')">
                Investimento
                <ChevronDown v-if="sortKey === 'investment'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium text-right" :aria-sort="sortAria('rake')">
              <button type="button" class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary" @click="toggleSort('rake')">
                Rake acum.
                <ChevronDown v-if="sortKey === 'rake'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium text-right" :aria-sort="sortAria('recovery')">
              <button type="button" class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary" @click="toggleSort('recovery')">
                Recuperação
                <ChevronDown v-if="sortKey === 'recovery'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium" :aria-sort="sortAria('health')">
              <button type="button" class="inline-flex items-center gap-1 hover:text-text-primary" @click="toggleSort('health')">
                Saúde
                <ChevronDown v-if="sortKey === 'health'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium" :aria-sort="sortAria('status')">
              <button type="button" class="inline-flex items-center gap-1 hover:text-text-primary" @click="toggleSort('status')">
                Status
                <ChevronDown v-if="sortKey === 'status'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium text-right" :aria-sort="sortAria('weeks')">
              <button type="button" class="inline-flex w-full items-center justify-end gap-1 hover:text-text-primary" @click="toggleSort('weeks')">
                Semanas
                <ChevronDown v-if="sortKey === 'weeks'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium" :aria-sort="sortAria('lastReport')">
              <button type="button" class="inline-flex items-center gap-1 hover:text-text-primary" @click="toggleSort('lastReport')">
                Último relatório
                <ChevronDown v-if="sortKey === 'lastReport'" :size="13" :class="{ 'rotate-180': sortAsc }" />
              </button>
            </th>
            <th class="px-3 py-3 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, idx) in rows"
            :key="row.campaign.id"
            class="border-b border-border-subtle/50 transition-colors hover:bg-white/[0.07]"
            :class="idx % 2 === 1 ? 'bg-white/[0.045]' : 'bg-transparent'"
          >
            <td class="px-3 py-3">
              <button
                type="button"
                class="text-left font-medium text-text-primary hover:text-accent"
                @click="emit('view', row.campaign.id)"
              >
                {{ row.campaign.name }}
              </button>
              <p class="text-[11px] text-text-muted">{{ typeLabel(row.campaign) }}</p>
            </td>
            <td class="px-3 py-3 text-text-secondary">
              {{ row.agent?.name || row.campaign.agency || '—' }}
            </td>
            <td class="px-3 py-3 font-mono text-xs text-text-secondary">
              {{ row.campaign.agentId || '—' }}
            </td>
            <td class="px-3 py-3 text-right tabular-nums">
              {{ row.metrics.agencyPlayers }}
            </td>
            <td class="px-3 py-3 text-right tabular-nums">
              {{ row.metrics.uniqueActivePlayers }}
            </td>
            <td class="px-3 py-3 text-right tabular-nums">
              {{ formatPercent(row.metrics.activationRate) }}
            </td>
            <td class="px-3 py-3 text-right tabular-nums">
              {{ formatCurrency(row.campaign.investment) }}
            </td>
            <td class="px-3 py-3 text-right tabular-nums">
              {{ formatCurrency(row.metrics.accumulatedRake) }}
            </td>
            <td class="px-3 py-3 text-right tabular-nums">
              {{ formatPercent(row.metrics.recoveryRate) }}
            </td>
            <td class="px-3 py-3 text-xs text-text-secondary">
              {{
                row.metrics.weeksTracked > 0
                  ? row.health.classificationLabel
                  : '—'
              }}
            </td>
            <td class="whitespace-nowrap px-3 py-3">
              <CampaignStatusBadge :status="row.metrics.status" />
            </td>
            <td class="px-3 py-3 text-right tabular-nums">
              {{ row.metrics.weeksTracked }}
            </td>
            <td class="px-3 py-3 text-xs text-text-muted">
              <template v-if="row.metrics.lastPeriodStart && row.metrics.lastPeriodEnd">
                {{
                  store.formatPeriodLabel(
                    row.metrics.lastPeriodStart,
                    row.metrics.lastPeriodEnd,
                  )
                }}
              </template>
              <template v-else>—</template>
            </td>
            <td class="relative px-3 py-3 text-right">
              <div class="inline-flex items-center gap-1" data-ephemeral-menu>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
                  title="Ver"
                  @click="emit('view', row.campaign.id)"
                >
                  <Eye :size="15" />
                </button>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
                  title="Editar"
                  @click="emit('edit', row.campaign.id)"
                >
                  <Pencil :size="15" />
                </button>
                <button
                  v-if="canDelete(row.campaign)"
                  type="button"
                  class="rounded-lg p-1.5 text-danger hover:bg-danger/10"
                  title="Excluir"
                  @click="onDelete(row.campaign.id)"
                >
                  <Trash2 :size="15" />
                </button>
                <button
                  type="button"
                  data-ephemeral-menu
                  class="rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
                  title="Mais"
                  @click.stop="toggleMenu(row.campaign.id)"
                >
                  <MoreHorizontal :size="15" />
                </button>
              </div>
              <div
                v-if="menuId === row.campaign.id"
                data-ephemeral-menu
                class="absolute right-3 z-20 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-border-subtle bg-board-elevated py-1 shadow-xl"
                @click.stop
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface"
                  @click="onDuplicate(row.campaign.id)"
                >
                  <Copy :size="14" /> Duplicar
                </button>
                <button
                  v-if="!row.campaign.isArchived && auth.isAdmin"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface"
                  @click="onArchive(row.campaign.id)"
                >
                  <Archive :size="14" /> Arquivar
                </button>
                <button
                  v-else-if="row.campaign.isArchived && auth.isAdmin"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface"
                  @click="onRestore(row.campaign.id)"
                >
                  <RotateCcw :size="14" /> Restaurar
                </button>
                <button
                  v-if="canDelete(row.campaign)"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                  @click="onDelete(row.campaign.id)"
                >
                  <Trash2 :size="14" /> Excluir
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="14" class="px-3 py-10 text-center text-sm text-text-muted">
              Nenhuma campanha encontrada. Importe um relatório e vincule um Agent ID.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
</template>
