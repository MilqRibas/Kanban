import fs from 'node:fs'

function loadEnv(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    out[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

const env = {
  ...loadEnv('.env'),
  ...loadEnv('.env.local'),
  ...loadEnv('.env.production.local'),
}

/** Fallback público do projeto (anon / publishable) — nunca service_role. */
const FALLBACK_URL = 'https://gkyrsdciednwopqomqkp.supabase.co'
const FALLBACK_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdreXJzZGNpZWRud29wcW9tcWtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MjU4NDIsImV4cCI6MjEwMDQwMTg0Mn0.CZ9zkOCQnx4J2r0DpiYOUpEuywCLRyiyvxx2EP3S_dc'

const url =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_URL.includes('supabase.co')
    ? env.VITE_SUPABASE_URL
    : FALLBACK_URL
const anon =
  env.VITE_SUPABASE_ANON_KEY && env.VITE_SUPABASE_ANON_KEY.startsWith('eyJ')
    ? env.VITE_SUPABASE_ANON_KEY
    : FALLBACK_ANON
const app = env.VITE_APP_URL || 'https://timeb2c.vercel.app'

const body = `/* Gerado localmente — não versionar. */
globalThis.SX_B2C_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(anon)},
  BOARD_ID: 'board-1',
  APP_ORIGIN: ${JSON.stringify(app)},
}
`

fs.writeFileSync('extension/config.js', body)
console.log(
  JSON.stringify({
    ok: true,
    urlHost: new URL(url).host,
    anonLen: anon.length,
    app,
  }),
)
