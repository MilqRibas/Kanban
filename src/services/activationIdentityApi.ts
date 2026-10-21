import { BOARD_ID, supabase } from '../lib/supabase'
import type {
  ActivationLookupResult,
  IdentityAuditItem,
  IdentityPhone,
  IdentityPlayerLink,
  OperationalIdentity,
} from '../types/activationIdentity'

function asString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s ? s : null
}

function mapPhone(raw: Record<string, unknown>): IdentityPhone {
  return {
    id: asString(raw.id) ?? undefined,
    phoneE164: String(raw.phoneE164 ?? raw.phone_e164 ?? ''),
    phoneRaw: asString(raw.phoneRaw ?? raw.phone_raw),
    source: String(raw.source ?? 'manual'),
    status: String(raw.status ?? raw.confirmation_status ?? 'pending'),
    confirmedAt: asString(raw.confirmedAt ?? raw.confirmed_at),
    confirmedBy: asString(raw.confirmedBy ?? raw.confirmed_by),
  }
}

function mapLink(raw: Record<string, unknown>): IdentityPlayerLink {
  return {
    playerId: String(raw.playerId ?? raw.player_id ?? ''),
    status: String(raw.status ?? raw.link_status ?? 'confirmed'),
    confirmedAt: asString(raw.confirmedAt ?? raw.confirmed_at),
    confirmedBy: asString(raw.confirmedBy ?? raw.confirmed_by),
  }
}

export async function lookupActivationPlayer(
  playerId: string,
): Promise<ActivationLookupResult> {
  const { data, error } = await supabase.rpc('crm_activation_lookup', {
    p_board_id: BOARD_ID,
    p_player_id: playerId.trim(),
  })
  if (error) throw new Error(error.message)

  const payload = (data ?? {}) as Record<string, unknown>
  const found = Boolean(payload.found)
  const phonesRaw = Array.isArray(payload.phones) ? payload.phones : []
  const linkedRaw = Array.isArray(payload.linkedPlayerIds)
    ? payload.linkedPlayerIds
    : []
  const clubsRaw = Array.isArray(payload.clubs) ? payload.clubs : []

  return {
    found,
    playerId: String(payload.playerId ?? playerId),
    message: asString(payload.message) ?? undefined,
    clubs: clubsRaw.map((c) => String(c)),
    identityId: asString(payload.identityId),
    phones: phonesRaw.map((p) => mapPhone(p as Record<string, unknown>)),
    linkedPlayerIds: linkedRaw.map((p) => mapLink(p as Record<string, unknown>)),
    player360:
      payload.player360 && typeof payload.player360 === 'object'
        ? (payload.player360 as Record<string, unknown>)
        : null,
  }
}

export async function getOperationalIdentity(
  playerId: string,
): Promise<OperationalIdentity> {
  const { data, error } = await supabase.rpc('crm_get_operational_identity', {
    p_board_id: BOARD_ID,
    p_player_id: playerId.trim(),
  })
  if (error) throw new Error(error.message)

  const payload = (data ?? {}) as Record<string, unknown>
  const phonesRaw = Array.isArray(payload.phones) ? payload.phones : []
  const playersRaw = Array.isArray(payload.playerIds) ? payload.playerIds : []
  const auditRaw = Array.isArray(payload.audit) ? payload.audit : []

  return {
    found: Boolean(payload.found),
    identityId: asString(payload.identityId),
    referenceName: asString(payload.referenceName),
    status: asString(payload.status),
    phones: phonesRaw.map((p) => mapPhone(p as Record<string, unknown>)),
    playerIds: playersRaw.map((p) => mapLink(p as Record<string, unknown>)),
    audit: auditRaw.map((a) => {
      const row = a as Record<string, unknown>
      return {
        operation: String(row.operation ?? ''),
        occurredAt: String(row.occurredAt ?? row.occurred_at ?? ''),
        actorId: asString(row.actorId ?? row.actor_id),
        after:
          row.after && typeof row.after === 'object'
            ? (row.after as Record<string, unknown>)
            : null,
      } satisfies IdentityAuditItem
    }),
  }
}

export async function confirmIdentityPhone(input: {
  playerId: string
  phoneE164: string
  phoneRaw?: string | null
  source?: 'whatsapp_web' | 'manual' | 'import'
  contactName?: string | null
}): Promise<{ ok: boolean; conflict?: boolean; message?: string; identityId?: string }> {
  const { data, error } = await supabase.rpc('crm_confirm_identity_phone', {
    p_board_id: BOARD_ID,
    p_player_id: input.playerId.trim(),
    p_phone_e164: input.phoneE164.trim(),
    p_phone_raw: input.phoneRaw ?? null,
    p_source: input.source ?? 'manual',
    p_contact_name: input.contactName ?? null,
  })
  if (error) throw new Error(error.message)
  const payload = (data ?? {}) as Record<string, unknown>
  return {
    ok: Boolean(payload.ok),
    conflict: Boolean(payload.conflict),
    message: asString(payload.message) ?? undefined,
    identityId: asString(payload.identityId) ?? undefined,
  }
}

export async function associatePlayerIds(
  primaryPlayerId: string,
  associatePlayerId: string,
): Promise<{
  ok: boolean
  conflict?: boolean
  alreadyLinked?: boolean
  message?: string
  identityId?: string
}> {
  const { data, error } = await supabase.rpc('crm_associate_player_ids', {
    p_board_id: BOARD_ID,
    p_primary_player_id: primaryPlayerId.trim(),
    p_associate_player_id: associatePlayerId.trim(),
  })
  if (error) throw new Error(error.message)
  const payload = (data ?? {}) as Record<string, unknown>
  return {
    ok: Boolean(payload.ok),
    conflict: Boolean(payload.conflict),
    alreadyLinked: Boolean(payload.alreadyLinked),
    message: asString(payload.message) ?? undefined,
    identityId: asString(payload.identityId) ?? undefined,
  }
}
