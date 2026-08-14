import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export function useDebouncedValue<T>(source: () => T, delayMs = 180): Ref<T> {
  const delayed = ref(source()) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(source, (value) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      delayed.value = value
    }, delayMs)
  })

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return delayed
}
