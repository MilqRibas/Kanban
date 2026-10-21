chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {})
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'WA_CONTACT') {
    chrome.storage.local.set({ waContact: message.payload }).finally(() => {
      sendResponse({ ok: true })
    })
    return true
  }
  return false
})
