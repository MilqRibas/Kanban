/**
 * Fonte única das regras econômicas de incentivo (Etapa 2).
 * Não hardcodar 18%/25% em componentes ou RPCs — usar estas constantes
 * e a tabela crm_economic_settings no banco (espelho operacional).
 */

/** Player ID oficial da conta operacional de incentivos. Nunca usar nickname. */
export const MKT_GT_PLAYER_ID = '1092502'

/** Taxa da liga sobre o rake bruto histórico confirmado. */
export const LEAGUE_FEE_RATE = 0.18

/**
 * Percentual do rake líquido histórico que define o Limite de Incentivo.
 * limite = rakeLiquido * INCENTIVE_LIMIT_RATE
 * equivalência: limite = rakeBruto * (1 - LEAGUE_FEE_RATE) * INCENTIVE_LIMIT_RATE
 *             = rakeBruto * 0.205 com os defaults atuais.
 */
export const INCENTIVE_LIMIT_RATE = 0.25

export const INCENTIVE_CLASSIFICATIONS = [
  'ativacao',
  'relacionamento',
  'acao',
  'pendente',
] as const

export type IncentiveClassification = (typeof INCENTIVE_CLASSIFICATIONS)[number]

export type IncentiveEconomics = {
  rakeBrutoHistorico: number
  taxaLiga: number
  rakeLiquidoHistorico: number
  percentualLimite: number
  limiteIncentivo: number
  incentivoEnviado: number
  incentivoDisponivel: number
}

function asMoney(n: number): number {
  if (!Number.isFinite(n)) return 0
  // Evita lixo de ponto flutuante sem truncar regra de negócio.
  return Math.round(n * 1e6) / 1e6
}

export function computeIncentiveEconomics(params: {
  rakeBrutoHistorico: number
  incentivoEnviado: number
  leagueFeeRate?: number
  incentiveLimitRate?: number
}): IncentiveEconomics {
  const league = params.leagueFeeRate ?? LEAGUE_FEE_RATE
  const limitRate = params.incentiveLimitRate ?? INCENTIVE_LIMIT_RATE
  const rakeBrutoHistorico = asMoney(Math.max(0, Number(params.rakeBrutoHistorico) || 0))
  const incentivoEnviado = asMoney(Math.max(0, Number(params.incentivoEnviado) || 0))
  const taxaLiga = asMoney(rakeBrutoHistorico * league)
  const rakeLiquidoHistorico = asMoney(rakeBrutoHistorico - taxaLiga)
  const limiteIncentivo = asMoney(rakeLiquidoHistorico * limitRate)
  const incentivoDisponivel = asMoney(limiteIncentivo - incentivoEnviado)

  return {
    rakeBrutoHistorico,
    taxaLiga,
    rakeLiquidoHistorico,
    percentualLimite: limitRate,
    limiteIncentivo,
    incentivoEnviado,
    incentivoDisponivel,
  }
}

/** Identificação canônica da conta MKT GT — somente Player ID. */
export function isMktGtSender(senderPlayerId: string | null | undefined): boolean {
  return String(senderPlayerId ?? '').trim() === MKT_GT_PLAYER_ID
}

/**
 * Incentivo Enviado (regra definitiva Etapa 2):
 * Sender = MKT GT OR transação Bônus.
 * Uma TX que satisfaz ambos conta uma única vez (união, não soma).
 */
export function isIncentiveTransaction(params: {
  senderPlayerId?: string | null
  isBonus?: boolean | null
}): boolean {
  return isMktGtSender(params.senderPlayerId) || Boolean(params.isBonus)
}

export type IncentiveDetection = 'mkt_gt' | 'bonus' | 'mkt_gt_bonus'

export function incentiveDetection(params: {
  senderPlayerId?: string | null
  isBonus?: boolean | null
}): IncentiveDetection | null {
  const mkt = isMktGtSender(params.senderPlayerId)
  const bonus = Boolean(params.isBonus)
  if (mkt && bonus) return 'mkt_gt_bonus'
  if (mkt) return 'mkt_gt'
  if (bonus) return 'bonus'
  return null
}

/**
 * Soma deduplicada de incentivos (cada TX uma vez).
 * Preferir chamar com linhas já filtradas por isIncentiveTransaction.
 */
export function sumIncentiveSent(
  rows: Array<{ amount: number; externalTransactionId?: string }>,
): number {
  const seen = new Set<string>()
  let total = 0
  for (const row of rows) {
    const key = row.externalTransactionId ?? `__idx_${seen.size}`
    if (seen.has(key)) continue
    seen.add(key)
    total += Math.abs(Number(row.amount) || 0)
  }
  return asMoney(total)
}

/**
 * Classificação automática inicial:
 * primeira transferência histórica de incentivo → ativacao;
 * demais → pendente.
 * Desempate: occurredAt ASC, depois externalTransactionId ASC.
 */
export function classifyMktGtTransfersChronologically<
  T extends { externalTransactionId: string; occurredAt: string | null },
>(transfers: T[]): Array<T & { classification: IncentiveClassification }> {
  return classifyIncentiveTransfersChronologically(transfers)
}

/** Alias semântico: classificação sobre o universo de incentivos (MKT GT OU Bônus). */
export function classifyIncentiveTransfersChronologically<
  T extends { externalTransactionId: string; occurredAt: string | null },
>(transfers: T[]): Array<T & { classification: IncentiveClassification }> {
  const sorted = [...transfers].sort((a, b) => {
    const ta = a.occurredAt ?? ''
    const tb = b.occurredAt ?? ''
    if (ta !== tb) return ta < tb ? -1 : 1
    return a.externalTransactionId < b.externalTransactionId
      ? -1
      : a.externalTransactionId > b.externalTransactionId
        ? 1
        : 0
  })
  return sorted.map((row, idx) => ({
    ...row,
    classification: (idx === 0 ? 'ativacao' : 'pendente') as IncentiveClassification,
  }))
}
