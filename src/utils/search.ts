export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function searchTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(/[\s,;]+/)
    .filter((token) => token.length > 0)
}

export function buildSearchHaystack(
  parts: Array<string | number | null | undefined>,
): string {
  return normalizeSearchText(
    parts
      .filter((part) => part != null && String(part).trim() !== '')
      .join(' '),
  )
}

export function matchesSearch(haystack: string, query: string): boolean {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return true
  return tokens.every((token) => haystack.includes(token))
}
