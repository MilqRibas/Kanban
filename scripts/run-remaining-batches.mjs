import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const payloadDir = path.join(root, '..', 'docs', 'samples', '_sql', '_payloads')
const projectId = 'gkyrsdciednwopqomqkp'

const chunks = ['combined-20-23', 'combined-24-27', 'combined-28-31']

for (const chunk of chunks) {
  const file = path.join(payloadDir, `${chunk}.exec.json`)
  const { query } = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = path.join(payloadDir, `${chunk}.query.txt`)
  fs.writeFileSync(out, query)
  console.log(chunk, query.length, '->', out)
}
