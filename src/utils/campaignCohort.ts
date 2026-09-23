import type { Campaign, CampaignPlayerPeriod } from '../types/campaigns'
import {
  isIncentiveTransaction,
  sumIncentiveSent,
} from './crmIncentiveEconomics'
import {
  eventInCampaignWindow,
  lifetimeFromAcquisition,
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

/**
 * Janela de elegibilidade da coorte no Agent ID.
 * `startDate` marca o início da campanha; `endDate` é só registro do período
 * em que a campanha rodou e NÃO fecha a coorte — jogadores e rake posteriores
 * continuam atribuídos enquanto estiverem no Agent ID.
 */
export function acquisitionWindow(campaign: {
  startDate?: string | null
  endDate?: string | null
}) {
  void campaign.endDate
  return {
    start: isoDay(campaign.startDate),
    end: null,
  }
}

export function playerAppearedInAcquisitionWindow(
  period: { agentId: string; periodStart: string; periodEnd?: string | null },
  campaign: { agentId?: string | null; startDate?: string | null; endDate?: string | null },
): boolean {
  if (!campaign.agentId || period.agentId !== campaign.agentId) return false
  return periodOverlapsCampaignWindow(period, acquisitionWindow(campaign))
}

/** Semana do jogador conta no rake da campanha a partir da entrada na coorte (LTV). */
export function periodCountsTowardCohortRake(
  period: { periodStart: string },
  acquiredAt: string,
): boolean {
  const start = isoDay(period.periodStart)
  const acquired = isoDay(acquiredAt)
  if (!start || !acquired) return false
  // Regra de negócio: rake acumulado não é cortado pelo endDate da campanha.
  return start >= acquired
}

/**
 * Player IDs no Agent ID da campanha a partir do início (`startDate`).
 * O fim cadastrado não limita novos jogadores nem o rake posterior.
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
 * Rake atribuído à campanha (regra de negócio LTV):
 * - Coorte = Player IDs no Agent ID a partir de `startDate` (sem corte por `endDate`).
 * - Rake acumulado = todas as semanas desse jogador no Agent ID da campanha
 *   a partir de `acquiredAt`, inclusive depois do período cadastrado da campanha.
 * - Rake gerado em outra agência pertence à campanha daquela agência.
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
 * Transações atribuídas à campanha (mesma regra LTV do rake): jogador da
 * coorte, a partir da aquisição, sem corte pelo endDate, somente enquanto a
 * movimentação aconteceu no Agent ID da campanha.
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
      lifetimeFromAcquisition(acquiredAt),
      { periodStart: t.periodStart, periodEnd: t.periodEnd },
    )
  })
}

export type ActivationBonusRow = CohortTransaction & {
  isBonus: boolean
  amount?: number
  senderPlayerId?: string | null
  /** Preferir externalTransactionId; fallback id para dedupe. */
  externalTransactionId?: string | null
  id?: string
}

/**
 * Custo de ativação da campanha = incentivo atribuído à coorte:
 * Sender MKT GT OR Bônus (união, sem duplicar a mesma TX).
 * Se o jogador também foi adquirido por outra campanha e o envio foi no
 * Agent ID dela, aquela campanha fica com o valor.
 */
export function attributedActivationBonuses<T extends ActivationBonusRow>(params: {
  members: Pick<CampaignCohortMember, 'playerId'>[]
  campaignAgentId: string | null | undefined
  transactions: T[]
  competing: Array<{ agentId: string | null; playerIds: string[] }>
}): T[] {
  const memberIds = new Set(params.members.map((m) => m.playerId))
  if (memberIds.size === 0) return []

  const claimedElsewhere = (playerId: string, agentId: string | null) =>
    params.competing.some(
      (campaign) =>
        Boolean(campaign.agentId) &&
        campaign.agentId === agentId &&
        campaign.playerIds.includes(playerId),
    )

  return params.transactions.filter((row) => {
    if (
      !isIncentiveTransaction({
        senderPlayerId: row.senderPlayerId,
        isBonus: row.isBonus,
      })
    ) {
      return false
    }
    if (!memberIds.has(row.receiverPlayerId)) return false
    if (claimedElsewhere(row.receiverPlayerId, row.agentId)) return false
    return true
  })
}

export function sumActivationBonuses(
  rows: Array<{
    isBonus?: boolean
    amount?: number
    senderPlayerId?: string | null
    externalTransactionId?: string | null
    id?: string
  }>,
): number {
  const incentiveRows = rows.filter((row) =>
    isIncentiveTransaction({
      senderPlayerId: row.senderPlayerId,
      isBonus: row.isBonus,
    }),
  )
  return sumIncentiveSent(
    incentiveRows.map((row) => ({
      amount: Number(row.amount) || 0,
      externalTransactionId:
        row.externalTransactionId ?? row.id ?? undefined,
    })),
  )
}
