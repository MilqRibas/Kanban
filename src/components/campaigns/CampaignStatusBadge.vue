<script setup lang="ts">
import type { CampaignComputedStatus } from '../../types/campaigns'
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_STYLES,
} from '../../types/campaigns'

defineProps<{
  status: CampaignComputedStatus
}>()
</script>

<template>
  <span
    class="inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-medium"
    :class="CAMPAIGN_STATUS_STYLES[status]"
  >
    {{ CAMPAIGN_STATUS_LABELS[status] }}
  </span>
</template>
