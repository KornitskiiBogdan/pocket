import type { Card } from '../types'

export interface QueueSummary {
  session: Card[]
  dueCount: number
  newCount: number
  unseenLeft: number
  nextDue: number | null
  used: number
}

export function summarize(cards: Card[], today: string, limit: number, now: number): QueueSummary {
  const due = cards
    .filter((card) => card.status !== 'new' && card.due <= now)
    .sort((a, b) => a.due - b.due || a.createdAt - b.createdAt)
  const later = cards.filter((card) => card.status !== 'new' && card.due > now)
  const relearning = cards
    .filter((card) => card.status === 'new' && card.introducedOn)
    .sort((a, b) => a.createdAt - b.createdAt)
  const unseen = cards
    .filter((card) => card.status === 'new' && !card.introducedOn)
    .sort((a, b) => a.createdAt - b.createdAt)
  const used = cards.filter((card) => card.introducedOn === today).length
  const slots = Math.max(0, limit - used)
  const take = unseen.slice(0, slots)
  const nextDue = later.reduce<number | null>((min, card) => (min === null || card.due < min ? card.due : min), null)
  return {
    session: [...due, ...relearning, ...take],
    dueCount: due.length,
    newCount: relearning.length + take.length,
    unseenLeft: unseen.length - take.length,
    nextDue,
    used,
  }
}
