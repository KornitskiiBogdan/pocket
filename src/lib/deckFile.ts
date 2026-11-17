import type { ActivityLog, Card, CardStatus, DeckFile, Grade, OwnSentence, ReadingText, ReviewMark, TextOrigin } from '../types'
import { normalizeActivity } from './activity'

const STATUSES = new Set<CardStatus>(['new', 'learning', 'review'])
const ORIGINS = new Set<TextOrigin>(['mine', 'bbc', 'ai', 'starter'])
const GRADES = new Set<Grade>(['again', 'hard', 'good', 'easy'])

export function serializeDeck(
  cards: Card[],
  dailyNewLimit: number,
  extras: { texts?: ReadingText[]; activity?: ActivityLog } = {},
): DeckFile {
  return {
    version: 1,
    app: 'pocket',
    exportedAt: new Date().toISOString(),
    dailyNewLimit,
    cards,
    texts: extras.texts ?? [],
    activity: extras.activity ?? {},
  }
}

export function mergeByRecency<T extends { id: string; updatedAt: number }>(local: T[], incoming: T[]): T[] {
  const map = new Map(local.map((item) => [item.id, item]))
  for (const item of incoming) {
    const previous = map.get(item.id)
    if (!previous || item.updatedAt >= previous.updatedAt) map.set(item.id, item)
  }
  return [...map.values()]
}

export function parseDeckFile(raw: unknown): {
  cards: Card[]
  dailyNewLimit?: number
  texts: ReadingText[]
  activity: ActivityLog
} {
  if (!raw || typeof raw !== 'object') throw new Error('Файл не похож на колоду')
  const data = raw as Record<string, unknown>
  if (!Array.isArray(data.cards)) throw new Error('В файле нет списка карточек')
  const byId = new Map<string, Card>()
  for (const item of data.cards) {
    const card = normalizeCard(item)
    if (card) byId.set(card.id, card)
  }
  const limit = data.dailyNewLimit
  const texts = Array.isArray(data.texts)
    ? data.texts.map(normalizeText).filter((text): text is ReadingText => text !== null)
    : []
  return {
    cards: [...byId.values()],
    dailyNewLimit: typeof limit === 'number' && limit >= 1 ? Math.min(40, Math.round(limit)) : undefined,
    texts,
    activity: normalizeActivity(data.activity),
  }
}

export function normalizeText(item: unknown): ReadingText | null {
  if (!item || typeof item !== 'object') return null
  const raw = item as Record<string, unknown>
  const body = stringField(raw.body)
  if (!body) return null
  const now = Date.now()
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    title: stringField(raw.title) || body.split(/\s+/).slice(0, 6).join(' '),
    body,
    origin: ORIGINS.has(raw.origin as TextOrigin) ? (raw.origin as TextOrigin) : 'mine',
    focus: Array.isArray(raw.focus)
      ? raw.focus.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()).slice(0, 30)
      : [],
    createdAt: numberField(raw.createdAt, now),
    updatedAt: numberField(raw.updatedAt, now),
    readAt: typeof raw.readAt === 'number' ? raw.readAt : null,
  }
}

export function normalizeCard(item: unknown): Card | null {
  if (!item || typeof item !== 'object') return null
  const raw = item as Record<string, unknown>
  if (typeof raw.term !== 'string' || !raw.term.trim()) return null
  const now = Date.now()
  const status = STATUSES.has(raw.status as CardStatus) ? (raw.status as CardStatus) : 'new'
  const image = typeof raw.image === 'string' && raw.image.startsWith('data:image') && raw.image.length < 1_500_000
    ? raw.image
    : null
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    term: raw.term.trim(),
    partOfSpeech: stringField(raw.partOfSpeech),
    translation: stringField(raw.translation),
    definition: stringField(raw.definition),
    sentence: stringField(raw.sentence),
    sentenceTranslation: stringField(raw.sentenceTranslation),
    source: stringField(raw.source),
    image,
    imagePrompt: stringField(raw.imagePrompt),
    imageQuery: stringField(raw.imageQuery),
    imageCredit: image ? stringField(raw.imageCredit) : '',
    abstract: raw.abstract === true,
    createdAt: numberField(raw.createdAt, now),
    updatedAt: numberField(raw.updatedAt, now),
    step: Math.max(0, Math.round(numberField(raw.step, 0))),
    intervalMinutes: Math.max(0, numberField(raw.intervalMinutes, 0)),
    due: numberField(raw.due, now),
    reps: Math.max(0, Math.round(numberField(raw.reps, 0))),
    lapses: Math.max(0, Math.round(numberField(raw.lapses, 0))),
    lastReviewed: typeof raw.lastReviewed === 'number' ? raw.lastReviewed : null,
    status,
    introducedOn: typeof raw.introducedOn === 'string' ? raw.introducedOn : null,
    history: listField(raw.history, readMark).slice(-40),
    mine: listField(raw.mine, readOwn).slice(-5),
  }
}

function listField<T>(value: unknown, read: (item: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (item && typeof item === 'object' ? read(item as Record<string, unknown>) : null))
    .filter((item): item is T => item !== null)
}

function readMark(item: Record<string, unknown>): ReviewMark | null {
  if (typeof item.at !== 'number' || !GRADES.has(item.grade as Grade)) return null
  return { at: item.at, grade: item.grade as Grade }
}

function readOwn(item: Record<string, unknown>): OwnSentence | null {
  const text = stringField(item.text)
  if (!text) return null
  return {
    text,
    corrected: stringField(item.corrected),
    natural: stringField(item.natural),
    comment: stringField(item.comment),
    ok: item.ok === true,
    at: numberField(item.at, Date.now()),
  }
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
