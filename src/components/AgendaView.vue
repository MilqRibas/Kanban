<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { useBoardStore } from '../stores/board'
import { LABEL_COLOR_MAP } from '../types/board'

const board = useBoardStore()
const today = new Date()
const viewDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))

const monthLabel = computed(() =>
  new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(viewDate.value),
)

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const calendarDays = computed(() => {
  const year = viewDate.value.getFullYear()
  const month = viewDate.value.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: {
    day: number | null
    isToday: boolean
    dateKey: string | null
  }[] = []

  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, isToday: false, dateKey: null })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday =
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ day, isToday, dateKey })
  }

  return cells
})

const dueCardsByDay = computed(() => {
  const map: Record<string, typeof board.cards> = {}
  for (const card of board.cardsWithDueDate) {
    if (!card.dueDate) continue
    const d = new Date(card.dueDate)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!map[key]) map[key] = []
    map[key].push(card)
  }
  return map
})

function prevMonth() {
  viewDate.value = new Date(
    viewDate.value.getFullYear(),
    viewDate.value.getMonth() - 1,
    1,
  )
}

function nextMonth() {
  viewDate.value = new Date(
    viewDate.value.getFullYear(),
    viewDate.value.getMonth() + 1,
    1,
  )
}

function goToday() {
  viewDate.value = new Date(today.getFullYear(), today.getMonth(), 1)
}

function isOverdue(dueDate: string) {
  const due = new Date(dueDate)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return due < start
}
</script>

<template>
  <div class="flex flex-1 flex-col overflow-auto px-4 pb-24 pt-4">
    <div
      class="mx-auto flex w-full max-w-5xl flex-1 flex-col rounded-2xl border border-border-subtle/60 bg-board-elevated p-4 sm:p-6"
    >
      <header class="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold capitalize text-text-primary">
            {{ monthLabel }}
          </h2>
          <p class="mt-1 text-sm text-text-muted">
            Prazos finais dos cartões do quadro
          </p>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            aria-label="Mês anterior"
            @click="prevMonth"
          >
            <ChevronLeft :size="18" :stroke-width="2" />
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            @click="goToday"
          >
            Hoje
          </button>
          <button
            type="button"
            class="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            aria-label="Próximo mês"
            @click="nextMonth"
          >
            <ChevronRight :size="18" :stroke-width="2" />
          </button>
        </div>
      </header>

      <div class="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle">
        <div
          v-for="weekDay in weekDays"
          :key="weekDay"
          class="bg-surface px-2 py-2 text-center text-xs font-medium text-text-muted"
        >
          {{ weekDay }}
        </div>

        <div
          v-for="(cell, index) in calendarDays"
          :key="index"
          class="min-h-24 bg-column p-1.5 sm:min-h-28"
        >
          <template v-if="cell.day !== null">
            <span
              :class="[
                'mb-1 inline-flex size-7 items-center justify-center rounded-full text-sm',
                cell.isToday
                  ? 'bg-accent font-semibold text-board'
                  : 'text-text-secondary',
              ]"
            >
              {{ cell.day }}
            </span>

            <div class="space-y-1">
              <button
                v-for="card in dueCardsByDay[cell.dateKey!] ?? []"
                :key="card.id"
                type="button"
                :class="[
                  'block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity hover:opacity-90',
                  card.completed || card.columnId === 'done'
                    ? 'bg-success/20 text-success'
                    : isOverdue(card.dueDate!)
                      ? 'bg-danger/20 text-danger'
                      : 'bg-accent/20 text-accent-hover',
                ]"
                :style="{
                  borderLeft: `3px solid ${
                    board.getLabelsForCard(card)[0]
                      ? LABEL_COLOR_MAP[board.getLabelsForCard(card)[0].color]
                      : '#579dff'
                  }`,
                }"
                @click="board.openCard(card.id)"
              >
                {{ card.title }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
