import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { DailyEntry, DailyStatus, DailyTodoItem } from '../types/daily'
import { BOARD_ID, supabase } from '../lib/supabase'
import { useBoardStore } from './board'
import { useToastStore } from './toast'
import type { Json } from '../lib/database.types'
import {
  cloneTodo,
  cloneTodos,
  continuousDateKeys,
  entryLookupKey,
  insertTodoAfter,
  nextDateKey,
  parseDateKey,
  sameMemberId,
  startOfWeek,
  toDateKey,
} from '../utils/dailyEntries'

const STORAGE_KEY = 'kanban-daily-ui-v1'

export type DailyViewMode = 'day' | 'week' | 'month'
export type DailyCalendarMode = 'week' | 'month'
export type DailyDuplicateMode = 'next-day' | 'continuous'

export { parseDateKey, startOfWeek, toDateKey }

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function normalizeTodo(raw: unknown): DailyTodoItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const kind = row.kind === 'toggle' ? 'toggle' : 'task'
  const children = Array.isArray(row.children)
    ? row.children
        .map((child) => normalizeTodo(child))
        .filter((child): child is DailyTodoItem => Boolean(child))
    : []
  return {
    id: String(row.id ?? createId('td')),
    text: String(row.text ?? ''),
    completed: Boolean(row.completed),
    highlighted: Boolean(row.highlighted) || undefined,
    kind,
    collapsed: Boolean(row.collapsed),
    children: kind === 'toggle' ? children : undefined,
  }
}

function asTodos(value: Json): DailyTodoItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeTodo(item))
    .filter((item): item is DailyTodoItem => Boolean(item))
}

/** Folhas (tarefas reais) — ignora cabeçalhos de lista alternante */
export function leafTodos(todos: DailyTodoItem[]): DailyTodoItem[] {
  const out: DailyTodoItem[] = []
  for (const item of todos) {
    if (item.kind === 'toggle') {
      out.push(...leafTodos(item.children ?? []))
    } else {
      out.push(item)
    }
  }
  return out
}

function findTodo(
  todos: DailyTodoItem[],
  id: string,
): DailyTodoItem | null {
  for (const item of todos) {
    if (item.id === id) return item
    if (item.children?.length) {
      const found = findTodo(item.children, id)
      if (found) return found
    }
  }
  return null
}

function removeTodoById(
  todos: DailyTodoItem[],
  id: string,
): DailyTodoItem[] {
  return todos
    .filter((item) => item.id !== id)
    .map((item) =>
      item.children
        ? { ...item, children: removeTodoById(item.children, id) }
        : item,
    )
}

function emptyEntry(memberId: string | null, dateKey: string): DailyEntry {
  return {
    id: createId('day'),
    memberId,
    dateKey,
    status: 'todo',
    campaign: '',
    todos: [],
    updatedAt: new Date().toISOString(),
  }
}

export function entryProgress(entry: DailyEntry | null | undefined) {
  if (!entry) {
    return { done: 0, total: 0, percent: 0, complete: false }
  }
  const leaves = leafTodos(entry.todos)
  if (leaves.length === 0) {
    return { done: 0, total: 0, percent: 0, complete: false }
  }
  const done = leaves.filter((item) => item.completed).length
  const total = leaves.length
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
    complete: done === total,
  }
}

function loadUiState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      selectedDateKey?: string
      viewMode?: DailyViewMode
      calendarViewMode?: DailyCalendarMode
      dayDetailOpen?: boolean
      detailMemberId?: string | null
    }
    if (parsed.calendarViewMode) return parsed
    if (parsed.viewMode === 'day') {
      return {
        ...parsed,
        calendarViewMode: 'week' as DailyCalendarMode,
        dayDetailOpen: true,
      }
    }
    if (parsed.viewMode === 'week' || parsed.viewMode === 'month') {
      return {
        ...parsed,
        calendarViewMode: parsed.viewMode,
        dayDetailOpen: parsed.dayDetailOpen ?? false,
      }
    }
    return parsed
  } catch {
    return null
  }
}

