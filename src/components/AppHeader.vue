<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Camera, Archive, LogOut, Menu, Plus, UserRound, Users, X } from '@lucide/vue'
import { useBoardStore } from '../stores/board'
import { useAuthStore } from '../stores/auth'
import MembersManager from './MembersManager.vue'
import MemberFilterSelect from './MemberFilterSelect.vue'
import LabelFilterSelect from './LabelFilterSelect.vue'
import NotificationCenter from './NotificationCenter.vue'
import HeaderSearch from './HeaderSearch.vue'
import ArchivedCardsModal from './ArchivedCardsModal.vue'
import logoSxB2c from '../assets/brand/sx-b2c.svg'

const board = useBoardStore()
const auth = useAuthStore()
const membersManager = ref<{ openModal: () => void } | null>(null)
const archivedModal = ref<{ openModal: () => void } | null>(null)
const menuOpen = ref(false)

async function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const ok = await auth.uploadAvatar(file)
  if (ok) {
    const member = board.members.find(
      (item) => item.userId === auth.user?.id || item.id === auth.memberId,
    )
    if (member && auth.avatarUrl) {
      member.avatarUrl = auth.avatarUrl
    }
  }
  input.value = ''
}

function openMembers() {
  menuOpen.value = false
  membersManager.value?.openModal()
}

function openArchived() {
  menuOpen.value = false
  archivedModal.value?.openModal()
}

function signOut() {
  menuOpen.value = false
  void auth.signOut()
}

watch(menuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <header
    class="relative z-30 flex h-12 shrink-0 items-center border-b border-white/10 bg-board/70 px-2 backdrop-blur-md sm:gap-3 sm:px-3"
  >
    <!-- Mobile: hamburger -->
    <button
      type="button"
      class="relative z-20 flex size-9 items-center justify-center rounded-lg text-text-secondary hover:bg-white/10 hover:text-text-primary md:hidden"
      aria-label="Abrir menu"
      :aria-expanded="menuOpen"
      @click="menuOpen = true"
    >
      <Menu :size="20" :stroke-width="2.25" />
    </button>

    <!-- Mobile: logo centralizado -->
    <div
      class="pointer-events-none absolute inset-x-0 flex justify-center md:hidden"
    >
      <img
        :src="logoSxB2c"
        alt="SX B2C"
        class="h-6 w-auto object-contain"
      />
    </div>

    <!-- Desktop: logo + título -->
    <div class="hidden min-w-0 shrink items-center gap-3 md:flex">
      <img
        :src="logoSxB2c"
        alt="SX B2C"
        class="h-7 w-auto shrink-0 object-contain"
      />
      <div class="h-6 w-px bg-white/15" />
      <h1 class="truncate text-base font-semibold tracking-tight text-text-primary">
        {{ board.title }}
      </h1>
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

    <!-- Desktop: filtro -->
    <div class="hidden min-w-0 flex-1 items-center justify-center gap-2 px-2 md:flex">
      <MemberFilterSelect compact />
      <LabelFilterSelect compact />
    </div>

    <!-- Direita: busca + filtro mini (mobile) + notificações + avatar -->
    <div class="relative z-20 ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
      <HeaderSearch />

      <button
        v-if="auth.isAdmin"
        type="button"
        class="relative inline-flex size-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
        title="Cartões arquivados"
        aria-label="Cartões arquivados"
        @click="openArchived"
      >
        <Archive :size="17" :stroke-width="2.25" />
        <span
          v-if="board.archivedCards.length"
          class="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-board"
        >
          {{ board.archivedCards.length }}
        </span>
      </button>

      <div class="flex items-center gap-1 md:hidden">
        <MemberFilterSelect mini />
        <LabelFilterSelect mini />
      </div>

      <NotificationCenter />

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
          class="absolute inset-0 hidden items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 sm:flex"
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

      <button
        type="button"
        class="hidden items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary md:inline-flex"
        title="Sair"
        @click="auth.signOut()"
      >
        <LogOut :size="15" :stroke-width="2.25" />
        <span class="hidden lg:inline">Sair</span>
      </button>

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

    <!-- Drawer mobile -->
    <Teleport to="body">
      <div
        v-if="menuOpen"
        class="fixed inset-0 z-[180] md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <button
          type="button"
          class="absolute inset-0 bg-black/60"
          aria-label="Fechar menu"
          @click="menuOpen = false"
        />
        <aside
          class="absolute inset-y-0 left-0 flex w-[min(100%,18rem)] flex-col border-r border-white/10 bg-board-elevated shadow-2xl"
        >
          <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <img :src="logoSxB2c" alt="SX B2C" class="h-6 w-auto object-contain" />
            <button
              type="button"
              class="rounded-lg p-1.5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
              aria-label="Fechar"
              @click="menuOpen = false"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="border-b border-white/10 px-4 py-3">
            <p class="text-xs text-text-muted">Quadro</p>
            <p class="truncate text-sm font-semibold text-text-primary">
              {{ board.title }}
            </p>
          </div>

          <div class="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-white"
            >
              <img
                v-if="auth.avatarUrl"
                :src="auth.avatarUrl"
                alt=""
                class="size-full object-cover"
              />
              <template v-else>{{ auth.initials }}</template>
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm text-text-primary">
                {{ auth.displayName ?? 'Usuário' }}
              </p>
              <p class="truncate text-xs text-text-muted">
                {{ auth.user?.email }}
              </p>
            </div>
          </div>

          <nav class="flex flex-1 flex-col gap-1 p-2">
            <button
              v-if="auth.isAdmin"
              type="button"
              class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
              @click="openArchived"
            >
              <Archive :size="17" />
              Arquivados
              <span
                v-if="board.archivedCards.length"
                class="ml-auto rounded-full bg-white/10 px-1.5 text-[10px]"
              >
                {{ board.archivedCards.length }}
              </span>
            </button>
            <button
              type="button"
              class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
              @click="openMembers"
            >
              <Users :size="17" />
              Usuários do time
            </button>
            <label
              class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
            >
              <UserRound :size="17" />
              Alterar foto
              <input
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.gif,.webp"
                class="sr-only"
                :disabled="auth.uploadingAvatar"
                @change="onAvatarChange"
              />
            </label>
            <button
              type="button"
              class="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-300 hover:bg-red-500/10"
              @click="signOut"
            >
              <LogOut :size="17" />
              Sair
            </button>
          </nav>
        </aside>
      </div>
    </Teleport>

    <MembersManager ref="membersManager" />
    <ArchivedCardsModal ref="archivedModal" />
  </header>
</template>
