<script setup lang="ts">
import { computed } from 'vue'
import { Bell, CheckCheck } from '@lucide/vue'
import { useNotificationsStore } from '../stores/notifications'
import { useBoardStore } from '../stores/board'
import MemberAvatar from './MemberAvatar.vue'

const notifications = useNotificationsStore()
const board = useBoardStore()

const fallback = {
  name: 'Usuário',
  initials: '?',
  avatarColor: 'bg-sky-600',
  avatarUrl: null as string | null,
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

const hasItems = computed(() => notifications.sorted.length > 0)
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="relative flex size-8 items-center justify-center rounded-lg text-text-secondary hover:bg-white/10 hover:text-text-primary"
      :aria-expanded="notifications.open"
      aria-label="Notificações"
      @click="notifications.open = !notifications.open"
    >
      <Bell :size="17" :stroke-width="2.25" />
      <span
        v-if="notifications.unreadCount"
        class="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white"
      >
        {{ notifications.unreadCount > 9 ? '9+' : notifications.unreadCount }}
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="notifications.open"
        class="fixed inset-0 z-[190]"
      >
        <button
          type="button"
          class="absolute inset-0 bg-black/40"
          aria-label="Fechar notificações"
          @click="notifications.open = false"
        />
        <div
          class="absolute right-2 top-14 w-[min(100%-1rem,22rem)] overflow-hidden rounded-2xl border border-border-subtle bg-board-elevated shadow-2xl sm:right-4"
        >
          <header class="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
            <h2 class="text-sm font-semibold text-text-primary">Notificações</h2>
            <button
              v-if="notifications.unreadCount"
              type="button"
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-secondary hover:bg-surface hover:text-text-primary"
              @click="notifications.markAllRead()"
            >
              <CheckCheck :size="13" />
              Marcar lidas
            </button>
          </header>

          <ul class="max-h-[60vh] overflow-y-auto">
            <li
              v-for="item in notifications.sorted"
              :key="item.id"
              class="border-b border-border-subtle/70 last:border-b-0"
            >
              <button
                type="button"
                class="flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface/60"
                :class="!item.readAt && 'bg-accent/5'"
                @click="notifications.openNotification(item)"
              >
                <MemberAvatar
                  :member="
                    board.getMemberById(item.actorMemberId ?? '') ?? fallback
                  "
                  size="md"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-text-primary">
                    {{ item.title }}
                  </p>
                  <p class="mt-0.5 line-clamp-2 text-xs text-text-muted">
                    {{ item.body }}
                  </p>
                  <p class="mt-1 text-[10px] text-text-muted">
                    {{ formatWhen(item.createdAt) }}
                  </p>
                </div>
                <span
                  v-if="!item.readAt"
                  class="mt-1 size-2 shrink-0 rounded-full bg-accent"
                />
              </button>
            </li>
            <li
              v-if="!hasItems"
              class="px-3 py-8 text-center text-sm text-text-muted"
            >
              Nenhuma notificação ainda.
            </li>
          </ul>
        </div>
      </div>
    </Teleport>
  </div>
</template>
