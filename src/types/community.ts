export interface CommunityContent {
  id: string
  title: string
  body: string
  status: string
  contentType: string
  objective: string
  community: string
  fds: string
  publishDate: string | null
  authorId: string | null
  createdAt: string
  updatedAt: string
}

export type HubSectionKind = 'link' | 'folder' | 'community_calendar' | 'note'

export interface HubSection {
  id: string
  parent: string
  title: string
  kind: HubSectionKind
  description: string
  eyebrow: string
  url: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export const CONTENT_STATUS_OPTIONS = [
  'Rascunho',
  'Em produção',
  'Pronto',
  'Enviado',
] as const
