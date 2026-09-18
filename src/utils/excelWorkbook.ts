import readXlsxFile from 'read-excel-file/browser'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

export type WorkbookSheets = Map<string, unknown[][]>

/**
 * Suprema exports sometimes embed literal NaN in sheet XML, which makes
 * read-excel-file throw VALUE_INVALID. Blank those cells before parse.
 */
export function sanitizeExcelNaNCells(buffer: ArrayBuffer): ArrayBuffer {
  try {
    const files = unzipSync(new Uint8Array(buffer))
    let changed = false
    for (const name of Object.keys(files)) {
      if (!/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) continue
      const xml = strFromU8(files[name]!)
      const next = xml
        .replace(/<v>\s*NaN\s*<\/v>/gi, '<v></v>')
        .replace(/<v>\s*#N\/A\s*<\/v>/gi, '<v></v>')
        .replace(/<v>\s*#VALUE!\s*<\/v>/gi, '<v></v>')
        .replace(/<v>\s*#DIV\/0!\s*<\/v>/gi, '<v></v>')
      if (next !== xml) {
        files[name] = strToU8(next)
        changed = true
      }
    }
    if (!changed) return buffer
    const zipped = zipSync(files)
    return zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    ) as ArrayBuffer
  } catch {
    return buffer
  }
}

function isInvalidCellError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /VALUE_INVALID|InvalidSpreadsheetError/i.test(msg)
}

async function readSheets(buffer: ArrayBuffer) {
  return readXlsxFile(sanitizeExcelNaNCells(buffer))
}

export async function readWorkbookFromBuffer(
  buffer: ArrayBuffer,
): Promise<WorkbookSheets> {
  let sheets
  try {
    sheets = await readSheets(buffer)
  } catch (err) {
    if (!isInvalidCellError(err)) throw err
    sheets = await readXlsxFile(sanitizeExcelNaNCells(buffer))
  }
  const map = new Map<string, unknown[][]>()
  for (const { sheet, data } of sheets) {
    map.set(sheet, data as unknown[][])
  }
  return map
}

export async function readFirstSheetFromBuffer(
  buffer: ArrayBuffer,
): Promise<unknown[][]> {
  let sheets
  try {
    sheets = await readSheets(buffer)
  } catch (err) {
    if (!isInvalidCellError(err)) throw err
    sheets = await readXlsxFile(sanitizeExcelNaNCells(buffer))
  }
  const first = sheets[0]
  if (!first) throw new Error('Planilha vazia.')
  return first.data as unknown[][]
}

/** Converte serial de data/hora do Excel em partes (equivalente ao SSF do SheetJS). */
export function excelSerialToParts(value: number): {
  y: number
  m: number
  d: number
  H: number
  M: number
  S: number
} | null {
  if (!Number.isFinite(value)) return null
  const utcDays = Math.floor(value - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  if (Number.isNaN(date.getTime())) return null

  const fraction = value - Math.floor(value)
  let totalSeconds = Math.round(86400 * fraction)
  if (totalSeconds >= 86400) totalSeconds = 0

  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    H: Math.floor(totalSeconds / 3600),
    M: Math.floor((totalSeconds % 3600) / 60),
    S: totalSeconds % 60,
  }
}
