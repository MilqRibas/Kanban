import fs from 'node:fs';
import path from 'node:path';

const payloadDir = path.resolve('docs/samples/_sql/_payloads');
const chunks = [
  'combined-07-10',
  'combined-11-14',
  'combined-15-18',
  'combined-19-19',
  'combined-20-23',
  'combined-24-27',
  'combined-28-31',
];

for (const chunk of chunks) {
  const j = JSON.parse(fs.readFileSync(path.join(payloadDir, `${chunk}.mcp.json`), 'utf8'));
  fs.writeFileSync(path.join(payloadDir, `${chunk}.exec.json`), JSON.stringify(j));
  console.log('wrote', chunk, j.query.length);
}
