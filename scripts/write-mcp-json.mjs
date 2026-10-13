import fs from 'node:fs';
import path from 'node:path';

const payloadDir = path.resolve('docs/samples/_sql/_payloads');
const chunks = [
  'combined-07-10.query.sql',
  'combined-11-14.query.sql',
  'combined-15-18.query.sql',
  'combined-19-19.query.sql',
  'combined-20-23.query.sql',
  'combined-24-27.query.sql',
  'combined-28-31.query.sql',
];

for (const chunk of chunks) {
  const query = fs.readFileSync(path.join(payloadDir, chunk), 'utf8');
  const out = path.join(payloadDir, chunk.replace('.query.sql', '.mcp.json'));
  fs.writeFileSync(out, JSON.stringify({ project_id: 'gkyrsdciednwopqomqkp', query }));
  console.log('wrote', out, 'len', query.length);
}
