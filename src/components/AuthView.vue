<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import logoSxB2c from '../assets/brand/sx-b2c.svg'
import boardBg from '../assets/brand/bg-board.png'

const auth = useAuthStore()
const mode = ref<'login' | 'signup'>('login')
const email = ref('')
const password = ref('')
const name = ref('')
const submitting = ref(false)

async function submit() {
  if (submitting.value) return
  submitting.value = true
  try {
    if (mode.value === 'login') {
      await auth.signIn(email.value.trim(), password.value)
    } else {
      await auth.signUp(email.value.trim(), password.value, name.value)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    class="relative flex min-h-full items-center justify-center bg-board bg-cover bg-center px-4 py-10"
    :style="{ backgroundImage: `url(${boardBg})` }"
  >
    <div class="pointer-events-none absolute inset-0 bg-board/60" />
    <form
      class="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-black/55 p-6 shadow-2xl backdrop-blur-md"
      @submit.prevent="submit"
    >
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <img :src="logoSxB2c" alt="SX B2C" class="h-10 w-auto object-contain" />
        <div>
          <h1 class="text-xl font-semibold text-text-primary">B2C TEAM</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Entre para sincronizar o quadro com o Supabase
          </p>
        </div>
      </div>

      <div class="space-y-3">
        <label v-if="mode === 'signup'" class="block text-sm text-text-secondary">
          Nome
          <input
            v-model="name"
            type="text"
            autocomplete="name"
            class="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-text-primary outline-none focus:border-accent"
            placeholder="Seu nome"
          />
        </label>

        <label class="block text-sm text-text-secondary">
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

        <label class="block text-sm text-text-secondary">
          Senha
          <input
            v-model="password"
            type="password"
            required
            minlength="6"
            autocomplete="current-password"
            class="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-text-primary outline-none focus:border-accent"
            placeholder="Mínimo 6 caracteres"
          />
        </label>
      </div>

      <p v-if="auth.error" class="mt-3 text-sm text-red-300">{{ auth.error }}</p>

      <button
        type="submit"
        class="mt-5 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-board transition-colors hover:bg-accent-hover disabled:opacity-60"
        :disabled="submitting"
      >
        {{
          submitting
            ? 'Aguarde…'
            : mode === 'login'
              ? 'Entrar'
              : 'Criar conta'
        }}
      </button>

      <button
        type="button"
        class="mt-3 w-full text-sm text-text-secondary hover:text-text-primary"
        @click="mode = mode === 'login' ? 'signup' : 'login'"
      >
        {{
          mode === 'login'
            ? 'Não tem conta? Criar agora'
            : 'Já tem conta? Entrar'
        }}
      </button>
    </form>
  </div>
</template>
