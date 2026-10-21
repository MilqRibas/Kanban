/**
 * Métrica complementar Rake sobre Depósitos (%).
 * Preparada, NÃO publicada como indicador oficial até validação de cobertura.
 *
 * Fórmula conceitual: rake bruto do período / depósitos válidos do período × 100
 * Não substitui rake, depósitos, incentivos nem payback.
 */

export type RakeOverDepositsStatus =
  | 'ready'
  | 'unavailable_zero_deposits'
  | 'unavailable_pending_validation'
  | 'unavailable_incomplete_coverage'

export type RakeOverDepositsResult = {
  status: RakeOverDepositsStatus
  /** Percentual quando status === 'ready'; null caso contrário. */
  percent: number | null
  rakeBruto: number
  depositsValid: number | null
  reason: string
}

/**
 * Calcula a razão quando os insumos já estão validados pelo chamador.
 * Se a cobertura de depósitos não foi auditada, retorna pendente.
 */
export function computeRakeOverDeposits(input: {
  rakeBruto: number
  depositsValid: number | null
  depositsCoverageValidated: boolean
}): RakeOverDepositsResult {
  if (!input.depositsCoverageValidated) {
    return {
      status: 'unavailable_pending_validation',
      percent: null,
      rakeBruto: input.rakeBruto,
      depositsValid: input.depositsValid,
      reason:
        'Métrica pendente de validação da cobertura histórica de depósitos.',
    }
  }
  if (input.depositsValid == null) {
    return {
      status: 'unavailable_incomplete_coverage',
      percent: null,
      rakeBruto: input.rakeBruto,
      depositsValid: null,
      reason: 'Cobertura de depósitos incompleta no período.',
    }
  }
  if (input.depositsValid <= 0) {
    return {
      status: 'unavailable_zero_deposits',
      percent: null,
      rakeBruto: input.rakeBruto,
      depositsValid: input.depositsValid,
      reason: 'Depósitos válidos zero — percentual indisponível.',
    }
  }
  return {
    status: 'ready',
    percent: (input.rakeBruto / input.depositsValid) * 100,
    rakeBruto: input.rakeBruto,
    depositsValid: input.depositsValid,
    reason: '',
  }
}
