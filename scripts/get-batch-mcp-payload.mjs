import fs from 'fs';
import path from 'path';

const payloadDir = 'docs/samples/_sql/_payloads';
const projectId = 'gkyrsdciednwopqomqkp';

// Output one batch at a time for MCP execution
const batchNum = parseInt(process.argv[2] || '11', 10);
if (batchNum === 19) {
  console.error('Batch 19 already applied');
  process.exit(1);
}
const file = path.join(payloadDir, `batch-${String(batchNum).padStart(2, '0')}.json`);
const { query } = JSON.parse(fs.readFileSync(file, 'utf8'));
process.stdout.write(JSON.stringify({ project_id: projectId, query }));
