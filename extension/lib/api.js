function cfg() {
  return (
    (typeof globalThis !== 'undefined' && globalThis.SX_B2C_CONFIG) ||
    (typeof window !== 'undefined' && window.SX_B2C_CONFIG) ||
    {}
  )
}

async function getSession() {
  const { session } = await chrome.storage.local.get('session')
  return session || null
}

async function setSession(session) {
  if (session) {
    await chrome.storage.local.set({
      session: {
        ...session,
        persist: session.persist !== false,
        savedAt: Date.now(),
      },
    })
  } else {
    await chrome.storage.local.remove('session')
  }
}

async function getRememberLogin() {
  const { rememberLogin } = await chrome.storage.local.get('rememberLogin')
  return rememberLogin !== false
}

async function setRememberLogin(value) {
  await chrome.storage.local.set({ rememberLogin: Boolean(value) })
}

async function getSavedLogin() {
  const { savedLogin } = await chrome.storage.local.get('savedLogin')
  return typeof savedLogin === 'string' ? savedLogin : ''
}

async function setSavedLogin(login) {
  const value = String(login || '').trim()
  if (value) await chrome.storage.local.set({ savedLogin: value })
  else await chrome.storage.local.remove('savedLogin')
}

function sessionFromTokenResponse(body, previous = null) {
  const expiresIn = Number(body.expires_in) || 3600
  let expiresAt = Number(body.expires_at)
  // Alguns payloads usam ms
  if (expiresAt > 1e12) expiresAt = Math.floor(expiresAt / 1000)
  if (!expiresAt) expiresAt = Math.floor(Date.now() / 1000) + expiresIn
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token || previous?.refresh_token || null,
    expires_at: expiresAt,
    expires_in: expiresIn,
    user: body.user || previous?.user || null,
    persist: previous?.persist !== false,
  }
}

function isHardAuthReject(status, body) {
  if (status === 400 || status === 401 || status === 403) {
    const msg = String(
      body?.error_description || body?.msg || body?.error || body?.message || '',
    ).toLowerCase()
    return /invalid.*(grant|token|refresh)|refresh.?token.*(not found|expired|revoked)|user.*banned|invalid_login/i.test(
      msg,
    )
  }
  return false
}

function isAuthFailure(status, body) {
  if (status === 401) return true
  const msg = String(
    (body && (body.message || body.error || body.msg || body.error_description)) ||
      '',
  ).toLowerCase()
  return /jwt expired|invalid jwt|token is expired|not authenticated/i.test(msg)
}

