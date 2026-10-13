import fs from 'node:fs';
import path from 'node:path';

const chunk = process.argv[2];
if (!chunk) {
  console.error('usage: node scripts/print-mcp-query.mjs <chunk-name>');
  process.exit(1);
}

const file = path.resolve('docs/samples/_sql/_payloads', `${chunk}.mcp.json`);
const { query } = JSON.parse(fs.readFileSync(file, 'utf8'));
process.stdout.write(query);
