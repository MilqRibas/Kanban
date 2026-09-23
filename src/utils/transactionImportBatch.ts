/** Utilitários de import em lotes de transações. */

export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/**
 * Escolhe tamanho de lote para caber ~1.5MB por request (gateway/PostgREST).
 * Mínimo 50, máximo 500.
 */
export function chooseTransactionBatchSize(
  sampleRow: unknown,
  totalRows: number,
): number {
  if (totalRows <= 0) return 50
  const sampleBytes = Math.max(jsonByteLength(sampleRow), 1)
  const targetBytes = 1_500_000
  const bySize = Math.floor(targetBytes / sampleBytes)
  return Math.min(500, Math.max(50, bySize))
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  const n = Math.max(1, size)
  for (let i = 0; i < items.length; i += n) {
    out.push(items.slice(i, i + n))
  }
  return out
}

export function formatSupabaseError(
  err: unknown,
  fallback = 'Falha ao processar as transações.',
): string {
  if (!err || typeof err !== 'object') {
    if (err instanceof Error) return err.message || fallback
    return fallback
  }
  const e = err as {
    message?: string
    code?: string
    details?: string
    hint?: string
    name?: string
  }
  const parts = [
    e.message,
    e.code ? `code=${e.code}` : null,
    e.details ? `details=${e.details}` : null,
    e.hint ? `hint=${e.hint}` : null,
  ].filter(Boolean)
  if (parts.length === 0) {
    if (err instanceof Error) return err.message || fallback
    return fallback
  }
  return parts.join(' | ')
}
