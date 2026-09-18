import type {
  SegmentCondition,
  SegmentDefinition,
  SegmentGroup,
  SegmentOp,
} from '../types/segments'

export const SEGMENT_FIELDS: { value: string; label: string; kind: 'text' | 'number' | 'bool' }[] = [
  { value: 'player_id', label: 'Player ID', kind: 'text' },
  { value: 'nickname', label: 'Nick', kind: 'text' },
  { value: 'name', label: 'Nome', kind: 'text' },
  { value: 'has_campaign', label: 'Tem campanha', kind: 'bool' },
  { value: 'agent_id', label: 'Agent ID', kind: 'text' },
  { value: 'accumulated_rake', label: 'Rake acumulado', kind: 'number' },
  { value: 'rake_7d', label: 'Rake 7d', kind: 'number' },
  { value: 'rake_30d', label: 'Rake 30d', kind: 'number' },
  { value: 'rake_60d', label: 'Rake 60d', kind: 'number' },
  { value: 'rake_90d', label: 'Rake 90d', kind: 'number' },
  { value: 'days_since_last_rake', label: 'Dias desde último rake', kind: 'number' },
  { value: 'incentive_limit', label: 'Limite de incentivo', kind: 'number' },
  { value: 'incentive_sent', label: 'Incentivo enviado', kind: 'number' },
  { value: 'incentive_available', label: 'Incentivo disponível', kind: 'number' },
  { value: 'ever_received_incentive', label: 'Já recebeu incentivo', kind: 'bool' },
  { value: 'incentive_count', label: 'Qtd. incentivos', kind: 'number' },
]

export const SEGMENT_OPS_BY_KIND: Record<'text' | 'number' | 'bool', { value: SegmentOp; label: string }[]> = {
  text: [
    { value: 'eq', label: 'igual a' },
    { value: 'neq', label: 'diferente de' },
    { value: 'contains', label: 'contém' },
    { value: 'is', label: 'é' },
    { value: 'is_not', label: 'não é' },
  ],
  number: [
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
    { value: 'between', label: 'entre' },
  ],
  bool: [
    { value: 'is', label: 'é' },
    { value: 'is_not', label: 'não é' },
    { value: 'eq', label: 'igual a' },
  ],
}

export function createEmptyCondition(field = 'accumulated_rake'): SegmentCondition {
  const meta = SEGMENT_FIELDS.find((f) => f.value === field)
  const kind = meta?.kind ?? 'number'
  const defaultOp = SEGMENT_OPS_BY_KIND[kind][0]?.value ?? 'eq'
  return {
    field,
    op: defaultOp,
    value: kind === 'bool' ? true : kind === 'number' ? 0 : '',
  }
}

export function createEmptyGroup(): SegmentGroup {
  return { logic: 'and', conditions: [createEmptyCondition()] }
}

export function createDefaultDefinition(): SegmentDefinition {
  return { groupLogic: 'or', groups: [createEmptyGroup()] }
}

/** True when definition has no groups or every group has zero conditions. */
export function isEmptyDefinition(definition: SegmentDefinition | null | undefined): boolean {
  if (!definition?.groups?.length) return true
  return definition.groups.every((g) => !g.conditions?.length)
}

/** Sanitize definition before save/preview — drops empty groups. */
export function sanitizeDefinition(definition: SegmentDefinition): SegmentDefinition {
  const groups = (definition.groups ?? [])
    .map((g) => ({
      logic: g.logic === 'or' ? ('or' as const) : ('and' as const),
      conditions: (g.conditions ?? []).filter((c) => Boolean(c.field && c.op)),
    }))
    .filter((g) => g.conditions.length > 0)

  return {
    groupLogic: definition.groupLogic === 'and' ? 'and' : 'or',
    groups,
  }
}

export function cloneDefinition(definition: SegmentDefinition): SegmentDefinition {
  return JSON.parse(JSON.stringify(definition)) as SegmentDefinition
}
