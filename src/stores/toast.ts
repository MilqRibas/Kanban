import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastKind = 'error' | 'success' | 'info'

export interface ToastItem {
  id: string
  kind: ToastKind
  message: string
  createdAt: number
}

export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function dismiss(id: string) {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  function push(kind: ToastKind, message: string, ms = 4200) {
    const text = message.trim()
    if (!text) return
    const id = `toast-${crypto.randomUUID().slice(0, 8)}`
    items.value = [...items.value.slice(-4), { id, kind, message: text, createdAt: Date.now() }]
    timers.set(
      id,
      setTimeout(() => {
        dismiss(id)
      }, ms),
    )
  }

  function error(message: string) {
    push('error', message, 5600)
  }

  function success(message: string) {
    push('success', message, 3200)
  }

  function info(message: string) {
    push('info', message)
  }

  return { items, push, error, success, info, dismiss }
})
