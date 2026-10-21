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
  const dashed = text.match(/^(.+?)\s+[-–—]\s+(\d{5,12})\s*$/)
  if (dashed?.[2]) return dashed[2]
  const trail = text.match(/(?:^|[\s\-_|:(])(\d{5,12})\s*$/)
  return trail?.[1] || null
}
