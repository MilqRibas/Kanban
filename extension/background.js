chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {})
  }
})

async function saveContact(payload) {
  await chrome.storage.local.set({ waContact: payload })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'WA_CONTACT') {
    saveContact(message.payload).finally(() => sendResponse({ ok: true }))
    return true
  }

  if (message?.type === 'WA_REQUEST_READ') {
    ;(async () => {
      const tabs = await chrome.tabs.query({
        url: ['https://web.whatsapp.com/*', 'http://web.whatsapp.com/*'],
      })
      const tab =
        tabs.find((t) => t.active) ||
        tabs.find((t) => t.url?.includes('web.whatsapp.com')) ||
        tabs[0]
      if (!tab?.id) {
        sendResponse({
          ok: false,
          error: 'WhatsApp Web não encontrado. Abra web.whatsapp.com nesta janela.',
        })
        return
      }
      try {
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'WA_FORCE_READ' })
        sendResponse({ ok: true, payload: result?.payload || null })
      } catch {
        // Content script ausente (aba aberta antes da extensão) — reinjetar
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          })
          const result = await chrome.tabs.sendMessage(tab.id, {
            type: 'WA_FORCE_READ',
          })
          sendResponse({ ok: true, payload: result?.payload || null, reinjected: true })
        } catch (err) {
          sendResponse({
            ok: false,
            error:
              err?.message ||
              'Não foi possível ler o WhatsApp. Recarregue a aba do WhatsApp Web.',
          })
        }
      }
    })()
    return true
  }

  return false
})
