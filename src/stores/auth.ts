import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { BOARD_ID, supabase } from '../lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const user = ref<User | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const memberId = ref<string | null>(null)
  const displayName = ref<string | null>(null)
  const avatarUrl = ref<string | null>(null)
  const isAdmin = ref(false)
  const uploadingAvatar = ref(false)
  const passwordRecovery = ref(false)

  let authListenerBound = false

  const isAuthenticated = computed(() => !!session.value)

  const initials = computed(() => {
    const name = displayName.value?.trim()
    if (!name) return '?'
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase()
  })

  function clearProfile() {
    memberId.value = null
    displayName.value = null
    avatarUrl.value = null
    isAdmin.value = false
  }

  function clearMessages() {
    error.value = null
    notice.value = null
  }

  function translateAuthMessage(message: string) {
    const lower = message.toLowerCase()
    if (/invalid login credentials|invalid credentials/.test(lower)) {
      return 'E-mail ou senha incorretos.'
    }
    if (/email not confirmed/.test(lower)) {
      return 'Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.'
    }
    if (/user already registered|already been registered/.test(lower)) {
      return 'Este e-mail já possui conta. Entre ou use “Esqueci minha senha”.'
    }
    if (/rate limit|over_email/.test(lower)) {
      return 'Muitas tentativas de e-mail. Aguarde alguns minutos e tente de novo.'
    }
    if (/failed to fetch/i.test(message)) {
      return 'Falha de conexão com o Supabase. Tente de novo.'
    }
    return message
  }

  function formatError(err: unknown, fallback: string) {
    if (!err) return fallback
    if (typeof err === 'string') return translateAuthMessage(err) || fallback
    if (err instanceof Error) {
      return translateAuthMessage(err.message) || fallback
    }
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const message = String((err as { message: unknown }).message)
      return translateAuthMessage(message) || fallback
    }
    return fallback
  }

  async function init() {
    loading.value = true
    clearMessages()

    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      error.value = formatError(sessionError, 'Falha ao carregar sessão.')
    }

    session.value = data.session
    user.value = data.session?.user ?? null
    if (user.value) {
      await loadProfile({ silent: true })
    }

    if (!authListenerBound) {
      authListenerBound = true
      supabase.auth.onAuthStateChange((event, nextSession) => {
        session.value = nextSession
        user.value = nextSession?.user ?? null

        if (event === 'PASSWORD_RECOVERY') {
          passwordRecovery.value = true
          return
        }

        // Nunca faça await de queries aqui — e ignore TOKEN_REFRESHED/INITIAL_SESSION
        // para não competir com o auth lock (causa "Failed to fetch").
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          return
        }

        setTimeout(() => {
          if (event === 'SIGNED_OUT' || !nextSession?.user) {
            clearProfile()
            passwordRecovery.value = false
            return
          }
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            void loadProfile({ silent: true })
          }
        }, 0)
      })
    }

    loading.value = false
  }

  async function loadProfile(options?: { silent?: boolean }) {
    if (!user.value) return
    const silent = options?.silent ?? false
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('display_name, member_id, avatar_url, is_admin')
      .eq('id', user.value.id)
      .maybeSingle()

    if (profileError) {
      if (!silent) {
        error.value = formatError(profileError, 'Falha ao carregar perfil.')
      }
      return
    }

    displayName.value = data?.display_name ?? user.value.email ?? null
    memberId.value = data?.member_id ?? null
    avatarUrl.value = data?.avatar_url ?? null
    isAdmin.value = Boolean(data?.is_admin)
    await syncMemberRecord({ silent })
  }

  function initialsFromName(name: string) {
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0] ?? '')
        .join('')
        .toUpperCase() || '?'
    )
  }

  /** Garante um member real vinculado ao usuário autenticado. */
  async function syncMemberRecord(options?: { silent?: boolean }) {
    if (!user.value) return
    const silent = options?.silent ?? false
    const name = (displayName.value || user.value.email || 'Usuário').trim()
    const nextMemberId = `user-${user.value.id}`
    const alreadyLinked = memberId.value === nextMemberId

    // Já sincronizado — evita UPDATE/UPSERT a cada load (spam de requests)
    if (alreadyLinked) return

    const { error: upsertError } = await supabase.from('members').upsert(
      {
        id: nextMemberId,
        board_id: BOARD_ID,
        name,
        initials: initialsFromName(name),
        avatar_color: 'bg-emerald-600',
        position: 0,
        user_id: user.value.id,
        avatar_url: avatarUrl.value,
        email: user.value.email ?? null,
      },
      { onConflict: 'id' },
    )

    if (upsertError) {
      if (!silent) {
        error.value = formatError(upsertError, 'Falha ao sincronizar usuário.')
      }
      return
    }

    const { error: linkError } = await supabase
      .from('profiles')
      .update({ member_id: nextMemberId })
      .eq('id', user.value.id)

    if (linkError) {
      if (!silent) {
        error.value = formatError(linkError, 'Falha ao vincular perfil.')
      }
      return
    }

    memberId.value = nextMemberId
  }

  async function signIn(email: string, password: string) {
    clearMessages()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      error.value = formatError(signInError, 'Falha ao entrar.')
      return false
    }
    return true
  }

  async function signUp(email: string, password: string, name?: string) {
    clearMessages()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name?.trim() || undefined },
        emailRedirectTo: window.location.origin,
      },
    })
    if (signUpError) {
      error.value = formatError(signUpError, 'Falha ao criar conta.')
      return false
    }
    if (!data.session) {
      notice.value =
        'Conta criada. Enviamos um link de confirmação para o seu e-mail. Abra o link e depois entre aqui.'
      return 'confirm_email'
    }
    return true
  }

  async function requestPasswordReset(email: string) {
    clearMessages()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.includes('@')) {
      error.value = 'Informe um e-mail válido.'
      return false
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      trimmed,
      { redirectTo: `${window.location.origin}/` },
    )

    if (resetError) {
      error.value = formatError(resetError, 'Não foi possível enviar o e-mail.')
      return false
    }

    notice.value =
      'Se este e-mail existir, enviamos um link para redefinir a senha. Confira a caixa de entrada.'
    return true
  }

  async function updatePassword(password: string) {
    clearMessages()
    if (password.trim().length < 6) {
      error.value = 'A senha precisa ter pelo menos 6 caracteres.'
      return false
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password.trim(),
    })

    if (updateError) {
      error.value = formatError(updateError, 'Não foi possível atualizar a senha.')
      return false
    }

    passwordRecovery.value = false
    notice.value = 'Senha atualizada. Você já pode usar o quadro.'
    await loadProfile({ silent: true })
    return true
  }

  async function signOut() {
    await supabase.auth.signOut()
    passwordRecovery.value = false
  }

  async function linkMember(nextMemberId: string | null) {
    if (!user.value) return
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ member_id: nextMemberId })
      .eq('id', user.value.id)
    if (updateError) {
      error.value = formatError(updateError, 'Falha ao vincular membro.')
      return
    }
    memberId.value = nextMemberId
  }

  async function uploadAvatar(file: File) {
    if (!user.value) return false

    const extFromName = file.name.split('.').pop()?.toLowerCase() || ''
    const allowedExt = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
    const mime = file.type || ''
    const looksLikeImage =
      mime.startsWith('image/') || allowedExt.has(extFromName)

    if (!looksLikeImage) {
      error.value = 'Selecione uma imagem (JPG, PNG, GIF ou WEBP).'
      return false
    }

    const ext = allowedExt.has(extFromName)
      ? extFromName === 'jpeg'
        ? 'jpg'
        : extFromName
      : 'jpg'
    const contentType = mime.startsWith('image/')
      ? mime
      : ext === 'png'
        ? 'image/png'
        : ext === 'gif'
          ? 'image/gif'
          : ext === 'webp'
            ? 'image/webp'
            : 'image/jpeg'

    uploadingAvatar.value = true
    clearMessages()

    const localPreview = URL.createObjectURL(file)
    const previousAvatar = avatarUrl.value
    avatarUrl.value = localPreview

    try {
      // Caminho fixo facilita replace da foto
      const path = `${user.value.id}/avatar.jpg`

      await supabase.storage.from('avatars').remove([path])

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType,
        })

      if (uploadError) {
        error.value = formatError(uploadError, 'Falha ao enviar a foto.')
        avatarUrl.value = previousAvatar
        URL.revokeObjectURL(localPreview)
        return false
      }

      const { data: publicUrl } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      const nextUrl = `${publicUrl.publicUrl}?t=${Date.now()}`

      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.value.id,
          display_name: displayName.value,
          avatar_url: nextUrl,
        })
        .select('avatar_url')
        .single()

      if (updateError || !updated?.avatar_url) {
        error.value = formatError(
          updateError,
          'Não foi possível salvar a foto no perfil.',
        )
        avatarUrl.value = previousAvatar
        URL.revokeObjectURL(localPreview)
        return false
      }

      URL.revokeObjectURL(localPreview)
      avatarUrl.value = updated.avatar_url

      await supabase
        .from('members')
        .update({ avatar_url: updated.avatar_url, name: displayName.value })
        .eq('user_id', user.value.id)

      return true
    } catch (err) {
      error.value = formatError(err, 'Falha ao enviar a foto.')
      avatarUrl.value = previousAvatar
      URL.revokeObjectURL(localPreview)
      return false
    } finally {
      uploadingAvatar.value = false
    }
  }

  return {
    BOARD_ID,
    session,
    user,
    loading,
    error,
    notice,
    memberId,
    displayName,
    avatarUrl,
    isAdmin,
    initials,
    uploadingAvatar,
    passwordRecovery,
    isAuthenticated,
    init,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
    linkMember,
    loadProfile,
    uploadAvatar,
    clearMessages,
  }
})
