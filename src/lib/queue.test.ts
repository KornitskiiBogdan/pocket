import { describe, expect, it } from 'vitest'
import { createCard, gradeCard } from './card'
import { summarize } from './queue'

const today = '2026-11-16'
const now = Date.parse('2026-11-16T12:00:00')

function unseen(term: string, createdAt: number) {
  return createCard({ term, sentence: `${term} lives here.`, createdAt, now: createdAt })
}

describe('daily queue', () => {
  it('opens at most the daily number of new cards', () => {
    const cards = Array.from({ length: 10 }, (_, index) => unseen(`word${index}`, now + index))
    const summary = summarize(cards, today, 8, now + 10_000)
    expect(summary.newCount).toBe(8)
    expect(summary.unseenLeft).toBe(2)
    expect(summary.session.map((card) => card.term)).toEqual(Array.from({ length: 8 }, (_, index) => `word${index}`))
  })

  it('puts due cards first and does not let a reset card eat an extra slot', () => {
    const fresh = Array.from({ length: 3 }, (_, index) => unseen(`new${index}`, now + index))
    const learned = gradeCard(unseen('old', now - 10), 'good', now - 60_000, today)
    const due = { ...learned, due: now - 1000 }
    const reset = {
      ...unseen('reset', now - 5),
      introducedOn: '2026-11-15',
      status: 'new' as const,
    }
    const summary = summarize([due, reset, ...fresh], today, 8, now)
    expect(summary.session.map((card) => card.term)).toEqual(['old', 'reset', 'new0', 'new1', 'new2'])
    expect(summary.used).toBe(1)
  })
})
