<script setup lang="ts">
import { computed } from 'vue'
import {
  Calendar,
  Check,
  CheckSquare,
  MessageSquare,
  Paperclip,
} from '@lucide/vue'
import type { Card } from '../types/board'
import { LABEL_COLOR_MAP } from '../types/board'
import { useBoardStore } from '../stores/board'
import MemberAvatar from './MemberAvatar.vue'

const props = defineProps<{
  card: Card
}>()

const board = useBoardStore()

const labels = computed(() => board.getLabelsForCard(props.card))
const members = computed(() => board.getMembersForCard(props.card))

const isDone = computed(() => {
  const doneColumn = board.columns.find((column) => column.isDoneColumn)
  return Boolean(
    props.card.completed ||
      (doneColumn && props.card.columnId === doneColumn.id),
  )
})

const fullDescription = computed(() =>
  props.card.description
    .replace(/[#>*_`~\-\[\]\(\)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim(),
)

const CARD_DESC_PREVIEW = 100
const CARD_DESC_HOVER = 180

function truncateText(text: string, limit: number) {
  if (text.length <= limit) return text
  return `${text.slice(0, limit).trimEnd()}...`
}

const previewDescription = computed(() =>
  truncateText(fullDescription.value, CARD_DESC_PREVIEW),
)

const hoverDescription = computed(() =>
  truncateText(fullDescription.value, CARD_DESC_HOVER),
)

const checklistProgress = computed(() => {
  const items = props.card.checklists.flatMap((list) => list.items)
  if (items.length === 0) return null
  const done = items.filter((item) => item.completed).length
  return { done, total: items.length, complete: done === items.length }
})

function formatShort(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(iso))
}

const dateMeta = computed(() => {
  const start = props.card.startDate
  const due = props.card.dueDate
  if (!start && !due) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = due ? new Date(due) : null
  if (end) end.setHours(0, 0, 0, 0)

  let tone: 'ok' | 'today' | 'overdue' | 'done' = 'ok'
  if (isDone.value) {
    tone = 'done'
  } else if (end) {
    const diffDays = Math.round(
      (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (diffDays < 0) tone = 'overdue'
    else if (diffDays === 0) tone = 'today'
  }

  const label =
    start && due
      ? `${formatShort(start)} – ${formatShort(due)}`
      : due
        ? formatShort(due)
        : formatShort(start!)

  return { label, tone }
})

async function onToggleDone(event: Event) {
  event.stopPropagation()
  event.preventDefault()
  await board.toggleCardDone(props.card.id)
}
</script>

<template>
  <article
    class="group cursor-pointer rounded-xl border border-white/10 bg-card p-3 shadow-md shadow-black/25 transition-colors hover:border-white/15 hover:bg-card-hover"
    role="button"
    tabindex="0"
    @click="board.openCard(card.id)"
    @keydown.enter="board.openCard(card.id)"
  >
    <div v-if="labels.length" class="mb-2 flex flex-wrap gap-1.5 pl-7">
      <span
        v-for="label in labels"
        :key="label.id"
        class="h-1.5 w-10 rounded-full"
        :style="{ backgroundColor: LABEL_COLOR_MAP[label.color] }"
        :title="label.name"
      />
    </div>

    <div class="flex items-start gap-2">
      <button
        type="button"
        :title="
          isDone ? 'Reabrir tarefa' : 'Marcar tarefa como concluída'
        "
        :aria-label="
          isDone ? 'Reabrir tarefa' : 'Marcar tarefa como concluída'
        "
        :aria-pressed="isDone"
        :class="[
          'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          isDone
            ? 'border-success bg-success text-board'
            : 'border-white/30 text-white/20 hover:border-success hover:text-success',
        ]"
        @click="onToggleDone"
        @keydown.enter.stop="onToggleDone"
      >
        <Check :size="11" :stroke-width="3" />
      </button>

      <div class="min-w-0 flex-1">
        <h3
          :class="[
            'text-[15px] font-semibold leading-snug',
            isDone ? 'text-text-muted line-through' : 'text-text-primary',
          ]"
        >
          {{ card.title }}
        </h3>

        <div v-if="fullDescription" class="mt-1 text-[11px] leading-relaxed text-text-muted">
          <p class="line-clamp-2 group-hover:hidden" :title="fullDescription">
            {{ previewDescription }}
          </p>
          <p
            class="hidden line-clamp-4 group-hover:block"
            :title="fullDescription"
          >
            {{ hoverDescription }}
          </p>
        </div>

        <div
          v-if="checklistProgress || card.comments.length || card.attachments.length"
          class="mt-2.5 flex flex-wrap items-center gap-2 text-text-muted"
        >
          <span
            v-if="card.comments.length"
            class="inline-flex items-center gap-1 text-[11px]"
            :title="`${card.comments.length} comentário(s)`"
          >
            <MessageSquare :size="12" :stroke-width="2" />
            {{ card.comments.length }}
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
            {{ checklistProgress.done }} / {{ checklistProgress.total }}
          </span>
          <span
            v-if="card.attachments.length"
            class="inline-flex items-center gap-0.5 text-[11px]"
          >
            <Paperclip :size="12" :stroke-width="2" />
            {{ card.attachments.length }}
          </span>
        </div>

        <footer
          v-if="dateMeta || members.length"
          class="mt-3 flex items-center gap-2 border-t border-white/10 pt-2.5"
        >
          <span
            v-if="dateMeta"
            :class="[
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
              dateMeta.tone === 'overdue' && 'bg-danger/20 text-danger',
              dateMeta.tone === 'today' && 'bg-danger/20 text-danger',
              dateMeta.tone === 'ok' && 'bg-surface text-text-secondary',
              dateMeta.tone === 'done' && 'bg-success/15 text-success',
            ]"
          >
            <Calendar :size="12" :stroke-width="2" />
            {{ dateMeta.label }}
          </span>

          <div v-if="members.length" class="ml-auto flex -space-x-1.5">
            <MemberAvatar
              v-for="member in members"
              :key="member.id"
              :member="member"
              size="md"
              class="border border-card"
            />
          </div>
        </footer>
      </div>
    </div>
  </article>
</template>
