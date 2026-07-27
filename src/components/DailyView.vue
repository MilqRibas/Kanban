<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  ListTodo,
  ListTree,
  Plus,
  Trash2,
  UserRound,
  X,
} from '@lucide/vue'
import { useBoardStore } from '../stores/board'
import { entryProgress, toDateKey, useDailyStore } from '../stores/dailyTodos'
import type { DailyEntry, DailyStatus, DailyTodoItem } from '../types/daily'
import MemberAvatar from './MemberAvatar.vue'

const board = useBoardStore()
const daily = useDailyStore()

const newTodoText = ref('')
const childDrafts = ref<Record<string, string>>({})
const campaignDraft = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const celebratePin = ref(false)
const addMenuDateKey = ref<string | null>(null)
const memberPickerOpen = ref(false)
const addBlockMenuOpen = ref(false)

const weekDaysHeader = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.']

const statusMeta: Record<DailyStatus, { label: string; className: string }> = {
  todo: { label: 'Não realizado', className: 'bg-danger/25 text-danger' },
  in_progress: { label: 'Em andamento', className: 'bg-amber-500/25 text-amber-200' },
  done: { label: 'Concluído', className: 'bg-success/25 text-success' },
}

/** Membro focado no detalhe: filtro do header ou último selecionado */
const focusMemberId = computed(
  () =>
    board.memberFilterId ??
    daily.detailMemberId ??
    board.members[0]?.id ??
    null,
)

const selectedMember = computed(
  () => board.members.find((member) => member.id === focusMemberId.value) ?? null,
)

watch(
  focusMemberId,
  (memberId) => {
    if (memberId) daily.detailMemberId = memberId
  },
  { immediate: true },
)

watch(
  [focusMemberId, () => daily.selectedDateKey, () => daily.ready],
  () => {
    if (!daily.ready || daily.loading) return
    if (focusMemberId.value) {
      daily.ensureEntry(focusMemberId.value, daily.selectedDateKey)
    }
  },
  { immediate: true },
)

function openDay(dateKey: string) {
  const memberId = focusMemberId.value ?? board.members[0]?.id
  if (!memberId) return
  daily.openEntry(memberId, dateKey)
}

function membersAvailableForDate(_dateKey: string) {
  return board.members
}

function startAddForDay(dateKey: string) {
  if (board.memberFilterId) {
    daily.openEntry(board.memberFilterId, dateKey)
    addMenuDateKey.value = null
    return
  }
  if (board.members.length <= 1) {
    const only = board.members[0]?.id
    if (only) daily.openEntry(only, dateKey)
    addMenuDateKey.value = null
    return
  }
  addMenuDateKey.value = addMenuDateKey.value === dateKey ? null : dateKey
}

function pickMemberForDay(memberId: string, dateKey: string) {
  addMenuDateKey.value = null
  daily.openEntry(memberId, dateKey)
}

function setResponsible(memberId: string) {
  memberPickerOpen.value = false
  daily.openEntry(memberId, daily.selectedDateKey)
}

const focusedEntry = computed(() => {
  const memberId = focusMemberId.value
  if (!memberId) return null
  return (
    daily.entries.find(
      (entry) =>
        entry.memberId === memberId && entry.dateKey === daily.selectedDateKey,
    ) ?? null
  )
})

watch(
  () => focusedEntry.value?.campaign,
  (value) => {
    campaignDraft.value = value ?? ''
  },
  { immediate: true },
)

const focusedProgress = computed(() => entryProgress(focusedEntry.value))

watch(
  () => focusedProgress.value.complete,
  (complete, wasComplete) => {
    if (complete && wasComplete === false && focusedProgress.value.total > 0) {
      celebratePin.value = true
      window.setTimeout(() => {
        celebratePin.value = false
      }, 1200)
    }
  },
)

const dateLabel = computed(() => {
  const [y, m, d] = daily.selectedDateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(y, m - 1, d))
})

const isViewingToday = computed(
  () => daily.selectedDateKey === toDateKey(new Date()),
)

function memberOf(entry: DailyEntry) {
  return board.getMemberById(entry.memberId)
}

