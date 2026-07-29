export interface CommunityContent {
  id: string
  sectionId: string | null
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
  starred: boolean
  position: number
  createdAt: string
  updatedAt: string
}

export const CONTENT_STATUS_OPTIONS = [
  'Rascunho',
  'Em produção',
  'Pronto',
  'Não enviado',
  'Enviado',
] as const

export type ContentStatus = (typeof CONTENT_STATUS_OPTIONS)[number]

/** Cores compartilhadas: painel do conteúdo + chips do calendário */
export const CONTENT_STATUS_STYLES: Record<string, string> = {
  Rascunho: 'bg-white/10 text-text-secondary',
  'Em produção': 'bg-amber-500/20 text-amber-200',
  Pronto: 'bg-sky-500/20 text-sky-200',
  'Não enviado': 'bg-danger/25 text-danger',
  Enviado: 'bg-emerald-500/20 text-emerald-300',
}

export function contentStatusStyle(status: string | null | undefined) {
  if (!status) return CONTENT_STATUS_STYLES.Rascunho
  return CONTENT_STATUS_STYLES[status] ?? CONTENT_STATUS_STYLES.Rascunho
}
