export type DailyStatus = 'todo' | 'in_progress' | 'done'

export interface DailyTodoItem {
  id: string
  text: string
  completed: boolean
  highlighted?: boolean
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
