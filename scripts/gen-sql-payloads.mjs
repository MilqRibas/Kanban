import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('docs/samples/_sql');
const out = path.join(dir, '_payloads');
fs.mkdirSync(out, { recursive: true });

for (let i = 2; i <= 31; i++) {
  const n = String(i).padStart(2, '0');
  const sql = fs.readFileSync(path.join(dir, `mcp_${n}.sql`), 'utf8').trim();
  const query =
    sql +
    "\nSELECT count(*)::int AS with_sender FROM public.campaign_transactions WHERE board_id='board-1' AND sender_player_id IS NOT NULL;";
  fs.writeFileSync(path.join(out, `batch-${n}.json`), JSON.stringify({ batch: n, query }));
}

console.log('wrote 30 payload files to', out);
