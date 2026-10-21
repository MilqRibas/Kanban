/**
 * Leitura assistida do WhatsApp Web.
 * - Nome do chat / painel "Dados do contato"
 * - Telefone só no painel de detalhes (não em mensagens)
 * Sem APIs internas do WhatsApp.
 */

const PHONE_RE =
  /(?:\+|00)?\d{1,3}[\s.-]?\(?\d{2,3}\)?[\s.-]?\d{4,5}[-.\s]?\d{4}\b/
const NAME_ID_RE = /^(.+?)\s+[-–—]\s+(\d{5,12})\s*$/

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeUiChrome(text) {
  return /^(dados do contato|contact info|info\.?\s*do contato|mídia|midia|links|docs|buscar|search|ligação|chamada|call|bloquear|block|denunciar|report|grupos em comum|comum|áudio|audio|vídeo|video|mensagem|message|hoje|ontem|today|yesterday|digite|type a message)$/i.test(
    text,
  )
}

function extractPhoneFromText(text) {
  const m = String(text || '').match(PHONE_RE)
  if (!m) return null
  return cleanText(m[0])
}

function isLikelyPhone(text) {
  const t = cleanText(text)
  if (!t || t.length > 40 || !PHONE_RE.test(t)) return false
  const digits = t.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}

function isLikelyContactName(text) {
  const t = cleanText(text)
  if (!t || t.length < 2 || t.length > 80 || looksLikeUiChrome(t)) return false
  if (isLikelyPhone(t)) return false
  return true
}

/**
 * Localiza o painel "Dados do contato" / chat info drawer.
 * Preferência: nós com título da UI; fallback: painel compacto com Nome - ID + telefone.
 */
function findContactInfoRoot() {
  const candidates = document.querySelectorAll(
    '[data-testid*="contact-info"], [data-testid*="ContactInfo"], [data-testid*="drawer"], [data-testid="chat-info-drawer"], aside, [role="dialog"], section',
  )
  for (const el of candidates) {
    const raw = String(el.innerText || el.textContent || '').slice(0, 800)
    if (/dados do contato|contact info|info\.?\s*do contato/i.test(raw)) {
      return el
    }
  }

  // Fallback sem cleanText (preserva linhas): Nome - ID + telefone no mesmo painel
  for (const el of document.querySelectorAll('div, section, aside')) {
    if (el.childElementCount > 120) continue
    const raw = String(el.innerText || '')
    if (raw.length < 20 || raw.length > 3500) continue
    if (!PHONE_RE.test(raw)) continue
    const lines = raw
      .split(/\n/)
      .map((l) => cleanText(l))
      .filter(Boolean)
      .slice(0, 16)
    if (lines.some((l) => NAME_ID_RE.test(l))) return el
  }
  return null
}

function readNameFromContactInfo(root) {
  if (!root) return null

  const titled = root.querySelectorAll(
    'h1, h2, h3, span[dir="auto"], div[dir="auto"], [data-testid*="title"], [data-testid*="name"], span[title], div[title]',
  )
  let best = null
  for (const el of titled) {
    const titledAttr = cleanText(el.getAttribute('title') || '')
    const text = titledAttr || cleanText(el.textContent)
    if (!isLikelyContactName(text)) continue
    if (NAME_ID_RE.test(text)) return text
    if (!best && /\d{5,12}/.test(text)) best = text
  }
  if (best) return best

  const chunks = String(root.innerText || '')
    .split(/\n/)
    .map(cleanText)
    .filter(Boolean)
  for (const line of chunks.slice(0, 16)) {
    if (looksLikeUiChrome(line) || isLikelyPhone(line)) continue
    if (NAME_ID_RE.test(line)) return line
  }
  for (const line of chunks.slice(0, 10)) {
    if (looksLikeUiChrome(line) || isLikelyPhone(line)) continue
    if (isLikelyContactName(line)) return line
  }
  return null
}