function statusOf(entry: DailyEntry) {
  const progress = entryProgress(entry)
  if (progress.complete) return statusMeta.done
  return statusMeta[entry.status]
}

function saveCampaign() {
  daily.setCampaign(campaignDraft.value.trim())
}

function onDateChange(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return
  const memberId = focusMemberId.value ?? board.members[0]?.id
  if (!memberId) {
    daily.setDateKey(value)
    return
  }
  daily.openEntry(memberId, value)
}

function isToggle(todo: DailyTodoItem) {
  return todo.kind === 'toggle'
}

function submitTodo(parentToggleId?: string | null) {
  if (parentToggleId) {
    const text = (childDrafts.value[parentToggleId] ?? '').trim()
    if (!text) return
    daily.addTodo(text, parentToggleId)
    childDrafts.value[parentToggleId] = ''
    return
  }
  daily.addTodo(newTodoText.value)
  newTodoText.value = ''
  nextTick(() => inputRef.value?.focus())
}

function addToggleList() {
  addBlockMenuOpen.value = false
  daily.addToggle('Nova lista')
}

function addTaskFromMenu() {
  addBlockMenuOpen.value = false
  nextTick(() => inputRef.value?.focus())
}

function isTabActive(mode: 'day' | 'week' | 'month') {
  if (mode === 'day') return daily.dayDetailOpen
  if (mode === 'week') {
    return !daily.dayDetailOpen && daily.calendarViewMode === 'week'
  }
  return !daily.dayDetailOpen && daily.calendarViewMode === 'month'
}

function closeDayDetail() {
  memberPickerOpen.value = false
  addBlockMenuOpen.value = false
  addMenuDateKey.value = null
  daily.closeDayDetail()
}

function onEscapeKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && daily.dayDetailOpen) closeDayDetail()
}

