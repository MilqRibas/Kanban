import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const payloadDir = path.join(root, '..', 'docs', 'samples', '_sql', '_payloads')
const store = 'C:/Users/sxgru/AppData/Local/Cursor/AgentStores/cursor_agent_stores/d9693148-b1cf-487a-a293-15d0d40e5458/files'

for (let n = 20; n <= 31; n++) {
  const file = path.join(payloadDir, `batch-${String(n).padStart(2, '0')}.json`)
  const { query } = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.writeFileSync(path.join(store, `mcp-batch-${String(n).padStart(2, '0')}.json`), JSON.stringify({ project_id: 'gkyrsdciednwopqomqkp', query }))
  console.log('wrote batch', n)
}
