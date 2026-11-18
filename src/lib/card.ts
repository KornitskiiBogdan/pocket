import type { Card, Grade } from '../types'
import type { Enriched } from './gemini'
import { applyGrade, freshSrs } from './srs'

export function createCard(input: {
  term: string
  sentence?: string
  source?: string
  partOfSpeech?: string
  translation?: string
  definition?: string
  sentenceTranslation?: string
  imagePrompt?: string
  createdAt?: number
  now?: number
}): Card {
  const now = input.now ?? input.createdAt ?? Date.now()
  return {
    id: crypto.randomUUID(),
    term: input.term.trim(),
    partOfSpeech: input.partOfSpeech?.trim() ?? '',
    translation: input.translation?.trim() ?? '',
    definition: input.definition?.trim() ?? '',
    sentence: input.sentence?.trim() ?? '',
    sentenceTranslation: input.sentenceTranslation?.trim() ?? '',
    source: input.source?.trim() ?? '',
    image: null,
    imagePrompt: input.imagePrompt?.trim() ?? '',
    imageQuery: '',
    imageCredit: '',
    abstract: false,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    ...freshSrs(now),
    history: [],
    mine: [],
  }
}

export function gradeCard(card: Card, grade: Grade, now: number, today: string): Card {
  return {
    ...card,
    ...applyGrade(card, grade, now, today),
    history: [...card.history, { at: now, grade }].slice(-HISTORY_LIMIT),
    updatedAt: now,
  }
}

const HISTORY_LIMIT = 40
export const MINE_LIMIT = 5

export function resetProgress(card: Card, now: number): Card {
  return { ...card, ...freshSrs(now), introducedOn: card.introducedOn, updatedAt: now }
}

/** Fill an empty English explanation. A gloss never replaces one already on the card. */
export function keepDefinition(card: Card, gloss: string | undefined, now = Date.now()): Card {
  const next = gloss?.trim() ?? ''
  if (!next || card.definition) return card
  return { ...card, definition: next, updatedAt: now }
}

/** Copy a Gemini gloss onto a card. The English explanation stays as it was saved. */
export function applyEnrich(card: Card, enriched: Enriched | undefined): Card {
  if (!enriched) return card
  return {
    ...card,
    partOfSpeech: enriched.partOfSpeech || card.partOfSpeech,
    translation: enriched.translation || card.translation,
    sentence: enriched.sentence || card.sentence,
    sentenceTranslation: enriched.sentenceTranslation || card.sentenceTranslation,
    imagePrompt: enriched.imagePrompt || card.imagePrompt,
    imageQuery: enriched.imageQuery || card.imageQuery,
    definition: card.definition,
    abstract: enriched.abstract,
    updatedAt: Date.now(),
  }
}
