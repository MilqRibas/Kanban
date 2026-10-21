/** Smoke: padrões do caso Davi - 1737455 */
const PHONE_RE =
  /(?:\+|00)?\d{1,3}[\s.-]?\(?\d{2,3}\)?[\s.-]?\d{4,5}[-.\s]?\d{4}\b/
const NAME_ID_RE = /^(.+?)\s+[-–—]\s+(\d{5,12})\s*$/

function extractPlayerIdHypothesis(contactName) {
  const text = String(contactName || '').trim()
  if (!text) return null
  const dashed = text.match(/^(.+?)\s+[-–—]\s+(\d{5,12})\s*$/)
  if (dashed?.[2]) return dashed[2]
  const trail = text.match(/(?:^|[\s\-_|:(])(\d{5,12})\s*$/)
  return trail?.[1] || null
}

function normalizePhoneE164(raw, defaultCountry = '55') {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 8) return null
  let normalized = digits
  if (!trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 11) {
    normalized = `${defaultCountry}${digits}`
  }
  if (normalized.length < 10 || normalized.length > 15) return null
  return `+${normalized}`
}

const name = 'Davi - 1737455'
const phone = '+55 32 9153-8322'
const cases = [
  ['name match', NAME_ID_RE.test(name)],
  ['player id', extractPlayerIdHypothesis(name) === '1737455'],
  ['phone match', PHONE_RE.test(phone)],
  ['e164', normalizePhoneE164(phone) === '+553291538322'],
  ['no mid number', extractPlayerIdHypothesis('Sala 12 Poker') === null],
  ['no invent', extractPlayerIdHypothesis('Zico') === null],
]

let failed = 0
for (const [label, ok] of cases) {
  console.log(ok ? 'OK' : 'FAIL', label)
  if (!ok) failed++
}
process.exit(failed ? 1 : 0)
