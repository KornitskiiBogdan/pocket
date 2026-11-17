import { describe, expect, it } from 'vitest'
import { createCard } from './card'
import { breakdown, forecast, isLeech, LEARNED_MINUTES, misses, recall } from './stats'

const now = new Date(2026, 10, 17, 12, 0).getTime()
const day = 24 * 60 * 60 * 1000

function scheduled(due: number) {
  return { ...createCard({ term: 'x', now }), status: 'review' as const, due }
}

describe('stats', () => {
  it('puts overdue cards into today and skips new and distant ones', () => {
    const cards = [
      scheduled(now - 3 * day),
      scheduled(now + 60_000),
      scheduled(now + 2 * day),
      scheduled(now + 30 * day),
      createCard({ term: 'fresh', now }),
    ]
    expect(forecast(cards, now).map((item) => item.count)).toEqual([2, 0, 1, 0, 0, 0, 0])
  })

  it('counts recall over the last month only', () => {
    const card = createCard({ term: 'x', now })
    card.history = [
      { at: now - 40 * day, grade: 'again' },
      { at: now - day, grade: 'good' },
      { at: now - day, grade: 'again' },
      { at: now, grade: 'easy' },
    ]
    expect(recall([card], now)).toEqual({ total: 3, share: 2 / 3 })
  })

  it('splits the deck into new, in progress and learned', () => {
    const fresh = createCard({ term: 'a', now })
    const learning = { ...createCard({ term: 'b', now }), status: 'review' as const, intervalMinutes: 3 * 24 * 60 }
    const learned = { ...createCard({ term: 'c', now }), status: 'review' as const, intervalMinutes: LEARNED_MINUTES }
    expect(breakdown([fresh, learning, learned])).toEqual({ total: 3, fresh: 1, learning: 1, learned: 1 })
  })

  it('ranks the most forgotten cards first', () => {
    const calm = createCard({ term: 'calm', now })
    const shaky = { ...createCard({ term: 'shaky', now }), lapses: 1, history: [{ at: now, grade: 'again' as const }] }
    const worst = { ...createCard({ term: 'worst', now }), lapses: 3 }
    const result = misses([calm, shaky, worst], now)
    expect(result.worst.map((item) => item.card.term)).toEqual(['worst', 'shaky'])
    expect(result).toMatchObject({ again: 1, lapses: 4 })
  })

  it('flags a card forgotten four times', () => {
    expect(isLeech({ ...createCard({ term: 'x', now }), lapses: 4 })).toBe(true)
    expect(isLeech({ ...createCard({ term: 'x', now }), lapses: 3 })).toBe(false)
  })
})
