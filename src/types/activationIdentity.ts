/** Identidade operacional — Agentes de Ativação / SX B2C Assistant. */

export type IdentityPhone = {
  id?: string
  phoneE164: string
  phoneRaw: string | null
  source: string
  status: string
  confirmedAt: string | null
  confirmedBy?: string | null
}

export type IdentityPlayerLink = {
  playerId: string
  status: string
  confirmedAt: string | null
  confirmedBy?: string | null
}

export type IdentityAuditItem = {
  operation: string
  occurredAt: string
  actorId: string | null
  after: Record<string, unknown> | null
}

export type OperationalIdentity = {
  found: boolean
  identityId: string | null
  referenceName: string | null
  status: string | null
  phones: IdentityPhone[]
  playerIds: IdentityPlayerLink[]
  audit: IdentityAuditItem[]
}

export type ActivationLookupResult = {
  found: boolean
  playerId: string
  message?: string
  clubs: string[]
  identityId: string | null
  phones: IdentityPhone[]
  linkedPlayerIds: IdentityPlayerLink[]
  /** Payload bruto do crm_get_player_360 quando found. */
  player360: Record<string, unknown> | null
}

export const EXTENSION_META = {
  name: 'SX B2C Assistant',
  version: '0.1.1',
  compatibility: 'Chrome e Edge (Manifest V3)',
  packagePath: 'extension/',
} as const
