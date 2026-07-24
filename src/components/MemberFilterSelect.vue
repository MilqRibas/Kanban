<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronDown, Users } from '@lucide/vue'
import { useBoardStore } from '../stores/board'
import MemberAvatar from './MemberAvatar.vue'

withDefaults(
  defineProps<{
    compact?: boolean
    /** Só ícone/avatar — ideal para header mobile */
    mini?: boolean
  }>(),
  { compact: false, mini: false },
)

const board = useBoardStore()
const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

const menuStyle = ref<Record<string, string>>({
  top: '0px',
  left: '0px',
})

const label = computed(() => {
  if (!board.memberFilterId) return 'Todos'
  return board.activeMemberFilter?.name ?? 'Todos'
})

const selectedMember = computed(() => board.activeMemberFilter)

function updatePosition() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const menuWidth = 224
  const padding = 8
  let left = rect.left
  if (left + menuWidth > window.innerWidth - padding) {
    left = Math.max(padding, rect.right - menuWidth)
  }
  menuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${left}px`,
    width: `${Math.max(rect.width, menuWidth)}px`,
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updatePosition()
  }
}

function choose(memberId: string | null) {
  board.setMemberFilter(memberId)
  open.value = false
}

function onDocClick(event: MouseEvent) {
  const target = event.target as Node
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) {
    return
  }
  open.value = false
}

function onWindowChange() {
  if (open.value) updatePosition()
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', onDocClick)
    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', onWindowChange, true)
  } else {
    document.removeEventListener('click', onDocClick)
    window.removeEventListener('resize', onWindowChange)
    window.removeEventListener('scroll', onWindowChange, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      :class="[
        'inline-flex items-center border border-white/10 bg-white/5 text-left text-sm text-text-primary transition-colors hover:bg-white/10',
        mini
          ? 'size-8 justify-center rounded-full'
          : compact
            ? 'gap-2 rounded-xl px-2.5 py-1.5'
            : 'min-w-44 gap-2 rounded-xl px-3 py-2',
      ]"
      :aria-expanded="open"
      :aria-label="mini ? `Filtrar por: ${label}` : undefined"
      :title="mini ? label : undefined"
      @click.stop="toggle"
    >
      <MemberAvatar v-if="selectedMember" :member="selectedMember" size="sm" />
      <Users v-else :size="mini ? 15 : 15" class="shrink-0 text-text-muted" />
      <template v-if="!mini">
        <span class="min-w-0 flex-1 truncate">{{ label }}</span>
        <ChevronDown :size="14" class="shrink-0 text-text-muted" />
      </template>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        class="fixed z-[200] max-h-72 overflow-y-auto rounded-xl border border-border-subtle bg-board-elevated shadow-2xl shadow-black/50"
        role="listbox"
        :style="menuStyle"
        @click.stop
      >
        <button
          type="button"
          role="option"
          :aria-selected="board.memberFilterId === null"
          :class="[
            'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors',
            board.memberFilterId === null
              ? 'bg-surface text-text-primary'
              : 'text-text-secondary hover:bg-surface/70 hover:text-text-primary',
          ]"
          @click="choose(null)"
        >
          <Users :size="15" class="text-text-muted" />
          Todos
        </button>
        <button
          v-for="member in board.members"
          :key="member.id"
          type="button"
          role="option"
          :aria-selected="board.memberFilterId === member.id"
          :class="[
            'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors',
            board.memberFilterId === member.id
              ? 'bg-surface text-text-primary'
              : 'text-text-secondary hover:bg-surface/70 hover:text-text-primary',
          ]"
          @click="choose(member.id)"
        >
          <MemberAvatar :member="member" size="md" />
          {{ member.name }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
