import { describe, expect, it } from 'vitest'
import { createCard } from './card'
import { mergeByRecency, parseDeckFile, serializeDeck } from './deckFile'

describe('deck file', () => {
  it('keeps the newer copy when the same card arrives from another device', () => {
    const older = createCard({ term: 'reluctant', sentence: 'She was reluctant.', now: 10, createdAt: 10 })
    older.translation = 'старое'
    older.updatedAt = 10
    const newer = { ...older, translation: 'неохотно', updatedAt: 20, step: 3 }
    const localOnly = createCard({ term: 'nudge', sentence: 'A small nudge.', now: 15, createdAt: 15 })
    const merged = mergeByRecency([older, localOnly], [newer])
    const terms = Object.fromEntries(merged.map((card) => [card.term, card.translation || card.step]))
    expect(terms.reluctant).toBe('неохотно')
    expect(merged.map((card) => card.term).sort()).toEqual(['nudge', 'reluctant'])
  })

  it('reads a deck file back with the schedule intact', () => {
    const card = createCard({ term: 'outcome', sentence: 'The outcome was fair.', now: 5, createdAt: 5 })
    card.step = 4
    card.intervalMinutes = 1440
    const parsed = parseDeckFile(serializeDeck([card], 8))
    expect(parsed.dailyNewLimit).toBe(8)
    expect(parsed.cards[0].step).toBe(4)
    expect(parsed.cards[0].term).toBe('outcome')
  })
})
