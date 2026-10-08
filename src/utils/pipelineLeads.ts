export type LeadSchedule = {
  id: string
  nextContactAt: string | null
}

/** Data local YYYY-MM-DD, sem deslocar o dia pelo fuso. */
export function todayIso(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatIsoDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const [year, month, day] = iso.slice(0, 10).split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

export function nextContactRank(
  nextContactAt: string | null | undefined,
  today = todayIso(),
): 0 | 1 | 2 {
  const day = nextContactAt?.slice(0, 10) || ''
  if (!day) return 1
  if (day < today) return 0
  return 2
}

/** Atrasados primeiro, depois sem data, depois os agendados. */
export function compareLeadsByNextContact(
  a: LeadSchedule,
  b: LeadSchedule,
  today = todayIso(),
): number {
  const rankA = nextContactRank(a.nextContactAt, today)
  const rankB = nextContactRank(b.nextContactAt, today)
  if (rankA !== rankB) return rankA - rankB
  if (rankA !== 1) {
    const byDate = (a.nextContactAt ?? '').localeCompare(b.nextContactAt ?? '')
    if (byDate !== 0) return byDate
  }
  return a.id.localeCompare(b.id)
}

export type LeadColumnMove = {
  id: string
  fromStageId: string
}

/** Movimentos reais: a coluna de origem ainda está no card arrastado. */
export function leadMovesToPersist(
  incoming: { id: string; stageId: string }[],
  targetStageId: string,
): LeadColumnMove[] {
  const seen = new Set<string>()
  const moves: LeadColumnMove[] = []
  for (const entry of incoming) {
    if (!entry.id || seen.has(entry.id)) continue
    seen.add(entry.id)
    if (entry.stageId && entry.stageId !== targetStageId) {
      moves.push({ id: entry.id, fromStageId: entry.stageId })
    }
  }
  return moves
}
