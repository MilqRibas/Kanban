import type { WorkBook, WorkSheet } from 'xlsx'
import { RECONCILIATION } from './campaignThresholds'

type XlsxModule = typeof import('xlsx')
let xlsxRuntime: XlsxModule | null = null

async function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxRuntime) xlsxRuntime = await import('xlsx')
  return xlsxRuntime
}

export type GameTypeCode = 'RG' | 'MTT' | 'SNG' | 'RODEO' | string

export const GAME_TYPE_LABELS: Record<string, string> = {
  RG: 'Ring Game',
  MTT: 'Torneio',
  SNG: 'Sit And Go',
  RODEO: 'Rodeo',
}

export type ParsedPeriod = {
  start: string // YYYY-MM-DD
  end: string
  label: string
}

export type ParsedAgentRow = {
  agentId: string
  agentName: string
  league: string | null
  slot: string | null
  slotName: string | null
  client: string | null
  period: ParsedPeriod
  gains: number
  weeklyRake: number
  hands: number
}

export type ParsedPlayerRow = {
  agentId: string
  playerId: string
  playerName: string
  nickname: string
  period: ParsedPeriod
  gains: number
  weeklyRake: number
  hands: number
}

export type ParsedTableRow = {
  agentId: string
  playerId: string
  playerName: string
  period: ParsedPeriod
  tableId: string
  gameType: GameTypeCode
  tableName: string
  hands: number
  buyIn: number
  gains: number
  rake: number
  adminFee: number
}

export type ParseWarning = {
  code: string
  message: string
}

export type ParsedReport = {
  period: ParsedPeriod
  agents: ParsedAgentRow[]
  players: ParsedPlayerRow[]
  tables: ParsedTableRow[]
  warnings: ParseWarning[]
  uniquePlayerIds: string[]
  uniqueAgentIds: string[]
  gameTypes: string[]
}

export type AgentReconciliation = {
  agentId: string
  agentName: string
  officialRake: number
  playersRakeSum: number
  diff: number
  diffPct: number | null
  conciliated: boolean
  uniquePlayers: number
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const raw = String(value).trim().replace(/\s/g, '')
  if (!raw) return fallback
  // BR format 1.234,56 or plain 1234.56
  let normalized = raw
  if (raw.includes(',') && raw.includes('.')) {
    normalized = raw.replace(/\./g, '').replace(',', '.')
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.')
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : fallback
}

function toId(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return String(Math.trunc(value))
  }
  const raw = String(value).trim()
  if (!raw) return ''
  const asNum = Number(raw.replace(',', '.'))
  if (Number.isFinite(asNum) && /^\d+(\.0+)?$/.test(raw.replace(',', '.'))) {
    return String(Math.trunc(asNum))
  }
  return raw
}

function rowText(row: unknown[]): string {
  return row
    .map((cell) => (cell === null || cell === undefined || cell === '' ? '' : String(cell)))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse "13/07/2026 à 19/07/2026" (a / à / - entre as datas). */
export function parsePeriodLabel(raw: unknown): ParsedPeriod | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (!text) return null

  const match =
    text.match(
      /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*(?:à|á|a|ate|até|-|–|—)\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i,
    ) ??
    text.match(
      /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4}).*?(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
    )
  if (!match) return null

  const toIso = (d: string, m: string, y: string) => {
    const year = y.length === 2 ? `20${y}` : y
    return `${year.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const start = toIso(match[1], match[2], match[3])
  const end = toIso(match[4], match[5], match[6])
  const label = `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3].length === 2 ? `20${match[3]}` : match[3]} a ${match[4].padStart(2, '0')}/${match[5].padStart(2, '0')}/${match[6].length === 2 ? `20${match[6]}` : match[6]}`

  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return null
  return { start, end, label }
}

/** Extract Agent ID from "Liga: … Slot: … Agente: 1642314 - CPP02" */
export function extractAgentIdFromBlockHeader(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw)
  const match = text.match(/Agente:\s*(\d+)/i)
  return match ? match[1] : null
}

export function aggregateAgentsById(agents: ParsedAgentRow[]): ParsedAgentRow[] {
  const map = new Map<string, ParsedAgentRow>()
  for (const agent of agents) {
    const key = `${agent.agentId}|${agent.period.start}|${agent.period.end}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...agent })
      continue
    }
    prev.weeklyRake += agent.weeklyRake
    prev.gains += agent.gains
    prev.hands += agent.hands
    if (agent.agentName) prev.agentName = agent.agentName
  }
  return [...map.values()]
}

