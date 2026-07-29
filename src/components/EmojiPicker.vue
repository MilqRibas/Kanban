<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Smile } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    /** Classes extras no botão trigger */
    compact?: boolean
  }>(),
  { compact: false },
)

const emit = defineEmits<{
  pick: [emoji: string]
}>()

const EMOJIS = [
  '😀', '😁', '😂', '😊', '😍', '🤔', '😮', '😢', '🔥', '✨',
  '✅', '❌', '⚠️', '💡', '📌', '📎', '📅', '🎯', '🚀', '👏',
  '👍', '👎', '❤️', '💙', '🙌', '💪', '🎉', '📝', '🔔', '⭐',
]

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({ top: '0px', left: '0px' })

function updatePosition() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const menuWidth = 240
  const padding = 8
  let left = rect.left
  if (left + menuWidth > window.innerWidth - padding) {
    left = Math.max(padding, rect.right - menuWidth)
  }
  const below = rect.bottom + 6
  const spaceBelow = window.innerHeight - below
  const top =
    spaceBelow < 180 && rect.top > 180
      ? `${rect.top - 176}px`
      : `${below}px`
  menuStyle.value = {
    top,
    left: `${left}px`,
    width: `${menuWidth}px`,
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updatePosition()
  }
}

function pick(emoji: string) {
  emit('pick', emoji)
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
  <div class="relative inline-flex">
    <button
      ref="triggerRef"
      type="button"
      :class="[
        'inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary',
        compact ? 'size-7' : 'size-8',
      ]"
      title="Inserir emoji"
      aria-label="Inserir emoji"
      :aria-expanded="open"
      @click="toggle"
    >
      <Smile :size="props.compact ? 14 : 15" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        class="fixed z-[220] rounded-xl border border-border-subtle bg-board-elevated p-2 shadow-2xl shadow-black/50"
        :style="menuStyle"
        role="listbox"
        aria-label="Emojis"
      >
        <div class="grid grid-cols-6 gap-0.5">
          <button
            v-for="emoji in EMOJIS"
            :key="emoji"
            type="button"
            class="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-white/10"
            @click="pick(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
