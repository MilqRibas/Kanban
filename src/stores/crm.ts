import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  fetchCrmDataFreshness,
  fetchCrmPlayer360,
  fetchCrmPlayerList,
  updateIncentiveClassification as apiUpdateIncentiveClassification,
} from '../services/crmApi'
import type {
  CrmCampaignFilter,
  CrmDataFreshness,
  CrmIncentiveAvailableFilter,
  CrmIncentiveClassificationUpdate,
  CrmIncentiveReceivedFilter,
  CrmPlayer360,
  CrmPlayerListItem,
  CrmPlayerSort,
} from '../types/crm'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'

const PAGE_SIZE = 50

export const useCrmStore = defineStore('crm', () => {
  const rows = ref<CrmPlayerListItem[]>([])
  const total = ref(0)
  const offset = ref(0)
  const limit = ref(PAGE_SIZE)
  const search = ref('')
  const campaignFilter = ref<CrmCampaignFilter>('all')
  const incentiveAvailableFilter = ref<CrmIncentiveAvailableFilter>('all')
  const incentiveReceivedFilter = ref<CrmIncentiveReceivedFilter>('all')
  const sort = ref<CrmPlayerSort>('last_activity_desc')
  const clubFilter = ref<'all' | 'sx_club' | 'xtreme_pro'>('all')
  const loading = ref(false)
  const ready = ref(false)
  const error = ref<string | null>(null)
  const freshness = ref<CrmDataFreshness | null>(null)

  const player360 = ref<CrmPlayer360 | null>(null)
  const player360Loading = ref(false)
  const player360Error = ref<string | null>(null)
  const incentiveUpdating = ref(false)

  const page = computed(() => Math.floor(offset.value / limit.value) + 1)
  const pageCount = computed(() =>
    total.value === 0 ? 1 : Math.ceil(total.value / limit.value),
  )
  const hasPrev = computed(() => offset.value > 0)
  const hasNext = computed(() => offset.value + limit.value < total.value)

  async function loadFreshness() {
    try {
      freshness.value = await fetchCrmDataFreshness()
    } catch (err) {
      freshness.value = null
      console.warn('[crm] freshness', err)
    }
  }

  async function loadPlayers(options?: { resetOffset?: boolean }) {
    if (options?.resetOffset) offset.value = 0
    loading.value = true
    error.value = null
    try {
      const result = await fetchCrmPlayerList({
        search: search.value,
        campaignFilter: campaignFilter.value,
        incentiveAvailableFilter: incentiveAvailableFilter.value,
        incentiveReceivedFilter: incentiveReceivedFilter.value,
        sort: sort.value,
        club: clubFilter.value,
        limit: limit.value,
        offset: offset.value,
      })
      rows.value = result.rows
      total.value = result.total
      limit.value = result.limit
      offset.value = result.offset
      ready.value = true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao carregar jogadores do CRM.'
      error.value = message
      useToastStore().error(message)
    } finally {
      loading.value = false
    }
  }

  async function init() {
    await Promise.all([loadPlayers({ resetOffset: true }), loadFreshness()])
  }

  function reset() {
    rows.value = []
    total.value = 0
    offset.value = 0
    search.value = ''
    campaignFilter.value = 'all'
    incentiveAvailableFilter.value = 'all'
    incentiveReceivedFilter.value = 'all'
    sort.value = 'last_activity_desc'
    loading.value = false
    ready.value = false
    error.value = null
    freshness.value = null
    player360.value = null
    player360Loading.value = false
    player360Error.value = null
    incentiveUpdating.value = false
  }

  async function setSearch(value: string) {
    search.value = value
    await loadPlayers({ resetOffset: true })
  }

  async function setCampaignFilter(value: CrmCampaignFilter) {
    campaignFilter.value = value
    await loadPlayers({ resetOffset: true })
  }

  async function setIncentiveAvailableFilter(value: CrmIncentiveAvailableFilter) {
    incentiveAvailableFilter.value = value
    await loadPlayers({ resetOffset: true })
  }

  async function setIncentiveReceivedFilter(value: CrmIncentiveReceivedFilter) {
    incentiveReceivedFilter.value = value
    await loadPlayers({ resetOffset: true })
  }

  async function setSort(value: CrmPlayerSort) {
    sort.value = value
    await loadPlayers({ resetOffset: true })
  }

  async function setClubFilter(value: 'all' | 'sx_club' | 'xtreme_pro') {
    clubFilter.value = value
    await loadPlayers({ resetOffset: true })
  }

  async function nextPage() {
    if (!hasNext.value) return
    offset.value += limit.value
    await loadPlayers()
  }

  async function prevPage() {
    if (!hasPrev.value) return
    offset.value = Math.max(0, offset.value - limit.value)
    await loadPlayers()
  }

  async function openPlayer360(playerId: string) {
    player360Loading.value = true
    player360Error.value = null
    try {
      const data = await fetchCrmPlayer360(playerId)
      if (!data) {
        player360.value = null
        player360Error.value = 'Jogador não encontrado na base operacional.'
        useToastStore().error(player360Error.value)
        return null
      }
      player360.value = data
      return data
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao abrir Player 360º.'
      player360Error.value = message
      useToastStore().error(message)
      return null
    } finally {
      player360Loading.value = false
    }
  }

  function closePlayer360() {
    player360.value = null
    player360Error.value = null
  }

  async function updateIncentiveClassification(
    externalTransactionId: string,
    update: CrmIncentiveClassificationUpdate,
  ) {
    incentiveUpdating.value = true
    try {
      const auth = useAuthStore()
      await apiUpdateIncentiveClassification(
        externalTransactionId,
        update,
        auth.memberId ?? null,
      )
      useToastStore().success('Classificação de incentivo atualizada.')
      const openId = player360.value?.playerId
      if (openId) {
        await openPlayer360(openId)
      }
      await loadPlayers()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Falha ao atualizar classificação de incentivo.'
      useToastStore().error(message)
      throw err
    } finally {
      incentiveUpdating.value = false
    }
  }

  return {
    rows,
    total,
    offset,
    limit,
    search,
    campaignFilter,
    incentiveAvailableFilter,
    incentiveReceivedFilter,
    sort,
    clubFilter,
    setClubFilter,
    loading,
    ready,
    error,
    freshness,
    player360,
    player360Loading,
    player360Error,
    incentiveUpdating,
    page,
    pageCount,
    hasPrev,
    hasNext,
    init,
    reset,
    loadPlayers,
    loadFreshness,
    setSearch,
    setCampaignFilter,
    setIncentiveAvailableFilter,
    setIncentiveReceivedFilter,
    setClubFilter,
    setSort,
    nextPage,
    prevPage,
    openPlayer360,
    closePlayer360,
    updateIncentiveClassification,
  }
})
