import { describe, expect, it } from 'vitest'
import {
  cloneTodo,
  cloneTodos,
  continuousDateKeys,
  entryLookupKey,
  insertTodoAfter,
  nextDateKey,
  sameMemberId,
} from './dailyEntries'
import type { DailyTodoItem } from '../types/daily'

function ids() {
  let n = 0
  return (prefix: string) => `${prefix}-${++n}`
}

describe('unassigned daily entries', () => {
  it('treats null and missing member as the same responsible', () => {
    expect(sameMemberId(null, undefined)).toBe(true)
    expect(sameMemberId('m1', null)).toBe(false)
    expect(entryLookupKey(null, '2026-09-01')).toBe('unassigned:2026-09-01')
  })
})

describe('duplicate daily todos', () => {
  const source: DailyTodoItem = {
    id: 'td-orig',
    text: 'Relatórios Mensais',
    completed: true,
    kind: 'task',
  }

  it('clones a task with a new id and resets completion', () => {
    const copy = cloneTodo(source, ids())
    expect(copy.id).not.toBe(source.id)
    expect(copy.text).toBe('Relatórios Mensais')
    expect(copy.completed).toBe(false)
  })

  it('clones every item in a list, including toggle children', () => {
    const todos: DailyTodoItem[] = [
      source,
      {
        id: 'tg-1',
        text: 'Rotina',
        completed: false,
        kind: 'toggle',
        children: [
          { id: 'td-2', text: 'Abrir caixa', completed: true, kind: 'task' },
        ],
      },
    ]
    const copies = cloneTodos(todos, ids())
    expect(copies).toHaveLength(2)
    expect(copies[1].children).toHaveLength(1)
    expect(copies[1].children?.[0].id).not.toBe('td-2')
    expect(copies[1].children?.[0].completed).toBe(false)
  })

  it('inserts the duplicate after the original task', () => {
    const todos: DailyTodoItem[] = [
      { id: 'a', text: 'A', completed: false, kind: 'task' },
      { id: 'b', text: 'B', completed: false, kind: 'task' },
    ]
    const ok = insertTodoAfter(todos, 'a', {
      id: 'a-copy',
      text: 'A',
      completed: false,
      kind: 'task',
    })
    expect(ok).toBe(true)
    expect(todos.map((item) => item.id)).toEqual(['a', 'a-copy', 'b'])
  })

  it('copies to the next day', () => {
    expect(nextDateKey('2026-09-01')).toBe('2026-09-02')
  })

  it('repeats a continuous routine through the rest of the week', () => {
    expect(continuousDateKeys('2026-09-01')).toEqual([
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ])
  })

  it('uses the next 6 days when the source is the last day of the week', () => {
    expect(continuousDateKeys('2026-09-05')).toEqual([
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ])
  })
})
