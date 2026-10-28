/* global SX_B2C_CONFIG, SX_B2C_API */

try {
  importScripts('config.js', 'lib/api.js')
} catch (err) {
  console.warn('[SX B2C] Falha ao carregar config/api no background:', err)
}

const REFRESH_ALARM = 'sx-b2c-session-refresh'

async function saveContact(payload) {
  await chrome.storage.local.set({ waContact: payload })
}

async function scheduleSessionRefresh() {
  try {
    await chrome.alarms.clear(REFRESH_ALARM)
    // Renova a cada 45 min enquanto o Chrome estiver aberto
    await chrome.alarms.create(REFRESH_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: 45,
    })
  } catch (err) {
    console.warn('[SX B2C] alarms indisponível:', err)
  }
}

async function clearSessionRefresh() {
  try {
    await chrome.alarms.clear(REFRESH_ALARM)
  } catch {
    /* ignore */
  }
}

async function quietRefresh() {
  const api = globalThis.SX_B2C_API
  if (!api?.refreshSession || !api?.getSession) return { ok: false }
  const session = await api.getSession()
  if (!session?.refresh_token) return { ok: false, reason: 'no_session' }
  try {
    if (api.isExpiredOrNearExpiry(session, 300)) {
      await api.refreshSession({ clearOnHardFail: true })
    }
    return { ok: true }
  } catch (e) {
    // Rede / falha transitória: não força logout
    return { ok: false, reason: e?.code || e?.message || 'refresh_failed' }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {})
  }
  void scheduleSessionRefresh()
  void quietRefresh()
})

chrome.runtime.onStartup.addListener(() => {
  // PC/Chrome acabou de ligar — tenta renovar sem apagar login
  void scheduleSessionRefresh()
  void quietRefresh()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) void quietRefresh()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'WA_CONTACT') {
    saveContact(message.payload).finally(() => sendResponse({ ok: true }))
    return true
  }

  if (message?.type === 'AUTH_SCHEDULE_REFRESH') {
    scheduleSessionRefresh().finally(() => sendResponse({ ok: true }))
    return true
  }

  if (message?.type === 'AUTH_CLEAR_REFRESH') {
    clearSessionRefresh().finally(() => sendResponse({ ok: true }))
    return true
  }

  if (message?.type === 'AUTH_ENSURE') {
    ;(async () => {
      const api = globalThis.SX_B2C_API
      if (!api?.ensureSession) {
        sendResponse({ ok: false, error: 'API indisponível no background.' })
        return
      }
      try {
        const session = await api.ensureSession({ allowStale: false })
        sendResponse({
          ok: true,
          session: {
            expires_at: session.expires_at,
            user: session.user,
            persist: session.persist,
          },
        })
      } catch (e) {
        const stored = await api.getSession()
        sendResponse({
          ok: Boolean(stored?.refresh_token),
          soft: e?.code === 'REFRESH_SOFT' || e?.code === 'NETWORK',
          error: e?.message || 'Falha ao garantir sessão',
          hasSession: Boolean(stored?.refresh_token),
        })
      }
    })()
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

void scheduleSessionRefresh()
