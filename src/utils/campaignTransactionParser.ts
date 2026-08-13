import * as XLSX from 'xlsx'
import { classifyTransactionFlags } from './campaignDepositMetrics'

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

function toText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  return text || null
}

function excelDateToIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return null
    const iso = new Date(
      Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0),
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

function mondaySundayContaining(isoDate: string): ParsedTransactionPeriod {
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

const HEADER_ALIASES: Record<string, string[]> = {
  externalTransactionId: [
    'transaction id',
    'transactionid',
    'id da transacao',
    'id transacao',
    'transacao id',
    'txid',
    'id',
  ],
  receiverPlayerId: [
    'receiver player id',
    'receiverplayerid',
    'player id receptor',
    'id jogador receptor',
    'receiver id',
    'player id',
  ],
  receiverNickname: [
    'receiver nickname',
    'receiver nick',
    'nickname receptor',
    'nick receptor',
    'nickname',
  ],
  agentId: ['agent id', 'agentid', 'id agente', 'agente id', 'id da agencia'],
  agentNickname: ['agent nickname', 'agent nick', 'nickname agente', 'nick agente'],
  occurredAt: [
    'date',
    'data',
    'datetime',
    'data hora',
    'occurred at',
    'created at',
    'timestamp',
  ],
  origin: ['origem', 'origin', 'source'],
  transactionType: [
    'tipo',
    'type',
    'transaction type',
    'tipo de transacao',
    'tipo transacao',
  ],
  amount: [
    'amount',
    'valor',
    'value',
    'chips',
    'quantidade',
    'fichas',
    'total',
  ],
  chipsSendOut: ['chips send out', 'send out', 'envio', 'chips enviadas'],
  chipsClaimback: ['chips claimback', 'claimback', 'retorno', 'claim back'],
  systemStatus: ['system status', 'status sistema', 'status do sistema'],
  orderStatus: ['order status', 'status pedido', 'status da ordem', 'status'],
}

function mapHeaders(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    const h = normalizeHeader(cell)
    if (!h) return
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map.has(field)) continue
      if (aliases.some((a) => h === a || h.includes(a))) {
        map.set(field, idx)
      }
    }
  })
  return map
}

function findHeaderRow(rows: unknown[][]): { index: number; map: Map<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
    const map = mapHeaders(rows[i] ?? [])
    if (map.has('externalTransactionId') && map.has('receiverPlayerId')) {
      return { index: i, map }
    }
  }
  return null
}

export function parseTransactionReportBuffer(
  buffer: ArrayBuffer,
  filename = 'transactions.xlsx',
): ParsedTransactionReport {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const warnings: ParsedTransactionReport['warnings'] = []
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Planilha de transações vazia.')
  }
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  })

  const header = findHeaderRow(rows)
  if (!header) {
    throw new Error(
      'Não foi possível identificar as colunas Transaction ID e Receiver player ID.',
    )
  }

  const col = (field: string, row: unknown[]) => {
    const idx = header.map.get(field)
    return idx === undefined ? undefined : row[idx]
  }

  const transactions: ParsedTransactionRow[] = []
  const seen = new Set<string>()

  for (let i = header.index + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? []
    if (!row.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) {
      continue
    }
    const externalTransactionId = toId(col('externalTransactionId', row))
    const receiverPlayerId = toId(col('receiverPlayerId', row))
    if (!externalTransactionId || !receiverPlayerId) {
      warnings.push({
        code: 'skip_row',
        message: `Linha ${i + 1}: Transaction ID ou Receiver player ID ausente.`,
      })
      continue
    }
    if (seen.has(externalTransactionId)) {
      warnings.push({
        code: 'duplicate_in_file',
        message: `Transaction ID duplicado no arquivo: ${externalTransactionId}.`,
      })
      continue
    }
    seen.add(externalTransactionId)

    const origin = toText(col('origin', row))
    const transactionType = toText(col('transactionType', row))
    const systemStatus = toText(col('systemStatus', row))
    const orderStatus = toText(col('orderStatus', row))
    const flags = classifyTransactionFlags({
      origin,
      transactionType,
      systemStatus,
      orderStatus,
    })

    const raw: Record<string, unknown> = {}
    header.map.forEach((idx, key) => {
      raw[key] = row[idx]
    })

    transactions.push({
      externalTransactionId,
      receiverPlayerId,
      receiverNickname: toText(col('receiverNickname', row)),
      agentId: toId(col('agentId', row)) || null,
      agentNickname: toText(col('agentNickname', row)),
      occurredAt: excelDateToIso(col('occurredAt', row)),
      origin,
      transactionType,
      amount: toNumber(col('amount', row)),
      chipsSendOut: toNullableNumber(col('chipsSendOut', row)),
      chipsClaimback: toNullableNumber(col('chipsClaimback', row)),
      systemStatus,
      orderStatus,
      isDeposit: flags.isDeposit,
      isBonus: flags.isBonus,
      raw,
    })
  }

  let period =
    parsePeriodFromFilename(filename) ??
    (() => {
      const dates = transactions
        .map((t) => t.occurredAt?.slice(0, 10))
        .filter((d): d is string => Boolean(d))
        .sort()
      if (dates.length === 0) return null
      return mondaySundayContaining(dates[0])
    })()

  if (!period) {
    const today = new Date().toISOString().slice(0, 10)
    period = mondaySundayContaining(today)
    warnings.push({
      code: 'period_inferred',
      message: 'Período não encontrado no arquivo; inferido pela data atual.',
    })
  }

  if (!header.map.has('agentId')) {
    warnings.push({
      code: 'missing_agent',
      message:
        'Agent ID ausente no relatório — será usado o vínculo histórico do rake quando disponível.',
    })
  }

  return {
    period,
    transactions,
    warnings,
    depositsCount: transactions.filter((t) => t.isDeposit).length,
    bonusesCount: transactions.filter((t) => t.isBonus).length,
    uniquePlayerIds: [...new Set(transactions.map((t) => t.receiverPlayerId))].sort(),
    uniqueAgentIds: [
      ...new Set(
        transactions
          .map((t) => t.agentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ].sort(),
  }
}

export async function parseTransactionReportFile(
  file: File,
): Promise<ParsedTransactionReport> {
  const buffer = await file.arrayBuffer()
  return parseTransactionReportBuffer(buffer, file.name)
}
