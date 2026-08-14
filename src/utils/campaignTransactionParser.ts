import { classifyTransactionFlags } from './campaignDepositMetrics'

type XlsxModule = typeof import('xlsx')
let xlsxRuntime: XlsxModule | null = null

async function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxRuntime) xlsxRuntime = await import('xlsx')
  return xlsxRuntime
}

export type ParsedTransactionPeriod = {
  start: string
  end: string
  label: string
}

export type ParsedTransactionRow = {
  externalTransactionId: string
  receiverPlayerId: string
  receiverNickname: string | null
  agentId: string | null
  agentNickname: string | null
  occurredAt: string | null
  origin: string | null
  /** Coluna real: SX tipo */
  sxType: string | null
  transactionType: string | null
  amount: number
  chipsSendOut: number | null
  chipsClaimback: number | null
  systemStatus: string | null
  orderStatus: string | null
  isDeposit: boolean
  isBonus: boolean
  raw: Record<string, unknown>
}

export type ParsedTransactionReport = {
  period: ParsedTransactionPeriod
  transactions: ParsedTransactionRow[]
  warnings: Array<{ code: string; message: string }>
  depositsCount: number
  bonusesCount: number
  uniquePlayerIds: string[]
  uniqueAgentIds: string[]
  recognizedHeaders: Record<string, string>
  stats: {
    rowsTotal: number
    rowsSkipped: number
    withoutAgentId: number
    withoutOccurredAt: number
  }
}

const DEV = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

function devLog(...args: unknown[]) {
  if (DEV) console.info('[campaigns:tx]', ...args)
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function normalizeEntityId(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return String(Math.trunc(value))
  }
  const raw = String(value).trim()
  if (!raw || raw === '-') return ''
  const asNum = Number(raw.replace(',', '.'))
  if (Number.isFinite(asNum) && /^-?\d+(\.0+)?$/.test(raw.replace(',', '.'))) {
    return String(Math.trunc(asNum))
  }
  return raw
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const raw = String(value).trim().replace(/\s/g, '')
  if (!raw || raw === '-') return fallback
  let normalized = raw
  if (raw.includes(',') && raw.includes('.')) {
    normalized = raw.replace(/\./g, '').replace(',', '.')
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.')
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = toNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  if (!text || text === '-') return null
  return text
}

/**
 * Matching prioritário e estrito para o XLSX real Suprema.
 * Nunca mapear "Agente player ID" como Receiver.
 */
type FieldKey =
  | 'externalTransactionId'
  | 'receiverPlayerId'
  | 'receiverNickname'
  | 'agentId'
  | 'agentNickname'
  | 'day'
  | 'time'
  | 'occurredAt'
  | 'origin'
  | 'sxType'
  | 'transactionType'
  | 'chipsSendOut'
  | 'chipsClaimback'
  | 'systemStatus'
  | 'orderStatus'
  | 'amount'

const FIELD_MATCHERS: Array<{
  field: FieldKey
  exact: string[]
  /** Só usa includes se exact não casar em nenhuma coluna. */
  includes?: string[]
}> = [
  {
    field: 'externalTransactionId',
    exact: ['id', 'transaction id', 'id da transacao', 'id transacao'],
  },
  {
    field: 'receiverPlayerId',
    exact: [
      'receiver player id',
      'receiverplayerid',
      'id jogador receptor',
      'player id receptor',
    ],
    // NÃO incluir "player id" solto — colide com "Agente player ID".
  },
  {
    field: 'agentId',
    exact: [
      'agente player id',
      'agent player id',
      'agent id',
      'agentid',
      'id agente',
      'agente id',
    ],
  },
  {
    field: 'receiverNickname',
    exact: [
      'receiver nickname',
      'receiver nick',
      'nickname receptor',
      'nick receptor',
    ],
  },
  {
    field: 'agentNickname',
    exact: [
      'agent nickname',
      'agente nickname',
      'agent nick',
      'nickname agente',
      'nick agente',
    ],
  },
  {
    field: 'day',
    exact: ['dia', 'day', 'data'],
  },
  {
    field: 'time',
    exact: ['hora', 'time', 'horario'],
  },
  {
    field: 'occurredAt',
    exact: ['datetime', 'data hora', 'occurred at', 'timestamp', 'created at'],
  },
  {
    field: 'origin',
    exact: ['origem', 'origin', 'source'],
  },
  {
    field: 'sxType',
    exact: ['sx tipo', 'sx type', 'tipo sx'],
  },
  {
    field: 'transactionType',
    exact: ['tipo de transacao', 'transaction type', 'tipo transacao'],
  },
  {
    field: 'chipsSendOut',
    exact: ['chips send out', 'chip send out', 'chips enviadas', 'send out'],
  },
  {
    field: 'chipsClaimback',
    exact: ['chips claimback', 'chip claimback', 'claimback', 'claim back'],
  },
  {
    field: 'systemStatus',
    exact: ['system status', 'status sistema', 'status do sistema'],
  },
  {
    field: 'orderStatus',
    exact: ['order status', 'status pedido', 'status da ordem', 'status order'],
  },
  {
    field: 'amount',
    exact: ['amount', 'valor', 'value'],
  },
]

function mapHeaders(headerRow: unknown[]): {
  map: Map<FieldKey, number>
  labels: Record<string, string>
} {
  const map = new Map<FieldKey, number>()
  const labels: Record<string, string> = {}
  const normalized = headerRow.map((cell, idx) => ({
    idx,
    raw: String(cell ?? '').trim(),
    h: normalizeHeader(cell),
  }))

  // 1) Exact matches first
  for (const matcher of FIELD_MATCHERS) {
    if (map.has(matcher.field)) continue
    const hit = normalized.find((c) => c.h && matcher.exact.includes(c.h))
    if (hit) {
      map.set(matcher.field, hit.idx)
      labels[matcher.field] = hit.raw || hit.h
    }
  }

  // 2) Includes only for fields still missing, never for ambiguous player id
  for (const matcher of FIELD_MATCHERS) {
    if (map.has(matcher.field) || !matcher.includes?.length) continue
    const hit = normalized.find(
      (c) =>
        c.h &&
        matcher.includes!.some((a) => c.h === a || c.h.includes(a)) &&
        // Guard: never bind agent column to receiver
        !(matcher.field === 'receiverPlayerId' && c.h.includes('agente')),
    )
    if (hit) {
      map.set(matcher.field, hit.idx)
      labels[matcher.field] = hit.raw || hit.h
    }
  }

  return { map, labels }
}

function findHeaderRow(rows: unknown[][]): {
  index: number
  map: Map<FieldKey, number>
  labels: Record<string, string>
} | null {
  for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
    const { map, labels } = mapHeaders(rows[i] ?? [])
    if (map.has('externalTransactionId') && map.has('receiverPlayerId')) {
      return { index: i, map, labels }
    }
  }
  return null
}

