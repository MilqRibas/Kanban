export type SegmentOp =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'between'
  | 'contains'
  | 'is'
  | 'is_not'

export type SegmentCondition = {
  field: string
  op: SegmentOp
  value: string | number | boolean
  valueTo?: number
}

export type SegmentGroup = {
  logic: 'and' | 'or'
  conditions: SegmentCondition[]
}

export type SegmentDefinition = {
  groupLogic: 'and' | 'or'
  groups: SegmentGroup[]
}

export type SegmentRow = {
  id: string
  boardId: string
  name: string
  description: string | null
  definition: SegmentDefinition
  updatedAt: string
  playerCount?: number
  pipelineName?: string | null
}

export type SegmentPreviewSample = {
  playerId: string
  name: string | null
  nickname: string | null
  incentiveAvailable: number
  accumulatedRake: number
}

export type SegmentPreviewResult = {
  count: number
  sample: SegmentPreviewSample[]
}
