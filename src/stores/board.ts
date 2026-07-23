import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { mockBoard } from '../data/mockBoard'
import type { Card, Column, Label, Member } from '../types/board'

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export const useBoardStore = defineStore('board', () => {
  const title = ref(mockBoard.title)
  const columns = ref<Column[]>(structuredClone(mockBoard.columns))
  const cards = ref<Card[]>(structuredClone(mockBoard.cards))
  const labels = ref<Label[]>(structuredClone(mockBoard.labels))
  const members = ref<Member[]>(structuredClone(mockBoard.members))
  const selectedCardId = ref<string | null>(null)

  const sortedColumns = computed(() =>
    [...columns.value].sort((a, b) => a.position - b.position),
  )

  const selectedCard = computed(() =>
    cards.value.find((card) => card.id === selectedCardId.value) ?? null,
  )

  const cardsByColumn = computed(() => {
    const map: Record<string, Card[]> = {}
    for (const column of columns.value) {
      map[column.id] = []
    }
    for (const card of [...cards.value].sort((a, b) => a.position - b.position)) {
      if (!map[card.columnId]) map[card.columnId] = []
      map[card.columnId].push(card)
    }
    return map
  })

  const cardsWithDueDate = computed(() =>
    cards.value.filter((card) => card.dueDate !== null),
  )

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

  function setColumnCards(columnId: string, nextCards: Card[]) {
    const column = columns.value.find((item) => item.id === columnId)
    const previousCards = cards.value.filter((card) => card.columnId === columnId)
    const movedIntoDone =
      column?.isDoneColumn &&
      nextCards.some((card) => !previousCards.find((prev) => prev.id === card.id))

    const otherCards = cards.value.filter((card) => card.columnId !== columnId)
    const normalized = nextCards.map((card, index) => ({
      ...card,
      columnId,
      position: index,
      completed: column?.isDoneColumn ? true : card.completed,
      updatedAt: new Date().toISOString(),
    }))

    cards.value = [...otherCards, ...normalized]

    if (movedIntoDone) {
      const newlyDone = normalized.filter(
        (card) => !previousCards.find((prev) => prev.id === card.id),
      )
      for (const card of newlyDone) {
        onCardCompleted(card)
      }
    }
  }

  function reorderColumns(nextColumns: Column[]) {
    columns.value = nextColumns.map((column, index) => ({
      ...column,
      position: index,
    }))
  }

  function addColumn(titleText: string) {
    const column: Column = {
      id: createId('col'),
      title: titleText.trim() || 'Nova lista',
      position: columns.value.length,
    }
    columns.value.push(column)
  }

  function addCard(columnId: string, titleText: string) {
    const columnCards = cards.value.filter((card) => card.columnId === columnId)
    const card: Card = {
      id: createId('card'),
      columnId,
      title: titleText.trim() || 'Novo cartão',
      description: '',
      labelIds: [],
      memberIds: [],
      dueDate: null,
      checklists: [],
      comments: [],
      attachments: [],
      completed: false,
      position: columnCards.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    cards.value.push(card)
    return card
  }

  function updateCard(cardId: string, patch: Partial<Card>) {
    const index = cards.value.findIndex((card) => card.id === cardId)
    if (index === -1) return
    cards.value[index] = {
      ...cards.value[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    }
  }

  function addComment(cardId: string, body: string, authorId = 'm1') {
    const card = cards.value.find((item) => item.id === cardId)
    if (!card || !body.trim()) return
    card.comments.push({
      id: createId('cm'),
      authorId,
      body: body.trim(),
      createdAt: new Date().toISOString(),
    })
    card.updatedAt = new Date().toISOString()
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
    sortedColumns,
    cardsByColumn,
    cardsWithDueDate,
    getLabelsForCard,
    getMembersForCard,
    getMemberById,
    openCard,
    closeCard,
    setColumnCards,
    reorderColumns,
    addColumn,
    addCard,
    updateCard,
    addComment,
  }
})
