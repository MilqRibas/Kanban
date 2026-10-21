const root = document.getElementById('root')
const api = window.SX_B2C_API

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
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

async function renderMain() {
  const session = await api.getSession()
  if (!session) return renderLogin()

  const { waContact } = await chrome.storage.local.get('waContact')
  const contactName = waContact?.contactName || ''
  const hypothesis = api.extractPlayerIdHypothesis(contactName) || ''

  root.innerHTML = `
    <div class="card">
      <div class="muted">Contato WhatsApp (leitura assistida)</div>
      <div><strong id="contact-name">${contactName || 'Nenhum chat detectado'}</strong></div>
      <div class="muted">Hipótese de Player ID: <span id="hyp">${hypothesis || '—'}</span></div>
    </div>
    <label>Player ID
      <input id="player-id" value="${hypothesis}" placeholder="Ex.: 123456" />
    </label>
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
  document.getElementById('btn-refresh').onclick = () => renderMain()
  document.getElementById('btn-lookup').onclick = () => runLookup()
}

async function runLookup() {
  const err = document.getElementById('err')
  const result = document.getElementById('result')
  err.hidden = true
  result.innerHTML = '<p class="muted">Consultando…</p>'
  const playerId = document.getElementById('player-id').value.trim()
  if (!playerId) {
    err.textContent = 'Informe o Player ID.'
    err.hidden = false
    result.innerHTML = ''
    return
  }

  try {
    const boardId = api.cfg().BOARD_ID || 'board-1'
    const data = await api.rpc('crm_activation_lookup', {
      p_board_id: boardId,
      p_player_id: playerId,
    })
    if (!data?.found) {
      result.innerHTML = `<div class="card error">${
        data?.message || 'Player ID não encontrado na base de dados.'
      }</div>`
      return
    }

    const inc = incentivesFrom360(data.player360)
    const clubs = Array.isArray(data.clubs) ? data.clubs.join(', ') : '—'
    const phones = Array.isArray(data.phones)
      ? data.phones.map((p) => p.phoneE164 || p.phone_e164).filter(Boolean)
      : []
    const linked = Array.isArray(data.linkedPlayerIds)
      ? data.linkedPlayerIds.map((p) => p.playerId || p.player_id).filter(Boolean)
      : []
    const appOrigin = api.cfg().APP_ORIGIN || ''

    result.innerHTML = `
      <div class="card">
        <div><strong>${playerId}</strong> ${inc.nickname ? `· ${inc.nickname}` : ''}</div>
        <div class="muted">Clubes: ${clubs || '—'}</div>
        <div class="row">
          <div class="metric muted">Limite<b>${money(inc.limite)}</b></div>
          <div class="metric muted">Enviado<b>${money(inc.enviado)}</b></div>
          <div class="metric muted">Disponível<b>${money(inc.disponivel)}</b></div>
        </div>
        <div class="muted">Telefones: ${phones.length ? phones.join(', ') : 'nenhum confirmado'}</div>
        <div class="muted">IDs associados: ${linked.length ? linked.join(', ') : 'somente este'}</div>
        ${
          appOrigin
            ? `<a href="${appOrigin}" target="_blank" rel="noopener">Abrir SX B2C</a>`
            : '<span class="muted">Defina APP_ORIGIN em config.js para abrir o 360º</span>'
        }
      </div>
      <div class="card">
        <div class="muted">Confirmar telefone (não salva sozinho)</div>
        <label>Telefone<input id="phone" placeholder="+55 15 9XXXX-XXXX" /></label>
        <button id="btn-phone" class="secondary">Confirmar vínculo</button>
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
        const { waContact } = await chrome.storage.local.get('waContact')
        const out = await api.rpc('crm_confirm_identity_phone', {
          p_board_id: boardId,
          p_player_id: playerId,
          p_phone_e164: e164,
          p_phone_raw: raw,
          p_source: 'whatsapp_web',
          p_contact_name: waContact?.contactName || null,
        })
        if (!out?.ok) {
          msg.textContent = out?.message || 'Não foi possível confirmar.'
          msg.className = 'error'
          return
        }
        msg.textContent = `Telefone ${e164} confirmado.`
        msg.className = 'muted'
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
          p_primary_player_id: playerId,
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
    err.textContent = /crm_activation_lookup|does not exist|schema cache/i.test(text)
      ? 'API de identidade ainda não aplicada no Supabase. Peça a migration ao time.'
      : text
    err.hidden = false
  }
}

;(async function boot() {
  const session = await api.getSession()
  if (session) await renderMain()
  else await renderLogin()

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.waContact) renderMain()
  })
})()
