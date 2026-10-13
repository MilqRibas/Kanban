import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const payloadDir = path.join(root, '..', 'docs', 'samples', '_sql', '_payloads')
const chunk = process.argv[2]
if (!chunk) {
  console.error('Usage: node mcp-write-invoke.mjs combined-21-23')
  process.exit(1)
}

const queryPath = path.join(payloadDir, `${chunk}.query.txt`)
const query = fs.readFileSync(queryPath, 'utf8')
const out = path.join(payloadDir, `invoke-${chunk}.json`)
fs.writeFileSync(
  out,
  JSON.stringify({ project_id: 'gkyrsdciednwopqomqkp', query }),
)
console.log(out, query.length)