function excelSerialToParts(value: number): {
  y: number
  m: number
  d: number
  H: number
  M: number
  S: number
} | null {
  const parsed = xlsxRuntime?.SSF.parse_date_code(value)
  if (!parsed) return null
  return {
    y: parsed.y,
    m: parsed.m,
    d: parsed.d,
    H: parsed.H || 0,
    M: parsed.M || 0,
    S: parsed.S || 0,
  }
}

function combineDayAndTime(day: unknown, time: unknown): string | null {
  let y: number | null = null
  let m: number | null = null
  let d: number | null = null
  let H = 0
  let M = 0
  let S = 0

  if (day instanceof Date && !Number.isNaN(day.getTime())) {
    y = day.getFullYear()
    m = day.getMonth() + 1
    d = day.getDate()
  } else if (typeof day === 'number' && Number.isFinite(day)) {
    const parts = excelSerialToParts(day)
    if (parts) {
      y = parts.y
      m = parts.m
      d = parts.d
      H = parts.H
      M = parts.M
      S = parts.S
    }
  } else {
    const text = String(day ?? '').trim()
    const br = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
    if (br) {
      d = Number(br[1])
      m = Number(br[2])
      y = Number(br[3].length === 2 ? `20${br[3]}` : br[3])
    }
  }

  if (time instanceof Date && !Number.isNaN(time.getTime())) {
    H = time.getHours()
    M = time.getMinutes()
    S = time.getSeconds()
  } else if (typeof time === 'number' && Number.isFinite(time)) {
    if (time > 0 && time < 1) {
      const totalSeconds = Math.round(time * 24 * 60 * 60)
      H = Math.floor(totalSeconds / 3600)
      M = Math.floor((totalSeconds % 3600) / 60)
      S = totalSeconds % 60
    } else {
      const parts = excelSerialToParts(time)
      if (parts) {
        H = parts.H
        M = parts.M
        S = parts.S
      }
    }
  } else {
    const text = String(time ?? '').trim()
    const tm = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
    if (tm) {
      H = Number(tm[1])
      M = Number(tm[2])
      S = Number(tm[3] ?? 0)
    }
  }

  if (y == null || m == null || d == null) return null
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}:${String(S).padStart(2, '0')}.000Z`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

function excelDateToIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parts = excelSerialToParts(value)
    if (!parts) return null
    const iso = new Date(
      Date.UTC(parts.y, parts.m - 1, parts.d, parts.H, parts.M, parts.S),
    )
    return Number.isNaN(iso.getTime()) ? null : iso.toISOString()
  }
  const text = String(value).trim()
  const br = text.match(
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3]
    const iso = `${year.padStart(4, '0')}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}T${(br[4] ?? '00').padStart(2, '0')}:${(br[5] ?? '00').padStart(2, '0')}:${(br[6] ?? '00').padStart(2, '0')}.000Z`
    return Number.isNaN(Date.parse(iso)) ? null : iso
  }
  const t = Date.parse(text)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

export function mondaySundayContaining(isoDate: string): ParsedTransactionPeriod {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`)
  const day = d.getUTCDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setUTCDate(d.getUTCDate() + diffToMon)
  const sun = new Date(mon)
  sun.setUTCDate(mon.getUTCDate() + 6)
  const fmt = (x: Date) => x.toISOString().slice(0, 10)
  const start = fmt(mon)
  const end = fmt(sun)
  const label = `${start.slice(8, 10)}/${start.slice(5, 7)}/${start.slice(0, 4)} a ${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`
  return { start, end, label }
}

