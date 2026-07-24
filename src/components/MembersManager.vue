<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Loader2, Mail, Trash2, X } from '@lucide/vue'
import { useBoardStore } from '../stores/board'
import { useAuthStore } from '../stores/auth'
import MemberAvatar from './MemberAvatar.vue'

const board = useBoardStore()
const auth = useAuthStore()
const open = ref(false)
const email = ref('')
const name = ref('')
const inviting = ref(false)
const removingId = ref<string | null>(null)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)
const inviteLink = ref<string | null>(null)
const emailInputRef = ref<HTMLInputElement | null>(null)

const canManageRemovals = computed(() => auth.isAdmin)

function canRemove(memberId: string) {
  if (!auth.isAdmin) return false
  const member = board.getMemberById(memberId)
  if (!member) return false
  if (member.isAdmin) return false
  if (member.userId && member.userId === auth.user?.id) return false
  if (member.id === auth.memberId) return false
  return true
}

async function openModal() {
  open.value = true
  formError.value = null
  formSuccess.value = null
  inviteLink.value = null
  await nextTick()
  emailInputRef.value?.focus()
}

function closeModal() {
  open.value = false
  email.value = ''
  name.value = ''
  formError.value = null
  formSuccess.value = null
  inviteLink.value = null
}

async function submitInvite() {
  formError.value = null
  formSuccess.value = null
  inviteLink.value = null
  if (!email.value.trim()) {
    formError.value = 'Informe o e-mail da pessoa.'
    return
  }

  inviting.value = true
  try {
    const result = await board.inviteMember(email.value, name.value)
    if (!result) {
      formError.value = board.error ?? 'Não foi possível enviar o convite.'
      return
    }
    formSuccess.value =
      typeof result.message === 'string' && result.message
        ? result.message
        : result.alreadyExisted
          ? 'Usuário já existia — adicionado ao time.'
          : 'Convite enviado.'
    inviteLink.value =
      typeof result.inviteLink === 'string' ? result.inviteLink : null
    email.value = ''
    name.value = ''
    await nextTick()
    emailInputRef.value?.focus()
  } finally {
    inviting.value = false
  }
}

async function copyInviteLink() {
  if (!inviteLink.value) return
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    formSuccess.value = 'Link copiado. Envie para a pessoa pelo WhatsApp/e-mail.'
  } catch {
    formError.value = 'Não foi possível copiar o link automaticamente.'
  }
}

async function remove(memberId: string, memberName: string) {
  if (!canRemove(memberId)) {
    formError.value = 'Você não tem permissão para remover este usuário.'
    return
  }
  if (
    !window.confirm(
      `Remover ${memberName} do time? A conta de acesso também será excluída.`,
    )
  ) {
    return
  }

  formError.value = null
  formSuccess.value = null
  removingId.value = memberId
  try {
    const ok = await board.removeMember(memberId)
    if (!ok) {
      formError.value = board.error ?? 'Não foi possível remover o usuário.'
      return
    }
    formSuccess.value = `${memberName} foi removido do time.`
  } finally {
    removingId.value = null
  }
}

defineExpose({ openModal })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Gerenciar usuários"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/65"
        aria-label="Fechar"
        @click="closeModal"
      />

      <div
        class="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border-subtle bg-board-elevated shadow-2xl shadow-black/50"
      >
        <header class="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <h2 class="text-base font-semibold text-text-primary">Usuários do time</h2>
            <p class="text-xs text-text-muted">
              {{
                canManageRemovals
                  ? 'Convide por e-mail e remova membros quando precisar'
                  : 'Convide por e-mail — o Supabase envia o link de acesso'
              }}
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-text-secondary hover:bg-surface"
            @click="closeModal"
          >
            <X :size="18" />
          </button>
        </header>

        <div class="max-h-[45vh] space-y-2 overflow-y-auto px-5 py-4">
          <div
            v-for="member in board.members"
            :key="member.id"
            class="flex items-center gap-3 rounded-xl bg-column px-3 py-2.5"
          >
            <MemberAvatar :member="member" size="lg" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-text-primary">
                {{ member.name }}
                <span
                  v-if="member.isAdmin"
                  class="ml-1 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                >
                  admin
                </span>
              </p>
              <p v-if="member.email" class="truncate text-xs text-text-muted">
                {{ member.email }}
              </p>
            </div>
            <button
              v-if="canRemove(member.id)"
              type="button"
              class="rounded-lg p-1.5 text-text-muted hover:bg-danger/15 hover:text-danger disabled:opacity-50"
              :aria-label="`Remover ${member.name}`"
              :disabled="removingId === member.id"
              @click="remove(member.id, member.name)"
            >
              <Loader2
                v-if="removingId === member.id"
                :size="15"
                class="animate-spin"
              />
              <Trash2 v-else :size="15" />
            </button>
          </div>
          <p v-if="!board.members.length" class="text-sm text-text-muted">
            Nenhum usuário ainda. Convide alguém pelo e-mail abaixo.
          </p>
        </div>

        <form
          class="space-y-2 border-t border-border-subtle px-5 py-4"
          @submit.prevent="submitInvite"
        >
          <label class="block text-xs text-text-muted">
            E-mail
            <div class="relative mt-1">
              <Mail
                :size="15"
                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                ref="emailInputRef"
                v-model="email"
                type="email"
                required
                placeholder="pessoa@empresa.com"
                class="w-full rounded-lg border border-border-subtle bg-column py-2 pl-9 pr-3 text-sm outline-none placeholder:text-text-muted focus:border-accent"
              />
            </div>
          </label>

          <label class="block text-xs text-text-muted">
            Nome (opcional)
            <input
              v-model="name"
              type="text"
              placeholder="Nome que aparece no quadro"
              class="mt-1 w-full rounded-lg border border-border-subtle bg-column px-3 py-2 text-sm outline-none placeholder:text-text-muted focus:border-accent"
            />
          </label>

          <p v-if="formError" class="text-xs text-red-300">{{ formError }}</p>
          <p v-if="formSuccess" class="text-xs text-emerald-300">{{ formSuccess }}</p>
          <div
            v-if="inviteLink"
            class="rounded-lg border border-border-subtle bg-column p-2.5"
          >
            <p class="mb-1.5 text-[11px] text-text-muted">
              Link de acesso (enviar manualmente):
            </p>
            <p class="mb-2 break-all text-[11px] text-text-secondary">{{ inviteLink }}</p>
            <button
              type="button"
              class="rounded-md bg-surface px-2.5 py-1 text-xs text-text-primary hover:bg-accent/20"
              @click="copyInviteLink"
            >
              Copiar link
            </button>
          </div>

          <button
            type="submit"
            class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-board hover:bg-accent-hover disabled:opacity-60"
            :disabled="inviting"
          >
            <Loader2 v-if="inviting" :size="16" class="animate-spin" />
            <Mail v-else :size="16" />
            {{ inviting ? 'Enviando convite…' : 'Enviar convite' }}
          </button>
        </form>
      </div>
    </div>
  </Teleport>
</template>
