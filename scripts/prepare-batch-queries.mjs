import fs from 'fs';
import path from 'path';

const dir = 'docs/samples/_sql';
const countQ =
  "SELECT count(*)::int AS with_sender FROM public.campaign_transactions WHERE board_id='board-1' AND sender_player_id IS NOT NULL;";

for (let i = 7; i <= 31; i++) {
  const name = `mcp_${String(i).padStart(2, '0')}.sql`;
  const sql = fs.readFileSync(path.join(dir, name), 'utf8').trim();
  const query = sql + '\n' + countQ;
  fs.writeFileSync(
    path.join(dir, '_payloads', `batch-${String(i).padStart(2, '0')}.json`),
    JSON.stringify({ batch: name, project_id: 'gkyrsdciednwopqomqkp', query })
  );
}
console.log('Prepared batches 07-31');
