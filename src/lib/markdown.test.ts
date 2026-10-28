import { describe, expect, it } from 'vitest'
import { autolinkMarkdown, renderMarkdown } from './markdown'

describe('autolinkMarkdown', () => {
  it('não corrompe imagens markdown', () => {
    const src =
      '![print-2026-10-28](https://example.supabase.co/storage/v1/object/public/card-attachments/board-1/a.png)'
    expect(autolinkMarkdown(src)).toBe(src)
    const html = renderMarkdown(src)
    expect(html).toContain(
      'src="https://example.supabase.co/storage/v1/object/public/card-attachments/board-1/a.png"',
    )
    expect(html).not.toContain('%5Bhttps')
  })

  it('não corrompe links markdown', () => {
    const src = '[docs](https://example.com/path)'
    expect(autolinkMarkdown(src)).toBe(src)
  })

  it('autolinka URL solta', () => {
    const src = 'Veja https://example.com/page aqui'
    expect(autolinkMarkdown(src)).toBe(
      'Veja [https://example.com/page](https://example.com/page) aqui',
    )
  })
})
