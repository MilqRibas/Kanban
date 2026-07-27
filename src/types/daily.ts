export type DailyStatus = 'todo' | 'in_progress' | 'done'

export type DailyTodoKind = 'task' | 'toggle'

export interface DailyTodoItem {
  id: string
  text: string
  completed: boolean
  highlighted?: boolean
  /** task = checkbox; toggle = lista alternante (dropdown) */
  kind?: DailyTodoKind
  /** Só para kind=toggle — inicia aberta */
  collapsed?: boolean
  /** Itens dentro de uma lista alternante */
  children?: DailyTodoItem[]
}

export interface DailyEntry {
  id: string
  memberId: string
  /** YYYY-MM-DD */
  dateKey: string
  status: DailyStatus
  campaign: string
  todos: DailyTodoItem[]
  updatedAt: string
}
