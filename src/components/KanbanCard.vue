<script setup lang="ts">
import { computed } from 'vue'
import {
  AlignLeft,
  CheckSquare,
  MessageSquare,
  Paperclip,
} from '@lucide/vue'
import type { Card } from '../types/board'
import { LABEL_COLOR_MAP } from '../types/board'
import { useBoardStore } from '../stores/board'

const props = defineProps<{
  card: Card
}>()

const board = useBoardStore()

const labels = computed(() => board.getLabelsForCard(props.card))
const members = computed(() => board.getMembersForCard(props.card))

const checklistProgress = computed(() => {
  const items = props.card.checklists.flatMap((list) => list.items)
  if (items.length === 0) return null
  const done = items.filter((item) => item.completed).length
  return { done, total: items.length, complete: done === items.length }
})

const dueMeta = computed(() => {
  if (!props.card.dueDate) return null
  const due = new Date(props.card.dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDay = new Date(due)
  dueDay.setHours(0, 0, 0, 0)
  const diffDays = Math.round(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )

  const label = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
  }).format(due)

  if (props.card.completed || props.card.columnId === 'done') {
    return { label, tone: 'done' as const }
  }
  if (diffDays < 0) return { label, tone: 'overdue' as const }
  if (diffDays === 0) return { label, tone: 'today' as const }
  return { label, tone: 'ok' as const }
})

const hasDescription = computed(() => props.card.description.trim().length > 0)
</script>

<template>
  <article
    class="group cursor-pointer rounded-lg bg-card p-2.5 shadow-sm shadow-black/20 transition-colors hover:bg-card-hover"
    role="button"
    tabindex="0"
    @click="board.openCard(card.id)"
    @keydown.enter="board.openCard(card.id)"
  >
    <div v-if="labels.length" class="mb-2 flex flex-wrap gap-1">
      <span
        v-for="label in labels"
        :key="label.id"
        class="h-1.5 w-10 rounded-full"
        :style="{ backgroundColor: LABEL_COLOR_MAP[label.color] }"
        :title="label.name"
      />
    </div>

    <h3 class="text-sm leading-snug text-text-primary">
      {{ card.title }}
    </h3>

    <footer
      v-if="
        dueMeta ||
        checklistProgress ||
        hasDescription ||
        card.attachments.length ||
        card.comments.length ||
        members.length
      "
      class="mt-2.5 flex flex-wrap items-center gap-1.5"
    >
      <span
        v-if="dueMeta"
        :class="[
          'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
          dueMeta.tone === 'overdue' && 'bg-danger/20 text-danger',
          dueMeta.tone === 'today' && 'bg-danger/20 text-danger',
          dueMeta.tone === 'ok' && 'bg-success/15 text-success',
          dueMeta.tone === 'done' && 'bg-success/15 text-success',
        ]"
      >
        {{ dueMeta.label }}
      </span>

      <span
        v-if="checklistProgress"
        :class="[
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
          checklistProgress.complete
            ? 'bg-success/15 text-success'
            : 'bg-surface text-text-secondary',
        ]"
      >
        <CheckSquare :size="12" :stroke-width="2.25" />
        {{ checklistProgress.done }}/{{ checklistProgress.total }}
      </span>

      <span
        v-if="hasDescription"
        class="inline-flex text-text-muted"
        title="Possui descrição"
      >
        <AlignLeft :size="14" :stroke-width="2" />
      </span>

      <span
        v-if="card.attachments.length"
        class="inline-flex items-center gap-0.5 text-[11px] text-text-muted"
        :title="`${card.attachments.length} anexo(s)`"
      >
        <Paperclip :size="13" :stroke-width="2" />
        {{ card.attachments.length }}
      </span>

      <span
        v-if="card.comments.length"
        class="inline-flex items-center gap-0.5 text-[11px] text-text-muted"
        :title="`${card.comments.length} comentário(s)`"
      >
        <MessageSquare :size="13" :stroke-width="2" />
        {{ card.comments.length }}
      </span>

      <div v-if="members.length" class="ml-auto flex -space-x-1.5">
        <div
          v-for="member in members"
          :key="member.id"
          :class="[
            member.avatarColor,
            'flex size-6 items-center justify-center rounded-full border border-card text-[9px] font-semibold text-white',
          ]"
          :title="member.name"
        >
          {{ member.initials }}
        </div>
      </div>
    </footer>
  </article>
</template>
