#!/usr/bin/env node
/**
 * Apply nm payload SQL batches by reading invoke JSON files.
 * Prints one JSON line per batch: {file, ok, result|error}
 * Uses DATABASE_URL from .env.local when set (direct postgres), otherwise exits with instructions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const execDir = path.join(root, 'docs', 'samples', '_sql', '_exec');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

const start = Number(process.argv[2] ?? 1);
const end = Number(process.argv[3] ?? 23);
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL not found in .env.local or .env');
  process.exit(2);
}

const { Client } = await import('pg');
const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const results = [];
for (let i = start; i <= end; i++) {
  const file = `nm_payload_${String(i).padStart(2, '0')}.json`;
  const payloadPath = path.join(execDir, file);
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  try {
    await client.query(payload.query);
    results.push({ file, ok: true, result: [] });
  } catch (err) {
    results.push({ file, ok: false, error: String(err.message || err) });
  }
}

await client.end();
for (const r of results) console.log(JSON.stringify(r));
