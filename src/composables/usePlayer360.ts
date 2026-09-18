import { computed, inject, provide, type InjectionKey, type Ref, ref } from 'vue'
import { useCrmStore } from '../stores/crm'

type Player360Api = {
  open: (playerId: string) => Promise<void>
  close: () => void
  isOpen: Ref<boolean>
}

const PLAYER_360_KEY: InjectionKey<Player360Api> = Symbol('player360')

export function providePlayer360() {
  const crm = useCrmStore()
  const requestedOpen = ref(false)

  const api: Player360Api = {
    isOpen: computed(() => requestedOpen.value && Boolean(crm.player360 || crm.player360Loading)),
    async open(playerId: string) {
      requestedOpen.value = true
      await crm.openPlayer360(playerId)
      if (!crm.player360) requestedOpen.value = false
    },
    close() {
      requestedOpen.value = false
      crm.closePlayer360()
    },
  }

  provide(PLAYER_360_KEY, api)
  return api
}

export function usePlayer360() {
  const api = inject(PLAYER_360_KEY, null)
  if (!api) {
    const crm = useCrmStore()
    return {
      isOpen: computed(() => Boolean(crm.player360 || crm.player360Loading)),
      async open(playerId: string) {
        await crm.openPlayer360(playerId)
      },
      close() {
        crm.closePlayer360()
      },
    } satisfies Player360Api
  }
  return api
}
