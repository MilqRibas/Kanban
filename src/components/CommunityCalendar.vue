<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight, Plus, X } from '@lucide/vue'
import { useCommunityStore } from '../stores/community'
import CommunityContentPanel from './CommunityContentPanel.vue'

const community = useCommunityStore()
const today = new Date()
const viewDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))

defineProps<{
  title?: string
}>()

const emit = defineEmits<{
  back: []
}>()

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

  while (cells.length < 42) {
    cells.push({ day: null, isToday: false, dateKey: null })
  }

  return cells
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

function itemsForDay(dateKey: string | null) {
  if (!dateKey) return []
  return community.byPublishDate[dateKey] ?? []
}

async function createOnDay(dateKey: string | null) {
  await community.create({
    publishDate: dateKey,
    title: 'Novo conteúdo',
  })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <header class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        class="rounded-lg px-2.5 py-1.5 text-xs text-text-secondary hover:bg-white/10 hover:text-text-primary"
        @click="emit('back')"
      >
        ← HUB
      </button>
      <div class="min-w-0 flex-1">
        <h2 class="text-lg font-semibold text-text-primary">
          {{ title || 'Comunidade' }}
        </h2>
        <p class="text-xs text-text-muted">
          Planejamento de conteúdo por dia
        </p>
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
          aria-label="Mês anterior"
          @click="prevMonth"
        >
          <ChevronLeft :size="18" />
        </button>
        <button
          type="button"
          class="rounded-lg px-2.5 py-1 text-xs capitalize text-text-secondary hover:bg-white/10 hover:text-text-primary"
          @click="goToday"
        >
          {{ monthLabel }} · Hoje
        </button>
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
          aria-label="Próximo mês"
          @click="nextMonth"
        >
          <ChevronRight :size="18" />
        </button>
        <button
          type="button"
          class="ml-1 inline-flex items-center gap-1 rounded-lg bg-[#39bcff] px-2.5 py-1.5 text-xs font-semibold text-board hover:brightness-110"
          @click="createOnDay(null)"
        >
          <Plus :size="14" />
          Nova
        </button>
      </div>
    </header>

    <p v-if="community.error" class="mb-2 text-xs text-red-300">
      {{ community.error }}
      <button type="button" class="ml-1 underline" @click="community.error = null">
        <X :size="12" class="inline" />
      </button>
    </p>

    <div
      class="panel-glass grid min-h-0 flex-1 grid-cols-7 gap-px overflow-hidden rounded-2xl border border-white/10"
      style="grid-template-rows: auto repeat(6, minmax(0, 1fr))"
    >
      <div
        v-for="weekDay in weekDays"
        :key="weekDay"
        class="bg-black/25 px-1 py-1.5 text-center text-[11px] font-medium text-text-muted"
      >
        {{ weekDay }}
      </div>

      <div
        v-for="(cell, index) in calendarDays"
        :key="index"
        class="group/day flex min-h-0 flex-col overflow-hidden bg-black/20 p-1"
      >
        <template v-if="cell.day !== null">
          <div class="mb-0.5 flex items-center justify-between gap-1">
            <span
              :class="[
                'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs',
                cell.isToday
                  ? 'bg-accent font-semibold text-board'
                  : 'text-text-secondary',
              ]"
            >
              {{ cell.day }}
            </span>
            <button
              type="button"
              class="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:bg-white/10 hover:text-text-primary group-hover/day:opacity-100"
              title="Criar conteúdo neste dia"
              @click="createOnDay(cell.dateKey)"
            >
              <Plus :size="12" />
            </button>
          </div>

          <div class="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
            <button
              v-for="item in itemsForDay(cell.dateKey)"
              :key="item.id"
              type="button"
              class="panel-glass block w-full rounded-lg px-1.5 py-1.5 text-left transition-all hover:brightness-110"
              @click="community.open(item.id)"
            >
              <p class="line-clamp-2 text-[11px] font-semibold leading-snug text-text-primary">
                {{ item.title || 'Sem título' }}
              </p>
              <span
                v-if="item.status"
                class="mt-1 inline-block rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300"
              >
                {{ item.status }}
              </span>
            </button>
          </div>
        </template>
      </div>
    </div>

    <CommunityContentPanel />
  </div>
</template>
