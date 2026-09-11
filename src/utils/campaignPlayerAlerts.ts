import { inclusiveDayCount } from './campaignWeeklyMetrics'

export type AlertPriority = 'high' | 'medium' | 'low'

export type CampaignPlayerAlertKind =
  | 'relevant_inactive'
  | 'sharp_drop'
  | 'high_value_deceleration'
  | 'player_return'
  | 'new_standout'

export type CampaignPlayerAlert = {
  id: string
  kind: CampaignPlayerAlertKind
  priority: AlertPriority
  /** Chave canônica — nunca nickname. */
  playerId: string
  nickname: string | null
  title: string
  details: Array<{ label: string; value: string }>
  score: number
}

export type AlertPlayerPeriod = {
  playerId: string
  periodStart: string
  periodEnd?: string | null
  weeklyRake: number
  playerName?: string | null
  nickname?: string | null
}

export type AlertCohortMember = {
  playerId: string
  acquiredAt: string
}

const PRIORITY_RANK: Record<AlertPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const KIND_LABELS: Record<CampaignPlayerAlertKind, string> = {
  relevant_inactive: 'Possível perda de jogador relevante',
  sharp_drop: 'Queda brusca de atividade',
  high_value_deceleration: 'Jogador de alto valor desacelerando',
  player_return: 'Retorno de jogador',
  new_standout: 'Novo destaque',
}

