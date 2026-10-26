const root = document.getElementById('root')
const api = window.SX_B2C_API

/** @type {{ source: 'whatsapp'|'manual'|null, playerId: string|null, contactKey: string|null }} */
let context = { source: null, playerId: null, contactKey: null }
let lastAutoLookupKey = null
let lookupBusy = false

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function incentivesFrom360(player360) {
  const inc = player360?.incentives || {}
  return {
    limite: inc.limiteIncentivo,
    enviado: inc.incentivoEnviado,
    disponivel: inc.incentivoDisponivel,
    nickname: player360?.nickname || player360?.name || null,
  }
}

function statusLabel(status, hasName, hasPhone) {
  switch (status) {
    case 'details_with_phone':
      return 'Contato detectado · telefone nos detalhes'
    case 'details_no_phone':
      return 'Lendo detalhes · telefone não disponível neste painel'
    case 'reading_details':
      return 'Lendo detalhes do contato…'
    case 'chat_detected':
      return hasName
        ? 'Conversa detectada · abra Dados do contato para capturar o telefone'
        : 'Conversa detectada'
    case 'waiting_chat':
    default:
      return hasName
        ? 'Contato detectado'
        : 'Aguardando conversa — abra um chat no WhatsApp Web (use Atualizar contato se a aba já estava aberta)'
  }
}

function contactKeyOf(wa) {
  return [wa?.contactName || '', wa?.phoneRaw || '', wa?.status || ''].join('|')
}

async function requestWhatsAppRead() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'WA_REQUEST_READ' }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message })
        return
      }
      resolve(res || { ok: false, error: 'Sem resposta do background.' })
    })
  })
}

async function renderLogin() {
  root.innerHTML = `
    <p class="muted">Login SX B2C — Agentes de Ativação</p>
    <label>Usuário ou e-mail<input id="login" /></label>
    <label>Senha<input id="password" type="password" /></label>
    <button id="btn-login">Entrar</button>
    <p id="err" class="error" hidden></p>
  `
  document.getElementById('btn-login').onclick = async () => {
    const err = document.getElementById('err')
    err.hidden = true
    try {
      await api.signIn(
        document.getElementById('login').value,
        document.getElementById('password').value,
      )
      await renderMain()
    } catch (e) {
      err.textContent = e.message || 'Falha no login'
      err.hidden = false
    }
  }
}

async function renderMain(options = {}) {
  const session = await api.getSession()
  if (!session) return renderLogin()

  const { waContact } = await chrome.storage.local.get('waContact')
  const contactName = waContact?.contactName || ''
  const phoneRaw = waContact?.phoneRaw || ''
  const phoneE164 = phoneRaw ? api.normalizePhoneE164(phoneRaw) : null
  const hypothesis = contactName
    ? api.extractPlayerIdHypothesis(contactName)
    : null
  const key = contactKeyOf(waContact)
  const statusText = statusLabel(
    waContact?.status,
    Boolean(contactName),
    Boolean(phoneRaw),
  )

  // Troca de contato: limpar resultado anterior
  if (context.contactKey && context.contactKey !== key) {
    lastAutoLookupKey = null
    context = { source: null, playerId: null, contactKey: key }
  } else {
    context.contactKey = key
  }

  const playerInputValue =
    options.preserveManual && document.getElementById('player-id')
      ? document.getElementById('player-id').value
      : hypothesis || ''

  root.innerHTML = `
    <div class="card">
      <div class="muted">Leitura assistida do WhatsApp</div>
      <div><strong id="contact-name">${
        contactName
          ? escapeHtml(contactName)
          : 'Nenhum contato identificável ainda'
      }</strong></div>
      <div class="muted" id="status-line">${escapeHtml(statusText)}</div>
      <div class="muted">
        Origem do nome:
        <span>${contactName ? 'WhatsApp' : '—'}</span>
        · Hipótese de Player ID:
        <span id="hyp">${hypothesis ? escapeHtml(hypothesis) : '—'}</span>
      </div>
      <div class="muted">
        Telefone capturado:
        <span id="phone-captured">${
          phoneE164
            ? escapeHtml(phoneE164)
            : phoneRaw
              ? escapeHtml(phoneRaw)
              : 'não disponível nos detalhes'
        }</span>
      </div>
    </div>
    <label>Player ID
      <input id="player-id" value="${escapeHtml(playerInputValue)}" placeholder="Ex.: 1737455" />
    </label>
    <p class="muted" id="id-origin">
      ${
        hypothesis && playerInputValue === hypothesis
          ? 'ID sugerido pelo nome do WhatsApp (hipótese até validar).'
          : 'ID manual ou editado — não confundir com o detectado no WhatsApp.'
      }
    </p>
    <div class="row">
      <button id="btn-lookup">Consultar</button>
      <button id="btn-refresh" class="secondary">Atualizar contato</button>
      <button id="btn-out" class="secondary">Sair</button>
    </div>
    <p id="err" class="error" hidden></p>
    <div id="result"></div>
  `

  document.getElementById('btn-out').onclick = async () => {
    await api.signOut()
    await renderLogin()
  }
  document.getElementById('btn-refresh').onclick = async () => {
    const res = await requestWhatsAppRead()
    if (!res.ok) {
      const err = document.getElementById('err')
      err.textContent = res.error || 'Falha ao ler WhatsApp.'
      err.hidden = false
      return
    }
    await renderMain()
  }
  document.getElementById('btn-lookup').onclick = () =>
    runLookup({ source: 'manual' })
  document.getElementById('player-id').oninput = () => {
    const el = document.getElementById('id-origin')
    const val = document.getElementById('player-id').value.trim()
    if (el) {
      el.textContent =
        hypothesis && val === hypothesis
          ? 'ID sugerido pelo nome do WhatsApp (hipótese até validar).'
          : 'ID manual ou editado — não confundir com o detectado no WhatsApp.'
    }
  }

  // Auto-consulta quando há hipótese nova do WhatsApp
  if (hypothesis && lastAutoLookupKey !== `${key}|${hypothesis}`) {
    lastAutoLookupKey = `${key}|${hypothesis}`
    await runLookup({
      source: 'whatsapp',
      playerId: hypothesis,
      phonePrefill: phoneE164 || phoneRaw || '',
    })
  } else if (document.getElementById('result') && !document.getElementById('result').innerHTML) {
    // manter área vazia até consultar
  }
}

