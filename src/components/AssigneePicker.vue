<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Plus, UserRoundPlus } from '@lucide/vue'
import type { Member } from '../types/board'
import MemberAvatar from './MemberAvatar.vue'
import { useEphemeralDismiss } from '../composables/useEphemeralDismiss'

const props = withDefaults(
  defineProps<{
    selectedIds: string[]
    members: Member[]
    /** stack = avatars + circular + (card); icon = compact row action (checklist) */
    variant?: 'stack' | 'icon'
    label?: string
    maxVisible?: number
  }>(),
  {
    variant: 'stack',
    label: undefined,
    maxVisible: 5,
  },
)

const emit = defineEmits<{
  toggle: [memberId: string]
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

useEphemeralDismiss({
  isOpen: open,
  onClose: () => {
    open.value = false
  },
  roots: [rootRef],
  delayMs: 4000,
})

const selected = computed(() =>
  props.selectedIds
    .map((id) => props.members.find((member) => member.id === id))
    .filter((member): member is Member => Boolean(member)),
)

const visible = computed(() => selected.value.slice(0, props.maxVisible))
const overflow = computed(() => Math.max(0, selected.value.length - props.maxVisible))

async function toggleOpen() {
  open.value = !open.value
  if (open.value) await nextTick()
}
</script>

<template>
  <div ref="rootRef" class="relative" data-ephemeral-menu>
    <p
      v-if="label"
      class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted"
    >
      {{ label }}
    </p>

    <!-- Card: stacked avatars + dashed circle -->
    <div v-if="variant === 'stack'" class="flex items-center">
      <div class="flex -space-x-1.5">
        <button
          v-for="member in visible"
          :key="member.id"
          type="button"
          class="rounded-full ring-2 ring-board-elevated transition-transform hover:z-10 hover:scale-105"
          :title="`${member.name} (clique para remover)`"
          @click="emit('toggle', member.id)"
        >
          <MemberAvatar :member="member" size="lg" />
        </button>
        <span
          v-if="overflow"
          class="inline-flex size-8 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-text-secondary ring-2 ring-board-elevated"
        >
          +{{ overflow }}
        </span>
      </div>
      <button
        type="button"
        class="ml-1.5 inline-flex size-8 items-center justify-center rounded-full border border-dashed border-white/30 text-text-muted transition-colors hover:border-[#39bcff] hover:bg-[#39bcff]/10 hover:text-[#39bcff]"
        title="Adicionar membro"
        :aria-expanded="open"
        @click="toggleOpen"
      >
        <Plus :size="16" />
      </button>
    </div>

    <!-- Checklist row: avatar(s) or user-plus -->
    <button
      v-else
      type="button"
      class="inline-flex items-center justify-center rounded-md p-1 text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary"
      :title="selected.length ? selected.map((m) => m.name).join(', ') : 'Atribuir responsável'"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <div v-if="selected.length" class="flex -space-x-1.5">
        <MemberAvatar
          v-for="member in selected.slice(0, 2)"
          :key="member.id"
          :member="member"
          size="sm"
          class="ring-1 ring-board-elevated"
        />
        <span
          v-if="selected.length > 2"
          class="inline-flex size-5 items-center justify-center rounded-full bg-surface text-[8px] font-semibold text-text-secondary ring-1 ring-board-elevated"
        >
          +{{ selected.length - 2 }}
        </span>
      </div>
      <UserRoundPlus v-else :size="16" :stroke-width="1.75" />
    </button>

    <div
      v-if="open"
      class="absolute left-0 top-[calc(100%+6px)] z-40 max-h-56 w-60 overflow-y-auto rounded-xl border border-white/10 bg-board-elevated p-1.5 shadow-xl shadow-black/50"
      :class="variant === 'icon' && 'right-0 left-auto'"
      role="listbox"
      aria-label="Selecionar membros"
    >
      <button
        v-for="member in members"
        :key="member.id"
        type="button"
        role="option"
        :aria-selected="selectedIds.includes(member.id)"
        :class="[
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
          selectedIds.includes(member.id)
            ? 'bg-[#39bcff]/15 text-text-primary'
            : 'text-text-secondary hover:bg-surface hover:text-text-primary',
        ]"
        @click="emit('toggle', member.id)"
      >
        <MemberAvatar :member="member" size="sm" />
        <span class="min-w-0 flex-1 truncate">{{ member.name }}</span>
        <span
          v-if="selectedIds.includes(member.id)"
          class="text-[10px] font-medium text-[#39bcff]"
        >
          ✓
        </span>
      </button>
      <p
        v-if="!members.length"
        class="px-2 py-3 text-center text-xs text-text-muted"
      >
        Nenhum membro no time
      </p>
    </div>
  </div>
</template>