export const ALERT_PRIORITY_LABELS: Record<AlertPriority, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null
  const day = String(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

function displayName(periods: AlertPlayerPeriod[], playerId: string): string | null {
  const row = periods.find((p) => p.playerId === playerId)
  return row?.nickname || row?.playerName || null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatPercent(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}%`
}

function formatDate(iso: string): string {
  const day = isoDay(iso)
  if (!day) return '—'
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

function priorityFromShare(
  sharePct: number,
  rank: number,
  severityBoost = 0,
): AlertPriority {
  const score = sharePct + Math.max(0, 12 - rank) + severityBoost
  if (score >= 22 || sharePct >= 15) return 'high'
  if (score >= 10 || sharePct >= 5) return 'medium'
  return 'low'
}

type PlayerSeries = {
  playerId: string
  nickname: string | null
  acquiredAt: string | null
  totalRake: number
  sharePct: number
  rank: number
  weeks: Array<{ periodStart: string; periodEnd: string; weeklyRake: number }>
  lastActiveStart: string | null
  lastActiveEnd: string | null
}

function buildPlayerSeries(params: {
  periods: AlertPlayerPeriod[]
  members: AlertCohortMember[]
}): PlayerSeries[] {
  const acquired = new Map(params.members.map((m) => [m.playerId, m.acquiredAt]))
  const byPlayer = new Map<string, AlertPlayerPeriod[]>()
  for (const period of params.periods) {
    const list = byPlayer.get(period.playerId) ?? []
    list.push(period)
    byPlayer.set(period.playerId, list)
  }

  const campaignTotal = params.periods.reduce(
    (sum, p) => sum + (Number(p.weeklyRake) || 0),
    0,
  )

  const series: PlayerSeries[] = []
  for (const [playerId, rows] of byPlayer) {
    const weeks = [...rows]
      .map((r) => ({
        periodStart: isoDay(r.periodStart) || r.periodStart,
        periodEnd: isoDay(r.periodEnd) || isoDay(r.periodStart) || r.periodStart,
        weeklyRake: Number(r.weeklyRake) || 0,
      }))
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    const totalRake = weeks.reduce((sum, w) => sum + w.weeklyRake, 0)
    const activeWeeks = weeks.filter((w) => w.weeklyRake > 0)
    const lastActive = activeWeeks[activeWeeks.length - 1] ?? null
    series.push({
      playerId,
      nickname: displayName(params.periods, playerId),
      acquiredAt: acquired.get(playerId) ?? null,
      totalRake,
      sharePct: campaignTotal > 0 ? (totalRake / campaignTotal) * 100 : 0,
      rank: 0,
      weeks,
      lastActiveStart: lastActive?.periodStart ?? null,
      lastActiveEnd: lastActive?.periodEnd ?? null,
    })
  }

  series.sort((a, b) => b.totalRake - a.totalRake)
  series.forEach((row, index) => {
    row.rank = index + 1
  })
  return series
}

function isRelevant(player: PlayerSeries): boolean {
  return player.sharePct >= 5 || player.rank <= 5
}

/**
 * Alertas comportamentais derivados dos períodos atribuídos da campanha.
 * Identidade sempre por `playerId`.
 */
export function buildCampaignPlayerAlerts(params: {
  periods: AlertPlayerPeriod[]
  members: AlertCohortMember[]
  /** Fim da última semana importada da campanha (referência temporal). */
  referencePeriodEnd?: string | null
}): CampaignPlayerAlert[] {
  if (params.periods.length === 0) return []

  const series = buildPlayerSeries(params)
  const allWeekStarts = [
    ...new Set(params.periods.map((p) => isoDay(p.periodStart)).filter(Boolean)),
  ].sort() as string[]
  const latestWeekStart = allWeekStarts[allWeekStarts.length - 1] ?? null
  const referenceEnd =
    isoDay(params.referencePeriodEnd) ||
    series.reduce<string | null>((max, p) => {
      if (!p.lastActiveEnd) return max
      if (!max || p.lastActiveEnd > max) return p.lastActiveEnd
      return max
    }, null)

  const alerts: CampaignPlayerAlert[] = []

  for (const player of series) {
    if (!isRelevant(player) && player.sharePct < 8) {
      // Novo destaque pode subir com share alto mesmo fora do top; demais precisam relevância.
    }

    // 1) Relevante inativo
    if (
      isRelevant(player) &&
      player.lastActiveEnd &&
      referenceEnd &&
      player.lastActiveEnd < referenceEnd
    ) {
      const inactiveDays = inclusiveDayCount(player.lastActiveEnd, referenceEnd)
      if (inactiveDays != null && inactiveDays >= 14) {
        const priority = priorityFromShare(
          player.sharePct,
          player.rank,
          inactiveDays >= 28 ? 6 : 2,
        )
        alerts.push({
          id: `${player.playerId}:relevant_inactive`,
          kind: 'relevant_inactive',
          priority,
          playerId: player.playerId,
          nickname: player.nickname,
          title: KIND_LABELS.relevant_inactive,
          score:
            player.sharePct * 2 +
            inactiveDays +
            PRIORITY_RANK[priority] * 10,
          details: [
            { label: 'Jogador', value: player.nickname || '—' },
            { label: 'ID', value: player.playerId },
            { label: 'Rake acumulado', value: formatMoney(player.totalRake) },
            {
              label: 'Participação no rake',
              value: formatPercent(player.sharePct),
            },
            { label: 'Tempo sem gerar rake', value: `${inactiveDays} dias` },
            {
              label: 'Última atividade',
              value: formatDate(player.lastActiveEnd),
            },
          ],
        })
      }
    }

    // 2) Queda brusca (ainda ativo na última semana)
    if (player.weeks.length >= 6 && latestWeekStart) {
      const lastTwoStarts = allWeekStarts.slice(-2)
      const priorStarts = allWeekStarts.slice(-6, -2)
      if (lastTwoStarts.length === 2 && priorStarts.length >= 3) {
        const recentRake = player.weeks
          .filter((w) => lastTwoStarts.includes(w.periodStart))
          .reduce((sum, w) => sum + w.weeklyRake, 0)
        const priorValues = priorStarts.map(
          (start) =>
            player.weeks.find((w) => w.periodStart === start)?.weeklyRake ?? 0,
        )
        const priorMedian = median(priorValues)
        const stillActive = recentRake > 0
        if (
          stillActive &&
          priorMedian != null &&
          priorMedian > 0 &&
          recentRake <= priorMedian * 0.4 &&
          isRelevant(player)
        ) {
          const dropPct = 100 - (recentRake / priorMedian) * 100
          const priority = priorityFromShare(player.sharePct, player.rank, 4)
          alerts.push({
            id: `${player.playerId}:sharp_drop`,
            kind: 'sharp_drop',
            priority,
            playerId: player.playerId,
            nickname: player.nickname,
            title: KIND_LABELS.sharp_drop,
            score: player.sharePct + dropPct + PRIORITY_RANK[priority] * 10,
            details: [
              { label: 'Jogador', value: player.nickname || '—' },
              { label: 'ID', value: player.playerId },
              { label: 'Rake acumulado', value: formatMoney(player.totalRake) },
              {
                label: 'Participação no rake',
                value: formatPercent(player.sharePct),
              },
              {
                label: 'Rake recente (2 sem.)',
                value: formatMoney(recentRake),
              },
              {
                label: 'Mediana anterior (4 sem.)',
                value: formatMoney(priorMedian),
              },
            ],
          })
        }
      }
    }

    // 3) Alto valor desacelerando — 3 semanas consecutivas em queda
    if (isRelevant(player) && player.sharePct >= 8 && player.weeks.length >= 4) {
      const lastFourStarts = allWeekStarts.slice(-4)
      const vals = lastFourStarts.map(
        (start) =>
          player.weeks.find((w) => w.periodStart === start)?.weeklyRake ?? 0,
      )
      if (
        vals.length === 4 &&
        vals[1] < vals[0] &&
        vals[2] < vals[1] &&
        vals[3] < vals[2] &&
        vals[0] > 0
      ) {
        const priority = priorityFromShare(player.sharePct, player.rank, 3)
        alerts.push({
          id: `${player.playerId}:high_value_deceleration`,
          kind: 'high_value_deceleration',
          priority,
          playerId: player.playerId,
          nickname: player.nickname,
          title: KIND_LABELS.high_value_deceleration,
          score: player.sharePct * 1.5 + PRIORITY_RANK[priority] * 10,
          details: [
            { label: 'Jogador', value: player.nickname || '—' },
            { label: 'ID', value: player.playerId },
            { label: 'Rake acumulado', value: formatMoney(player.totalRake) },
            {
              label: 'Participação no rake',
              value: formatPercent(player.sharePct),
            },
            {
              label: 'Últimas 4 semanas',
              value: vals.map((v) => formatMoney(v)).join(' → '),
            },
          ],
        })
      }
    }

    // 4) Retorno após inatividade
    if (latestWeekStart && player.weeks.length >= 2) {
      const latestRake =
        player.weeks.find((w) => w.periodStart === latestWeekStart)?.weeklyRake ??
        0
      if (latestRake > 0) {
        const earlierActive = player.weeks.filter(
          (w) => w.periodStart < latestWeekStart && w.weeklyRake > 0,
        )
        const prevActive = earlierActive[earlierActive.length - 1]
        if (prevActive) {
          const gap = inclusiveDayCount(prevActive.periodEnd, latestWeekStart)
          if (gap != null && gap >= 14 && isRelevant(player)) {
            const priority = priorityFromShare(player.sharePct, player.rank)
            alerts.push({
              id: `${player.playerId}:player_return`,
              kind: 'player_return',
              priority,
              playerId: player.playerId,
              nickname: player.nickname,
              title: KIND_LABELS.player_return,
              score: player.sharePct + gap + PRIORITY_RANK[priority] * 8,
              details: [
                { label: 'Jogador', value: player.nickname || '—' },
                { label: 'ID', value: player.playerId },
                { label: 'Rake acumulado', value: formatMoney(player.totalRake) },
                {
                  label: 'Participação no rake',
                  value: formatPercent(player.sharePct),
                },
                { label: 'Intervalo inativo', value: `${gap} dias` },
                {
                  label: 'Rake na volta',
                  value: formatMoney(latestRake),
                },
              ],
            })
          }
        }
      }
    }

    // 5) Novo destaque
    if (
      player.acquiredAt &&
      referenceEnd &&
      player.sharePct >= 8
    ) {
      const tenure = inclusiveDayCount(player.acquiredAt, referenceEnd)
      if (tenure != null && tenure <= 21) {
        const priority = priorityFromShare(player.sharePct, player.rank, 2)
        alerts.push({
          id: `${player.playerId}:new_standout`,
          kind: 'new_standout',
          priority,
          playerId: player.playerId,
          nickname: player.nickname,
          title: KIND_LABELS.new_standout,
          score: player.sharePct * 2 + PRIORITY_RANK[priority] * 10,
          details: [
            { label: 'Jogador', value: player.nickname || '—' },
            { label: 'ID', value: player.playerId },
            { label: 'Rake acumulado', value: formatMoney(player.totalRake) },
            {
              label: 'Participação no rake',
              value: formatPercent(player.sharePct),
            },
            { label: 'Dias desde a entrada', value: `${tenure}` },
            { label: 'Entrada', value: formatDate(player.acquiredAt) },
          ],
        })
      }
    }
  }

  return alerts.sort((a, b) => {
    const pr = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
    if (pr !== 0) return pr
    return b.score - a.score
  })
}
