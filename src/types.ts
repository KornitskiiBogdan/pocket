export type CardStatus = 'new' | 'learning' | 'review'
export type Grade = 'again' | 'hard' | 'good' | 'easy'
export type Direction = 'cloze' | 'reverse' | 'mix'

export interface ReviewMark {
  at: number
  grade: Grade
}

export interface OwnSentence {
  text: string
  corrected: string
  natural: string
  comment: string
  ok: boolean
  at: number
}

export interface Card {
  id: string
  term: string
  partOfSpeech: string
  translation: string
  /** English explanation from a vocabulary list. Empty when the card has none. */
  definition: string
  sentence: string
  sentenceTranslation: string
  source: string
  image: string | null
  imagePrompt: string
  /** Short English keywords for a photo search. */
  imageQuery: string
  /** Author and licence of a found photo; empty for own pictures and Kandinsky drawings. */
  imageCredit: string
  /** The meaning cannot be shown by an ordinary photo, so Kandinsky may draw it. */
  abstract: boolean
  createdAt: number
  updatedAt: number
  step: number
  intervalMinutes: number
  due: number
  reps: number
  lapses: number
  lastReviewed: number | null
  status: CardStatus
  introducedOn: string | null
  history: ReviewMark[]
  mine: OwnSentence[]
}

export interface DayStat {
  seconds: number
  reviews: number
  added: number
}

/** Device id → local date (YYYY-MM-DD) → what that device logged that day. */
export type ActivityLog = Record<string, Record<string, DayStat>>

export type TextOrigin = 'mine' | 'bbc' | 'ai' | 'starter'

export interface ReadingText {
  id: string
  title: string
  body: string
  origin: TextOrigin
  /** Expressions to pre-select in the reader, e.g. the Vocabulary block of a BBC episode. */
  focus: string[]
  createdAt: number
  updatedAt: number
  readAt: number | null
  /** Cached Russian translation of the whole text. Empty until the reader asks for one. */
  translation: string
}

export interface DeckFile {
  version: 1
  app: 'pocket'
  exportedAt: string
  dailyNewLimit?: number
  cards: Card[]
  texts?: ReadingText[]
  activity?: ActivityLog
}

export type ImageSource = 'smart' | 'photo' | 'off'

export interface Settings {
  /** Yandex AI Studio API key. Stays on this device and never goes into the deck file. */
  yandexKey: string
  /** Yandex Cloud folder that owns the model. */
  yandexFolder: string
  /** Public Cloud Function address. The phone calls it, and the function calls Yandex. */
  yandexFunction: string
  /** FusionBrain API key. Drawings for abstract words; never exported. */
  kandinskyKey: string
  /** FusionBrain secret key. Paired with kandinskyKey; never exported. */
  kandinskySecret: string
  textModel: string
  /** Used for card glosses, where speed matters more than reasoning. */
  fastModel: string
  dailyNewLimit: number
  imageSource: ImageSource
  direction: Direction
  dailyGoalMinutes: number
  /** After Again or Hard, say the English phrase. Off for a quiet review. */
  speak: boolean
}

export interface Draft {
  term: string
  sentence: string
  /** English definition from a vocabulary list. Guides the translation; it is not shown as the example sentence. */
  gloss?: string
}