export const useDailyStore = defineStore('daily', () => {
  const board = useBoardStore()
  const ui = loadUiState()
  const entries = ref<DailyEntry[]>([])
  const selectedDateKey = ref(ui?.selectedDateKey ?? toDateKey(new Date()))
  const calendarViewMode = ref<DailyCalendarMode>(ui?.calendarViewMode ?? 'week')
  const dayDetailOpen = ref(ui?.dayDetailOpen ?? false)
  const detailMemberId = ref<string | null>(ui?.detailMemberId ?? null)
  const loading = ref(false)
  const ready = ref(false)
  const error = ref<string | null>(null)
  let channel: RealtimeChannel | null = null
  let suppressRealtimeUntil = 0
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let reloadTimer: ReturnType<typeof setTimeout> | null = null

  function quietRealtime(ms = 800) {
    suppressRealtimeUntil = Date.now() + ms
  }

  function schedulePersist(entry: DailyEntry) {
    const existing = persistTimers.get(entry.id)
    if (existing) clearTimeout(existing)
    persistTimers.set(
      entry.id,
      setTimeout(() => {
        persistTimers.delete(entry.id)
        void persistEntry(entry)
      }, 350),
    )
  }

  function sanitizeDetailMember() {
    if (
      detailMemberId.value &&
      !board.members.some((member) => member.id === detailMemberId.value)
    ) {
      detailMemberId.value = null
      persistUi()
    }
  }

  async function persistEntry(entry: DailyEntry) {
    quietRealtime()

    let existingQuery = supabase
      .from('daily_entries')
      .select('id')
      .eq('board_id', BOARD_ID)
      .eq('date_key', entry.dateKey)
    existingQuery = entry.memberId
      ? existingQuery.eq('member_id', entry.memberId)
      : existingQuery.is('member_id', null)

    const { data: existingRow } = await existingQuery.maybeSingle()

    if (existingRow?.id && existingRow.id !== entry.id) {
      const oldId = entry.id
      entry.id = existingRow.id
      if (persistTimers.has(oldId)) {
        const timer = persistTimers.get(oldId)
        if (timer) clearTimeout(timer)
        persistTimers.delete(oldId)
      }
    }

    const { error: upsertError } = await supabase.from('daily_entries').upsert(
      {
        id: entry.id,
        board_id: BOARD_ID,
        member_id: entry.memberId,
        date_key: entry.dateKey,
        status: entry.status,
        campaign: entry.campaign,
        todos: entry.todos as unknown as Json,
        updated_at: entry.updatedAt,
      },
      { onConflict: 'id' },
    )
    if (upsertError) {
      error.value = upsertError.message
      useToastStore().error(upsertError.message)
    }
  }

  async function loadEntries() {
    loading.value = true
    error.value = null
    const { data, error: loadError } = await supabase
      .from('daily_entries')
      .select('*')
      .eq('board_id', BOARD_ID)

    if (loadError) {
      error.value = loadError.message
      useToastStore().error(loadError.message)
      loading.value = false
      return
    }

    const localByKey = new Map(
      entries.value.map((entry) => [
        entryLookupKey(entry.memberId, entry.dateKey),
        entry,
      ]),
    )
    const remote = (data ?? []).map((row) => ({
      id: row.id,
      memberId: row.member_id ?? null,
      dateKey: String(row.date_key).slice(0, 10),
      status: row.status as DailyStatus,
      campaign: row.campaign,
      todos: asTodos(row.todos),
      updatedAt: row.updated_at,
    }))

    const merged = remote.map((row) => {
      const local = localByKey.get(entryLookupKey(row.memberId, row.dateKey))
      // Mantém edição local ainda não persistida
      if (local && persistTimers.has(local.id)) return local
      return row
    })

    for (const [key, local] of localByKey) {
      if (
        persistTimers.has(local.id) &&
        !merged.some(
          (entry) => entryLookupKey(entry.memberId, entry.dateKey) === key,
        )
      ) {
        merged.push(local)
      }
    }

    entries.value = merged
    loading.value = false
  }

  function subscribeRealtime() {
    unsubscribeRealtime()
    channel = supabase
      .channel(`daily:${BOARD_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_entries' },
        () => {
          if (Date.now() < suppressRealtimeUntil) return
          if (reloadTimer) clearTimeout(reloadTimer)
          reloadTimer = setTimeout(() => {
            reloadTimer = null
            if (Date.now() < suppressRealtimeUntil) return
            void loadEntries()
          }, 700)
        },
      )
      .subscribe()
  }

  function unsubscribeRealtime() {
    if (reloadTimer) {
      clearTimeout(reloadTimer)
      reloadTimer = null
    }
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  async function init() {
    await loadEntries()
    sanitizeDetailMember()
    subscribeRealtime()
    ready.value = true
  }

  function reset() {
    unsubscribeRealtime()
    for (const timer of persistTimers.values()) clearTimeout(timer)
    persistTimers.clear()
    entries.value = []
    ready.value = false
  }

  function persistUi() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedDateKey: selectedDateKey.value,
        calendarViewMode: calendarViewMode.value,
        dayDetailOpen: dayDetailOpen.value,
        detailMemberId: detailMemberId.value,
      }),
    )
  }

  const activeMemberId = computed(
    () => board.memberFilterId ?? detailMemberId.value,
  )

  const currentEntry = computed(() => {
    const memberId = activeMemberId.value
    return (
      entries.value.find(
        (entry) =>
          sameMemberId(entry.memberId, memberId) &&
          entry.dateKey === selectedDateKey.value,
      ) ?? null
    )
  })

  function entriesForDate(dateKey: string) {
    const filter = board.memberFilterId
    return entries.value.filter(
      (entry) =>
        entry.dateKey === dateKey &&
        entry.todos.length > 0 &&
        (!filter || entry.memberId === filter),
    )
  }

  const weekDays = computed(() => {
    const start = startOfWeek(parseDateKey(selectedDateKey.value))
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      const dateKey = toDateKey(date)
      const dayEntries = entriesForDate(dateKey)
      return {
        date,
        dateKey,
        dayNumber: date.getDate(),
        weekday: new Intl.DateTimeFormat('pt-BR', {
          weekday: 'short',
        }).format(date),
        isToday: dateKey === toDateKey(new Date()),
        isSelected: dateKey === selectedDateKey.value,
        entries: dayEntries,
      }
    })
  })

  const monthCells = computed(() => {
    const anchor = parseDateKey(selectedDateKey.value)
    const year = anchor.getFullYear()
    const month = anchor.getMonth()
    const first = new Date(year, month, 1)
    const start = startOfWeek(first)
    const cells = []

    for (let i = 0; i < 42; i++) {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      const dateKey = toDateKey(date)
      cells.push({
        date,
        dateKey,
        dayNumber: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: dateKey === toDateKey(new Date()),
        isSelected: dateKey === selectedDateKey.value,
        entries: entriesForDate(dateKey),
      })
    }

    return cells
  })

  const periodLabel = computed(() => {
    const date = parseDateKey(selectedDateKey.value)
    if (dayDetailOpen.value || calendarViewMode.value === 'week') {
      return new Intl.DateTimeFormat('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date)
    }
    return new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(date)
  })

  function ensureEntry(
    memberId: string | null = activeMemberId.value,
    dateKey = selectedDateKey.value,
    options?: { persistEmpty?: boolean },
  ) {
    if (
      memberId &&
      board.members.length &&
      !board.members.some((member) => member.id === memberId)
    ) {
      error.value = 'Membro inválido para criar tarefa.'
      useToastStore().error(error.value)
      return null
    }
    let entry = entries.value.find(
      (item) =>
        sameMemberId(item.memberId, memberId) && item.dateKey === dateKey,
    )
    if (!entry) {
      entry = emptyEntry(memberId, dateKey)
      entries.value.push(entry)
      // Só grava no banco quando há conteúdo real (evita race com load)
      if (options?.persistEmpty) schedulePersist(entry)
    }
    return entry
  }

  function setViewMode(mode: DailyViewMode) {
    if (mode === 'day') {
      dayDetailOpen.value = true
    } else {
      calendarViewMode.value = mode
      dayDetailOpen.value = false
    }
    persistUi()
  }

  function closeDayDetail() {
    dayDetailOpen.value = false
    persistUi()
  }

  function setDateKey(dateKey: string) {
    selectedDateKey.value = dateKey
    persistUi()
  }

  function openEntry(memberId: string | null, dateKey: string) {
    detailMemberId.value = memberId
    if (memberId && board.memberFilterId) {
      board.setMemberFilter(memberId)
    } else if (!memberId && board.memberFilterId) {
      board.setMemberFilter(null)
    }
    selectedDateKey.value = dateKey
    dayDetailOpen.value = true
    ensureEntry(memberId, dateKey)
    persistUi()
  }

  function shiftPeriod(delta: number) {
    const date = parseDateKey(selectedDateKey.value)
    if (dayDetailOpen.value) date.setDate(date.getDate() + delta)
    else if (calendarViewMode.value === 'week') date.setDate(date.getDate() + delta * 7)
    else date.setMonth(date.getMonth() + delta)
    selectedDateKey.value = toDateKey(date)
    persistUi()
  }

  function goToday() {
    selectedDateKey.value = toDateKey(new Date())
    persistUi()
  }

  function setStatus(status: DailyStatus) {
    const entry = ensureEntry()
    if (!entry) return
    entry.status = status
    entry.updatedAt = new Date().toISOString()
    schedulePersist(entry)
  }

  function setCampaign(campaign: string) {
    const entry = ensureEntry()
    if (!entry) return
    entry.campaign = campaign
    entry.updatedAt = new Date().toISOString()
    schedulePersist(entry)
  }

  function toggleCollapse(todoId: string) {
    const entry = ensureEntry()
    if (!entry) return
    const todo = findTodo(entry.todos, todoId)
    if (!todo || todo.kind !== 'toggle') return
    todo.collapsed = !todo.collapsed
    entry.updatedAt = new Date().toISOString()
    schedulePersist(entry)
  }

  function expandToggle(todoId: string) {
    const entry = ensureEntry()
    if (!entry) return
    const todo = findTodo(entry.todos, todoId)
    if (!todo || todo.kind !== 'toggle') return
    if (!todo.collapsed) return
    todo.collapsed = false
    entry.updatedAt = new Date().toISOString()
    schedulePersist(entry)
  }

  function addTodo(
    text: string,
    parentToggleId?: string | null,
    options?: { afterId?: string },
  ) {
    const trimmed = text.trim()
    // Permite item vazio ao criar linha com Enter (estilo Notion)
    const allowEmpty = Boolean(parentToggleId && options?.afterId !== undefined)
    if (!trimmed && !allowEmpty) return null
    const entry = ensureEntry()
    if (!entry) return null
    const todo: DailyTodoItem = {
      id: createId('td'),
      text: trimmed,
      completed: false,
      kind: 'task',
    }

    if (parentToggleId) {
      const parent = findTodo(entry.todos, parentToggleId)
      if (!parent || parent.kind !== 'toggle') return null
      if (!parent.children) parent.children = []
      const afterId = options?.afterId
      if (afterId) {
        const index = parent.children.findIndex((child) => child.id === afterId)
        if (index >= 0) parent.children.splice(index + 1, 0, todo)
        else parent.children.push(todo)
      } else {
        parent.children.push(todo)
      }
      parent.collapsed = false
    } else {
      entry.todos.push(todo)
    }

    entry.updatedAt = new Date().toISOString()
    if (entry.status === 'done') entry.status = 'in_progress'
    schedulePersist(entry)
    return todo
  }

  function addToggle(text = 'Nova lista') {
    const entry = ensureEntry()
    if (!entry) return null
    const toggle: DailyTodoItem = {
      id: createId('tg'),
      text: text.trim() || 'Nova lista',
      completed: false,
      kind: 'toggle',
      collapsed: false,
      children: [],
    }
    entry.todos.push(toggle)
    entry.updatedAt = new Date().toISOString()
    schedulePersist(entry)
    return toggle
  }

  function toggleTodo(todoId: string) {
    const entry = ensureEntry()
    if (!entry) return
    const todo = findTodo(entry.todos, todoId)
    if (!todo || todo.kind === 'toggle') return
    todo.completed = !todo.completed
    entry.updatedAt = new Date().toISOString()

    const leaves = leafTodos(entry.todos)
    if (leaves.length && leaves.every((item) => item.completed)) {
      entry.status = 'done'
    } else if (leaves.some((item) => item.completed)) {
      entry.status = 'in_progress'
    } else {
      entry.status = 'todo'
    }
    schedulePersist(entry)
  }

  function updateTodoText(todoId: string, text: string) {
    const entry = ensureEntry()
    if (!entry) return
    const todo = findTodo(entry.todos, todoId)
    if (!todo) return
    todo.text = text
    entry.updatedAt = new Date().toISOString()
    schedulePersist(entry)
  }

  function removeTodo(todoId: string) {
    const entry = ensureEntry()
    if (!entry) return
    entry.todos = removeTodoById(entry.todos, todoId)
    entry.updatedAt = new Date().toISOString()
    schedulePersist(entry)
  }

  function appendClonedTodos(
    memberId: string | null,
    dateKey: string,
    todos: DailyTodoItem[],
  ) {
    if (todos.length === 0) return false
    const target = ensureEntry(memberId, dateKey)
    if (!target) return false
    target.todos.push(...todos)
    if (target.status === 'done') target.status = 'in_progress'
    target.updatedAt = new Date().toISOString()
    schedulePersist(target)
    return true
  }

  function targetDateKeys(fromDateKey: string, mode: DailyDuplicateMode) {
    return mode === 'next-day'
      ? [nextDateKey(fromDateKey)]
      : continuousDateKeys(fromDateKey)
  }

  function duplicateEntry(mode: DailyDuplicateMode) {
    const source = currentEntry.value ?? ensureEntry()
    if (!source || source.todos.length === 0) {
      useToastStore().error('Não há tarefas para duplicar.')
      return
    }
    const dates = targetDateKeys(source.dateKey, mode)
    let copied = 0
    for (const dateKey of dates) {
      if (
        appendClonedTodos(
          source.memberId,
          dateKey,
          cloneTodos(source.todos, createId),
        )
      ) {
        copied += 1
      }
    }
    if (copied === 0) {
      useToastStore().error('Não foi possível duplicar as tarefas.')
      return
    }
    useToastStore().success(
      mode === 'continuous'
        ? `Rotina copiada para ${copied} dia${copied === 1 ? '' : 's'}.`
        : 'Tarefas copiadas para o próximo dia.',
    )
  }

  function duplicateTodo(todoId: string, mode: 'same-day' | DailyDuplicateMode) {
    const source = ensureEntry()
    if (!source) return
    const todo = findTodo(source.todos, todoId)
    if (!todo) return

    if (mode === 'same-day') {
      const copy = cloneTodo(todo, createId)
      if (!insertTodoAfter(source.todos, todoId, copy)) {
        source.todos.push(copy)
      }
      if (source.status === 'done') source.status = 'in_progress'
      source.updatedAt = new Date().toISOString()
      schedulePersist(source)
      return
    }

    const dates = targetDateKeys(source.dateKey, mode)
    let copied = 0
    for (const dateKey of dates) {
      if (appendClonedTodos(source.memberId, dateKey, [cloneTodo(todo, createId)])) {
        copied += 1
      }
    }
    if (copied === 0) {
      useToastStore().error('Não foi possível duplicar a tarefa.')
      return
    }
    useToastStore().success(
      mode === 'continuous'
        ? `Tarefa copiada para ${copied} dia${copied === 1 ? '' : 's'}.`
        : 'Tarefa copiada para o próximo dia.',
    )
  }

  const progress = computed(() => entryProgress(currentEntry.value))

  return {
    entries,
    selectedDateKey,
    calendarViewMode,
    dayDetailOpen,
    detailMemberId,
    activeMemberId,
    currentEntry,
    progress,
    weekDays,
    monthCells,
    periodLabel,
    loading,
    ready,
    error,
    init,
    reset,
    sanitizeDetailMember,
    setViewMode,
    closeDayDetail,
    setDateKey,
    openEntry,
    shiftPeriod,
    goToday,
    setStatus,
    setCampaign,
    addTodo,
    addToggle,
    toggleCollapse,
    expandToggle,
    toggleTodo,
    updateTodoText,
    removeTodo,
    duplicateEntry,
    duplicateTodo,
    ensureEntry,
    entryProgress,
  }
})
