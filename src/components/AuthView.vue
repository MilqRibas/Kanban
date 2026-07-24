<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Eye, EyeOff } from '@lucide/vue'
import { useAuthStore } from '../stores/auth'
import logoSxB2c from '../assets/brand/sx-b2c.svg'

type AuthMode = 'login' | 'signup' | 'forgot' | 'update-password'

const auth = useAuthStore()
const mode = ref<AuthMode>('login')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const name = ref('')
const submitting = ref(false)
const showPassword = ref(false)
const showPasswordConfirm = ref(false)

watch(
  () => auth.passwordRecovery,
  (recovering) => {
    if (recovering) mode.value = 'update-password'
  },
  { immediate: true },
)

const title = computed(() => {
  if (mode.value === 'forgot') return 'Recuperar senha'
  if (mode.value === 'update-password') return 'Nova senha'
  if (mode.value === 'signup') return 'Criar conta'
  return 'B2C TEAM'
})

const subtitle = computed(() => {
  if (mode.value === 'forgot') {
    return 'Informe seu e-mail para receber o link de redefinição.'
  }
  if (mode.value === 'update-password') {
    return 'Escolha uma nova senha para acessar o quadro.'
  }
  if (mode.value === 'signup') {
    return 'Se você recebeu um convite, prefira abrir o link do e-mail.'
  }
  return 'Entre para sincronizar o quadro com o time'
})

const submitLabel = computed(() => {
  if (submitting.value) return 'Aguarde…'
  if (mode.value === 'forgot') return 'Enviar link'
  if (mode.value === 'update-password') return 'Salvar nova senha'
  if (mode.value === 'signup') return 'Criar conta'
  return 'Entrar'
})

function switchMode(next: AuthMode) {
  mode.value = next
  auth.clearMessages()
  password.value = ''
  passwordConfirm.value = ''
  showPassword.value = false
  showPasswordConfirm.value = false
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  try {
    if (mode.value === 'login') {
      await auth.signIn(email.value.trim(), password.value)
      return
    }

    if (mode.value === 'signup') {
      const result = await auth.signUp(
        email.value.trim(),
        password.value,
        name.value,
      )
      if (result === 'confirm_email') {
        mode.value = 'login'
        password.value = ''
      }
      return
    }

    if (mode.value === 'forgot') {
      const ok = await auth.requestPasswordReset(email.value)
      if (ok) {
        password.value = ''
        mode.value = 'login'
      }
      return
    }

    if (mode.value === 'update-password') {
      if (password.value !== passwordConfirm.value) {
        auth.error = 'As senhas não coincidem.'
        return
      }
      await auth.updatePassword(password.value)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="app-bg relative flex min-h-full items-center justify-center px-4 py-10">
    <form
      class="panel-glass panel-glass-accent relative z-10 w-full max-w-md rounded-2xl p-6 shadow-2xl"
      @submit.prevent="submit"
    >
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <img :src="logoSxB2c" alt="SX B2C" class="h-10 w-auto object-contain" />
        <div>
          <h1 class="text-xl font-semibold text-text-primary">{{ title }}</h1>
          <p class="mt-1 text-sm text-text-secondary">{{ subtitle }}</p>
        </div>
      </div>

      <div class="space-y-3">
        <label
          v-if="mode === 'signup'"
          class="block text-sm text-text-secondary"
        >
          Nome
          <input
            v-model="name"
            type="text"
            autocomplete="name"
            class="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-text-primary outline-none focus:border-accent"
            placeholder="Seu nome"
          />
        </label>

        <label
          v-if="mode !== 'update-password'"
          class="block text-sm text-text-secondary"
        >
          E-mail
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-text-primary outline-none focus:border-accent"
            placeholder="voce@empresa.com"
          />
        </label>

        <div
          v-if="mode === 'login' || mode === 'signup' || mode === 'update-password'"
          class="block text-sm text-text-secondary"
        >
          <span>{{ mode === 'update-password' ? 'Nova senha' : 'Senha' }}</span>
          <div class="relative mt-1">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              minlength="6"
              :autocomplete="
                mode === 'update-password' ? 'new-password' : 'current-password'
              "
              class="w-full rounded-lg border border-white/15 bg-white/5 py-2 pl-3 pr-10 text-text-primary outline-none focus:border-accent"
              placeholder="Mínimo 6 caracteres"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
              :title="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
              :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="16" :stroke-width="2" />
              <Eye v-else :size="16" :stroke-width="2" />
            </button>
          </div>
        </div>

        <div
          v-if="mode === 'update-password'"
          class="block text-sm text-text-secondary"
        >
          <span>Confirmar senha</span>
          <div class="relative mt-1">
            <input
              v-model="passwordConfirm"
              :type="showPasswordConfirm ? 'text' : 'password'"
              required
              minlength="6"
              autocomplete="new-password"
              class="w-full rounded-lg border border-white/15 bg-white/5 py-2 pl-3 pr-10 text-text-primary outline-none focus:border-accent"
              placeholder="Repita a nova senha"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
              :title="
                showPasswordConfirm ? 'Ocultar senha' : 'Mostrar senha'
              "
              :aria-label="
                showPasswordConfirm ? 'Ocultar senha' : 'Mostrar senha'
              "
              @click="showPasswordConfirm = !showPasswordConfirm"
            >
              <EyeOff v-if="showPasswordConfirm" :size="16" :stroke-width="2" />
              <Eye v-else :size="16" :stroke-width="2" />
            </button>
          </div>
        </div>
      </div>

      <p v-if="auth.error" class="mt-3 text-sm text-red-300">{{ auth.error }}</p>
      <p v-if="auth.notice" class="mt-3 text-sm text-emerald-300">
        {{ auth.notice }}
      </p>

      <button
        type="submit"
        class="mt-5 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-board transition-colors hover:bg-accent-hover disabled:opacity-60"
        :disabled="submitting"
      >
        {{ submitLabel }}
      </button>

      <div
        v-if="mode === 'login'"
        class="mt-3 flex flex-col gap-2 text-center text-sm"
      >
        <button
          type="button"
          class="text-text-secondary hover:text-text-primary"
          @click="switchMode('forgot')"
        >
          Esqueci minha senha
        </button>
        <button
          type="button"
          class="text-text-secondary hover:text-text-primary"
          @click="switchMode('signup')"
        >
          Não tem conta? Criar agora
        </button>
      </div>

      <button
        v-else-if="mode !== 'update-password'"
        type="button"
        class="mt-3 w-full text-sm text-text-secondary hover:text-text-primary"
        @click="switchMode('login')"
      >
        Voltar para entrar
      </button>
    </form>
  </div>
</template>
