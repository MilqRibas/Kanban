import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  Attachment,
  Card,
  Checklist,
  Column,
  Comment,
  Label,
  LabelColor,
  Member,
} from '../types/board'
import { BOARD_ID, supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import type { Json } from '../lib/database.types'

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function asChecklists(value: Json): Checklist[] {
  if (!Array.isArray(value)) return []
  return value as unknown as Checklist[]
}

export const useBoardStore = defineStore('board', () => {
  const title = ref('B2C TEAM')
  const columns = ref<Column[]>([])
  const cards = ref<Card[]>([])
  const labels = ref<Label[]>([])
  const members = ref<Member[]>([])
  const selectedCardId = ref<string | null>(null)
  const memberFilterId = ref<string | null>(null)
  const loading = ref(false)
  const ready = ref(false)
  const error = ref<string | null>(null)

  let channel: RealtimeChannel | null = null
  let suppressRealtimeUntil = 0
  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  let loadPromise: Promise<void> | null = null

  const avatarColors = [
    'bg-sky-600',
    'bg-pink-600',
    'bg-emerald-600',
    'bg-amber-600',
    'bg-violet-600',
    'bg-rose-600',
    'bg-cyan-600',
    'bg-indigo-600',
  ]

  function initialsFromName(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase()
  }

  function quietRealtime(ms = 800) {
    suppressRealtimeUntil = Date.now() + ms
  }

  const sortedColumns = computed(() =>
    [...columns.value].sort((a, b) => a.position - b.position),
  )

  const selectedCard = computed(
    () => cards.value.find((card) => card.id === selectedCardId.value) ?? null,
  )

  const filteredCards = computed(() => {
    if (!memberFilterId.value) return cards.value
    return cards.value.filter((card) =>
      card.memberIds.includes(memberFilterId.value!),
    )
  })

  const cardsByColumn = computed(() => {
    const map: Record<string, Card[]> = {}
    for (const column of columns.value) {
      map[column.id] = []
    }
    for (const card of [...filteredCards.value].sort(
      (a, b) => a.position - b.position,
    )) {
      if (!map[card.columnId]) map[card.columnId] = []
      map[card.columnId].push(card)
    }
    return map
  })

  const cardsWithDueDate = computed(() =>
    filteredCards.value.filter((card) => card.dueDate !== null),
  )

  const activeMemberFilter = computed(() =>
    memberFilterId.value
      ? (members.value.find((member) => member.id === memberFilterId.value) ??
        null)
      : null,
  )

  async function loadBoard() {
    // Evita rajadas: se já está carregando, reutiliza a mesma Promise
    if (loadPromise) return loadPromise

    loadPromise = (async () => {
      loading.value = true
      error.value = null
      try {
        // 1 request no lugar de 9
        const { data, error: rpcError } = await supabase.rpc(
          'get_board_snapshot',
          { p_board_id: BOARD_ID },
        )

        if (rpcError) throw rpcError
        if (!data?.board) throw new Error('Quadro não encontrado')

        const snapshot = data as {
          board: { title: string }
          members: Array<{
            id: string
            name: string
            initials: string
            avatar_color: string
            avatar_url: string | null
            user_id: string | null
            email: string | null
          }>
          labels: Array<{ id: string; name: string; color: string }>
          columns: Array<{
            id: string
            title: string
            position: number
            is_done_column: boolean
          }>
          cards: Array<{
            id: string
            column_id: string
            title: string
            description: string
            due_date: string | null
            checklists: Json
            completed: boolean
            position: number
            created_at: string
            updated_at: string
          }>
          card_labels: Array<{ card_id: string; label_id: string }>
          card_members: Array<{ card_id: string; member_id: string }>
          comments: Array<{
            id: string
            card_id: string
            author_id: string
            body: string
            created_at: string
          }>
          attachments: Array<{
            id: string
            card_id: string
            name: string
            url: string
            mime_type: string
            size_bytes: number
            created_at: string
            kind: string | null
          }>
        }

        title.value = snapshot.board.title
        const mappedMembers = (snapshot.members ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          initials: row.initials,
          avatarColor: row.avatar_color,
          avatarUrl: row.avatar_url ?? null,
          userId: row.user_id ?? null,
          email: row.email ?? null,
          isAdmin: false,
        }))

        const userIds = mappedMembers
          .map((member) => member.userId)
          .filter((id): id is string => Boolean(id))

        if (userIds.length) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, is_admin')
            .in('id', userIds)
          const adminIds = new Set(
            (profiles ?? [])
              .filter((profile) => profile.is_admin)
              .map((profile) => profile.id),
          )
          for (const member of mappedMembers) {
            if (member.userId && adminIds.has(member.userId)) {
              member.isAdmin = true
            }
          }
        }

        members.value = mappedMembers
        labels.value = (snapshot.labels ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          color: row.color as LabelColor,
        }))
        columns.value = (snapshot.columns ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          position: row.position,
          isDoneColumn: row.is_done_column || undefined,
        }))

        const labelsByCard = new Map<string, string[]>()
        for (const row of snapshot.card_labels ?? []) {
          const list = labelsByCard.get(row.card_id) ?? []
          list.push(row.label_id)
          labelsByCard.set(row.card_id, list)
        }

        const membersByCard = new Map<string, string[]>()
        for (const row of snapshot.card_members ?? []) {
          const list = membersByCard.get(row.card_id) ?? []
          list.push(row.member_id)
          membersByCard.set(row.card_id, list)
        }

        const commentsByCard = new Map<string, Comment[]>()
        for (const row of snapshot.comments ?? []) {
          const list = commentsByCard.get(row.card_id) ?? []
          list.push({
            id: row.id,
            authorId: row.author_id,
            body: row.body,
            createdAt: row.created_at,
          })
          commentsByCard.set(row.card_id, list)
        }

        const attachmentsByCard = new Map<string, Attachment[]>()
        for (const row of snapshot.attachments ?? []) {
          const list = attachmentsByCard.get(row.card_id) ?? []
          list.push({
            id: row.id,
            name: row.name,
            url: row.url,
            mimeType: row.mime_type,
            sizeBytes: Number(row.size_bytes),
            createdAt: row.created_at,
            kind: (row.kind as 'file' | 'link') || 'file',
          })
          attachmentsByCard.set(row.card_id, list)
        }

        cards.value = (snapshot.cards ?? []).map((row) => ({
          id: row.id,
          columnId: row.column_id,
          title: row.title,
          description: row.description,
          labelIds: labelsByCard.get(row.id) ?? [],
          memberIds: membersByCard.get(row.id) ?? [],
          dueDate: row.due_date,
          checklists: asChecklists(row.checklists),
          comments: commentsByCard.get(row.id) ?? [],
          attachments: attachmentsByCard.get(row.id) ?? [],
          completed: row.completed,
          position: row.position,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }))

        ready.value = true
        // Evita eco imediato do realtime após o próprio load/sync
        quietRealtime(1200)
      } catch (err) {
        error.value =
          err instanceof Error ? err.message : 'Falha ao carregar o quadro'
        ready.value = false
      } finally {
        loading.value = false
        loadPromise = null
      }
    })()

    return loadPromise
  }

  function scheduleReload() {
    if (Date.now() < suppressRealtimeUntil) return
    if (reloadTimer) clearTimeout(reloadTimer)
    // Agrupa vários eventos realtime em 1 reload
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      if (Date.now() < suppressRealtimeUntil) return
      void loadBoard()
    }, 1200)
  }

  function subscribeRealtime() {
    unsubscribeRealtime()
    const onChange = () => scheduleReload()

    channel = supabase
      .channel(`board:${BOARD_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cards' },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'columns' },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members' },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments' },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attachments' },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_labels' },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_members' },
        onChange,
      )
      .subscribe()
  }

  function unsubscribeRealtime() {
    if (reloadTimer) {
      clearTimeout(reloadTimer)
      reloadTimer = null
    }
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  async function init() {
    await loadBoard()
    subscribeRealtime()
  }

  function reset() {
    unsubscribeRealtime()
    title.value = 'B2C TEAM'
    columns.value = []
    cards.value = []
    labels.value = []
    members.value = []
    selectedCardId.value = null
    memberFilterId.value = null
    ready.value = false
    error.value = null
  }

  function setMemberFilter(memberId: string | null) {
    memberFilterId.value = memberId
  }

  async function addMember(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return null
    const member: Member = {
      id: createId('m'),
      name: trimmed,
      initials: initialsFromName(trimmed) || '??',
      avatarColor: avatarColors[members.value.length % avatarColors.length],
    }
    members.value.push(member)
    quietRealtime()
    const { error: insertError } = await supabase.from('members').insert({
      id: member.id,
      board_id: BOARD_ID,
      name: member.name,
      initials: member.initials,
      avatar_color: member.avatarColor,
      position: members.value.length - 1,
    })
    if (insertError) error.value = insertError.message
    return member
  }

  async function removeMember(memberId: string) {
    const auth = useAuthStore()
    if (!auth.isAdmin) {
      error.value = 'Apenas administradores podem remover usuários.'
      return false
    }

    const previous = members.value.slice()
    members.value = members.value.filter((member) => member.id !== memberId)
    for (const card of cards.value) {
      card.memberIds = card.memberIds.filter((id) => id !== memberId)
    }
    if (memberFilterId.value === memberId) {
      memberFilterId.value = null
    }
    quietRealtime()

    const { data, error: fnError } = await supabase.functions.invoke(
      'remove-member',
      { body: { memberId } },
    )

    if (fnError || data?.error) {
      members.value = previous
      let fromBody: string | null = null
      if (data && typeof data === 'object' && 'error' in data) {
        fromBody = String((data as { error: unknown }).error)
      } else {
        try {
          const context = (fnError as { context?: Response } | null)?.context
          if (context) {
            const payload = await context.clone().json()
            if (payload?.error) fromBody = String(payload.error)
          }
        } catch {
          // ignore
        }
      }
      error.value = fromBody || fnError?.message || 'Falha ao remover usuário.'
      return false
    }

    error.value = null
    return true
  }

  function getLabelsForCard(card: Card) {
    return labels.value.filter((label) => card.labelIds.includes(label.id))
  }

  function getMembersForCard(card: Card) {
    return members.value.filter((member) => card.memberIds.includes(member.id))
  }

  function getMemberById(id: string) {
    return members.value.find((member) => member.id === id)
  }

  function openCard(cardId: string) {
    selectedCardId.value = cardId
  }

  function closeCard() {
    selectedCardId.value = null
  }

  async function setColumnCards(columnId: string, nextCards: Card[]) {
    const column = columns.value.find((item) => item.id === columnId)
    const previousInColumn = cards.value.filter(
      (card) => card.columnId === columnId,
    )
    const hiddenInColumn = memberFilterId.value
      ? previousInColumn.filter(
          (card) => !card.memberIds.includes(memberFilterId.value!),
        )
      : []

    const movedIntoDone =
      column?.isDoneColumn &&
      nextCards.some(
        (card) => !previousInColumn.find((prev) => prev.id === card.id),
      )

    const otherCards = cards.value.filter((card) => card.columnId !== columnId)
    const merged = [...nextCards, ...hiddenInColumn]
    const normalized = merged.map((card, index) => ({
      ...card,
      columnId,
      position: index,
      completed:
        column?.isDoneColumn && nextCards.some((next) => next.id === card.id)
          ? true
          : card.completed,
      updatedAt: new Date().toISOString(),
    }))

    cards.value = [...otherCards, ...normalized]

    if (movedIntoDone) {
      const newlyDone = nextCards.filter(
        (card) => !previousInColumn.find((prev) => prev.id === card.id),
      )
      for (const card of newlyDone) {
        onCardCompleted(card)
      }
    }

    quietRealtime(1200)
    await Promise.all(
      normalized.map((card) =>
        supabase
          .from('cards')
          .update({
            column_id: card.columnId,
            position: card.position,
            completed: card.completed,
            updated_at: card.updatedAt,
          })
          .eq('id', card.id),
      ),
    )
  }

  async function reorderColumns(nextColumns: Column[]) {
    columns.value = nextColumns.map((column, index) => ({
      ...column,
      position: index,
    }))
    quietRealtime()
    await Promise.all(
      columns.value.map((column) =>
        supabase
          .from('columns')
          .update({ position: column.position })
          .eq('id', column.id),
      ),
    )
  }

  async function addColumn(titleText: string) {
    const column: Column = {
      id: createId('col'),
      title: titleText.trim() || 'Nova lista',
      position: columns.value.length,
    }
    columns.value.push(column)
    quietRealtime()
    const { error: insertError } = await supabase.from('columns').insert({
      id: column.id,
      board_id: BOARD_ID,
      title: column.title,
      position: column.position,
      is_done_column: false,
    })
    if (insertError) error.value = insertError.message
  }

  async function renameColumn(columnId: string, titleText: string) {
    const index = columns.value.findIndex((item) => item.id === columnId)
    if (index === -1) return
    const next = titleText.trim()
    if (!next) return
    columns.value[index] = {
      ...columns.value[index],
      title: next,
    }
    quietRealtime()
    await supabase.from('columns').update({ title: next }).eq('id', columnId)
  }

  async function deleteColumn(columnId: string) {
    columns.value = columns.value
      .filter((column) => column.id !== columnId)
      .map((column, index) => ({ ...column, position: index }))
    cards.value = cards.value.filter((card) => card.columnId !== columnId)
    if (selectedCardId.value) {
      const stillExists = cards.value.some(
        (card) => card.id === selectedCardId.value,
      )
      if (!stillExists) selectedCardId.value = null
    }
    quietRealtime()
    await supabase.from('columns').delete().eq('id', columnId)
    await Promise.all(
      columns.value.map((column) =>
        supabase
          .from('columns')
          .update({ position: column.position })
          .eq('id', column.id),
      ),
    )
  }

  async function addCard(columnId: string, titleText: string) {
    const columnCards = cards.value.filter((card) => card.columnId === columnId)
    const now = new Date().toISOString()
    const card: Card = {
      id: createId('card'),
      columnId,
      title: titleText.trim() || 'Novo cartão',
      description: '',
      labelIds: [],
      memberIds: memberFilterId.value ? [memberFilterId.value] : [],
      dueDate: null,
      checklists: [],
      comments: [],
      attachments: [],
      completed: false,
      position: columnCards.length,
      createdAt: now,
      updatedAt: now,
    }
    cards.value.push(card)
    quietRealtime()
    const { error: insertError } = await supabase.from('cards').insert({
      id: card.id,
      board_id: BOARD_ID,
      column_id: card.columnId,
      title: card.title,
      description: card.description,
      due_date: null,
      completed: false,
      position: card.position,
      checklists: [],
      created_at: now,
      updated_at: now,
    })
    if (insertError) {
      error.value = insertError.message
      return card
    }
    if (card.memberIds.length) {
      await supabase.from('card_members').insert(
        card.memberIds.map((memberId) => ({
          card_id: card.id,
          member_id: memberId,
        })),
      )
    }
    return card
  }

  async function updateCard(cardId: string, patch: Partial<Card>) {
    const index = cards.value.findIndex((card) => card.id === cardId)
    if (index === -1) return
    const previous = cards.value[index]
    const next: Card = {
      ...previous,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    cards.value[index] = next
    quietRealtime()

    const dbPatch: Record<string, unknown> = {
      updated_at: next.updatedAt,
    }
    if (patch.title !== undefined) dbPatch.title = patch.title
    if (patch.description !== undefined) dbPatch.description = patch.description
    if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate
    if (patch.completed !== undefined) dbPatch.completed = patch.completed
    if (patch.columnId !== undefined) dbPatch.column_id = patch.columnId
    if (patch.position !== undefined) dbPatch.position = patch.position
    if (patch.checklists !== undefined) {
      dbPatch.checklists = patch.checklists as unknown as Json
    }

    await supabase.from('cards').update(dbPatch).eq('id', cardId)

    if (patch.labelIds) {
      await supabase.from('card_labels').delete().eq('card_id', cardId)
      if (patch.labelIds.length) {
        await supabase.from('card_labels').insert(
          patch.labelIds.map((labelId) => ({
            card_id: cardId,
            label_id: labelId,
          })),
        )
      }
    }

    if (patch.memberIds) {
      await supabase.from('card_members').delete().eq('card_id', cardId)
      if (patch.memberIds.length) {
        await supabase.from('card_members').insert(
          patch.memberIds.map((memberId) => ({
            card_id: cardId,
            member_id: memberId,
          })),
        )
      }
    }
  }

  async function addComment(cardId: string, body: string, authorId?: string) {
    const card = cards.value.find((item) => item.id === cardId)
    if (!card || !body.trim()) return
    const auth = useAuthStore()
    const resolvedAuthor =
      authorId || auth.memberId || members.value[0]?.id || 'm3'
    const comment: Comment = {
      id: createId('cm'),
      authorId: resolvedAuthor,
      body: body.trim(),
      createdAt: new Date().toISOString(),
    }
    card.comments.push(comment)
    card.updatedAt = new Date().toISOString()
    quietRealtime()
    await supabase.from('comments').insert({
      id: comment.id,
      card_id: cardId,
      author_id: comment.authorId,
      body: comment.body,
      created_at: comment.createdAt,
    })
  }

  async function uploadAttachment(cardId: string, file: File) {
    const card = cards.value.find((item) => item.id === cardId)
    if (!card) return null

    const maxBytes = 5 * 1024 * 1024
    if (file.size > maxBytes) {
      error.value = 'Arquivo acima do limite de 5 MB.'
      return null
    }

    const attachmentId = createId('a')
    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const storagePath = `${BOARD_ID}/${cardId}/${attachmentId}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('card-attachments')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })

    if (uploadError) {
      error.value = uploadError.message
      return null
    }

    const { data: publicUrl } = supabase.storage
      .from('card-attachments')
      .getPublicUrl(storagePath)

    const attachment: Attachment = {
      id: attachmentId,
      name: file.name,
      url: publicUrl.publicUrl,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      kind: 'file',
    }

    card.attachments.push(attachment)
    card.updatedAt = new Date().toISOString()
    quietRealtime()

    const { error: insertError } = await supabase.from('attachments').insert({
      id: attachment.id,
      card_id: cardId,
      name: attachment.name,
      storage_path: storagePath,
      url: attachment.url,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes,
      created_at: attachment.createdAt,
      kind: 'file',
    })

    if (insertError) {
      error.value = insertError.message
      return null
    }

    return attachment
  }

  async function addLinkAttachment(
    cardId: string,
    url: string,
    title?: string,
  ) {
    const card = cards.value.find((item) => item.id === cardId)
    if (!card) return null

    let normalized = url.trim()
    if (!normalized) {
      error.value = 'Informe um link válido.'
      return null
    }
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`
    }

    try {
      // valida URL
      void new URL(normalized)
    } catch {
      error.value = 'Link inválido.'
      return null
    }

    const attachment: Attachment = {
      id: createId('a'),
      name: title?.trim() || normalized,
      url: normalized,
      mimeType: 'text/uri-list',
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
      kind: 'link',
    }

    card.attachments.push(attachment)
    card.updatedAt = new Date().toISOString()
    quietRealtime()

    const { error: insertError } = await supabase.from('attachments').insert({
      id: attachment.id,
      card_id: cardId,
      name: attachment.name,
      storage_path: '',
      url: attachment.url,
      mime_type: attachment.mimeType,
      size_bytes: 0,
      created_at: attachment.createdAt,
      kind: 'link',
    })

    if (insertError) {
      error.value = insertError.message
      return null
    }

    return attachment
  }

  async function removeAttachment(cardId: string, attachmentId: string) {
    const card = cards.value.find((item) => item.id === cardId)
    if (!card) return
    const attachment = card.attachments.find((item) => item.id === attachmentId)
    card.attachments = card.attachments.filter((item) => item.id !== attachmentId)
    quietRealtime()

    if (attachment?.kind !== 'link' && attachment?.url) {
      const { data } = await supabase
        .from('attachments')
        .select('storage_path')
        .eq('id', attachmentId)
        .maybeSingle()
      if (data?.storage_path) {
        await supabase.storage.from('card-attachments').remove([data.storage_path])
      }
    }

    await supabase.from('attachments').delete().eq('id', attachmentId)
  }

  async function inviteMember(email: string, name?: string) {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      error.value = 'Informe um e-mail válido.'
      return null
    }

    const { data, error: fnError } = await supabase.functions.invoke(
      'invite-member',
      {
        body: {
          email: trimmedEmail,
          name: name?.trim() || undefined,
          redirectTo: window.location.origin,
        },
      },
    )

    if (fnError) {
      let fromBody: string | null = null
      if (data && typeof data === 'object' && 'error' in data) {
        fromBody = String((data as { error: unknown }).error)
      } else {
        try {
          const context = (fnError as { context?: Response }).context
          if (context) {
            const payload = await context.clone().json()
            if (payload?.error) fromBody = String(payload.error)
          }
        } catch {
          // ignore parse errors
        }
      }
      error.value = fromBody || fnError.message
      return null
    }

    if (data?.error) {
      error.value = String(data.error)
      return null
    }

    error.value = null
    await loadBoard()
    return data
  }

  /** Hook para Fase 6 (Google Sheets). */
  function onCardCompleted(card: Card) {
    const assignee = getMembersForCard(card)[0]
    console.info('[automation:sheets] Card concluído', {
      title: card.title,
      description: card.description,
      completedAt: new Date().toISOString(),
      assignee: assignee?.name ?? null,
    })
  }

  return {
    title,
    columns,
    cards,
    labels,
    members,
    selectedCardId,
    selectedCard,
    memberFilterId,
    activeMemberFilter,
    sortedColumns,
    cardsByColumn,
    cardsWithDueDate,
    loading,
    ready,
    error,
    init,
    reset,
    loadBoard,
    getLabelsForCard,
    getMembersForCard,
    getMemberById,
    setMemberFilter,
    addMember,
    removeMember,
    openCard,
    closeCard,
    setColumnCards,
    reorderColumns,
    addColumn,
    renameColumn,
    deleteColumn,
    addCard,
    updateCard,
    addComment,
    uploadAttachment,
    addLinkAttachment,
    removeAttachment,
    inviteMember,
  }
})
