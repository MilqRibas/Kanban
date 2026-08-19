import type { Campaign, CampaignPlayerPeriod } from '../types/campaigns'
import {
  campaignDateWindow,
  periodOverlapsCampaignWindow,
  sortPeriodsChronologically,
  sumWeeklyRake,
  type WeeklyPeriodPoint,
} from './campaignWeeklyMetrics'

export type CampaignCohortMember = {
  campaignId: string
  playerId: string
  acquiredAt: string
  sourceAgentId: string
  firstSeenWeek: string
  lastSeenWeek: string
  currentAgentId: string
}

export type CohortPlayerPeriod = Pick<
  CampaignPlayerPeriod,
  | 'playerId'
  | 'agentId'
  | 'periodStart'
  | 'periodEnd'
  | 'weeklyRake'
  | 'playerName'
  | 'nickname'
>

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null
  const day = String(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** Janela usada só para descobrir Player IDs no Agent ID da campanha. */
export function acquisitionWindow(campaign: {
  startDate?: string | null
  endDate?: string | null
}) {
  return campaignDateWindow(campaign)
}

export function playerAppearedInAcquisitionWindow(
  period: { agentId: string; periodStart: string; periodEnd?: string | null },
  campaign: { agentId?: string | null; startDate?: string | null; endDate?: string | null },
): boolean {
  if (!campaign.agentId || period.agentId !== campaign.agentId) return false
  return periodOverlapsCampaignWindow(period, acquisitionWindow(campaign))
}

/** Semana do jogador conta no rake da campanha a partir da entrada na coorte. */
export function periodCountsTowardCohortRake(
  period: { periodStart: string },
  acquiredAt: string,
): boolean {
  const start = isoDay(period.periodStart)
  const acquired = isoDay(acquiredAt)
  if (!start || !acquired) return false
  return start >= acquired
}

/**
 * Player IDs que apareceram no Agent ID da campanha durante a janela de aquisição.
 * `end_date` nulo continua aceitando novos jogadores.
 */
export function discoverCampaignCohort(
  campaign: Pick<Campaign, 'id' | 'agentId' | 'startDate' | 'endDate'>,
  playerPeriods: CohortPlayerPeriod[],
): CampaignCohortMember[] {
  if (!campaign.agentId) return []

  const firstByPlayer = new Map<
    string,
    { acquiredAt: string; sourceAgentId: string }
  >()

  for (const period of playerPeriods) {
    if (!playerAppearedInAcquisitionWindow(period, campaign)) continue
    const week = isoDay(period.periodStart)
    if (!week) continue
    const prev = firstByPlayer.get(period.playerId)
    if (!prev || week < prev.acquiredAt) {
      firstByPlayer.set(period.playerId, {
        acquiredAt: week,
        sourceAgentId: period.agentId,
      })
    }
  }

  const latestByPlayer = new Map<
    string,
    { lastSeenWeek: string; currentAgentId: string }
  >()
  for (const period of playerPeriods) {
    const member = firstByPlayer.get(period.playerId)
    if (!member || !periodCountsTowardCohortRake(period, member.acquiredAt)) {
      continue
    }
    const week = isoDay(period.periodStart)
    if (!week) continue
    const prev = latestByPlayer.get(period.playerId)
    if (!prev || week >= prev.lastSeenWeek) {
      latestByPlayer.set(period.playerId, {
        lastSeenWeek: week,
        currentAgentId: period.agentId,
      })
    }
  }

  return [...firstByPlayer.entries()]
    .map(([playerId, first]) => {
      const latest = latestByPlayer.get(playerId)
      return {
        campaignId: campaign.id,
        playerId,
        acquiredAt: first.acquiredAt,
        sourceAgentId: first.sourceAgentId,
        firstSeenWeek: first.acquiredAt,
        lastSeenWeek: latest?.lastSeenWeek ?? first.acquiredAt,
        currentAgentId: latest?.currentAgentId ?? first.sourceAgentId,
      }
    })
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
}

export function attributedPlayerPeriods<T extends CohortPlayerPeriod>(
  members: Pick<CampaignCohortMember, 'playerId' | 'acquiredAt'>[],
  playerPeriods: T[],
): T[] {
  if (members.length === 0) return []
  const acquiredAtByPlayer = new Map(
    members.map((m) => [m.playerId, m.acquiredAt]),
  )
  return playerPeriods.filter((period) => {
    const acquiredAt = acquiredAtByPlayer.get(period.playerId)
    return Boolean(acquiredAt && periodCountsTowardCohortRake(period, acquiredAt))
  })
}

export function aggregateCohortWeeklyRake(
  periods: Array<{
    periodStart: string
    periodEnd?: string | null
    weeklyRake: number
    playerId: string
  }>,
): WeeklyPeriodPoint[] {
  const byWeek = new Map<
    string,
    { periodStart: string; periodEnd: string; weeklyRake: number; players: Set<string> }
  >()
  for (const period of periods) {
    const start = isoDay(period.periodStart)
    if (!start) continue
    const end = isoDay(period.periodEnd) || start
    const bucket = byWeek.get(start) ?? {
      periodStart: start,
      periodEnd: end,
      weeklyRake: 0,
      players: new Set<string>(),
    }
    bucket.weeklyRake += Number(period.weeklyRake) || 0
    if (end > bucket.periodEnd) bucket.periodEnd = end
    bucket.players.add(period.playerId)
    byWeek.set(start, bucket)
  }
  return sortPeriodsChronologically(
    [...byWeek.values()].map((bucket) => ({
      periodStart: bucket.periodStart,
      periodEnd: bucket.periodEnd,
      weeklyRake: bucket.weeklyRake,
      uniquePlayers: bucket.players.size,
    })),
  )
}

export function sumCohortRake(
  members: Pick<CampaignCohortMember, 'playerId' | 'acquiredAt'>[],
  playerPeriods: CohortPlayerPeriod[],
): number {
  return sumWeeklyRake(attributedPlayerPeriods(members, playerPeriods))
}
