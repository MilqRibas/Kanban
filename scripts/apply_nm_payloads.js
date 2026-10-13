#!/usr/bin/env node
/**
 * Emit nm payload apply instructions as JSON lines for agent MCP automation.
 * Usage: node scripts/apply_nm_payloads.js [start] [end]
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const execDir = path.join(root, 'docs', 'samples', '_sql', '_exec');
const projectId = 'gkyrsdciednwopqomqkp';

const start = Number(process.argv[2] ?? 1);
const end = Number(process.argv[3] ?? 23);

for (let i = start; i <= end; i++) {
  const file = path.join(execDir, `nm_payload_${String(i).padStart(2, '0')}.json`);
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify({
    file: `nm_payload_${String(i).padStart(2, '0')}.json`,
    project_id: projectId,
    query: payload.query,
  }));
}
