import { onBeforeUnmount, onMounted, watch, type Ref, type WatchSource } from 'vue'

/** Fecha popovers ao clicar fora ou após `delayMs` sem interação. */
export function useEphemeralDismiss(options: {
  isOpen: WatchSource<boolean>
  onClose: () => void
  /** Elementos que contam como “dentro” do popover (não fecham ao clicar). */
  roots?: Ref<HTMLElement | null>[]
  delayMs?: number
}) {
  const delayMs = options.delayMs ?? 4000
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule() {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      options.onClose()
    }, delayMs)
  }

  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node
    const roots = options.roots ?? []
    if (roots.some((root) => root.value?.contains(target))) return
    // data-ephemeral-menu: âncora + painel marcados no DOM
    const el = event.target as HTMLElement | null
    if (el?.closest?.('[data-ephemeral-menu]')) return
    options.onClose()
  }

  watch(
    options.isOpen,
    (open) => {
      if (open) schedule()
      else clearTimer()
    },
    { immediate: true },
  )

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown, true)
  })

  onBeforeUnmount(() => {
    clearTimer()
    document.removeEventListener('pointerdown', onPointerDown, true)
  })

  return { schedule, clearTimer }
}
