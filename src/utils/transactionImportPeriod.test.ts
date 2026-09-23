import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import {
  parsePeriodFromFilename,
  parseTransactionReportBuffer,
} from './campaignTransactionParser'
import {
  chooseTransactionBatchSize,
  chunkArray,
  jsonByteLength,
} from './transactionImportBatch'
import { resolveClubCode } from './clubDimension'

async function xlsx(headers: string[], rows: unknown[][]) {
  const result = await writeXlsxFile([headers, ...rows] as (string | number)[][])
  const buf = await result.toBuffer()
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('período de transações', () => {
  it('ignora timestamp de exportação no filename (16/01/2041)', () => {
    expect(
      parsePeriodFromFilename(
        'Relatório de transações suprema 22-09-2026-16-01-41.xlsx',
      ),
    ).toBeNull()
  })

  it('usa MIN/MAX das datas das linhas, não o filename', async () => {
    const headers = [
      'ID',
      'Receiver player ID',
      'Receiver nickname',
      'Sender player ID',
      'Dia',
      'Hora',
      'Origem',
      'SX tipo',
      'Chips Send Out',
      'Order status',
      'Nome do clube',
    ]
    const buffer = await xlsx(headers, [
      [
        'a1',
        10,
        'n',
        1092502,
        '06/12/2023',
        '10:00:00',
        'SX 24 Horas',
        '-',
        100,
        'Completed',
        'SX | XTREME PRO',
      ],
      [
        'a2',
        11,
        'n',
        1092502,
        '20/09/2026',
        '18:00:00',
        'SX 24 Horas',
        '-',
        50,
        'Completed',
        'SX | XTREME PRO',
      ],
    ])
    const parsed = await parseTransactionReportBuffer(
      buffer,
      'Relatório de transações suprema 22-09-2026-16-01-41.xlsx',
    )
    expect(parsed.period.start).toBe('2023-12-06')
    expect(parsed.period.end).toBe('2026-09-20')
    expect(parsed.period.label).not.toContain('2041')
    expect(parsed.transactions[0]?.clubCode).toBe('xtreme_pro')
  })
})

describe('resolveClubCode Xtreme', () => {
  it('mapeia SX | XTREME PRO', () => {
    expect(resolveClubCode('SX | XTREME PRO')).toBe('xtreme_pro')
    expect(resolveClubCode('32443')).toBeNull()
  })
})

describe('transactionImportBatch', () => {
  it('escolhe batch size pelo tamanho do payload', () => {
    const fat = { raw: { a: 'x'.repeat(2000) } }
    const size = chooseTransactionBatchSize(fat, 59602)
    expect(size).toBeGreaterThanOrEqual(50)
    expect(size).toBeLessThanOrEqual(500)
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(jsonByteLength({ a: 1 })).toBeGreaterThan(0)
  })
})
