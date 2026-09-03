import type { DailyTodoItem } from '../types/daily'

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfWeek(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}

export function sameMemberId(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return (a ?? null) === (b ?? null)
}

export function entryLookupKey(
  memberId: string | null | undefined,
  dateKey: string,
) {
  return `${memberId ?? 'unassigned'}:${dateKey}`
}

export function nextDateKey(dateKey: string) {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + 1)
  return toDateKey(date)
}

/** Dias seguintes da semana atual; se já for o último, os 6 dias seguintes. */
export function continuousDateKeys(fromDateKey: string): string[] {
  const from = parseDateKey(fromDateKey)
  const weekStart = startOfWeek(from)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const keys: string[] = []
  const cursor = new Date(from)
  cursor.setDate(cursor.getDate() + 1)
  while (cursor <= weekEnd) {
    keys.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  if (keys.length > 0) return keys

  const extra = new Date(from)
  for (let i = 0; i < 6; i++) {
    extra.setDate(extra.getDate() + 1)
    keys.push(toDateKey(extra))
  }
  return keys
}

export function cloneTodo(
  item: DailyTodoItem,
  createId: (prefix: string) => string,
): DailyTodoItem {
  const kind = item.kind === 'toggle' ? 'toggle' : 'task'
  return {
    id: createId(kind === 'toggle' ? 'tg' : 'td'),
    text: item.text,
    completed: false,
    highlighted: item.highlighted,
    kind,
    collapsed: kind === 'toggle' ? false : item.collapsed,
    children:
      kind === 'toggle'
        ? (item.children ?? []).map((child) => cloneTodo(child, createId))
        : undefined,
  }
}

export function cloneTodos(
  todos: DailyTodoItem[],
  createId: (prefix: string) => string,
): DailyTodoItem[] {
  return todos.map((item) => cloneTodo(item, createId))
}

export function insertTodoAfter(
  todos: DailyTodoItem[],
  afterId: string,
  next: DailyTodoItem,
): boolean {
  const index = todos.findIndex((item) => item.id === afterId)
  if (index >= 0) {
    todos.splice(index + 1, 0, next)
    return true
  }
  for (const item of todos) {
    if (item.children && insertTodoAfter(item.children, afterId, next)) {
      return true
    }
  }
  return false
}
