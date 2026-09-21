<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Trash2,
} from '@lucide/vue'
import { useAgendaStore } from '../stores/agenda'
import type { AgendaEvent } from '../types/agenda'

const agenda = useAgendaStore()
const today = new Date()
const viewDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const selectedDate = ref(toDateKey(today))

const formOpen = ref(false)
const draftTitle = ref('')
const draftDescription = ref('')
const draftDate = ref(selectedDate.value)
const draftTime = ref('')
const saving = ref(false)

onMounted(() => {
  if (!agenda.ready) void agenda.init()
})

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDayLabel(dateKey: string) {
  const [y, m, day] = dateKey.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(d)
}

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

const eventsByDay = computed(() => {
  const map: Record<string, AgendaEvent[]> = {}
  for (const event of agenda.sortedEvents) {
    if (!map[event.eventDate]) map[event.eventDate] = []
    map[event.eventDate].push(event)
  }
  return map
})

const selectedEvents = computed(() => agenda.eventsOnDate(selectedDate.value))

const upcomingEvents = computed(() => {
  const todayKey = toDateKey(today)
  return agenda.sortedEvents.filter((e) => e.eventDate >= todayKey).slice(0, 40)
})

const timelineGroups = computed(() => {
  const groups: { date: string; items: AgendaEvent[] }[] = []
  for (const event of upcomingEvents.value) {
    const last = groups[groups.length - 1]
    if (last && last.date === event.eventDate) last.items.push(event)
    else groups.push({ date: event.eventDate, items: [event] })
  }
  return groups
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
  selectedDate.value = toDateKey(today)
}

function selectDay(dateKey: string | null) {
  if (!dateKey) return
  selectedDate.value = dateKey
}

function openCreate(forDate?: string) {
  draftTitle.value = ''
  draftDescription.value = ''
  draftDate.value = forDate || selectedDate.value
  draftTime.value = ''
  formOpen.value = true
}

async function saveEvent() {
  saving.value = true
  try {
    const created = await agenda.addEvent({
      title: draftTitle.value,
      description: draftDescription.value,
      eventDate: draftDate.value,
      eventTime: draftTime.value || null,
    })
    if (created) {
      formOpen.value = false
      selectedDate.value = created.eventDate
      const [y, m] = created.eventDate.split('-').map(Number)
      viewDate.value = new Date(y, m - 1, 1)
    }
  } finally {
    saving.value = false
  }
}

async function onDelete(id: string) {
  if (!confirm('Remover este item da agenda?')) return
  await agenda.removeEvent(id)
}

function countOnDay(dateKey: string | null) {
  if (!dateKey) return 0
  return eventsByDay.value[dateKey]?.length ?? 0
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3 pt-2 sm:pt-3 has-footer-pad">
    <div class="page-shell flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <!-- Calendário -->
      <section
        class="panel-glass flex min-h-0 w-full flex-col rounded-2xl p-3 shadow-xl shadow-black/20 lg:max-w-md"
      >
        <header class="mb-3 flex shrink-0 items-center justify-between gap-2">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold capitalize text-text-primary">
              {{ monthLabel }}
            </h2>
            <p class="text-xs text-text-muted">Agenda do time</p>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="rounded-xl p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
              aria-label="Mês anterior"
              @click="prevMonth"
            >
              <ChevronLeft :size="18" />
            </button>
            <button
              type="button"
              class="rounded-xl px-2.5 py-1 text-xs text-text-secondary hover:bg-surface hover:text-text-primary"
              @click="goToday"
            >
              Hoje
            </button>
            <button
              type="button"
              class="rounded-xl p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
              aria-label="Próximo mês"
              @click="nextMonth"
            >
              <ChevronRight :size="18" />
            </button>
          </div>
        </header>

        <div
          class="grid grid-cols-7 gap-1 rounded-2xl border border-border-subtle/60 bg-board/30 p-2"
        >
          <div
            v-for="weekDay in weekDays"
            :key="weekDay"
            class="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-text-muted"
          >
            {{ weekDay }}
          </div>
          <button
            v-for="(cell, index) in calendarDays"
            :key="index"
            type="button"
            :disabled="!cell.dateKey"
            class="relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors disabled:opacity-30"
            :class="[
              cell.dateKey === selectedDate
                ? 'bg-accent text-board font-semibold'
                : cell.isToday
                  ? 'bg-accent/15 text-text-primary ring-1 ring-accent/40'
                  : 'text-text-secondary hover:bg-surface',
            ]"
            @click="selectDay(cell.dateKey)"
          >
            <span>{{ cell.day }}</span>
            <span
              v-if="countOnDay(cell.dateKey) > 0"
              class="absolute bottom-1 size-1 rounded-full"
              :class="cell.dateKey === selectedDate ? 'bg-board' : 'bg-accent'"
            />
          </button>
        </div>

        <div class="mt-3 flex items-center justify-between gap-2">
          <p class="text-xs text-text-muted">
            {{ formatDayLabel(selectedDate) }}
            · {{ selectedEvents.length }}
            item{{ selectedEvents.length === 1 ? '' : 's' }}
          </p>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-board hover:bg-accent-hover"
            @click="openCreate(selectedDate)"
          >
            <Plus :size="14" />
            Adicionar
          </button>
        </div>

        <ul class="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
          <li
            v-if="agenda.loading && !agenda.ready"
            class="flex items-center justify-center gap-2 py-8 text-sm text-text-muted"
          >
            <Loader2 :size="16" class="animate-spin" />
            Carregando…
          </li>
          <li
            v-else-if="selectedEvents.length === 0"
            class="rounded-2xl border border-dashed border-white/15 px-3 py-8 text-center text-sm text-text-muted"
          >
            Nada agendado neste dia.
          </li>
          <li
            v-for="event in selectedEvents"
            :key="event.id"
            class="rounded-2xl border border-white/10 bg-card/80 p-3 shadow-sm"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-medium text-text-primary">{{ event.title }}</p>
                <p
                  v-if="event.eventTime"
                  class="mt-0.5 inline-flex items-center gap-1 text-[11px] text-accent"
                >
                  <Clock :size="12" />
                  {{ event.eventTime }}
                </p>
                <p
                  v-if="event.description"
                  class="mt-1 text-xs text-text-secondary"
                >
                  {{ event.description }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-xl p-1.5 text-text-muted hover:bg-rose-500/10 hover:text-rose-300"
                aria-label="Remover"
                @click="onDelete(event.id)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Timeline -->
      <section
        class="panel-glass min-h-0 flex-1 overflow-y-auto rounded-2xl p-3 shadow-xl shadow-black/20 sm:p-4"
      >
        <header class="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 class="text-base font-semibold text-text-primary">Timeline</h3>
            <p class="text-xs text-text-muted">
              Próximos compromissos e marcos do time
            </p>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-board-elevated px-3 py-2 text-sm text-text-primary hover:bg-surface"
            @click="openCreate()"
          >
            <Plus :size="16" />
            Novo item
          </button>
        </header>

        <div
          v-if="timelineGroups.length === 0"
          class="rounded-2xl border border-dashed border-white/15 px-4 py-16 text-center"
        >
          <CalendarDays :size="28" class="mx-auto mb-2 text-text-muted" />
          <p class="text-sm text-text-secondary">Agenda vazia</p>
          <p class="mt-1 text-xs text-text-muted">
            Adicione reuniões, prazos e avisos importantes para o time.
          </p>
        </div>

        <div v-else class="space-y-5">
          <div
            v-for="group in timelineGroups"
            :key="group.date"
            class="relative pl-4"
          >
            <div
              class="absolute left-0 top-2 bottom-0 w-px bg-border-subtle"
              aria-hidden="true"
            />
            <div
              class="absolute left-[-3px] top-2 size-2 rounded-full bg-accent"
              aria-hidden="true"
            />
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {{ formatDayLabel(group.date) }}
            </p>
            <ul class="space-y-2">
              <li
                v-for="event in group.items"
                :key="event.id"
                class="rounded-2xl border border-white/10 bg-card/70 p-3.5 transition-colors hover:border-accent/30"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="font-medium text-text-primary">{{ event.title }}</h4>
                      <span
                        v-if="event.eventTime"
                        class="inline-flex items-center gap-1 rounded-lg bg-accent/15 px-2 py-0.5 text-[11px] text-accent"
                      >
                        <Clock :size="11" />
                        {{ event.eventTime }}
                      </span>
                    </div>
                    <p
                      v-if="event.description"
                      class="mt-1 text-sm text-text-secondary"
                    >
                      {{ event.description }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="rounded-xl p-1.5 text-text-muted hover:bg-rose-500/10 hover:text-rose-300"
                    aria-label="Remover"
                    @click="onDelete(event.id)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="formOpen"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center"
        @click.self="formOpen = false"
      >
        <div
          class="w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-board p-4 shadow-xl"
          role="dialog"
          aria-modal="true"
        >
          <h3 class="text-base font-semibold text-text-primary">Novo item na agenda</h3>
          <label class="block space-y-1">
            <span class="text-[11px] uppercase text-text-muted">Título</span>
            <input
              v-model="draftTitle"
              type="text"
              class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="Ex.: Reunião Diretoria"
            />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block space-y-1">
              <span class="text-[11px] uppercase text-text-muted">Data</span>
              <input
                v-model="draftDate"
                type="date"
                class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/40"
              />
            </label>
            <label class="block space-y-1">
              <span class="text-[11px] uppercase text-text-muted">Horário</span>
              <input
                v-model="draftTime"
                type="time"
                class="w-full rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/40"
              />
            </label>
          </div>
          <label class="block space-y-1">
            <span class="text-[11px] uppercase text-text-muted">Descrição</span>
            <textarea
              v-model="draftDescription"
              rows="3"
              class="w-full resize-none rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="Opcional"
            />
          </label>
          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="rounded-xl border border-white/10 px-3 py-2 text-sm text-text-secondary"
              @click="formOpen = false"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-board disabled:opacity-50"
              :disabled="saving || !draftTitle.trim()"
              @click="saveEvent"
            >
              {{ saving ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