function readPhoneFromContactInfo(root) {
  if (!root) return null

  const tel = root.querySelector('a[href^="tel:"]')
  if (tel) {
    const fromHref = cleanText(tel.getAttribute('href')?.replace(/^tel:/i, ''))
    if (fromHref && isLikelyPhone(fromHref)) return fromHref
    const fromText = extractPhoneFromText(tel.textContent)
    if (fromText) return fromText
  }

  // Preferir linhas curtas do painel (evita texto de mídia/grupos)
  const lines = String(root.innerText || '')
    .split(/\n/)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 24)
  for (const line of lines) {
    if (looksLikeUiChrome(line)) continue
    if (isLikelyPhone(line)) return line
  }

  const spans = root.querySelectorAll('span, div, a')
  for (const el of spans) {
    const text = cleanText(el.textContent)
    if (isLikelyPhone(text)) return text
  }

  return extractPhoneFromText(
    lines.filter((l) => !looksLikeUiChrome(l)).join(' '),
  )
}

function readActiveChatName() {
  const selectors = [
    '#main header [data-testid="conversation-info-header-chat-title"]',
    '#main header [data-testid="conversation-header"] span[dir="auto"]',
    '#main header [data-testid="conversation-info-header"] span[dir="auto"]',
    '#main header span[title]',
    '#main header span[dir="auto"]',
    'header [data-testid="conversation-info-header-chat-title"]',
    '#main header div[role="button"] span[dir="auto"]',
    '#main header div[role="button"] span[title]',
  ]

  const scored = []
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const titled = cleanText(el.getAttribute('title') || '')
      const text = titled || cleanText(el.textContent)
      if (!isLikelyContactName(text)) continue
      let score = 1
      if (NAME_ID_RE.test(text)) score += 10
      if (titled) score += 2
      if (el.closest('#main header')) score += 3
      scored.push({ text, score })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  if (scored[0]) return scored[0].text

  // Fallback: conversa selecionada na lista lateral
  const side =
    document.querySelector(
      '#pane-side [aria-selected="true"] [data-testid="cell-frame-title"], #pane-side [aria-selected="true"] span[dir="auto"], #pane-side [aria-selected="true"] span[title]',
    ) ||
    document.querySelector(
      '[data-testid="cell-frame-container"][aria-selected="true"] span[title], [data-testid="cell-frame-container"][aria-selected="true"] span[dir="auto"]',
    )
  if (side) {
    const t =
      cleanText(side.getAttribute('title') || '') || cleanText(side.textContent)
    if (isLikelyContactName(t)) return t
  }

  return null
}

function readContactSnapshot() {
  const infoRoot = findContactInfoRoot()
  const detailsOpen = Boolean(infoRoot)
  const nameFromDetails = readNameFromContactInfo(infoRoot)
  const nameFromChat = readActiveChatName()
  const contactName = nameFromDetails || nameFromChat || null
  const phoneRaw = detailsOpen ? readPhoneFromContactInfo(infoRoot) : null

  let status = 'waiting_chat'
  if (detailsOpen && contactName && phoneRaw) status = 'details_with_phone'
  else if (detailsOpen && contactName) status = 'details_no_phone'
  else if (detailsOpen) status = 'reading_details'
  else if (contactName) status = 'chat_detected'
  else status = 'waiting_chat'

  return {
    contactName,
    phoneRaw,
    detailsOpen,
    status,
    capturedAt: new Date().toISOString(),
    href: location.href,
  }
}

let lastFingerprint = ''
let publishTimer = null

function fingerprint(payload) {
  return [
    payload.contactName || '',
    payload.phoneRaw || '',
    payload.detailsOpen ? '1' : '0',
    payload.status || '',
  ].join('|')
}

function publish(force = false) {
  const payload = readContactSnapshot()
  const fp = fingerprint(payload)
  if (!force && fp === lastFingerprint) return
  lastFingerprint = fp

  chrome.runtime.sendMessage(
    { type: 'WA_CONTACT', payload },
    () => void chrome.runtime.lastError,
  )
}

function schedulePublish() {
  if (publishTimer) clearTimeout(publishTimer)
  publishTimer = setTimeout(() => publish(false), 280)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'WA_PING' || message?.type === 'WA_FORCE_READ') {
    const payload = readContactSnapshot()
    lastFingerprint = fingerprint(payload)
    chrome.runtime.sendMessage(
      { type: 'WA_CONTACT', payload },
      () => void chrome.runtime.lastError,
    )
    sendResponse({ ok: true, payload })
    return true
  }
  return false
})

const observer = new MutationObserver(schedulePublish)
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
})

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) publish(true)
})
window.addEventListener('focus', () => publish(true))
setInterval(() => publish(false), 2500)
publish(true)