async function signIn(emailOrUser, password, { persist = true } = {}) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg()
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Configure extension/config.js (URL e anon key).')
  }

  let email = emailOrUser.trim()
  if (!email.includes('@')) {
    const resolveRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_login_email`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_username: email }),
    })
    if (resolveRes.ok) {
      const resolved = await resolveRes.json()
      if (typeof resolved === 'string' && resolved.includes('@')) email = resolved
    }
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error_description || body.msg || 'Falha no login.')
  }
  const session = sessionFromTokenResponse(body, { persist })
  session.persist = persist !== false
  await setSession(session)
  await setRememberLogin(session.persist)
  await setSavedLogin(emailOrUser.trim() || email)
  try {
    chrome.runtime.sendMessage({ type: 'AUTH_SCHEDULE_REFRESH' }, () => {
      void chrome.runtime.lastError
    })
  } catch {
    /* ignore */
  }
  return session
}

async function signOut() {
  await setSession(null)
  try {
    chrome.runtime.sendMessage({ type: 'AUTH_CLEAR_REFRESH' }, () => {
      void chrome.runtime.lastError
    })
  } catch {
    /* ignore */
  }
}

let refreshInFlight = null

async function refreshSession({ clearOnHardFail = true } = {}) {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg()
    const current = await getSession()
    if (!current?.refresh_token) {
      if (clearOnHardFail) await setSession(null)
      const err = new Error('Sessão expirada. Entre de novo.')
      err.code = 'NO_REFRESH'
      throw err
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Configure extension/config.js.')
    }

    let res
    try {
      res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      })
    } catch (networkErr) {
      // PC acabou de ligar / rede instável — não apaga a sessão persistida
      const err = new Error(
        networkErr?.message || 'Sem rede para renovar a sessão. Tente de novo.',
      )
      err.code = 'NETWORK'
      err.session = current
      throw err
    }

    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (clearOnHardFail && isHardAuthReject(res.status, body)) {
        await setSession(null)
      }
      const err = new Error(
        body.error_description ||
          body.msg ||
          'Não foi possível renovar a sessão.',
      )
      err.code = isHardAuthReject(res.status, body) ? 'INVALID_REFRESH' : 'REFRESH_FAILED'
      err.session = current
      throw err
    }
    const session = sessionFromTokenResponse(body, current)
    await setSession(session)
    return session
  })()

  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}

function isExpiredOrNearExpiry(session, skewSeconds = 90) {
  if (!session?.access_token) return true
  const expiresAt = Number(session.expires_at)
  if (!expiresAt) return false
  return expiresAt <= Math.floor(Date.now() / 1000) + skewSeconds
}

/**
 * Garante access_token válido.
 * Com persist=true, erros de rede NÃO apagam o refresh_token (login sobrevive ao reboot).
 */
async function ensureSession({ allowStale = false } = {}) {
  let session = await getSession()
  if (!session?.access_token && !session?.refresh_token) {
    throw new Error('Sessão expirada. Entre de novo.')
  }

  if (!isExpiredOrNearExpiry(session)) return session

  try {
    return await refreshSession({ clearOnHardFail: session.persist !== false })
  } catch (e) {
    if (e?.code === 'INVALID_REFRESH' || e?.code === 'NO_REFRESH') throw e
    if (allowStale && session?.access_token) return session
    // Mantém sessão no storage; propaga erro para UI tentar de novo
    if (session?.refresh_token) {
      const soft = new Error(
        e?.message || 'Não foi possível renovar agora. Mantivemos seu login.',
      )
      soft.code = e?.code || 'REFRESH_SOFT'
      soft.session = session
      throw soft
    }
    throw e
  }
}

async function rpc(fnName, params, { retried = false } = {}) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg()
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Configure extension/config.js.')
  }

  const session = await ensureSession()

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  const body = await res.json().catch(() => null)

  if (!res.ok && !retried && isAuthFailure(res.status, body)) {
    await refreshSession({ clearOnHardFail: true })
    return rpc(fnName, params, { retried: true })
  }

  if (!res.ok) {
    if (isAuthFailure(res.status, body)) {
      // Só limpa se refresh token também falhar na próxima; aqui tenta soft
      throw new Error('Token inválido. Use Atualizar ou entre de novo se persistir.')
    }
    const msg =
      (body && (body.message || body.error || body.hint)) ||
      `RPC ${fnName} falhou (${res.status}).`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return body
}

function extractPlayerIdHypothesis(contactName) {
  const text = String(contactName || '').trim()
  if (!text) return null
  const dashed = text.match(/^(.+?)\s+[-–—]\s+(\d{5,12})\s*$/)
  if (dashed?.[2]) return dashed[2]
  const trail = text.match(/(?:^|[\s\-_|:(])(\d{5,12})\s*$/)
  return trail?.[1] || null
}

function normalizePhoneE164(raw, defaultCountry = '55') {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 8) return null
  let normalized = digits
  if (!trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 11) {
    normalized = `${defaultCountry}${digits}`
  }
  if (normalized.length < 10 || normalized.length > 15) return null
  return `+${normalized}`
}

const apiExport = {
  cfg,
  getSession,
  setSession,
  getRememberLogin,
  setRememberLogin,
  getSavedLogin,
  setSavedLogin,
  ensureSession,
  refreshSession,
  signIn,
  signOut,
  rpc,
  extractPlayerIdHypothesis,
  normalizePhoneE164,
  isExpiredOrNearExpiry,
}

if (typeof window !== 'undefined') {
  window.SX_B2C_API = apiExport
}
if (typeof globalThis !== 'undefined') {
  globalThis.SX_B2C_API = apiExport
}
