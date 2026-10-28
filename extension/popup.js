const root = document.getElementById('root')
const api = window.SX_B2C_API

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function render() {
  let session = await api.getSession()
  if (session?.refresh_token || session?.access_token) {
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'AUTH_ENSURE' }, () => {
          void chrome.runtime.lastError
          resolve()
        })
      })
      session = await api.ensureSession({ allowStale: true }).catch(async (e) => {
        if (e?.session?.refresh_token || (await api.getSession())?.refresh_token) {
          return e.session || (await api.getSession())
        }
        return null
      })
    } catch {
      session = await api.getSession()
    }
  }

  if (!session?.access_token && !session?.refresh_token) {
    const savedLogin = await api.getSavedLogin()
    const remember = await api.getRememberLogin()
    root.innerHTML = `
      <p class="muted">Entre com a conta SX B2C das Agentes de Ativação.</p>
      <label>Usuário ou e-mail<input id="login" autocomplete="username" value="${escapeHtml(savedLogin)}" /></label>
      <label>Senha<input id="password" type="password" autocomplete="current-password" /></label>
      <label class="row" style="align-items:center;gap:8px;margin:8px 0">
        <input id="remember" type="checkbox" ${remember ? 'checked' : ''} />
        <span class="muted">Manter conectado neste PC</span>
      </label>
      <button id="btn-login">Entrar</button>
      <p id="err" class="error" hidden></p>
      <p class="muted">Abra o painel lateral no WhatsApp Web para a consulta completa.</p>
    `
    document.getElementById('btn-login').onclick = async () => {
      const err = document.getElementById('err')
      err.hidden = true
      try {
        await api.signIn(
          document.getElementById('login').value,
          document.getElementById('password').value,
          { persist: document.getElementById('remember').checked },
        )
        await render()
      } catch (e) {
        err.textContent = e.message || 'Falha no login'
        err.hidden = false
      }
    }
    return
  }

  root.innerHTML = `
    <p class="muted">Sessão ativa · ${escapeHtml(session.user?.email || 'agente')}</p>
    <div class="row">
      <button id="btn-panel" class="secondary">Abrir painel</button>
      <button id="btn-out" class="secondary">Sair</button>
    </div>
    <p class="muted">Login persistente: sobrevive a desligar o PC. Use Sair para encerrar.</p>
  `
  document.getElementById('btn-out').onclick = async () => {
    await api.signOut()
    await render()
  }
  document.getElementById('btn-panel').onclick = async () => {
    if (chrome.sidePanel?.open) {
      const win = await chrome.windows.getCurrent()
      await chrome.sidePanel.open({ windowId: win.id })
    }
  }
}

render()
