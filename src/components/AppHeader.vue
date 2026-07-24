<script setup lang="ts">
import { ref } from 'vue'
import { Camera, LogOut, Plus } from '@lucide/vue'
import { useBoardStore } from '../stores/board'
import { useAuthStore } from '../stores/auth'
import MembersManager from './MembersManager.vue'
import MemberFilterSelect from './MemberFilterSelect.vue'
import logoSxB2c from '../assets/brand/sx-b2c.svg'

const board = useBoardStore()
const auth = useAuthStore()
const membersManager = ref<{ openModal: () => void } | null>(null)

async function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const ok = await auth.uploadAvatar(file)
  if (ok) {
    // Atualiza só o member local — evita reload pesado / race com realtime
    const member = board.members.find(
      (item) => item.userId === auth.user?.id || item.id === auth.memberId,
    )
    if (member && auth.avatarUrl) {
      member.avatarUrl = auth.avatarUrl
    }
  }
  input.value = ''
}
</script>

<template>
  <header
    class="relative z-30 flex h-12 shrink-0 items-center gap-3 overflow-visible border-b border-white/10 bg-black/35 px-3 backdrop-blur-md"
  >
    <div class="flex min-w-0 shrink items-center gap-3">
      <img
        :src="logoSxB2c"
        alt="SX B2C"
        class="h-6 w-auto shrink-0 object-contain sm:h-7"
      />
      <div class="hidden h-6 w-px bg-white/15 sm:block" />
      <h1 class="truncate text-sm font-semibold tracking-tight text-text-primary sm:text-base">
        {{ board.title }}
      </h1>
    </div>

    <div class="flex min-w-0 flex-1 items-center justify-center gap-2 px-2">
      <MemberFilterSelect compact />
      <button
        type="button"
        class="flex size-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/25 text-text-secondary transition-colors hover:border-accent hover:bg-accent/15 hover:text-accent"
        title="Cadastrar ou remover usuários"
        aria-label="Gerenciar usuários"
        @click="membersManager?.openModal()"
      >
        <Plus :size="15" :stroke-width="2.5" />
      </button>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <div class="relative flex items-center gap-2">
        <label
          class="group relative flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold text-white transition-colors hover:border-accent"
          :title="auth.uploadingAvatar ? 'Enviando…' : 'Alterar foto de perfil'"
          :aria-label="auth.uploadingAvatar ? 'Enviando foto' : 'Alterar foto de perfil'"
          :class="{ 'pointer-events-none opacity-70': auth.uploadingAvatar }"
        >
          <img
            v-if="auth.avatarUrl"
            :src="auth.avatarUrl"
            alt=""
            class="size-full object-cover"
          />
          <span v-else>{{ auth.initials }}</span>
          <span
            class="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Camera :size="12" :stroke-width="2.25" class="text-white" />
          </span>
          <input
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.gif,.webp"
            class="sr-only"
            :disabled="auth.uploadingAvatar"
            @change="onAvatarChange"
          />
        </label>

        <span
          class="hidden max-w-[140px] truncate text-xs text-text-secondary sm:inline"
          :title="auth.displayName ?? auth.user?.email ?? ''"
        >
          {{ auth.displayName ?? auth.user?.email }}
        </span>

        <p
          v-if="auth.error"
          class="absolute right-0 top-full z-40 mt-1 max-w-[240px] rounded-md border border-red-400/30 bg-red-950/90 px-2 py-1 text-[11px] text-red-200"
        >
          {{ auth.error }}
          <button
            type="button"
            class="ml-1 underline opacity-80 hover:opacity-100"
            @click="auth.error = null"
          >
            fechar
          </button>
        </p>
      </div>

      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
        title="Sair"
        @click="auth.signOut()"
      >
        <LogOut :size="15" :stroke-width="2.25" />
        <span class="hidden sm:inline">Sair</span>
      </button>
    </div>

    <MembersManager ref="membersManager" />
  </header>
</template>
