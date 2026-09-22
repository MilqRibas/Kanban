/**
 * Chaves de conflito do relatório de rake/agentes.
 * Conflito = mesmo período + mesmo clube (+ slot name / agent).
 */

import type { ClubCode } from './clubDimension'

export function normalizeSlotName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Histórico sem clube conta como SX legado na comparação.
 * Xtreme nunca casa com NULL.
 */
export function rakeClubsMatch(
  existingClub: string | null | undefined,
  incomingClub: string | null | undefined,
): boolean {
  const existing = existingClub || null
  const incoming = incomingClub || null
  if (existing === incoming) return true
  if (incoming === 'sx_club' && existing == null) return true
  return false
}

export function rakeSlotsMatch(
  existingSlot: string | null | undefined,
  incomingSlot: string | null | undefined,
): boolean {
  return normalizeSlotName(existingSlot) === normalizeSlotName(incomingSlot)
}

export function resolveRakeImportClub(params: {
  fileClubCode?: ClubCode | null
  importClub?: ClubCode | null
}): ClubCode | null {
  return params.fileClubCode ?? params.importClub ?? null
}

export type RakeConflictAgentIncoming = {
  agentId: string
  period: { start: string; end: string }
  slotName?: string | null
}

export type RakeConflictAgentExisting = {
  agentId: string
  periodStart: string
  periodEnd: string
  importId: string
  clubCode?: string | null
  slotName?: string | null
}

export function findRakeImportConflicts(params: {
  incomingAgents: RakeConflictAgentIncoming[]
  existingPeriods: RakeConflictAgentExisting[]
  incomingClub: string | null
}): RakeConflictAgentExisting[] {
  const { incomingAgents, existingPeriods, incomingClub } = params
  return existingPeriods.filter((period) => {
    if (!rakeClubsMatch(period.clubCode, incomingClub)) return false
    return incomingAgents.some(
      (agent) =>
        agent.agentId === period.agentId &&
        agent.period.start === period.periodStart &&
        agent.period.end === period.periodEnd &&
        rakeSlotsMatch(period.slotName, agent.slotName),
    )
  })
}
