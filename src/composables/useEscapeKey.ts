import { onBeforeUnmount, watch, type WatchSource } from 'vue'

/** Fecha modal/overlay com Escape enquanto `active` estiver verdadeiro. */
export function useEscapeKey(
  active: WatchSource<boolean>,
  onEscape: () => void,
) {
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onEscape()
  }

  watch(
    active,
    (isActive) => {
      if (isActive) window.addEventListener('keydown', onKeydown)
      else window.removeEventListener('keydown', onKeydown)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
  })
}
