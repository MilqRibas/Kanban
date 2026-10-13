#!/usr/bin/env node
/**
 * Apply mcp_00..mcp_31 via Supabase REST if SERVICE_ROLE key is available.
 * Fallback: prints batch SQL paths for manual MCP execution.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const execDir = join(root, 'docs', 'samples', '_sql', '_exec')

function loadEnv() {
  try {
    const envPath = join(root, '.env')
    const text = readFileSync(envPath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {}
}

loadEnv()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY

const batches = Array.from({ length: 32 }, (_, i) => {
  const p = join(execDir, `mcp_${String(i).padStart(2, '0')}.json`)
  return JSON.parse(readFileSync(p, 'utf8'))
})

if (!url || !key) {
  console.log(JSON.stringify({ error: 'missing_service_role', batches: batches.length }))
  process.exit(2)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const results = []
for (let i = 0; i < batches.length; i++) {
  const { query } = batches[i]
  const { error } = await supabase.rpc('exec_sql', { query })
  if (error) {
    // direct SQL via postgres not exposed; try raw fetch to sql endpoint
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) {
      results.push({ batch: i, ok: false, error: error.message || await res.text() })
      continue
    }
  }
  results.push({ batch: i, ok: true })
}

console.log(JSON.stringify({ applied: results.filter(r => r.ok).length, results }))
