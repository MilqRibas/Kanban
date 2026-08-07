<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Archive,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from '@lucide/vue'
import type { Campaign } from '../../types/campaigns'
import { useAuthStore } from '../../stores/auth'
import { useCampaignsStore } from '../../stores/campaigns'
import {
  formatCurrency,
  formatDateTime,
  formatMonthYear,
  formatPercent,
} from '../../utils/campaignFormat'
import { buildCampaignMetrics } from '../../utils/campaignMetrics'
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

const rows = computed(() =>
  props.campaigns.map((campaign) => {
    const metrics = buildCampaignMetrics(campaign, store.monthlyResults)
    return { campaign, metrics }
  }),
)

function canDelete(campaign: Campaign) {
  if (!campaign.createdBy || campaign.createdBy === auth.memberId) return true
  return auth.isAdmin
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
  <div class="panel-glass overflow-hidden rounded-2xl">
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-border-subtle bg-surface/60 text-xs uppercase tracking-wide text-text-muted">
          <tr>
            <th class="px-3 py-3 font-medium">Campanha</th>
            <th class="px-3 py-3 font-medium">Aquisição</th>
            <th class="px-3 py-3 font-medium">Tipo</th>
            <th class="px-3 py-3 font-medium">Agência</th>
            <th class="px-3 py-3 font-medium text-right">Investimento</th>
            <th class="px-3 py-3 font-medium text-right">Captados</th>
            <th class="px-3 py-3 font-medium text-right">Ativos</th>
            <th class="px-3 py-3 font-medium text-right">Ativação</th>
            <th class="px-3 py-3 font-medium text-right">Rake acum.</th>
            <th class="px-3 py-3 font-medium text-right">Recuperação</th>
            <th class="px-3 py-3 font-medium">Status</th>
            <th class="px-3 py-3 font-medium">Atualização</th>
            <th class="px-3 py-3 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.campaign.id"
            class="border-b border-border-subtle/60 transition-colors hover:bg-surface/40"
          >
            <td class="px-3 py-3">
              <button
                type="button"
                class="text-left font-medium text-text-primary hover:text-accent"
                @click="emit('view', row.campaign.id)"
              >
                {{ row.campaign.name }}
              </button>
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-text-secondary">
              {{
                formatMonthYear(
                  row.campaign.acquisitionMonth,
                  row.campaign.acquisitionYear,
                )
              }}
            </td>
            <td class="px-3 py-3 text-text-secondary">
              {{ typeLabel(row.campaign) }}
            </td>
            <td class="px-3 py-3 text-text-secondary">
              {{ row.campaign.agency || '—' }}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-right tabular-nums text-text-primary">
              {{ formatCurrency(row.campaign.investment) }}
            </td>
            <td class="px-3 py-3 text-right tabular-nums text-text-primary">
              {{ row.campaign.capturedPlayers }}
            </td>
            <td class="px-3 py-3 text-right tabular-nums text-text-primary">
              {{ row.campaign.activePlayers }}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-right tabular-nums text-text-primary">
              {{ formatPercent(row.metrics.activationRate) }}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-right tabular-nums text-text-primary">
              {{ formatCurrency(row.metrics.accumulatedRake) }}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-right tabular-nums text-text-primary">
              {{ formatPercent(row.metrics.recoveryRate) }}
            </td>
            <td class="px-3 py-3">
              <CampaignStatusBadge :status="row.metrics.status" />
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-text-muted">
              {{ formatDateTime(row.campaign.updatedAt) }}
            </td>
            <td class="relative px-3 py-3 text-right">
              <div class="inline-flex items-center gap-1">
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
                  title="Visualizar"
                  @click="emit('view', row.campaign.id)"
                >
                  <Eye :size="15" />
                </button>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
                  title="Editar"
                  @click="emit('edit', row.campaign.id)"
                >
                  <Pencil :size="15" />
                </button>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
                  title="Mais ações"
                  data-ephemeral-menu
                  @click.stop="toggleMenu(row.campaign.id)"
                >
                  <MoreHorizontal :size="15" />
                </button>
              </div>

              <div
                v-if="menuId === row.campaign.id"
                data-ephemeral-menu
                class="absolute right-3 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border-subtle bg-board-elevated py-1 shadow-xl"
                @click.stop
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                  @click="onDuplicate(row.campaign.id)"
                >
                  <Copy :size="14" />
                  Duplicar
                </button>
                <button
                  v-if="!row.campaign.isArchived && auth.isAdmin"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                  @click="onArchive(row.campaign.id)"
                >
                  <Archive :size="14" />
                  Arquivar
                </button>
                <button
                  v-if="row.campaign.isArchived && auth.isAdmin"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
                  @click="onRestore(row.campaign.id)"
                >
                  <RotateCcw :size="14" />
                  Restaurar
                </button>
                <button
                  v-if="canDelete(row.campaign)"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                  @click="onDelete(row.campaign.id)"
                >
                  <Trash2 :size="14" />
                  Excluir
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td
              colspan="13"
              class="px-3 py-10 text-center text-sm text-text-muted"
            >
              Nenhuma campanha encontrada com os filtros atuais.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
