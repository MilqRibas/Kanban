import type { Campaign, CampaignPlayerPeriod } from '../types/campaigns'
import {
  campaignDateWindow,
  eventInCampaignWindow,
  periodOverlapsCampaignWindow,
  playerMeetsActivation,
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

/**
 * Rake atribuído à campanha: coorte identifica a origem do jogador, mas o
 * resultado pertence à agência onde a movimentação aconteceu. Só entram
 * semanas em que o jogador estava no Agent ID da campanha (a partir da
 * aquisição). Rake gerado em outra agência pertence à campanha daquela
 * agência — nunca a duas ao mesmo tempo.
 *
 * Granularidade: o vínculo jogador↔agente vem do fechamento semanal do
 * relatório; migração no meio da semana fica com o(s) agente(s) listados
 * naquela semana.
 */
export function attributedPlayerPeriods<T extends CohortPlayerPeriod>(
  members: Pick<CampaignCohortMember, 'playerId' | 'acquiredAt'>[],
  playerPeriods: T[],
  agentId: string | null | undefined,
): T[] {
  if (!agentId || members.length === 0) return []
  const acquiredAtByPlayer = new Map(
    members.map((m) => [m.playerId, m.acquiredAt]),
  )
  return playerPeriods.filter((period) => {
    if (period.agentId !== agentId) return false
    const acquiredAt = acquiredAtByPlayer.get(period.playerId)
    return Boolean(acquiredAt && periodCountsTowardCohortRake(period, acquiredAt))
  })
}

/**
 * Agrega o rake atribuído por semana. "Ativos" da semana = jogadores cujo
 * rake daquela semana cumpre o critério de ativação configurado na campanha
 * (`activationThreshold` via activationRakeThreshold; `null` = regra manual,
 * conta todo jogador presente na semana).
 */
export function aggregateCohortWeeklyRake(
  periods: Array<{
    periodStart: string
    periodEnd?: string | null
    weeklyRake: number
    playerId: string
  }>,
  activationThreshold: number | null,
): WeeklyPeriodPoint[] {
  const byWeek = new Map<
    string,
    {
      periodStart: string
      periodEnd: string
      weeklyRake: number
      rakeByPlayer: Map<string, number>
    }
  >()
  for (const period of periods) {
    const start = isoDay(period.periodStart)
    if (!start) continue
    const end = isoDay(period.periodEnd) || start
    const bucket = byWeek.get(start) ?? {
      periodStart: start,
      periodEnd: end,
      weeklyRake: 0,
      rakeByPlayer: new Map<string, number>(),
    }
    const rake = Number(period.weeklyRake) || 0
    bucket.weeklyRake += rake
    if (end > bucket.periodEnd) bucket.periodEnd = end
    bucket.rakeByPlayer.set(
      period.playerId,
      (bucket.rakeByPlayer.get(period.playerId) ?? 0) + rake,
    )
    byWeek.set(start, bucket)
  }
  return sortPeriodsChronologically(
    [...byWeek.values()].map((bucket) => ({
      periodStart: bucket.periodStart,
      periodEnd: bucket.periodEnd,
      weeklyRake: bucket.weeklyRake,
      uniquePlayers: [...bucket.rakeByPlayer.values()].filter((rake) =>
        playerMeetsActivation(rake, activationThreshold),
      ).length,
    })),
  )
}

export function sumCohortRake(
  members: Pick<CampaignCohortMember, 'playerId' | 'acquiredAt'>[],
  playerPeriods: CohortPlayerPeriod[],
  agentId: string | null | undefined,
): number {
  return sumWeeklyRake(attributedPlayerPeriods(members, playerPeriods, agentId))
}

export type CohortTransaction = {
  receiverPlayerId: string
  agentId: string | null
  occurredAt: string | null
  periodStart: string
  periodEnd?: string | null
}

/**
 * Transações atribuídas à campanha: jogador da coorte, a partir da aquisição,
 * e somente enquanto a movimentação aconteceu no Agent ID da campanha
 * (`t.agentId` é o agente histórico do evento, resolvido na importação).
 * Depósito feito em outra agência pertence à campanha daquela agência.
 */
export function attributedCohortTransactions<T extends CohortTransaction>(
  members: Pick<CampaignCohortMember, 'playerId' | 'acquiredAt'>[],
  transactions: T[],
  agentId: string | null | undefined,
): T[] {
  if (!agentId || members.length === 0) return []
  const acquiredAtByPlayer = new Map(
    members.map((m) => [m.playerId, m.acquiredAt]),
  )
  return transactions.filter((t) => {
    if (t.agentId !== agentId) return false
    const acquiredAt = acquiredAtByPlayer.get(t.receiverPlayerId)
    if (!acquiredAt) return false
    return eventInCampaignWindow(
      t.occurredAt,
      { start: acquiredAt, end: null },
      { periodStart: t.periodStart, periodEnd: t.periodEnd },
    )
  })
}
