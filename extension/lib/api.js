function cfg() {
  return window.SX_B2C_CONFIG || {}
}

async function getSession() {
  const { session } = await chrome.storage.local.get('session')
  return session || null
}

async function setSession(session) {
  if (session) await chrome.storage.local.set({ session })
  else await chrome.storage.local.remove('session')
}

function sessionFromTokenResponse(body, previous = null) {
  const expiresIn = Number(body.expires_in) || 3600
  const expiresAt =
    Number(body.expires_at) ||
    Math.floor(Date.now() / 1000) + expiresIn
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token || previous?.refresh_token || null,
    expires_at: expiresAt,
    expires_in: expiresIn,
    user: body.user || previous?.user || null,
  }
}

async function signIn(emailOrUser, password) {
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
  const session = sessionFromTokenResponse(body)
  await setSession(session)
  return session
}

async function signOut() {
  await setSession(null)
}

let refreshInFlight = null

async function refreshSession() {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg()
    const current = await getSession()
    if (!current?.refresh_token) {
      await setSession(null)
      throw new Error('Sessão expirada. Entre de novo.')
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Configure extension/config.js.')
    }

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      await setSession(null)
      throw new Error(
        body.error_description ||
          body.msg ||
          'Sessão expirada. Entre de novo na extensão.',
      )
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

function isExpiredOrNearExpiry(session, skewSeconds = 60) {
  if (!session?.access_token) return true
  const expiresAt = Number(session.expires_at)
  if (!expiresAt) return false
  return expiresAt <= Math.floor(Date.now() / 1000) + skewSeconds
}

async function ensureSession() {
  let session = await getSession()
  if (!session?.access_token) {
    throw new Error('Sessão expirada. Entre de novo.')
  }
  if (isExpiredOrNearExpiry(session)) {
    session = await refreshSession()
  }
  return session
}

function isAuthFailure(status, body) {
  if (status === 401 || status === 403) return true
  const msg = String(
    (body && (body.message || body.error || body.msg || body.error_description)) ||
      '',
  ).toLowerCase()
  return /jwt expired|invalid jwt|token is expired|not authenticated|session/i.test(
    msg,
  )
}

async function rpc(fnName, params, { retried = false } = {}) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg()
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Configure extension/config.js.')
  }

  let session
  try {
    session = await ensureSession()
  } catch (e) {
    throw e
  }

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
    await refreshSession()
    return rpc(fnName, params, { retried: true })
  }

  if (!res.ok) {
    if (isAuthFailure(res.status, body)) {
      await setSession(null)
      throw new Error('Sessão expirada. Entre de novo na extensão.')
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
  // Preferir padrão da equipe: "Nome - 123456"
  const dashed = text.match(/^(.+?)\s+[-–—]\s+(\d{5,12})\s*$/)
  if (dashed?.[2]) return dashed[2]
  // Fallback: ID no final após separador
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

window.SX_B2C_API = {
  cfg,
  getSession,
  setSession,
  ensureSession,
  refreshSession,
  signIn,
  signOut,
  rpc,
  extractPlayerIdHypothesis,
  normalizePhoneE164,
}
