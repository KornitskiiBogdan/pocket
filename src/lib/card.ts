import type { Card, Grade } from '../types'
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
