export type AgendaEvent = {
  id: string
  boardId: string
  title: string
  description: string | null
  /** YYYY-MM-DD */
  eventDate: string
  /** HH:mm opcional */
  eventTime: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type AgendaEventDraft = {
  title: string
  description?: string | null
  eventDate: string
  eventTime?: string | null
}
