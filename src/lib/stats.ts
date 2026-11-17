import type { Card } from '../types'

export const LEECH_LAPSES = 4
/** Anki calls a card "mature" from a 21-day interval; that is what counts as learned here. */
export const LEARNED_MINUTES = 21 * 24 * 60
const DAY = 24 * 60 * 60 * 1000

export function breakdown(cards: Card[]) {
  let fresh = 0
  let learning = 0
  let learned = 0
  for (const card of cards) {
    if (card.status === 'new') fresh += 1
    else if (card.intervalMinutes >= LEARNED_MINUTES) learned += 1
    else learning += 1
  }
  return { total: cards.length, fresh, learning, learned }
}

export function misses(cards: Card[], now: number, windowDays = 30) {
  const since = now - windowDays * DAY
  let again = 0
  let lapses = 0
  const ranked: { card: Card; misses: number }[] = []
  for (const card of cards) {
    lapses += card.lapses
    const recent = card.history.filter((mark) => mark.grade === 'again' && mark.at >= since).length
    again += recent
    const score = card.lapses * 2 + recent
    const logged = card.history.filter((mark) => mark.grade === 'again').length
    if (score > 0) ranked.push({ card, misses: Math.max(logged, card.lapses) })
  }
  ranked.sort((a, b) => b.misses - a.misses || b.card.lapses - a.card.lapses)
  return { again, lapses, worst: ranked.slice(0, 5) }
}

export function isLeech(card: Card): boolean {
  return card.lapses >= LEECH_LAPSES
}

export interface ForecastDay {
  start: number
  count: number
}

export function forecast(cards: Card[], now: number, days = 7): ForecastDay[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const out = Array.from({ length: days }, (_, index) => {
    const start = new Date(today)
    start.setDate(today.getDate() + index)
    return { start: start.getTime(), count: 0 }
  })
  const lastEnd = new Date(today)
  lastEnd.setDate(today.getDate() + days)
  for (const card of cards) {
    if (card.status === 'new' || card.due >= lastEnd.getTime()) continue
    let index = out.length - 1
    while (index > 0 && card.due < out[index].start) index -= 1
    out[index].count += 1
  }
  return out
}

export function recall(cards: Card[], now: number, windowDays = 30): { total: number; share: number | null } {
  const since = now - windowDays * DAY
  let total = 0
  let remembered = 0
  for (const card of cards) {
    for (const mark of card.history) {
      if (mark.at < since) continue
      total += 1
      if (mark.grade !== 'again') remembered += 1
    }
  }
  return { total, share: total ? remembered / total : null }
}
