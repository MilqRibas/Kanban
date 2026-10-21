/** Normaliza telefone BR/internacional para E.164 (+digits). */

export function normalizePhoneE164(raw: string, defaultCountry = '55'): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 8) return null

  let normalized = digits
  if (trimmed.startsWith('+')) {
    normalized = digits
  } else if (digits.length >= 10 && digits.length <= 11) {
    normalized = `${defaultCountry}${digits}`
  } else if (digits.startsWith('0') && digits.length >= 11) {
    normalized = `${defaultCountry}${digits.replace(/^0+/, '')}`
  }

  if (normalized.length < 10 || normalized.length > 15) return null
  return `+${normalized}`
}

/** Extrai hipótese de Player ID de nomes tipo "Zico - 123456". */
export function extractPlayerIdHypothesis(contactName: string): string | null {
  const text = contactName.trim()
  if (!text) return null
  const patterns = [
    /(?:^|[\s\-_|:(])(\d{5,12})(?:$|[\s\-_|:)])/,
    /(\d{5,12})\s*$/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}
