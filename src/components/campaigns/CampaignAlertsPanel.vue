<script setup lang="ts">
import {
  ALERT_PRIORITY_LABELS,
  type CampaignPlayerAlert,
  type AlertPriority,
} from '../../utils/campaignPlayerAlerts'

defineProps<{
  alerts: CampaignPlayerAlert[]
}>()

const priorityClass: Record<AlertPriority, string> = {
  high: 'bg-danger/20 text-danger',
  medium: 'bg-amber-500/20 text-amber-200',
  low: 'bg-white/10 text-text-muted',
}
</script>

<template>
  <div v-if="alerts.length === 0" class="text-sm text-text-muted">
    Nenhum alerta comportamental no momento para os jogadores desta campanha.
  </div>
  <ul v-else class="space-y-3">
    <li
      v-for="alert in alerts"
      :key="alert.id"
      class="rounded-xl border border-border-subtle/60 bg-surface/40 p-3 sm:p-4"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-sm font-semibold text-text-primary">
          {{ alert.title }}
        </h3>
        <span
          class="rounded-full px-2 py-0.5 text-[11px] font-medium"
          :class="priorityClass[alert.priority]"
        >
          Prioridade {{ ALERT_PRIORITY_LABELS[alert.priority] }}
        </span>
      </div>
      <dl class="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <div
          v-for="detail in alert.details"
          :key="`${alert.id}-${detail.label}`"
          class="text-xs"
        >
          <dt class="text-text-muted">{{ detail.label }}</dt>
          <dd class="font-medium tabular-nums text-text-primary">
            {{ detail.value }}
          </dd>
        </div>
      </dl>
    </li>
  </ul>
</template>
