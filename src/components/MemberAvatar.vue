<script setup lang="ts">
import type { Member } from '../types/board'

withDefaults(
  defineProps<{
    member: Pick<Member, 'name' | 'initials' | 'avatarColor' | 'avatarUrl'>
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)

const sizeClass = {
  sm: 'size-5 text-[9px]',
  md: 'size-6 text-[10px]',
  lg: 'size-8 text-xs',
}
</script>

<template>
  <span
    :class="[
      member.avatarColor,
      sizeClass[size],
      'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white',
    ]"
    :title="member.name"
  >
    <img
      v-if="member.avatarUrl"
      :src="member.avatarUrl"
      alt=""
      class="absolute inset-0 size-full object-cover"
    />
    <template v-else>{{ member.initials }}</template>
  </span>
</template>
