export type NoteKind = 'meeting' | 'note'

export interface Note {
  id: string
  title: string
  body: string
  kind: NoteKind
  authorId: string
  createdAt: string
  updatedAt: string
}
