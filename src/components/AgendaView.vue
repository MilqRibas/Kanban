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

  // Sempre 6 semanas para o grid preencher a altura da tela
  while (cells.length < 42) {
    cells.push({ day: null, isToday: false, dateKey: null })
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

function isDone(card: (typeof board.cards)[number]) {
  const doneColumn = board.columns.find((column) => column.isDoneColumn)
  return Boolean(
    card.completed || (doneColumn && card.columnId === doneColumn.id),
  )
}

function cardsForDay(dateKey: string | null) {
  if (!dateKey) return []
  return dueCardsByDay.value[dateKey] ?? []
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col pb-[4.75rem] pt-2 sm:pb-16 sm:pt-3">
    <div
      class="page-shell panel-glass flex min-h-0 flex-1 flex-col rounded-2xl p-2 shadow-xl shadow-black/20 sm:p-3"
    >
      <header class="mb-2 flex shrink-0 items-center justify-between gap-3">
        <div class="min-w-0">
          <h2 class="truncate text-base font-semibold capitalize text-text-primary">
            {{ monthLabel }}
          </h2>
          <p class="text-xs text-text-muted">
            Prazos finais dos cartões do quadro
          </p>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            aria-label="Mês anterior"
            @click="prevMonth"
          >
            <ChevronLeft :size="18" :stroke-width="2" />
          </button>
          <button
            type="button"
            class="rounded-lg px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            @click="goToday"
          >
            Hoje
          </button>
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            aria-label="Próximo mês"
            @click="nextMonth"
          >
            <ChevronRight :size="18" :stroke-width="2" />
          </button>
        </div>
      </header>

      <div
        class="grid min-h-0 flex-1 grid-cols-7 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle"
        style="grid-template-rows: auto repeat(6, minmax(0, 1fr))"
      >
        <div
          v-for="weekDay in weekDays"
          :key="weekDay"
          class="bg-surface px-1 py-1.5 text-center text-[11px] font-medium text-text-muted"
        >
          {{ weekDay }}
        </div>

        <div
          v-for="(cell, index) in calendarDays"
          :key="index"
          class="flex min-h-0 flex-col overflow-hidden bg-column p-1"
        >
          <template v-if="cell.day !== null">
            <span
              :class="[
                'mb-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs',
                cell.isToday
                  ? 'bg-accent font-semibold text-board'
                  : 'text-text-secondary',
              ]"
            >
              {{ cell.day }}
            </span>

            <div class="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
              <button
                v-for="card in cardsForDay(cell.dateKey)"
                :key="card.id"
                type="button"
                :class="[
                  'block w-full rounded-md px-1.5 py-1 text-left text-[11px] font-semibold leading-snug shadow-sm transition-all hover:brightness-110',
                  isDone(card)
                    ? 'bg-success/30 text-success ring-1 ring-success/25'
                    : isOverdue(card.dueDate!)
                      ? 'bg-danger/30 text-danger ring-1 ring-danger/30'
                      : 'bg-[#39bcff]/25 text-[#c8ecff] ring-1 ring-[#39bcff]/35',
                ]"
                :style="{
                  borderLeft: `3px solid ${
                    board.getLabelsForCard(card)[0]
                      ? LABEL_COLOR_MAP[board.getLabelsForCard(card)[0].color]
                      : '#39bcff'
                  }`,
                }"
                :title="card.title"
                @click="board.openCard(card.id)"
              >
                <span class="line-clamp-2 break-words">{{ card.title }}</span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
