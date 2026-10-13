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
  primeira_semana: 'Primeira semana observada',
}

const WEEKLY_ONLY: BiMetric[] = ['rake_bruto', 'rake_liquido', 'ativos', 'primeira_semana']

export function metricAllowsGrain(metric: BiMetric, grain: BiGrain): boolean {
  if (grain === 'day' && WEEKLY_ONLY.includes(metric)) return false
  return true
}

export function grainBlockReason(metric: BiMetric, grain: BiGrain): string | null {
  if (metricAllowsGrain(metric, grain)) return null
  return 'O relatório de rake é semanal. Não há valor diário para fabricar a partir do total da semana.'
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
