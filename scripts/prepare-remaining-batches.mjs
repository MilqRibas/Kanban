import fs from 'fs';
import path from 'path';

const payloadDir = 'docs/samples/_sql/_payloads';
const results = [];

for (let i = 8; i <= 31; i++) {
  if (i === 19) continue; // already applied
  const file = path.join(payloadDir, `batch-${String(i).padStart(2, '0')}.json`);
  const { project_id, query } = JSON.parse(fs.readFileSync(file, 'utf8'));
  results.push({ batch: i, project_id, query_len: query.length, query });
}

fs.writeFileSync(
  path.join(payloadDir, 'remaining-batches.json'),
  JSON.stringify(results)
);
console.log(`Prepared ${results.length} remaining batches`);
