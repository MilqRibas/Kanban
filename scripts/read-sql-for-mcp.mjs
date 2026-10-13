import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/read-sql-for-mcp.mjs <sql-file>');
  process.exit(1);
}
const query = fs.readFileSync(path.resolve(file), 'utf8');
process.stdout.write(JSON.stringify({ project_id: 'gkyrsdciednwopqomqkp', query }));
