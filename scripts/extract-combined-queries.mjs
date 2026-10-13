import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const payloadDir = path.join(root, '..', 'docs', 'samples', '_sql', '_payloads')

for (const chunk of ['combined-21-23', 'combined-24-27', 'combined-28-31']) {
  const { query } = JSON.parse(fs.readFileSync(path.join(payloadDir, `${chunk}.exec.json`), 'utf8'))
  fs.writeFileSync(path.join(payloadDir, `${chunk}.query.txt`), query)
  console.log(chunk, query.length)
}
