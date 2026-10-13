import fs from 'node:fs';
import path from 'node:path';

const payloadDir = path.resolve('docs/samples/_sql/_payloads');
const start = Number(process.argv[2] ?? 7);
const end = Number(process.argv[3] ?? 31);
const outName = process.argv[4] ?? `combined-${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}.query.sql`;

const parts = [];
for (let i = start; i <= end; i++) {
  const n = String(i).padStart(2, '0');
  const sql = fs.readFileSync(path.join(payloadDir, `batch-${n}.query.sql`), 'utf8');
  parts.push(sql.replace(/\nSELECT count\(\*\)[\s\S]*$/m, ''));
}

const combined =
  parts.join('\n') +
  "\nSELECT count(*)::int AS with_sender FROM public.campaign_transactions WHERE board_id='board-1' AND sender_player_id IS NOT NULL;";

const outPath = path.join(payloadDir, outName);
fs.writeFileSync(outPath, combined);
console.log(JSON.stringify({ outPath, length: combined.length, batches: parts.length }));
