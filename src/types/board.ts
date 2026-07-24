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

export interface Card {
  id: string
  columnId: string
  title: string
  description: string
  labelIds: string[]
  memberIds: string[]
  dueDate: string | null
  checklists: Checklist[]
  comments: Comment[]
  attachments: Attachment[]
  completed: boolean
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
