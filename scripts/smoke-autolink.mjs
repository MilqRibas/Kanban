import { autolinkMarkdown, renderMarkdown } from '../src/lib/markdown.ts'

const src =
  '![print-2026-10-28-13-28-24](https://gkyrsdciednwopqomqkp.supabase.co/storage/v1/object/public/card-attachments/board-1/card-69ceaea6/a-42465996-print-2026-10-28-13-28-24.png)'

const prepared = autolinkMarkdown(src.trim())
const html = renderMarkdown(src)
console.log('PREPARED ok:', prepared === src)
console.log('HTML has good src:', html.includes('src="https://gkyrsdciednwopqomqkp'))
console.log('HTML broken?', html.includes('%5Bhttps'))
if (prepared !== src || html.includes('%5Bhttps') || !html.includes('src="https://')) {
  process.exit(1)
}
console.log('OK')
