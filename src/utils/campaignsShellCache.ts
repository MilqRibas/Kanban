/** Cache leve do shell de campanhas (sessionStorage). */

const CACHE_PREFIX = 'sx.campaigns.shell'
const CACHE_VERSION = 1

export type CampaignsShellCache = {
  v: number
  boardId: string
  savedAt: number
  campaigns: Record<string, unknown>[]
  agents: Record<string, unknown>[]
  imports: Record<string, unknown>[]
  transactionImports: Record<string, unknown>[]
  monthlyResults: Record<string, unknown>[]
  history: Record<string, unknown>[]
  agentPeriods: Record<string, unknown>[]
  playerPeriods: Record<string, unknown>[]
  cohortPlayers: Record<string, unknown>[]
}

function cacheKey(boardId: string) {
  return `${CACHE_PREFIX}:v${CACHE_VERSION}:${boardId}`
}

export function readCampaignsShellCache(
  boardId: string,
  maxAgeMs = 30 * 60 * 1000,
): CampaignsShellCache | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(boardId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CampaignsShellCache
    if (parsed.v !== CACHE_VERSION || parsed.boardId !== boardId) return null
    if (Date.now() - parsed.savedAt > maxAgeMs) return null
    return parsed
  } catch {
    return null
  }
}

export function writeCampaignsShellCache(payload: CampaignsShellCache) {
  try {
    sessionStorage.setItem(cacheKey(payload.boardId), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function clearCampaignsShellCache(boardId: string) {
  try {
    sessionStorage.removeItem(cacheKey(boardId))
  } catch {
    /* ignore */
  }
}
