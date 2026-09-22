import { RECONCILIATION } from './campaignThresholds'
import { resolveClubCode, type ClubCode } from './clubDimension'
import {
  readWorkbookFromBuffer,
  type WorkbookSheets,
} from './excelWorkbook'

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
  /** Clube lido da coluna opcional "Nome do clube". Null se a coluna não existir. */
  fileClubCode: ClubCode | null
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

/** Agent ID 0 / None é linha dummy da planilha — não é agência real. */
export function isValidAgentId(id: string | null | undefined): boolean {
  const t = String(id ?? '').trim()
  if (!t) return false
  if (t === '0') return false
  if (/^none$/i.test(t)) return false
  return true
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
  if (!match) return null
  return isValidAgentId(match[1]) ? match[1] : null
}

export function aggregateAgentsById(agents: ParsedAgentRow[]): ParsedAgentRow[] {
  const map = new Map<string, ParsedAgentRow>()
  for (const agent of agents) {
    const slotKey = String(agent.slotName ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    const key = `${agent.agentId}|${slotKey}|${agent.period.start}|${agent.period.end}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...agent })
      continue
    }
    prev.weeklyRake += agent.weeklyRake
    prev.gains += agent.gains
    prev.hands += agent.hands
    if (agent.agentName) prev.agentName = agent.agentName
    if (agent.slotName) prev.slotName = agent.slotName
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

function findSheet(
  sheets: WorkbookSheets,
  candidates: string[],
): unknown[][] | null {
  for (const wanted of candidates) {
    for (const [name, matrix] of sheets) {
      if (normalizeHeader(name) === normalizeHeader(wanted)) return matrix
    }
  }
  return null
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

function parseAgentsSheet(matrix: unknown[][]): {
  agents: ParsedAgentRow[]
  period: ParsedPeriod | null
  error: string | null
  fileClubCode: ClubCode | null
} {
  if (matrix.length < 2) {
    return { agents: [], period: null, error: 'Aba Agentes está vazia.', fileClubCode: null }
  }

  const map = headerIndexMap(matrix[0] ?? [])
  const missing = requireCols(map, [
    { aliases: ['agent id', 'agentid', 'id agente'], label: 'Agent ID' },
    { aliases: ['agent name', 'agentname', 'nome agente', 'nome'], label: 'Agent name' },
    { aliases: ['semana', 'periodo', 'período'], label: 'Semana' },
    { aliases: ['taxa total', 'taxatotal'], label: 'Taxa total' },
  ])
  if (missing) return { agents: [], period: null, error: missing, fileClubCode: null }

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
  const clubCodes = new Set<ClubCode>()
  const iClub = col(map, 'nome do clube', 'club name', 'nome clube')

  for (let r = 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? []
    const agentId = toId(row[iAgentId])
    if (!isValidAgentId(agentId)) continue
    const weekRaw = row[iSemana]
    const parsed = parsePeriodLabel(weekRaw)
    if (!parsed) {
      return {
        agents: [],
        period: null,
        error: `Período inválido na aba Agentes (linha ${r + 1}).`,
        fileClubCode: null,
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
    if (iClub >= 0) {
      const code = resolveClubCode(row[iClub])
      if (code) clubCodes.add(code)
    }
  }

  const fileClubCode = clubCodes.size === 1 ? [...clubCodes][0]! : null

  if (agents.length === 0) {
    return { agents: [], period: null, error: 'Nenhum Agent ID encontrado na aba Agentes.', fileClubCode: null }
  }

  return { agents: aggregateAgentsById(agents), period, error: null, fileClubCode }
}

function parseBlockedSheet(
  matrix: unknown[][],
  mode: 'players' | 'tables',
  fallbackPeriod: ParsedPeriod | null,
): {
  players: ParsedPlayerRow[]
  tables: ParsedTableRow[]
  warnings: ParseWarning[]
  error: string | null
} {
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
    const rawAgentMatch = joined.match(/Agente:\s*(\d+)/i)
    if (rawAgentMatch && !isValidAgentId(rawAgentMatch[1])) {
      // Cabeçalho dummy (Agente: 0 - None) — não herda o agente anterior.
      currentAgent = null
      headerMap = null
      continue
    }
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

export function parseAgentReportWorkbook(sheets: WorkbookSheets): ParsedReport {
  const agentsSheet = findSheet(sheets, ['Agentes', 'Agents'])
  const playersSheet = findSheet(sheets, ['Jogadores', 'Players'])
  const tablesSheet = findSheet(sheets, [
    'Detalhes de mesa',
    'Detalhes da mesa',
    'Table details',
  ])

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
    fileClubCode: agentsParsed.fileClubCode,
  }
}

export async function parseAgentReportFile(file: File | ArrayBuffer): Promise<ParsedReport> {
  const buffer =
    file instanceof ArrayBuffer ? file : await file.arrayBuffer()
  const sheets = await readWorkbookFromBuffer(buffer)
  return parseAgentReportWorkbook(sheets)
}