watch(
  () => daily.dayDetailOpen,
  (open) => {
    if (open) window.addEventListener('keydown', onEscapeKey)
    else window.removeEventListener('keydown', onEscapeKey)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onEscapeKey))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col pb-[4.75rem] pt-2 sm:pb-16 sm:pt-3">
    <div class="page-shell flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
    <p v-if="daily.error" class="rounded-lg border border-red-400/30 bg-red-950/50 px-3 py-2 text-xs text-red-200">
      {{ daily.error }}
      <button type="button" class="ml-2 underline" @click="daily.error = null">fechar</button>
    </p>
    <!-- Controles: só modo + navegação (dropdown fica no header) -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex rounded-xl border border-border-subtle/70 bg-board-elevated/90 p-1">
        <button
          v-for="mode in [
            { id: 'day' as const, label: 'Diário' },
            { id: 'week' as const, label: 'Semanal' },
            { id: 'month' as const, label: 'Mensal' },
          ]"
          :key="mode.id"
          type="button"
          :class="[
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            isTabActive(mode.id)
              ? 'bg-surface text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          ]"
          @click="daily.setViewMode(mode.id)"
        >
          {{ mode.label }}
        </button>
      </div>

      <p class="hidden text-sm capitalize text-text-muted sm:block">
        {{ daily.periodLabel }}
        <span v-if="selectedMember"> · {{ selectedMember.name }}</span>
      </p>

      <div class="ml-auto flex items-center gap-1 rounded-xl bg-board-elevated/90 p-1">
        <button
          type="button"
          :class="[
            'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
            isViewingToday
              ? 'bg-accent text-board'
              : 'bg-accent/15 text-accent hover:bg-accent/25',
          ]"
          title="Ir para hoje"
          @click="daily.goToday()"
        >
          Hoje
        </button>
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
          aria-label="Anterior"
          @click="daily.shiftPeriod(-1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
          aria-label="Próximo"
          @click="daily.shiftPeriod(1)"
        >
          <ChevronRight :size="18" />
        </button>
      </div>
    </div>

    <!-- SEMANAL / MENSAL -->
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <Transition name="view-fade">
        <section
          v-if="daily.calendarViewMode === 'week'"
          key="week"
          class="panel-glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl"
        >
      <header class="flex shrink-0 items-center justify-between border-b border-border-subtle/70 px-4 py-3">
        <div>
          <h2 class="text-sm font-semibold capitalize text-text-primary">
            {{ daily.periodLabel }}
          </h2>
          <p class="text-xs text-text-muted">
            Tarefas
            <span v-if="board.memberFilterId && selectedMember">
              · {{ selectedMember.name }}
            </span>
            <span v-else> · todos</span>
          </p>
        </div>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-7 gap-px overflow-hidden bg-border-subtle">
        <div
          v-for="day in daily.weekDays"
          :key="day.dateKey"
          class="flex min-h-0 flex-col gap-2 overflow-hidden bg-column p-2"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between gap-1 rounded-lg px-0.5 text-left hover:bg-white/5"
            :title="`Abrir diário de ${day.dayNumber}`"
            @click="openDay(day.dateKey)"
          >
            <span class="text-[11px] capitalize text-text-muted">{{ day.weekday }}</span>
            <span
              :class="[
                'inline-flex size-6 items-center justify-center rounded-full text-xs',
                day.isToday ? 'bg-danger font-semibold text-white' : 'text-text-secondary',
              ]"
            >
              {{ day.dayNumber }}
            </span>
          </button>

          <div class="min-h-0 flex-1 space-y-2 overflow-y-auto">
            <button
              v-for="entry in day.entries"
              :key="entry.id"
              type="button"
              class="relative w-full rounded-xl border border-border-subtle/70 bg-card p-2.5 pr-9 text-left shadow-sm transition-colors hover:bg-card-hover"
              @click="daily.openEntry(entry.memberId, day.dateKey)"
            >
              <div
                v-if="entryProgress(entry).complete"
                class="absolute right-2 top-2"
              >
                <div
                  class="flex size-6 items-center justify-center rounded-full bg-success text-board shadow-md"
                >
                  <Check :size="12" :stroke-width="3" />
                </div>
              </div>

              <div class="mb-1.5 flex items-center gap-1.5">
                <MemberAvatar
                  v-if="memberOf(entry)"
                  :member="memberOf(entry)!"
                  size="sm"
                />
                <span class="truncate text-xs font-semibold text-text-primary">
                  {{ memberOf(entry)?.name }}
                </span>
              </div>
              <p class="mb-2 line-clamp-2 text-[11px] leading-snug text-text-muted">
                {{ entry.campaign || entry.todos[0]?.text }}
              </p>
              <span
                :class="[
                  'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                  statusOf(entry).className,
                ]"
              >
                {{ statusOf(entry).label }}
              </span>
            </button>

            <div class="relative">
              <button
                type="button"
                class="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-subtle/60 px-2 py-3 text-center transition-colors hover:border-accent/40 hover:bg-white/5"
                :title="
                  day.entries.length
                    ? 'Adicionar rotina de outro membro'
                    : 'Adicionar tarefa'
                "
                @click.stop="startAddForDay(day.dateKey)"
              >
                <Plus :size="14" class="text-text-muted" />
                <span class="text-[11px] font-medium text-text-muted">
                  {{ day.entries.length ? 'Outro membro' : 'Adicionar tarefa' }}
                </span>
              </button>

              <div
                v-if="addMenuDateKey === day.dateKey"
                class="absolute inset-x-0 bottom-full z-20 mb-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-board-elevated py-1 shadow-xl"
              >
                <p class="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  Criar para
                </p>
                <button
                  v-for="member in membersAvailableForDate(day.dateKey)"
                  :key="member.id"
                  type="button"
                  class="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-text-secondary hover:bg-white/10 hover:text-text-primary"
                  @click.stop="pickMemberForDay(member.id, day.dateKey)"
                >
                  <MemberAvatar :member="member" size="sm" />
                  <span class="truncate">{{ member.name }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
        </section>

        <section
          v-else
          key="month"
          class="panel-glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl"
        >
      <header class="flex shrink-0 items-center justify-between border-b border-border-subtle/70 px-4 py-3">
        <h2 class="text-sm font-semibold capitalize text-text-primary">
          {{ daily.periodLabel }}
        </h2>
        <p class="text-xs text-text-muted">Visão mensal</p>
      </header>

      <div
        class="grid min-h-0 flex-1 grid-cols-7 gap-px overflow-hidden bg-border-subtle"
        style="grid-template-rows: auto repeat(6, minmax(0, 1fr))"
      >
        <div
          v-for="weekday in weekDaysHeader"
          :key="weekday"
          class="bg-surface px-1 py-1.5 text-center text-[11px] capitalize text-text-muted"
        >
          {{ weekday }}
        </div>

        <div
          v-for="cell in daily.monthCells"
          :key="cell.dateKey"
          :class="[
            'flex min-h-0 cursor-pointer flex-col gap-1 overflow-hidden p-1.5 transition-colors hover:bg-white/5',
            cell.inMonth ? 'bg-column' : 'bg-board/80 opacity-55',
          ]"
          @click="openDay(cell.dateKey)"
        >
          <span
            :class="[
              'mb-0.5 inline-flex size-6 items-center justify-center rounded-full text-xs',
              cell.isToday ? 'bg-danger font-semibold text-white' : 'text-text-secondary',
            ]"
          >
            {{ cell.dayNumber }}
          </span>

          <div class="min-h-0 flex-1 space-y-1 overflow-y-auto">
            <button
              v-for="entry in cell.entries"
              :key="entry.id"
              type="button"
              class="relative w-full rounded-lg border border-border-subtle/60 bg-card px-1.5 py-1.5 pr-6 text-left hover:bg-card-hover"
              @click.stop="daily.openEntry(entry.memberId, cell.dateKey)"
            >
              <div
                v-if="entryProgress(entry).complete"
                class="absolute right-1 top-1"
              >
                <div
                  class="flex size-4 items-center justify-center rounded-full bg-success text-board"
                >
                  <Check :size="9" :stroke-width="3" />
                </div>
              </div>
              <p class="truncate text-[10px] font-semibold text-text-primary">
                {{ memberOf(entry)?.name }}
              </p>
              <p class="truncate text-[10px] text-text-muted">
                {{ entry.campaign || 'Tarefas' }}
              </p>
              <span
                :class="[
                  'mt-1 inline-flex rounded px-1 py-0.5 text-[9px] font-semibold',
                  statusOf(entry).className,
                ]"
              >
                {{ statusOf(entry).label }}
              </span>
            </button>
          </div>
        </div>
      </div>
        </section>
      </Transition>
    </div>

    <!-- Detalhe do dia (overlay) -->
    <Teleport to="body">
      <Transition name="view-fade">
        <div
          v-if="daily.dayDetailOpen"
          class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          :aria-label="`Afazeres de ${selectedMember?.name ?? 'membro'}`"
        >
          <button
            type="button"
            class="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
            aria-label="Fechar detalhe do dia"
            @click="closeDayDetail"
          />

          <section
            class="panel-glass relative z-10 flex max-h-[min(94dvh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-white/10 shadow-2xl shadow-black/50 sm:rounded-2xl"
          >
            <div
              class="flex shrink-0 justify-center pt-2 sm:hidden"
              aria-hidden="true"
            >
              <span class="h-1 w-10 rounded-full bg-white/25" />
            </div>

            <button
              type="button"
              class="absolute right-3 top-3 z-20 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary sm:right-4 sm:top-4"
              aria-label="Fechar"
              @click="closeDayDetail"
            >
              <X :size="20" />
            </button>

            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 pr-12 sm:px-8 sm:py-7 sm:pr-14">
        <header class="mb-6">
          <div class="mb-2 flex items-start justify-between gap-3">
            <h2 class="text-3xl font-bold tracking-tight text-text-primary">
              {{ selectedMember?.name ?? 'Usuário' }}
            </h2>
            <div class="flex items-center gap-2 pr-1">
              <div
                v-if="focusedProgress.complete"
                class="flex size-9 items-center justify-center rounded-full bg-success text-board shadow-md"
                :class="{ 'daily-pin-pop': celebratePin }"
                title="Dia concluído"
              >
                <Check :size="18" :stroke-width="3" />
              </div>
            </div>
          </div>
          <p class="text-sm text-text-muted">
            Afazeres de {{ dateLabel }}
          </p>
        </header>

        <dl class="mb-6 space-y-3 text-sm">
          <div class="grid grid-cols-[140px_1fr] items-center gap-3 sm:grid-cols-[160px_1fr]">
            <dt class="flex items-center gap-2 text-text-muted">
              <Calendar :size="15" />
              Data
            </dt>
            <dd>
              <input
                type="date"
                :value="daily.selectedDateKey"
                class="rounded-md border border-border-subtle/70 bg-surface px-2 py-1 text-text-primary outline-none hover:border-accent/40 focus:border-accent [color-scheme:dark]"
                @change="onDateChange"
              />
            </dd>
          </div>

          <div class="grid grid-cols-[140px_1fr] items-center gap-3 sm:grid-cols-[160px_1fr]">
            <dt class="flex items-center gap-2 text-text-muted">
              <UserRound :size="15" />
              Responsável
            </dt>
            <dd class="relative">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-text-primary hover:bg-white/10"
                :aria-expanded="memberPickerOpen"
                @click="memberPickerOpen = !memberPickerOpen"
              >
                <MemberAvatar
                  v-if="selectedMember"
                  :member="selectedMember"
                  size="sm"
                />
                {{ selectedMember?.name ?? 'Escolher' }}
              </button>
              <div
                v-if="memberPickerOpen"
                class="absolute left-0 top-full z-20 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-white/10 bg-board-elevated py-1 shadow-xl"
              >
                <button
                  v-for="member in board.members"
                  :key="member.id"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
                  @click="setResponsible(member.id)"
                >
                  <MemberAvatar :member="member" size="sm" />
                  {{ member.name }}
                </button>
              </div>
            </dd>
          </div>

          <div class="grid grid-cols-[140px_1fr] items-center gap-3 sm:grid-cols-[160px_1fr]">
            <dt class="flex items-center gap-2 text-text-muted">
              <ListTodo :size="15" />
              Campanha
            </dt>
            <dd>
              <input
                v-model="campaignDraft"
                type="text"
                placeholder="Vazio"
                class="w-full max-w-sm rounded-md border border-transparent bg-transparent px-2 py-1 text-text-primary outline-none placeholder:text-text-muted hover:bg-surface focus:border-border-subtle focus:bg-surface"
                @blur="saveCampaign"
                @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
              />
            </dd>
          </div>

          <div class="grid grid-cols-[140px_1fr] items-center gap-3 sm:grid-cols-[160px_1fr]">
            <dt class="flex items-center gap-2 text-text-muted">
              <CircleDashed :size="15" />
              Status
            </dt>
            <dd class="flex flex-wrap gap-1.5">
              <button
                v-for="(meta, key) in statusMeta"
                :key="key"
                type="button"
                :class="[
                  'rounded-md px-2.5 py-1 text-xs font-medium',
                  meta.className,
                  focusedEntry?.status === key
                    ? 'ring-1 ring-white/25'
                    : 'opacity-55 hover:opacity-100',
                ]"
                @click="daily.setStatus(key as DailyStatus)"
              >
                {{ meta.label }}
              </button>
            </dd>
          </div>
        </dl>

        <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Afazeres do dia
        </h3>

        <ul class="space-y-1.5">
          <template v-for="todo in focusedEntry?.todos ?? []" :key="todo.id">
            <!-- Lista alternante (dropdown) -->
            <li
              v-if="isToggle(todo)"
              class="rounded-lg"
            >
              <div
                class="group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface/60"
              >
                <button
                  type="button"
                  class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-text-muted hover:bg-white/10 hover:text-text-primary"
                  :aria-expanded="!todo.collapsed"
                  :aria-label="todo.collapsed ? 'Expandir lista' : 'Recolher lista'"
                  @click="daily.toggleCollapse(todo.id)"
                >
                  <ChevronRight
                    v-if="todo.collapsed"
                    :size="16"
                  />
                  <ChevronDown
                    v-else
                    :size="16"
                  />
                </button>
                <input
                  :value="todo.text"
                  type="text"
                  class="min-w-0 flex-1 bg-transparent text-sm font-medium text-text-primary outline-none"
                  @change="
                    daily.updateTodoText(
                      todo.id,
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
                <button
                  type="button"
                  class="rounded-md p-1 text-text-muted opacity-0 transition-opacity hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                  aria-label="Remover lista"
                  @click="daily.removeTodo(todo.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>

              <ul
                v-if="!todo.collapsed"
                class="ml-4 space-y-1 border-l border-border-subtle/50 pl-3"
              >
                <li
                  v-for="child in todo.children ?? []"
                  :key="child.id"
                  :class="[
                    'group flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface/60',
                    child.highlighted && 'bg-amber-400/10',
                  ]"
                >
                  <input
                    type="checkbox"
                    class="mt-1 size-4 shrink-0 accent-accent"
                    :checked="child.completed"
                    @change="daily.toggleTodo(child.id)"
                  />
                  <input
                    :value="child.text"
                    type="text"
                    :class="[
                      'min-w-0 flex-1 bg-transparent text-sm outline-none',
                      child.completed
                        ? 'text-text-muted line-through'
                        : 'text-text-primary',
                    ]"
                    @change="
                      daily.updateTodoText(
                        child.id,
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                  <button
                    type="button"
                    class="rounded-md p-1 text-text-muted opacity-0 transition-opacity hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                    aria-label="Remover tarefa"
                    @click="daily.removeTodo(child.id)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </li>

                <li>
                  <form
                    class="flex items-center gap-2 px-2"
                    @submit.prevent="submitTodo(todo.id)"
                  >
                    <Plus :size="14" class="shrink-0 text-text-muted" />
                    <input
                      v-model="childDrafts[todo.id]"
                      type="text"
                      placeholder="Item nesta lista…"
                      class="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
                    />
                  </form>
                </li>
              </ul>
            </li>

            <!-- Tarefa simples -->
            <li
              v-else
              :class="[
                'group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface/60',
                todo.highlighted && 'bg-amber-400/10',
              ]"
            >
              <input
                type="checkbox"
                class="mt-1 size-4 shrink-0 accent-accent"
                :checked="todo.completed"
                @change="daily.toggleTodo(todo.id)"
              />
              <input
                :value="todo.text"
                type="text"
                :class="[
                  'min-w-0 flex-1 bg-transparent text-sm outline-none',
                  todo.completed
                    ? 'text-text-muted line-through'
                    : 'text-text-primary',
                ]"
                @change="
                  daily.updateTodoText(
                    todo.id,
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
              <button
                type="button"
                class="rounded-md p-1 text-text-muted opacity-0 transition-opacity hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                aria-label="Remover tarefa"
                @click="daily.removeTodo(todo.id)"
              >
                <Trash2 :size="14" />
              </button>
            </li>
          </template>
        </ul>

        <div class="relative mt-3 space-y-2 px-2">
          <form class="flex items-center gap-2" @submit.prevent="submitTodo()">
            <button
              type="button"
              class="shrink-0 rounded-md p-1 text-text-muted hover:bg-white/10 hover:text-text-primary"
              title="Tipo de bloco"
              aria-label="Adicionar bloco"
              @click="addBlockMenuOpen = !addBlockMenuOpen"
            >
              <Plus :size="16" />
            </button>
            <input
              ref="inputRef"
              v-model="newTodoText"
              type="text"
              placeholder="Adicionar um afazer… ou / para blocos"
              class="min-w-0 flex-1 bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
              @keydown.slash.exact.prevent="addBlockMenuOpen = true"
            />
            <button
              v-if="newTodoText.trim()"
              type="submit"
              class="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-board hover:bg-accent-hover"
            >
              Adicionar
            </button>
          </form>

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
            @click="addToggleList"
          >
            <ListTree :size="14" />
            Adicionar lista alternante
          </button>

          <div
            v-if="addBlockMenuOpen"
            class="absolute left-0 top-10 z-20 mt-1 min-w-[14rem] overflow-hidden rounded-xl border border-white/10 bg-board-elevated py-1 shadow-xl"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
              @click="addTaskFromMenu"
            >
              <ListTodo :size="16" class="shrink-0 text-text-muted" />
              <span class="flex-1">Lista de tarefas</span>
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
              @click="addToggleList"
            >
              <ListTree :size="16" class="shrink-0 text-text-muted" />
              <span class="flex-1">Lista de alternantes</span>
              <ChevronRight :size="14" class="text-text-muted" />
            </button>
          </div>
        </div>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
    </div>
  </div>
</template>
