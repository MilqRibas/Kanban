const root = document.getElementById('root')
const api = window.SX_B2C_API

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function render() {
  let session = await api.getSession()
  if (session?.access_token) {
    try {
      session = await api.ensureSession()
    } catch {
      session = null
    }
  }
  if (!session) {
    root.innerHTML = `
      <p class="muted">Entre com a conta SX B2C das Agentes de Ativação.</p>
      <label>Usuário ou e-mail<input id="login" autocomplete="username" /></label>
      <label>Senha<input id="password" type="password" autocomplete="current-password" /></label>
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
    <p class="muted">Sessão ativa · ${session.user?.email || 'agente'}</p>
    <div class="row">
      <button id="btn-panel" class="secondary">Abrir painel</button>
      <button id="btn-out" class="secondary">Sair</button>
    </div>
    <p class="muted">No WhatsApp Web, o painel lê o nome do chat e sugere o Player ID.</p>
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
