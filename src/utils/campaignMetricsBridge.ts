/** Re-export safeDivide to avoid circular imports with campaignMetrics. */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (denominator === 0) return null
  const result = numerator / denominator
  return Number.isFinite(result) ? result : null
}

export const GAME_TYPE_LABELS: Record<string, string> = {
  RG: 'Ring Game',
  MTT: 'Torneio',
  SNG: 'Sit And Go',
  RODEO: 'Rodeo',
}
