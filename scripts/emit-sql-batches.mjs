import fs from 'node:fs';
import path from 'node:path';

const projectId = 'gkyrsdciednwopqomqkp';
const payloadDir = path.resolve('docs/samples/_sql/_payloads');
const resultsPath = path.resolve('docs/samples/_sql/_payloads/apply-results.jsonl');

const start = Number(process.argv[2] ?? 2);
const end = Number(process.argv[3] ?? 31);

const results = [];

for (let i = start; i <= end; i++) {
  const n = String(i).padStart(2, '0');
  const queryPath = path.join(payloadDir, `batch-${n}.query.sql`);
  const query = fs.readFileSync(queryPath, 'utf8');
  process.stdout.write(`APPLYING batch ${n}\n`);
  // Marker for external MCP runner
  process.stdout.write(`__BATCH__${n}__\n`);
  process.stdout.write(query);
  process.stdout.write('\n__END_BATCH__\n');
}
