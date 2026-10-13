#!/usr/bin/env node
/** Read invoke JSON and print {project_id, query} for MCP execute_sql */
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) {
  console.error('Usage: node apply_nm_invoke.js <invoke-json-path>');
  process.exit(1);
}
const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
process.stdout.write(JSON.stringify({ project_id: payload.project_id, query: payload.query }));
