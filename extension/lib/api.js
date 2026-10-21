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
  const session = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: body.expires_at,
    user: body.user,
  }
  await setSession(session)
  return session
}

async function signOut() {
  await setSession(null)
}

async function rpc(fnName, params) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg()
  const session = await getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Entre de novo.')
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Configure extension/config.js.')
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
  if (!res.ok) {
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
  const m =
    text.match(/(?:^|[\s\-_|:(])(\d{5,12})(?:$|[\s\-_|:)])/) ||
    text.match(/(\d{5,12})\s*$/)
  return m?.[1] || null
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
  signIn,
  signOut,
  rpc,
  extractPlayerIdHypothesis,
  normalizePhoneE164,
}
