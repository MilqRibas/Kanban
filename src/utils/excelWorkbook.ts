import readXlsxFile from 'read-excel-file/browser'

export type WorkbookSheets = Map<string, unknown[][]>

export async function readWorkbookFromBuffer(
  buffer: ArrayBuffer,
): Promise<WorkbookSheets> {
  const sheets = await readXlsxFile(buffer)
  const map = new Map<string, unknown[][]>()
  for (const { sheet, data } of sheets) {
    map.set(sheet, data as unknown[][])
  }
  return map
}

export async function readFirstSheetFromBuffer(
  buffer: ArrayBuffer,
): Promise<unknown[][]> {
  const sheets = await readXlsxFile(buffer)
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