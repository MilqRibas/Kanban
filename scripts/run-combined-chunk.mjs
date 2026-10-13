import fs from 'node:fs'
import path from 'node:path'

const chunk = process.argv[2]
if (!chunk) {
  console.error('Usage: node run-combined-chunk.mjs combined-16-18')
  process.exit(1)
}

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const file = path.join(root, '..', 'docs', 'samples', '_sql', '_payloads', `${chunk}.exec.json`)
const { project_id, query } = JSON.parse(fs.readFileSync(file, 'utf8'))

// Output MCP payload for manual inspection
console.log(JSON.stringify({ project_id, query_length: query.length, query_preview: query.slice(0, 80) }))
