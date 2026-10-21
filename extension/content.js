/**
 * Leitura assistida do WhatsApp Web — apenas nome do chat ativo.
 * Não captura mensagens. Seletores podem mudar; falha com graça.
 */

function readActiveContactName() {
  const selectors = [
    'header [data-testid="conversation-info-header-chat-title"]',
    '#main header span[dir="auto"]',
    'header div[role="button"] span[dir="auto"]',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    const text = el?.textContent?.trim()
    if (text) return text
  }
  return null
}

function publish() {
  const name = readActiveContactName()
  if (!name) return
  chrome.runtime.sendMessage({
    type: 'WA_CONTACT',
    payload: {
      contactName: name,
      capturedAt: new Date().toISOString(),
      href: location.href,
    },
  })
}

let lastName = null
const observer = new MutationObserver(() => {
  const name = readActiveContactName()
  if (name && name !== lastName) {
    lastName = name
    publish()
  }
})

observer.observe(document.body, { childList: true, subtree: true })
setInterval(publish, 4000)
publish()