function parsePeriodFromFilename(name: string): ParsedTransactionPeriod | null {
  const match = name.match(
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4}).*?(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
  )
  if (!match) return null
  const toIso = (d: string, m: string, y: string) => {
    const year = y.length === 2 ? `20${y}` : y
    return `${year.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const start = toIso(match[1], match[2], match[3])
  const end = toIso(match[4], match[5], match[6])
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return null
  return {
    start,
    end,
    label: `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]} a ${match[4].padStart(2, '0')}/${match[5].padStart(2, '0')}/${match[6]}`,
  }
}

/** Valor financeiro oficial para depósito/bônus: Chips Send Out. */
export function resolveTransactionAmount(params: {
  chipsSendOut: number | null
  amount: number | null
  isDeposit: boolean
  isBonus: boolean
}): number {
  if (params.isDeposit || params.isBonus) {
    if (params.chipsSendOut != null && Number.isFinite(params.chipsSendOut)) {
      return Math.abs(params.chipsSendOut)
    }
  }
  if (params.amount != null && Number.isFinite(params.amount)) {
    return Math.abs(params.amount)
  }
  if (params.chipsSendOut != null && Number.isFinite(params.chipsSendOut)) {
    return Math.abs(params.chipsSendOut)
  }
  return 0
}

export async function parseTransactionReportBuffer(
  buffer: ArrayBuffer,
  filename = 'transactions.xlsx',
): Promise<ParsedTransactionReport> {
  const XLSX = await loadXlsx()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const warnings: ParsedTransactionReport['warnings'] = []
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Planilha de transações vazia.')

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  })

  const header = findHeaderRow(rows)
  if (!header) {
    throw new Error(
      'Não foi possível identificar as colunas ID e Receiver player ID.',
    )
  }

  const col = (field: FieldKey, row: unknown[]) => {
    const idx = header.map.get(field)
    return idx === undefined ? undefined : row[idx]
  }

  if (!header.map.has('agentId')) {
    warnings.push({
      code: 'missing_agent_column',
      message:
        'Coluna Agente player ID não encontrada — Agent IDs ficarão vazios até fallback histórico.',
    })
  } else {
    warnings.push({
      code: 'agent_column_ok',
      message: `Coluna de Agent ID reconhecida: ${header.labels.agentId}`,
    })
  }

  if (!header.map.has('sxType')) {
    warnings.push({
      code: 'missing_sx_type',
      message: 'Coluna SX tipo não encontrada — bônus podem não ser classificados.',
    })
  }

  if (!header.map.has('chipsSendOut')) {
    warnings.push({
      code: 'missing_chips_send_out',
      message: 'Coluna Chips Send Out não encontrada — valores podem ficar zerados.',
    })
  }

  const transactions: ParsedTransactionRow[] = []
  const seen = new Set<string>()
  let rowsSkipped = 0
  let withoutAgentId = 0
  let withoutOccurredAt = 0

  for (let i = header.index + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? []
    if (!row.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) {
      continue
    }

    const externalTransactionId = normalizeEntityId(col('externalTransactionId', row))
    const receiverPlayerId = normalizeEntityId(col('receiverPlayerId', row))
    if (!externalTransactionId || !receiverPlayerId) {
      rowsSkipped += 1
      warnings.push({
        code: 'skip_row',
        message: `Linha ${i + 1}: ID ou Receiver player ID ausente.`,
      })
      continue
    }
    if (seen.has(externalTransactionId)) {
      rowsSkipped += 1
      warnings.push({
        code: 'duplicate_in_file',
        message: `Transaction ID duplicado no arquivo: ${externalTransactionId}.`,
      })
      continue
    }
    seen.add(externalTransactionId)

    const origin = toText(col('origin', row))
    const sxType = toText(col('sxType', row))
    const transactionType = toText(col('transactionType', row))
    const systemStatus = toText(col('systemStatus', row))
    const orderStatus = toText(col('orderStatus', row))
    const flags = classifyTransactionFlags({
      origin,
      sxType,
      transactionType,
      systemStatus,
      orderStatus,
    })

    const chipsSendOut = toNullableNumber(col('chipsSendOut', row))
    const amountRaw = toNullableNumber(col('amount', row))
    const amount = resolveTransactionAmount({
      chipsSendOut,
      amount: amountRaw,
      isDeposit: flags.isDeposit,
      isBonus: flags.isBonus,
    })

    let occurredAt: string | null = null
    if (header.map.has('day') || header.map.has('time')) {
      occurredAt = combineDayAndTime(col('day', row), col('time', row))
    }
    if (!occurredAt) {
      occurredAt = excelDateToIso(col('occurredAt', row))
    }
    if (!occurredAt) withoutOccurredAt += 1

    const agentId = normalizeEntityId(col('agentId', row)) || null
    if (!agentId) withoutAgentId += 1

    const raw: Record<string, unknown> = {}
    header.map.forEach((idx, key) => {
      raw[key] = row[idx]
    })

    transactions.push({
      externalTransactionId,
      receiverPlayerId,
      receiverNickname: toText(col('receiverNickname', row)),
      agentId,
      agentNickname: toText(col('agentNickname', row)),
      occurredAt,
      origin,
      sxType,
      transactionType,
      amount,
      chipsSendOut,
      chipsClaimback: toNullableNumber(col('chipsClaimback', row)),
      systemStatus,
      orderStatus,
      isDeposit: flags.isDeposit,
      isBonus: flags.isBonus,
      raw,
    })
  }

  const uniqueAgentIds = [
    ...new Set(
      transactions.map((t) => t.agentId).filter((id): id is string => Boolean(id)),
    ),
  ].sort()
  const uniquePlayerIds = [
    ...new Set(transactions.map((t) => t.receiverPlayerId)),
  ].sort()

  // Período do lote: só organização/auditoria — preferir filename ou range das datas reais
  const realDates = transactions
    .map((t) => t.occurredAt?.slice(0, 10))
    .filter((d): d is string => Boolean(d))
    .sort()

  let period =
    parsePeriodFromFilename(filename) ??
    (realDates.length > 0
      ? {
          start: realDates[0],
          end: realDates[realDates.length - 1],
          label: `${realDates[0]} a ${realDates[realDates.length - 1]}`,
        }
      : null)

  if (!period) {
    const today = new Date().toISOString().slice(0, 10)
    period = mondaySundayContaining(today)
    warnings.push({
      code: 'period_inferred',
      message: 'Período do lote inferido pela data atual (sem datas nas linhas).',
    })
  }

  const depositsCount = transactions.filter((t) => t.isDeposit).length
  const bonusesCount = transactions.filter((t) => t.isBonus).length

  devLog('headers', header.labels)
  devLog('counts', {
    transactions: transactions.length,
    deposits: depositsCount,
    bonuses: bonusesCount,
    agents: uniqueAgentIds.length,
    players: uniquePlayerIds.length,
    withoutAgentId,
  })

  return {
    period,
    transactions,
    warnings,
    depositsCount,
    bonusesCount,
    uniquePlayerIds,
    uniqueAgentIds,
    recognizedHeaders: header.labels,
    stats: {
      rowsTotal: transactions.length + rowsSkipped,
      rowsSkipped,
      withoutAgentId,
      withoutOccurredAt,
    },
  }
}

export async function parseTransactionReportFile(
  file: File,
): Promise<ParsedTransactionReport> {
  const buffer = await file.arrayBuffer()
  return parseTransactionReportBuffer(buffer, file.name)
}
