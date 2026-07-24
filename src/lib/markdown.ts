import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

marked.use({
  renderer: {
    link({ href, title, text }) {
      const safeHref = href ?? '#'
      const titleAttr = title ? ` title="${title}"` : ''
      return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  },
})

/** Converte URLs soltas em markdown de link. */
export function autolinkMarkdown(text: string) {
  return text.replace(
    /(^|[\s(])((https?:\/\/|www\.)[^\s<]+[^\s<.,:;!?)\]])/gi,
    (_match, prefix: string, raw: string) => {
      const url = raw.startsWith('http') ? raw : `https://${raw}`
      return `${prefix}[${raw}](${url})`
    },
  )
}

export function renderMarkdown(source: string) {
  const prepared = autolinkMarkdown(source.trim())
  if (!prepared) return ''
  return marked.parse(prepared, { async: false }) as string
}

/** Markdown leve para comentários (*itálico*, **negrito**). */
export function renderCommentMarkdown(body: string) {
  let html = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  html = html.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="font-semibold text-text-primary">$1</strong>',
  )
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2">$1</a>',
  )
  return html.replace(/\n/g, '<br>')
}

export function wrapSelection(
  value: string,
  start: number,
  end: number,
  wrapper: { before: string; after: string },
) {
  const selected = value.slice(start, end) || 'texto'
  const next = `${value.slice(0, start)}${wrapper.before}${selected}${wrapper.after}${value.slice(end)}`
  const cursor = start + wrapper.before.length + selected.length + wrapper.after.length
  return { next, cursor }
}
