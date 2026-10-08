<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Calendar, ChevronLeft, ChevronRight, Plus, X } from '@lucide/vue'
import { useCommunityStore } from '../stores/community'
import { useHubSectionsStore } from '../stores/hubSections'
import CommunityContentPanel from './CommunityContentPanel.vue'
import { contentStatusStyle } from '../types/community'

const community = useCommunityStore()
const hubSections = useHubSectionsStore()
const today = new Date()
const viewDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))

const props = defineProps<{
  title?: string
  sectionId?: string | null
}>()

const emit = defineEmits<{
  back: []
}>()

watch(
  () => props.sectionId,
  (sectionId) => {
    community.setActiveSection(sectionId ?? null)
  },
  { immediate: true },
)

const monthLabel = computed(() =>
  new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(viewDate.value),
)

const weekDays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const sectionUrl = computed(() => {
  if (!props.sectionId) return null
  const url = hubSections.sections.find((section) => section.id === props.sectionId)?.url
  return url?.trim() || null
})

function dateKeyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dayLabel(date: Date) {
  if (date.getDate() !== 1) return String(date.getDate())
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(date)
    .replace('.', '')
  return `${date.getDate()} de ${month}.`
}

const calendarDays = computed(() => {
  const year = viewDate.value.getFullYear()
  const month = viewDate.value.getMonth()
  const gridStart = new Date(year, month, 1)
  gridStart.setDate(1 - gridStart.getDay())
  const todayKeyValue = todayKey()

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const dateKey = dateKeyOf(date)
    return {
      inMonth: date.getMonth() === month,
      isToday: dateKey === todayKeyValue,
      dateKey,
      label: dayLabel(date),
    }
  })
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

function todayKey() {
  return dateKeyOf(new Date())
}

function itemsForDay(dateKey: string | null) {
  if (!dateKey) return []
  return community.byPublishDate[dateKey] ?? []
}

async function createOnDay(dateKey: string | null) {
  // Sempre grava uma data — sem data o card some do calendário
  await community.create({
    publishDate: dateKey ?? todayKey(),
    title: 'Novo conteúdo',
    sectionId: props.sectionId ?? null,
  })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <header class="flex shrink-0 items-start justify-between gap-3 px-4 py-3 sm:px-5">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-md p-1 text-text-muted hover:bg-white/10 hover:text-text-primary"
            aria-label="Voltar"
            @click="emit('back')"
          >
            <ChevronLeft :size="16" />
          </button>
          <h2 class="truncate text-base font-semibold text-text-primary">
            {{ title || 'Calendário de Conteúdo' }}
          </h2>
        </div>
        <p class="mt-0.5 pl-7 text-sm text-text-muted">
          {{ monthLabel }}
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-2.5 text-sm font-medium text-board hover:bg-accent-hover"
          title="Criar conteúdo com data de hoje"
          @click="createOnDay(todayKey())"
        >
          <Plus :size="14" />
          Novo
        </button>
        <a
          v-if="sectionUrl"
          :href="sectionUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 px-2.5 text-xs text-text-secondary hover:bg-white/5 hover:text-text-primary"
        >
          <Calendar :size="14" />
          Abrir calendário
        </a>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex size-8 items-center justify-center rounded-md border border-white/15 text-text-secondary hover:bg-white/5 hover:text-text-primary"
            aria-label="Mês anterior"
            @click="prevMonth"
          >
            <ChevronLeft :size="16" />
          </button>
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md border border-white/15 px-2.5 text-sm text-text-primary hover:bg-white/5"
            @click="goToday"
          >
            Hoje
          </button>
          <button
            type="button"
            class="inline-flex size-8 items-center justify-center rounded-md border border-white/15 text-text-secondary hover:bg-white/5 hover:text-text-primary"
            aria-label="Próximo mês"
            @click="nextMonth"
          >
            <ChevronRight :size="16" />
          </button>
        </div>
      </div>
    </header>

    <p v-if="community.error" class="mx-4 mb-2 text-xs text-red-300 sm:mx-5">
      {{ community.error }}
      <button type="button" class="ml-1 underline" @click="community.error = null">
        <X :size="12" class="inline" />
      </button>
    </p>

    <div
      v-if="community.undatedItems.length"
      class="mx-4 mb-2 flex shrink-0 flex-wrap items-center gap-1.5 sm:mx-5"
    >
      <span class="text-[11px] font-medium text-amber-200">Sem data:</span>
      <button
        v-for="item in community.undatedItems"
        :key="item.id"
        type="button"
        class="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-text-primary hover:bg-white/10"
        @click="community.open(item.id)"
      >
        {{ item.title || 'Sem título' }}
      </button>
    </div>

    <div
      class="grid min-h-0 flex-1 grid-cols-7 overflow-hidden border-t border-white/10"
      style="grid-template-rows: auto repeat(6, minmax(0, 1fr))"
    >
      <div
        v-for="(weekDay, index) in weekDays"
        :key="weekDay"
        class="border-b border-r border-white/10 px-2 py-1.5 text-left text-[11px] text-text-muted"
        :class="index === 6 ? 'border-r-0' : ''"
      >
        {{ weekDay }}
      </div>

      <div
        v-for="(cell, index) in calendarDays"
        :key="cell.dateKey"
        class="group/day flex min-h-0 flex-col overflow-hidden border-b border-r border-white/10 p-1"
        :class="index % 7 === 6 ? 'border-r-0' : ''"
      >
        <div class="mb-0.5 flex items-start justify-between gap-1">
          <span
            :class="[
              'inline-flex h-6 min-w-6 items-center justify-center px-1 text-xs',
              cell.isToday
                ? 'rounded-full bg-accent font-semibold text-board'
                : cell.inMonth
                  ? 'text-text-primary'
                  : 'text-text-muted/70',
            ]"
          >
            {{ cell.label }}
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

        <div class="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          <button
            v-for="item in itemsForDay(cell.dateKey)"
            :key="item.id"
            type="button"
            class="block w-full truncate rounded px-1 py-0.5 text-left text-[11px] leading-4"
            :class="contentStatusStyle(item.status)"
            :title="item.title || 'Sem título'"
            @click="community.open(item.id)"
          >
            {{ item.title || 'Sem título' }}
          </button>
        </div>
      </div>
    </div>

    <CommunityContentPanel />
  </div>
</template>
