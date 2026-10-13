import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const payloadDir = path.join(root, '..', 'docs', 'samples', '_sql', '_payloads')
const projectId = 'gkyrsdciednwopqomqkp'

function build(name, batchNums) {
  let query = ''
  for (const n of batchNums) {
    const file = path.join(payloadDir, `batch-${String(n).padStart(2, '0')}.json`)
    const { query: batchQuery } = JSON.parse(fs.readFileSync(file, 'utf8'))
    query += batchQuery.replace(/\nSELECT count\(\*\).*$/s, '') + '\n'
  }
  query +=
    "SELECT count(*)::int AS with_sender FROM public.campaign_transactions WHERE board_id='board-1' AND sender_player_id IS NOT NULL;"
  const out = path.join(payloadDir, `${name}.exec.json`)
  fs.writeFileSync(out, JSON.stringify({ project_id: projectId, query }))
  console.log(name, query.length)
}

build('combined-16-18', [16, 17, 18])
build('combined-21-23', [21, 22, 23])
build('combined-24-27', [24, 25, 26, 27])
build('combined-28-31', [28, 29, 30, 31])
