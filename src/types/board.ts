export type LabelColor =
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'blue'
  | 'sky'
  | 'lime'

export interface Label {
  id: string
  name: string
  color: LabelColor
}

export interface Member {
  id: string
  name: string
  initials: string
  avatarColor: string
  avatarUrl?: string | null
  userId?: string | null
  email?: string | null
  isAdmin?: boolean
}

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
  /** Multiple assignees per checklist item */
  assigneeIds: string[]
  dueDate?: string | null
}

export interface Checklist {
  id: string
  title: string
  items: ChecklistItem[]
}

export interface Comment {
  id: string
  authorId: string
  body: string
  createdAt: string
  updatedAt?: string | null
}

export interface Attachment {
  id: string
  name: string
  url: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  kind?: 'file' | 'link'
}

export type NotificationType = 'checklist_assign' | 'mention'

export interface AppNotification {
  id: string
  boardId: string
  recipientMemberId: string
  actorMemberId: string | null
  cardId: string | null
  type: NotificationType
  title: string
  body: string
  readAt: string | null
  createdAt: string
  meta?: Record<string, unknown>
}

export interface Card {
  id: string
  columnId: string
  title: string
  description: string
  labelIds: string[]
  memberIds: string[]
  startDate: string | null
  dueDate: string | null
  checklists: Checklist[]
  comments: Comment[]
  attachments: Attachment[]
  completed: boolean
  archivedAt: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export interface Column {
  id: string
  title: string
  position: number
  isDoneColumn?: boolean
}

export interface Board {
  id: string
  title: string
  columns: Column[]
  cards: Card[]
  labels: Label[]
  members: Member[]
}

export const LABEL_COLOR_MAP: Record<LabelColor, string> = {
  green: '#4bce97',
  yellow: '#e2b203',
  orange: '#f5cd47',
  red: '#f87168',
  purple: '#9f8fef',
  blue: '#579dff',
  sky: '#6cc3e0',
  lime: '#94c748',
}
