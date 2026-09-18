/**
 * Parse + resumo de um XLSX real de transações (com Sender player ID).
 * Uso: node --import tsx scripts/parse-real-tx-xlsx.ts [caminho]
 * Ou:  npx vitest run --reporter=verbose scripts/parse-real-tx-xlsx.test.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTransactionReportBuffer } from '../src/utils/campaignTransactionParser'
import { MKT_GT_PLAYER_ID, isMktGtSender } from '../src/utils/crmIncentiveEconomics'

const SAMPLES = resolve(process.cwd(), 'docs/samples')
const TARGET = 'Relatório de transações suprema 16-09-2026-15-57-38.xlsx'

function locate(): string | null {
  const arg = process.argv.find((a) => a.toLowerCase().endsWith('.xlsx'))
  if (arg && existsSync(arg)) return resolve(arg)
  const exact = join(SAMPLES, TARGET)
  if (existsSync(exact)) return exact
  if (!existsSync(SAMPLES)) return null
  const hit = readdirSync(SAMPLES).find((f) => f.toLowerCase().includes('15-57-38'))
  return hit ? join(SAMPLES, hit) : null
}

const path = locate()

describe.skipIf(!path)('parse real TX xlsx with Sender', () => {
  it('extracts MKT GT sends by Sender player ID = 1092502', async () => {
    const buf = readFileSync(path!)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const parsed = await parseTransactionReportBuffer(ab, TARGET)

    expect(parsed.recognizedHeaders.senderPlayerId).toMatch(/sender/i)
    expect(parsed.warnings.some((w) => w.code === 'sender_column_ok')).toBe(true)

    const mkt = parsed.transactions.filter((t) => isMktGtSender(t.senderPlayerId))
    expect(mkt.length).toBeGreaterThan(0)

    const byReceiver = new Map<string, { count: number; total: number; firstAt: string | null }>()
    for (const t of mkt) {
      const cur = byReceiver.get(t.receiverPlayerId) ?? { count: 0, total: 0, firstAt: null }
      cur.count += 1
      cur.total += Math.abs(t.amount)
      if (!cur.firstAt || (t.occurredAt && t.occurredAt < cur.firstAt)) cur.firstAt = t.occurredAt
      byReceiver.set(t.receiverPlayerId, cur)
    }

    const summary = {
      file: path,
      recognizedHeaders: parsed.recognizedHeaders,
      rows: parsed.transactions.length,
      mktGtTransfers: mkt.length,
      mktGtAmount: mkt.reduce((s, t) => s + Math.abs(t.amount), 0),
      uniqueReceivers: byReceiver.size,
      topReceivers: [...byReceiver.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([playerId, v]) => ({ playerId, ...v })),
      sampleMktRows: mkt.slice(0, 5).map((t) => ({
        externalTransactionId: t.externalTransactionId,
        senderPlayerId: t.senderPlayerId,
        senderNickname: t.senderNickname,
        receiverPlayerId: t.receiverPlayerId,
        amount: t.amount,
        occurredAt: t.occurredAt,
        sxType: t.sxType,
      })),
    }

    const out = join(SAMPLES, 'mkt-gt-parse-summary.json')
    writeFileSync(out, JSON.stringify(summary, null, 2), 'utf8')
    writeFileSync(
      join(SAMPLES, 'mkt-gt-parsed-rows.json'),
      JSON.stringify(
        mkt.map((t) => ({
          external_transaction_id: t.externalTransactionId,
          receiver_player_id: t.receiverPlayerId,
          receiver_nickname: t.receiverNickname,
          sender_player_id: t.senderPlayerId,
          sender_nickname: t.senderNickname,
          agent_id: t.agentId,
          occurred_at: t.occurredAt,
          origin: t.origin,
          transaction_type: t.sxType ?? t.transactionType,
          amount: t.amount,
          chips_send_out: t.chipsSendOut,
          chips_claimback: t.chipsClaimback,
          system_status: t.systemStatus,
          order_status: t.orderStatus,
          is_deposit: t.isDeposit,
          is_bonus: t.isBonus,
          raw: t.raw,
        })),
        null,
        2,
      ),
      'utf8',
    )

    // eslint-disable-next-line no-console
    console.info(JSON.stringify(summary, null, 2))
    expect(summary.mktGtTransfers).toBeGreaterThan(0)
    expect(MKT_GT_PLAYER_ID).toBe('1092502')
  })
})
