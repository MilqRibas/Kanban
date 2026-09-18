/**
 * Parse all real Suprema TX XLSX in docs/samples and emit JSON summaries.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTransactionReportBuffer } from '../src/utils/campaignTransactionParser'
import { isIncentiveTransaction, isMktGtSender, MKT_GT_PLAYER_ID } from '../src/utils/crmIncentiveEconomics'

const SAMPLES = resolve(process.cwd(), 'docs/samples')

describe('real Suprema XLSX samples', () => {
  const files = readdirSync(SAMPLES).filter((f) => f.toLowerCase().endsWith('.xlsx'))
  expect(files.length).toBeGreaterThan(0)

  it('parses every sample and reports Sender / MKT GT stats', async () => {
    const reports = []
    for (const file of files) {
      const path = join(SAMPLES, file)
      const buf = readFileSync(path)
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      const parsed = await parseTransactionReportBuffer(ab, file)
      const withSender = parsed.transactions.filter((t) => t.senderPlayerId)
      const mkt = parsed.transactions.filter((t) => isMktGtSender(t.senderPlayerId))
      const incentives = parsed.transactions.filter((t) =>
        isIncentiveTransaction({ senderPlayerId: t.senderPlayerId, isBonus: t.isBonus }),
      )
      reports.push({
        file,
        period: parsed.period,
        recognizedHeaders: parsed.recognizedHeaders,
        senderHeader: parsed.recognizedHeaders.senderPlayerId ?? null,
        nicknameHeader: parsed.recognizedHeaders.senderNickname ?? null,
        rows: parsed.transactions.length,
        withSender: withSender.length,
        mktGt: mkt.length,
        mktGtAmount: mkt.reduce((s, t) => s + Math.abs(t.amount), 0),
        incentives: incentives.length,
        incentiveAmount: incentives.reduce((s, t) => s + Math.abs(t.amount), 0),
        uniqueSenders: [...new Set(parsed.transactions.map((t) => t.senderPlayerId).filter(Boolean))].slice(0, 20),
        sampleMkt: mkt.slice(0, 3).map((t) => ({
          externalTransactionId: t.externalTransactionId,
          senderPlayerId: t.senderPlayerId,
          senderNickname: t.senderNickname,
          receiverPlayerId: t.receiverPlayerId,
          amount: t.amount,
          isBonus: t.isBonus,
          sxType: t.sxType,
          occurredAt: t.occurredAt,
        })),
        warnings: parsed.warnings.map((w) => w.code),
      })
    }

    writeFileSync(join(SAMPLES, 'parse-all-summary.json'), JSON.stringify(reports, null, 2), 'utf8')

    // Persist all parsed incentive rows for import
    const allRows = []
    for (const file of files) {
      const path = join(SAMPLES, file)
      const buf = readFileSync(path)
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      const parsed = await parseTransactionReportBuffer(ab, file)
      for (const t of parsed.transactions) {
        allRows.push({
          sourceFile: file,
          periodStart: parsed.period.start,
          periodEnd: parsed.period.end,
          external_transaction_id: t.externalTransactionId,
          receiver_player_id: t.receiverPlayerId,
          receiver_nickname: t.receiverNickname,
          sender_player_id: t.senderPlayerId,
          sender_nickname: t.senderNickname,
          agent_id: t.agentId,
          agent_nickname: t.agentNickname,
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
        })
      }
    }
    writeFileSync(join(SAMPLES, 'parsed-all-rows.json'), JSON.stringify(allRows, null, 2), 'utf8')

    // eslint-disable-next-line no-console
    console.info(JSON.stringify(reports, null, 2))

    const anySender = reports.some((r) => r.senderHeader)
    expect(anySender).toBe(true)
    const totalMkt = reports.reduce((s, r) => s + r.mktGt, 0)
    expect(totalMkt).toBeGreaterThan(0)
    expect(MKT_GT_PLAYER_ID).toBe('1092502')
  })
})
