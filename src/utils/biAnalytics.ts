/** Cash = Ring Game. Torneio = MTT + SNG. OFC, Rodeo e TLT ficam de fora. */
export const RANKING_GAME_TYPES = {
  cash: ['RG'],
  torneio: ['MTT', 'SNG'],
} as const

export type RankingCategory = 'cash' | 'torneio' | 'spin'
export type BiMetric = 'rake_bruto' | 'rake_liquido' | 'ativos' | 'incentivos' | 'primeira_semana'
export type BiGrain = 'day' | 'week' | 'month' | 'range'

export const RANKING_CATEGORY_LABEL: Record<RankingCategory, string> = {
  cash: 'Cash',
  torneio: 'Torneio',
  spin: 'Spin',
}

export const BI_METRIC_LABEL: Record<BiMetric, string> = {
  rake_bruto: 'Rake bruto',
  rake_liquido: 'Rake líquido',
  ativos: 'Jogadores ativos',
  incentivos: 'Incentivos enviados',
  primeira_semana: 'Jogadores observados pela primeira vez',
}

export const PRIZE_STATUS_LABEL = {
  planejada: 'Premiação planejada',
  registrada: 'Premiação registrada',
  enviada: 'Envio informado operacionalmente',
} as const

/** Nenhum status operacional confirma transação. A conciliação financeira ainda não existe. */
export function prizeHasFinancialConfirmation(_status: string): boolean {
  return false
}

const WEEKLY_ONLY: BiMetric[] = ['rake_bruto', 'rake_liquido', 'ativos', 'primeira_semana']

export function metricAllowsGrain(metric: BiMetric, grain: BiGrain): boolean {
  if (grain === 'range') return metric === 'ativos'
  if (grain === 'day' && WEEKLY_ONLY.includes(metric)) return false
  return true
}

export function coerceGrain(metric: BiMetric, grain: BiGrain): BiGrain {
  return metricAllowsGrain(metric, grain) ? grain : 'week'
}

export function grainBlockReason(metric: BiMetric, grain: BiGrain): string | null {
  if (metricAllowsGrain(metric, grain)) return null
  if (metric === 'ativos') {
    return 'Jogadores ativos vêm do relatório semanal. Não há atividade diária para contar.'
  }
  if (metric === 'primeira_semana') {
    return 'A primeira observação é a semana importada. Não há data diária de entrada.'
  }
  return 'O relatório de rake é semanal. O valor da semana não é distribuído entre os dias.'
}

/** Taxa spin ausente ou zero não entra no ranking e não vira zero. */
export function spinFeeIsRankable(fee: number | null | undefined): boolean {
  return fee != null && Number.isFinite(fee) && fee > 0
}

export function spinCoverage(playersWithFee: number): 'indisponivel' | 'com_taxa' {
  return playersWithFee > 0 ? 'com_taxa' : 'indisponivel'
}

/** Semana encerrada antes do dia corrente em America/Sao_Paulo. A semana aberta não é completa. */
export function weekIsClosed(periodEnd: string, today: string): boolean {
  return periodEnd.slice(0, 10) < today.slice(0, 10)
}

/** O rake semanal inteiro aparece no ponto, mas o intervalo não cobre segunda–domingo. */
export function weekOverlapsPartial(from: string, to: string, periodStart: string, periodEnd: string): boolean {
  return periodStart.slice(0, 10) < from.slice(0, 10) || periodEnd.slice(0, 10) > to.slice(0, 10)
}

export function firstObservationKind(input: {
  club: string
  agentId: string
  campaignId: string
  playerId: string
}): 'global' | 'recorte' {
  const allClubs = !input.club || input.club === 'all'
  if (allClubs && !input.agentId && !input.campaignId && !input.playerId) return 'global'
  return 'recorte'
}

export const HISTORY_LIMITATION =
  'A primeira semana importada não é data de cadastro nem de aquisição. Atividade anterior à cobertura não é estimada.'

/** Diferença entre a taxa total do jogador e a soma das mesas. Não é redistribuída. */
export function rakeSourceGap(weeklyRake: number, tableRake: number): number {
  return Math.round((weeklyRake - tableRake) * 100) / 100
}

export function distinctPlayerCount(playerIds: string[]): number {
  return new Set(playerIds.filter(Boolean)).size
}

/** Desempate estável: maior rake e, no empate, menor Player ID. Não altera o valor. */
export function compareRanking(
  a: { rake: number; playerId: string },
  b: { rake: number; playerId: string },
): number {
  if (b.rake !== a.rake) return b.rake - a.rake
  return a.playerId.localeCompare(b.playerId)
}

export function variationPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}

export function saoPauloToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function periodPreset(preset: string, today = saoPauloToday()): { from: string; to: string } | null {
  if (preset === '7') return { from: addDays(today, -6), to: today }
  if (preset === '30') return { from: addDays(today, -29), to: today }
  if (preset === '90') return { from: addDays(today, -89), to: today }
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
  if (preset === 'prev-month') {
    const [year, month] = today.slice(0, 7).split('-').map(Number)
    const start = new Date(Date.UTC(year!, month! - 2, 1))
    const end = new Date(Date.UTC(year!, month! - 1, 0))
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
  }
  return null
}

export function previousWindow(from: string, to: string): { from: string; to: string } {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  const length = Math.round((end - start) / 86400000) + 1
  return { from: addDays(from, -length), to: addDays(from, -1) }
}

export function formatIsoDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [year, month, day] = iso.slice(0, 10).split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}
