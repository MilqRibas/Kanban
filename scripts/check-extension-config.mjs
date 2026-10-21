import fs from 'node:fs'

const c = fs.readFileSync('extension/config.js', 'utf8')
const anon = c.match(/SUPABASE_ANON_KEY:\s*"([^"]*)"/)?.[1] ?? ''
const url = c.match(/SUPABASE_URL:\s*"([^"]*)"/)?.[1] ?? ''
console.log(
  JSON.stringify({
    urlOk: url.includes('supabase.co'),
    anonLen: anon.length,
    jwtLike: anon.startsWith('eyJ'),
  }),
)