export function aggregatePlayersById(players: ParsedPlayerRow[]): ParsedPlayerRow[] {
  const map = new Map<string, ParsedPlayerRow>()
  for (const player of players) {
    const key = `${player.agentId}|${player.playerId}|${player.period.start}|${player.period.end}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...player })
      continue
    }
    prev.weeklyRake += player.weeklyRake
    prev.gains += player.gains
    prev.hands += player.hands
    if (player.playerName) prev.playerName = player.playerName
    if (player.nickname) prev.nickname = player.nickname
  }
  return [...map.values()]
}

function findSheet(wb: WorkBook, candidates: string[]): WorkSheet | null {
  const names = wb.SheetNames
  for (const wanted of candidates) {
    const found = names.find((n) => normalizeHeader(n) === normalizeHeader(wanted))
    if (found) return wb.Sheets[found]
  }
  return null
}

function sheetToMatrix(ws: WorkSheet): unknown[][] {
  if (!xlsxRuntime) throw new Error('Parser de planilha não inicializado.')
  return xlsxRuntime.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
  })
}

function headerIndexMap(row: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  row.forEach((cell, idx) => {
    const key = normalizeHeader(cell)
    if (key) map.set(key, idx)
  })
  return map
}

function col(map: Map<string, number>, ...aliases: string[]): number {
  for (const alias of aliases) {
    const idx = map.get(normalizeHeader(alias))
    if (idx !== undefined) return idx
  }
  return -1
}

function requireCols(
  map: Map<string, number>,
  required: { aliases: string[]; label: string }[],
): string | null {
  for (const item of required) {
    if (col(map, ...item.aliases) < 0) {
      return `Coluna obrigatória ausente: ${item.label}`
    }
  }
  return null
}

export function isRakeConciliated(
  official: number,
  playersSum: number,
): boolean {
  const diff = Math.abs(official - playersSum)
  if (diff <= RECONCILIATION.absoluteTolerance) return true
  const base = Math.max(Math.abs(official), Math.abs(playersSum), 1)
  return diff / base <= RECONCILIATION.relativeTolerance
}

export function buildAgentReconciliations(
  agents: ParsedAgentRow[],
  players: ParsedPlayerRow[],
): AgentReconciliation[] {
  return agents.map((agent) => {
    const agentPlayers = players.filter((p) => p.agentId === agent.agentId)
    const playersRakeSum = agentPlayers.reduce((s, p) => s + p.weeklyRake, 0)
    const uniquePlayers = new Set(agentPlayers.map((p) => p.playerId)).size
    const diff = agent.weeklyRake - playersRakeSum
    const diffPct =
      agent.weeklyRake === 0
        ? playersRakeSum === 0
          ? 0
          : null
        : (diff / agent.weeklyRake) * 100
    return {
      agentId: agent.agentId,
      agentName: agent.agentName,
      officialRake: agent.weeklyRake,
      playersRakeSum,
      diff,
      diffPct,
      conciliated: isRakeConciliated(agent.weeklyRake, playersRakeSum),
      uniquePlayers,
    }
  })
}

function parseAgentsSheet(ws: WorkSheet): {
  agents: ParsedAgentRow[]
  period: ParsedPeriod | null
  error: string | null
} {
  const matrix = sheetToMatrix(ws)
  if (matrix.length < 2) {
    return { agents: [], period: null, error: 'Aba Agentes está vazia.' }
  }

  const map = headerIndexMap(matrix[0] ?? [])
  const missing = requireCols(map, [
    { aliases: ['agent id', 'agentid', 'id agente'], label: 'Agent ID' },
    { aliases: ['agent name', 'agentname', 'nome agente', 'nome'], label: 'Agent name' },
    { aliases: ['semana', 'periodo', 'período'], label: 'Semana' },
    { aliases: ['taxa total', 'taxatotal'], label: 'Taxa total' },
  ])
  if (missing) return { agents: [], period: null, error: missing }

  const iAgentId = col(map, 'agent id', 'agentid', 'id agente')
  const iName = col(map, 'agent name', 'agentname', 'nome agente', 'nome')
  const iSemana = col(map, 'semana', 'periodo', 'período')
  const iTaxa = col(map, 'taxa total', 'taxatotal')
  const iGanhos = col(map, 'ganhos')
  const iHands = col(map, 'hands', 'maos', 'mãos')
  const iLiga = col(map, 'liga')
  const iSlot = col(map, 'slot')
  const iSlotName = col(map, 'slot name', 'slotname')
  const iClient = col(map, 'cliente', 'client')

  const agents: ParsedAgentRow[] = []
  let period: ParsedPeriod | null = null

  for (let r = 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? []
    const agentId = toId(row[iAgentId])
    if (!agentId) continue
    const weekRaw = row[iSemana]
    const parsed = parsePeriodLabel(weekRaw)
    if (!parsed) {
      return {
        agents: [],
        period: null,
        error: `Período inválido na aba Agentes (linha ${r + 1}).`,
      }
    }
    if (!period) period = parsed
    agents.push({
      agentId,
      agentName: String(row[iName] ?? '').trim() || agentId,
      league: iLiga >= 0 ? String(row[iLiga] ?? '') || null : null,
      slot: iSlot >= 0 ? toId(row[iSlot]) || null : null,
      slotName: iSlotName >= 0 ? String(row[iSlotName] ?? '') || null : null,
      client: iClient >= 0 ? String(row[iClient] ?? '') || null : null,
      period: parsed,
      gains: iGanhos >= 0 ? toNumber(row[iGanhos]) : 0,
      weeklyRake: toNumber(row[iTaxa]),
      hands: iHands >= 0 ? Math.trunc(toNumber(row[iHands])) : 0,
    })
  }

  if (agents.length === 0) {
    return { agents: [], period: null, error: 'Nenhum Agent ID encontrado na aba Agentes.' }
  }

  return { agents: aggregateAgentsById(agents), period, error: null }
}

function parseBlockedSheet(
  ws: WorkSheet,
  mode: 'players' | 'tables',
  fallbackPeriod: ParsedPeriod | null,
): {
  players: ParsedPlayerRow[]
  tables: ParsedTableRow[]
  warnings: ParseWarning[]
  error: string | null
} {
  const matrix = sheetToMatrix(ws)
  const players: ParsedPlayerRow[] = []
  const tables: ParsedTableRow[] = []
  const warnings: ParseWarning[] = []

  let currentAgent: string | null = null
  let currentPeriod = fallbackPeriod
  let headerMap: Map<string, number> | null = null

  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] ?? []
    const joined = rowText(row)
    if (!joined) continue

    if (/semana\s*:/i.test(joined)) {
      const parsed = parsePeriodLabel(joined)
      if (parsed) currentPeriod = parsed
      headerMap = null
    }

    const agentFromHeader = extractAgentIdFromBlockHeader(joined)
    if (agentFromHeader) {
      currentAgent = agentFromHeader
      headerMap = null
      continue
    }

    if (/semana\s*:/i.test(joined) && !agentFromHeader) {
      continue
    }

    const first = row.find((cell) => cell !== null && cell !== undefined && cell !== '')
    const normalizedFirst = normalizeHeader(first)
    if (normalizedFirst === 'player id' || normalizedFirst === 'playerid') {
      headerMap = headerIndexMap(row)
      continue
    }

    if (!currentAgent || !headerMap || !currentPeriod) continue

    const playerId = toId(row[col(headerMap, 'player id', 'playerid')])
    if (!playerId) continue

    if (mode === 'players') {
      const iName = col(headerMap, 'player name', 'playername', 'nome')
      const iNick = col(headerMap, 'nickname', 'nick')
      const iTaxa = col(headerMap, 'taxa total', 'taxatotal')
      const iGanhos = col(headerMap, 'ganhos')
      const iHands = col(headerMap, 'hands', 'maos', 'mãos')
      if (iTaxa < 0) {
        return {
          players: [],
          tables: [],
          warnings,
          error: 'Coluna "Taxa Total" ausente na aba Jogadores.',
        }
      }
      players.push({
        agentId: currentAgent,
        playerId,
        playerName: iName >= 0 ? String(row[iName] ?? '').trim() : '',
        nickname: iNick >= 0 ? String(row[iNick] ?? '').trim() : '',
        period: currentPeriod,
        gains: iGanhos >= 0 ? toNumber(row[iGanhos]) : 0,
        weeklyRake: toNumber(row[iTaxa]),
        hands: iHands >= 0 ? Math.trunc(toNumber(row[iHands])) : 0,
      })
    } else {
      const iName = col(headerMap, 'player name', 'playername')
      const iTableId = col(headerMap, 'id da mesa', 'id mesa', 'table id')
      const iTipo = col(headerMap, 'tipo', 'type')
      const iTableName = col(headerMap, 'nome da mesa', 'mesa')
      const iHands = col(headerMap, 'maos', 'mãos', 'hands')
      const iBuyIn = col(headerMap, 'total buy-in', 'buy-in', 'buyin')
      const iGanhos = col(headerMap, 'ganhos total', 'ganhos')
      const iTaxa = col(headerMap, 'taxa total', 'taxatotal')
      const iAdmin = col(headerMap, 'taxa admin total', 'taxa admin')
      if (iTipo < 0 || iTaxa < 0) {
        return {
          players: [],
          tables: [],
          warnings,
          error: 'Colunas essenciais ausentes na aba Detalhes de mesa (Tipo / Taxa Total).',
        }
      }
      const gameType = String(row[iTipo] ?? '')
        .trim()
        .toUpperCase()
      tables.push({
        agentId: currentAgent,
        playerId,
        playerName: iName >= 0 ? String(row[iName] ?? '').trim() : '',
        period: currentPeriod,
        tableId: iTableId >= 0 ? toId(row[iTableId]) : '',
        gameType,
        tableName: iTableName >= 0 ? String(row[iTableName] ?? '').trim() : '',
        hands: iHands >= 0 ? Math.trunc(toNumber(row[iHands])) : 0,
        buyIn: iBuyIn >= 0 ? toNumber(row[iBuyIn]) : 0,
        gains: iGanhos >= 0 ? toNumber(row[iGanhos]) : 0,
        rake: toNumber(row[iTaxa]),
        adminFee: iAdmin >= 0 ? toNumber(row[iAdmin]) : 0,
      })
    }
  }

  if (mode === 'players' && players.length === 0) {
    warnings.push({
      code: 'no_players',
      message: 'Nenhum jogador encontrado na aba Jogadores.',
    })
  }
  if (mode === 'tables' && tables.length === 0) {
    warnings.push({
      code: 'no_tables',
      message: 'Nenhum registro encontrado na aba Detalhes de mesa.',
    })
  }

  return {
    players: aggregatePlayersById(players),
    tables,
    warnings,
    error: null,
  }
}

export function parseAgentReportWorkbook(wb: WorkBook): ParsedReport {
  const agentsSheet = findSheet(wb, ['Agentes', 'Agents'])
  const playersSheet = findSheet(wb, ['Jogadores', 'Players'])
  const tablesSheet = findSheet(wb, ['Detalhes de mesa', 'Detalhes da mesa', 'Table details'])

  if (!agentsSheet) {
    throw new Error('Aba obrigatória "Agentes" não encontrada no arquivo.')
  }
  if (!playersSheet) {
    throw new Error('Aba obrigatória "Jogadores" não encontrada no arquivo.')
  }
  if (!tablesSheet) {
    throw new Error('Aba obrigatória "Detalhes de mesa" não encontrada no arquivo.')
  }

  const agentsParsed = parseAgentsSheet(agentsSheet)
  if (agentsParsed.error || !agentsParsed.period) {
    throw new Error(agentsParsed.error ?? 'Não foi possível identificar o período do relatório.')
  }

  const playersParsed = parseBlockedSheet(playersSheet, 'players', agentsParsed.period)
  if (playersParsed.error) throw new Error(playersParsed.error)

  const tablesParsed = parseBlockedSheet(tablesSheet, 'tables', agentsParsed.period)
  if (tablesParsed.error) throw new Error(tablesParsed.error)

  const warnings = [...playersParsed.warnings, ...tablesParsed.warnings]

  // Period consistency
  for (const agent of agentsParsed.agents) {
    if (
      agent.period.start !== agentsParsed.period.start ||
      agent.period.end !== agentsParsed.period.end
    ) {
      warnings.push({
        code: 'mixed_periods',
        message: `Agent ${agent.agentId} possui período diferente do relatório (${agent.period.label}).`,
      })
    }
  }

  const uniquePlayerIds = [
    ...new Set(playersParsed.players.map((p) => p.playerId)),
  ].sort()
  const uniqueAgentIds = [
    ...new Set(agentsParsed.agents.map((a) => a.agentId)),
  ].sort()
  const gameTypes = [
    ...new Set(
      tablesParsed.tables.map((t) => t.gameType).filter((t) => Boolean(t)),
    ),
  ].sort()

  return {
    period: agentsParsed.period,
    agents: agentsParsed.agents,
    players: playersParsed.players,
    tables: tablesParsed.tables,
    warnings,
    uniquePlayerIds,
    uniqueAgentIds,
    gameTypes,
  }
}

export async function parseAgentReportFile(file: File | ArrayBuffer): Promise<ParsedReport> {
  const buffer =
    file instanceof ArrayBuffer ? file : await file.arrayBuffer()
  const XLSX = await loadXlsx()
  const wb = XLSX.read(buffer, { type: 'array' })
  return parseAgentReportWorkbook(wb)
}
