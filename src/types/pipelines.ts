export type Pipeline = {
  id: string
  boardId: string
  name: string
  description: string | null
  segmentId: string | null
  ownerMemberId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  segmentName?: string | null
  entryCount?: number
}

export type PipelineStage = {
  id: string
  boardId: string
  pipelineId: string
  name: string
  position: number
  createdAt: string
}

export type PipelineEntry = {
  id: string
  boardId: string
  pipelineId: string
  stageId: string
  playerId: string
  enteredAt: string
  leftAt: string | null
  stillMatchesSegment: boolean
  notes: string | null
  nextContactAt: string | null
  nickname?: string | null
  name?: string | null
  incentiveAvailable?: number | null
}

export type PipelineBoard = {
  pipeline: Pipeline
  stages: PipelineStage[]
  entries: PipelineEntry[]
}

export type PipelineEventType = 'entered' | 'moved' | 'left' | 'sync' | 'note'

export type PipelineEvent = {
  id: string
  playerId: string
  eventType: string
  fromStageId: string | null
  toStageId: string | null
  occurredAt: string
  note: string | null
}
