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

const rows = computed(() =>
  props.campaigns.map((campaign) => {
    const metrics = store.metricsFor(campaign)
    const health = store.rakeHealthFor(campaign)
    const agent = store.findAgent(campaign.agentId)
    return { campaign, metrics, health, agent }
  }),
)

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
  <div class="panel-glass overflow-hidden rounded-2xl">
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-border-subtle bg-surface/60 text-xs uppercase tracking-wide text-text-muted">
          <tr>
            <th class="px-3 py-3 font-medium">Campanha</th>
            <th class="px-3 py-3 font-medium">Agência</th>
            <th class="px-3 py-3 font-medium">Agent ID</th>
            <th class="px-3 py-3 font-medium text-right">Jogadores</th>
            <th class="px-3 py-3 font-medium text-right">Ativos únicos</th>
            <th class="px-3 py-3 font-medium text-right">Ativação</th>
            <th class="px-3 py-3 font-medium text-right">Investimento</th>
            <th class="px-3 py-3 font-medium text-right">Rake acum.</th>
            <th class="px-3 py-3 font-medium text-right">Recuperação</th>
            <th class="px-3 py-3 font-medium">Saúde</th>
            <th class="px-3 py-3 font-medium">Status</th>
            <th class="px-3 py-3 font-medium text-right">Semanas</th>
            <th class="px-3 py-3 font-medium">Último relatório</th>
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
            <td class="px-3 py-3">
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
  </div>
</template>
