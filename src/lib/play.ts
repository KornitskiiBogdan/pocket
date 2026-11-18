import type { Card } from '../types'

/** What the learner should say after Again or Hard. Null when the card has no Russian prompt. */
export function speakPrompt(card: Pick<Card, 'term' | 'translation' | 'sentence' | 'sentenceTranslation'>): { russian: string; kind: 'sentence' | 'word' } | null {
  if (card.sentence.trim() && card.sentenceTranslation.trim()) {
    return { russian: card.sentenceTranslation.trim(), kind: 'sentence' }
  }
  if (card.term.trim() && card.translation.trim()) {
    return { russian: card.translation.trim(), kind: 'word' }
  }
  return null
}

export function matchesTerm(input: string, term: string): boolean {
  const answer = fold(input)
  const expected = fold(term)
  return answer !== '' && answer === expected
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fisher–Yates. When the previous card would land first, it is swapped aside. */
export function orderIds(ids: string[], random: () => number = Math.random, avoidId?: string): string[] {
  const next = [...ids]
  for (let index = next.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    const current = next[index]
    next[index] = next[swap]
    next[swap] = current
  }
  if (avoidId && next.length > 1 && next[0] === avoidId) {
    const swap = 1 + Math.floor(random() * (next.length - 1))
    const current = next[0]
    next[0] = next[swap]
    next[swap] = current
  }
  return next
}