async function runLookup({ source = 'manual', playerId, phonePrefill } = {}) {
  if (lookupBusy) return
  const err = document.getElementById('err')
  const result = document.getElementById('result')
  if (!err || !result) return

  err.hidden = true
  const id =
    (playerId || document.getElementById('player-id')?.value || '').trim()
  if (!id) {
    err.textContent = 'Informe o Player ID.'
    err.hidden = false
    result.innerHTML = ''
    return
  }

  lookupBusy = true
  result.innerHTML = '<p class="muted">Validando Player ID na base…</p>'
  context.source = source
  context.playerId = id

  try {
    const boardId = api.cfg().BOARD_ID || 'board-1'
    const { waContact } = await chrome.storage.local.get('waContact')
    const capturedPhone =
      phonePrefill ||
      (waContact?.phoneRaw
        ? api.normalizePhoneE164(waContact.phoneRaw) || waContact.phoneRaw
        : '')

    const data = await api.rpc('crm_activation_lookup', {
      p_board_id: boardId,
      p_player_id: id,
    })

    if (!data?.found) {
      result.innerHTML = `
        <div class="card error">
          <strong>Player ID não encontrado na base</strong>
          <p class="muted">${escapeHtml(
            data?.message || 'Player ID não encontrado na base de dados.',
          )}</p>
          <p class="muted">Origem da consulta: ${
            source === 'whatsapp' ? 'WhatsApp (hipótese)' : 'manual'
          }</p>
        </div>`
      return
    }

    const inc = incentivesFrom360(data.player360)
    const clubs = Array.isArray(data.clubs) ? data.clubs.filter(Boolean) : []
    const phones = Array.isArray(data.phones)
      ? data.phones.map((p) => p.phoneE164 || p.phone_e164).filter(Boolean)
      : []
    const linked = Array.isArray(data.linkedPlayerIds)
      ? data.linkedPlayerIds.map((p) => p.playerId || p.player_id).filter(Boolean)
      : []
    const appOrigin = api.cfg().APP_ORIGIN || ''
    const alreadyLinked =
      Boolean(capturedPhone) &&
      phones.some(
        (p) =>
          api.normalizePhoneE164(p) === api.normalizePhoneE164(capturedPhone) ||
          p === capturedPhone,
      )

    let linkState = 'pending'
    if (alreadyLinked) linkState = 'confirmed'
    else if (!capturedPhone) linkState = 'no_phone'

    result.innerHTML = `
      <div class="card">
        <div class="muted">Jogador validado na base · origem ${
          source === 'whatsapp' ? 'WhatsApp' : 'manual'
        }</div>
        <div><strong>${escapeHtml(id)}</strong>${
          inc.nickname ? ` · ${escapeHtml(inc.nickname)}` : ''
        }</div>
        <div class="muted">Clubes: ${
          clubs.length ? escapeHtml(clubs.join(', ')) : 'sem club_code explícito / só SX legado'
        }</div>
        <div class="row">
          <div class="metric muted">Limite<b>${money(inc.limite)}</b></div>
          <div class="metric muted">Enviado<b>${money(inc.enviado)}</b></div>
          <div class="metric muted">Disponível<b>${money(inc.disponivel)}</b></div>
        </div>
        <div class="muted">Telefones confirmados no SX: ${
          phones.length ? escapeHtml(phones.join(', ')) : 'nenhum'
        }</div>
        <div class="muted">IDs associados: ${
          linked.length ? escapeHtml(linked.join(', ')) : 'somente este'
        }</div>
        <div class="muted">Estado do vínculo: ${
          linkState === 'confirmed'
            ? 'já confirmado neste telefone'
            : linkState === 'no_phone'
              ? 'telefone não disponível — preencha ou abra os detalhes'
              : 'pendente de confirmação humana'
        }</div>
        ${
          appOrigin
            ? `<a href="${escapeHtml(appOrigin)}" target="_blank" rel="noopener">Abrir SX B2C</a>`
            : '<span class="muted">Defina APP_ORIGIN em config.js</span>'
        }
      </div>
      <div class="card">
        <div class="muted">Confirmar telefone (não salva sozinho)</div>
        <label>Telefone
          <input id="phone" value="${escapeHtml(capturedPhone || '')}" placeholder="+55 32 9153-8322" />
        </label>
        <p class="muted">${
          capturedPhone
            ? 'Preenchido a partir dos detalhes do WhatsApp — confira antes de confirmar.'
            : 'Telefone não capturado automaticamente. Digite se estiver visível.'
        }</p>
        <button id="btn-phone" class="secondary"${
          alreadyLinked ? ' disabled' : ''
        }>${alreadyLinked ? 'Vínculo já confirmado' : 'Confirmar vínculo'}</button>
        <p id="phone-msg" class="muted"></p>
      </div>
      <div class="card">
        <div class="muted">IDs associados (somente IDs já na base)</div>
        <label>Outro Player ID<input id="assoc" placeholder="Player ID existente" /></label>
        <button id="btn-assoc" class="secondary">Associar</button>
        <p id="assoc-msg" class="muted"></p>
      </div>
    `

    document.getElementById('btn-phone').onclick = async () => {
      const msg = document.getElementById('phone-msg')
      const raw = document.getElementById('phone').value
      const e164 = api.normalizePhoneE164(raw)
      if (!e164) {
        msg.textContent = 'Telefone inválido.'
        msg.className = 'error'
        return
      }
      try {
        const out = await api.rpc('crm_confirm_identity_phone', {
          p_board_id: boardId,
          p_player_id: id,
          p_phone_e164: e164,
          p_phone_raw: raw,
          p_source: 'whatsapp_web',
          p_contact_name: waContact?.contactName || null,
        })
        if (!out?.ok) {
          msg.textContent =
            out?.message ||
            (out?.conflict
              ? 'Conflito de identidade: telefone em outra identidade.'
              : 'Não foi possível confirmar.')
          msg.className = 'error'
          return
        }
        msg.textContent = `Telefone ${e164} confirmado e persistido.`
        msg.className = 'muted'
        document.getElementById('btn-phone').disabled = true
        document.getElementById('btn-phone').textContent = 'Vínculo confirmado'
      } catch (e) {
        msg.textContent = e.message || 'Erro'
        msg.className = 'error'
      }
    }

    document.getElementById('btn-assoc').onclick = async () => {
      const msg = document.getElementById('assoc-msg')
      const other = document.getElementById('assoc').value.trim()
      if (!other) return
      try {
        const out = await api.rpc('crm_associate_player_ids', {
          p_board_id: boardId,
          p_primary_player_id: id,
          p_associate_player_id: other,
        })
        if (!out?.ok) {
          msg.textContent = out?.message || 'Associação bloqueada.'
          msg.className = 'error'
          return
        }
        msg.textContent = out.alreadyLinked
          ? 'Vínculo já existia.'
          : `Associado à identidade ${out.identityId}.`
        msg.className = 'muted'
      } catch (e) {
        msg.textContent = e.message || 'Erro'
        msg.className = 'error'
      }
    }
  } catch (e) {
    const text = e.message || 'Falha na consulta'
    result.innerHTML = ''
    if (/sessão expirada|jwt expired|entre de novo/i.test(text)) {
      err.textContent =
        'Sessão expirada. Faça login novamente para consultar jogadores.'
      err.hidden = false
      lookupBusy = false
      await renderLogin()
      return
    }
    err.textContent = /crm_activation_lookup|does not exist|schema cache/i.test(
      text,
    )
      ? 'API de identidade indisponível no Supabase.'
      : text
    err.hidden = false
  } finally {
    lookupBusy = false
  }
}

;(async function boot() {
  let session = await api.getSession()
  if (session?.access_token) {
    try {
      session = await api.ensureSession()
    } catch {
      session = null
    }
  }
  if (session) {
    await requestWhatsAppRead()
    await renderMain()
  } else {
    await renderLogin()
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.waContact) {
      void renderMain()
    }
  })
})()
