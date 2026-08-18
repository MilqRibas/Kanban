const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return currencyFormatter.format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${percentFormatter.format(value)}%`
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return numberFormatter.format(value)
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return dateTimeFormatter.format(date)
}

export function formatMonthYear(month: number, year: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) return '—'
  if (!Number.isInteger(year)) return '—'
  return `${MONTH_NAMES[month - 1]} de ${year}`
}

export function monthName(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) return '—'
  return MONTH_NAMES[month - 1]
}

/**
 * Contagens (impressões, alcance, conversas) digitadas no padrão BR
 * com ponto de milhar: 64.301 → 64301, 29.35 → 29350.
 * Inteiros já corretos (≥ 1000 ou sem decimal) não mudam.
 */
export function coerceBrazilianCount(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  if (value < 0) return null
  if (Number.isInteger(value)) return value
  if (value > 0 && value < 1000) {
    return Math.round(value * 1000)
  }
  return Math.round(value)
}

/** Parse de campo de contagem a partir do texto do formulário. */
export function parseCountInput(
  raw: string | number | null | undefined,
): number | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (!text) return null
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    return Number(text.replace(/\./g, ''))
  }
  if (/^\d{1,3}(,\d{3})+$/.test(text)) {
    return Number(text.replace(/,/g, ''))
  }
  let normalized = text
  if (text.includes(',') && text.includes('.')) {
    normalized = text.replace(/\./g, '').replace(',', '.')
  } else if (text.includes(',')) {
    normalized = text.replace(',', '.')
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return coerceBrazilianCount(n)
}

export function formatPaybackLabel(params: {
  reached: boolean
  month: number | null
  year: number | null
  monthsToPayback: number | null
}): string {
  if (!params.reached) return 'Ainda não atingiu'
  if (params.month && params.year) {
    const base = `Atingido em ${formatMonthYear(params.month, params.year).toLowerCase()}`
    if (params.monthsToPayback && params.monthsToPayback > 0) {
      const plural = params.monthsToPayback === 1 ? 'mês' : 'meses'
      return `${base} (após ${params.monthsToPayback} ${plural})`
    }
    return base
  }
  return 'Atingido'
}
