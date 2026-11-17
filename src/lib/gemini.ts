import type { Settings } from '../types'
import { shrinkDataUrl } from './image'
import { currentModel, DEFAULT_SETTINGS } from './settings'

export interface Enriched {
  partOfSpeech: string
  translation: string
  sentence: string
  sentenceTranslation: string
  imagePrompt: string
  imageQuery: string
  abstract: boolean
}

const SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          partOfSpeech: { type: 'string' },
          translation: { type: 'string' },
          sentence: { type: 'string' },
          sentenceTranslation: { type: 'string' },
          imagePrompt: { type: 'string' },
          abstract: { type: 'boolean' },
        },
        required: ['term', 'partOfSpeech', 'translation', 'sentence', 'sentenceTranslation', 'imagePrompt', 'abstract'],
      },
    },
  },
  required: ['cards'],
}

export function localImagePrompt(term: string, sentence: string): string {
  return `A simple everyday scene that makes the meaning of "${term}" obvious. Context: ${sentence || term}.`
}

export async function enrich(
  items: { term: string; sentence: string }[],
  settings: Settings,
  onProgress?: (done: number, total: number) => void,
): Promise<Enriched[]> {
  const size = 6
  const chunks: { term: string; sentence: string }[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  const results: Enriched[][] = new Array(chunks.length)
  let done = 0
  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const index = next++
      results[index] = await enrichChunk(chunks[index], settings)
      done += chunks[index].length
      onProgress?.(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(ENRICH_PARALLEL, chunks.length) }, worker))
  return results.flat()
}

const ENRICH_PARALLEL = 3

/** The free tier serves zero image requests a day, so retrying is pointless until billing is enabled. */
export class ImageQuotaError extends Error {}

export async function illustrate(prompt: string, settings: Settings): Promise<string> {
  const text = `Create one illustration for a vocabulary flashcard. ${prompt}
Square composition, one clear scene, soft natural light. No words, no letters, no numbers, no watermark, no caption.`
  const body = {
    model: currentModel(settings.imageModel, DEFAULT_SETTINGS.imageModel),
    input: text,
    store: false,
  }
  let data: Interaction
  try {
    data = await postInteraction(body, settings.apiKey)
  } catch (error) {
    if (isQuotaError(error)) throw new ImageQuotaError('Картинки Gemini недоступны на бесплатном тарифе ключа. Нужна оплата в AI Studio, либо выберите поиск фото в настройках.')
    if (!(error instanceof GeminiError) || !error.busy) throw error
    await new Promise((resolve) => window.setTimeout(resolve, 2500))
    data = await postInteraction(body, settings.apiKey)
  }
  const url = extractImage(data)
  if (!url) throw new Error('Gemini не вернул картинку')
  countDrawing(body.model)
  return shrinkDataUrl(url)
}

const DRAWN_KEY = 'pocket.drawn'

/** USD per 1K image on the paid tier, November 2026. */
const IMAGE_PRICES: Record<string, number> = {
  'gemini-3.1-flash-lite-image': 0.034,
  'gemini-nano-banana-2.1': 0.034,
  'gemini-3.1-flash-image': 0.067,
  'gemini-3-pro-image': 0.134,
}

interface DrawnLog { month: string; count: number; usd: number }

function monthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function drawnThisMonth(): DrawnLog {
  try {
    const log = JSON.parse(localStorage.getItem(DRAWN_KEY) || 'null') as DrawnLog | null
    if (log && log.month === monthKey()) return log
  } catch {
    // fall through to an empty month
  }
  return { month: monthKey(), count: 0, usd: 0 }
}

function countDrawing(model: string) {
  const log = drawnThisMonth()
  const price = IMAGE_PRICES[model] ?? 0.067
  localStorage.setItem(DRAWN_KEY, JSON.stringify({ ...log, count: log.count + 1, usd: log.usd + price }))
}

export interface SentenceCheck {
  ok: boolean
  corrected: string
  natural: string
  comment: string
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    corrected: { type: 'string' },
    natural: { type: 'string' },
    comment: { type: 'string' },
  },
  required: ['ok', 'corrected', 'natural', 'comment'],
}

export async function checkSentence(
  card: { term: string; translation: string },
  text: string,
  settings: Settings,
): Promise<SentenceCheck> {
  const prompt = `You are a friendly English tutor for a Russian speaker moving from B1 to B2.
The learner wrote or said one sentence to practise the target expression.
Target: "${card.term}"${card.translation ? ` (meaning: ${card.translation})` : ''}
Learner sentence: ${JSON.stringify(text)}

Return JSON:
- ok: true only if the sentence is grammatical AND uses the target with the right meaning
- corrected: the learner sentence with the minimum changes needed; copy it unchanged if it is already correct
- natural: how a native speaker would most likely say the same idea, keeping the target expression
- comment: in Russian, at most two short sentences. Name the main mistake and the rule, or say what is good. Do not repeat the corrected sentence.`
  let parsed: unknown
  try {
    parsed = parseJson(await generate(settings, prompt, CHECK_SCHEMA))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!/schema|mime|json|invalid|unknown/i.test(message)) throw error
    parsed = parseJson(await generate(settings, prompt, null))
  }
  const raw = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const corrected = clip(raw.corrected, 400) || text.trim()
  return {
    ok: raw.ok === true,
    corrected,
    natural: clip(raw.natural, 400) || corrected,
    comment: clip(raw.comment, 400),
  }
}

const READING_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    paragraphs: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'paragraphs'],
}

export async function generateReading(
  request: { topic: string; words: string[]; length: 'short' | 'long' },
  settings: Settings,
): Promise<{ title: string; body: string }> {
  const size = request.length === 'short' ? '150-180' : '280-320'
  const weave = request.words.length
    ? `Use each of these expressions naturally at least once, exactly as written or in a natural grammatical form: ${request.words.map((word) => `"${word}"`).join(', ')}. Do not highlight them or explain them.`
    : ''
  const prompt = `Write an original reading text for a Russian speaker learning English, level B1+ moving to B2.
Topic: ${request.topic || 'everyday life'}.
Length: ${size} words, 3-5 short paragraphs. Natural modern English, like a magazine article or a blog post, with a few useful phrasal verbs and collocations a B2 learner should know. Avoid rare idioms and long academic words.
${weave}
Return JSON: "title" — a short English title, "paragraphs" — the paragraphs as separate strings.`
  let parsed: unknown
  try {
    parsed = parseJson(await generate(settings, prompt, READING_SCHEMA))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!/schema|mime|json|invalid|unknown/i.test(message)) throw error
    parsed = parseJson(await generate(settings, prompt, null))
  }
  const raw = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const paragraphs = Array.isArray(raw.paragraphs)
    ? raw.paragraphs.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
    : []
  if (!paragraphs.length) throw new Error('Gemini не прислал текст')
  return { title: clip(raw.title, 120) || request.topic || 'Текст', body: paragraphs.join('\n\n') }
}

export async function pingKey(settings: Settings): Promise<void> {
  await generate(settings, 'Reply with exactly: ok', null)
}

async function enrichChunk(items: { term: string; sentence: string }[], settings: Settings): Promise<Enriched[]> {
  const prompt = `You create Russian glosses for an English learner moving from B1 to B2.
Return JSON with a "cards" array of the same length and order as the input.
For each item:
- term: copy the input term exactly
- partOfSpeech: a short Russian label, one of: сущ., гл., прил., нареч., местоим., предл., союз, фраза
- translation: a short natural Russian translation of the term only, not of the whole sentence
- sentence: if the input sentence is non-empty, copy it exactly. If it is empty, write ONE clear English sentence at B1–B2 level that contains the term exactly as written
- sentenceTranslation: a natural Russian translation of that sentence
- imagePrompt: one English sentence describing a simple concrete scene that makes the term's meaning obvious. No text in the scene.
- abstract: true if a photo found by searching the term itself would NOT show the meaning: feelings, attitudes, qualities, ideas, abstract verbs and linking phrases (e.g. "reluctant", "outcome", "tend to", "get round to", "nevertheless"). false for things, people, places and visible actions (e.g. "bridesmaid", "plastic bag", "doze off").

Input:
${JSON.stringify(items)}`
  let parsed: unknown
  try {
    parsed = parseJson(await generate(settings, prompt, SCHEMA, 'fast'))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!/schema|mime|json|invalid|unknown/i.test(message)) throw error
    parsed = parseJson(await generate(settings, prompt, null, 'fast'))
  }
  const cards = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { cards?: unknown }).cards)
      ? (parsed as { cards: unknown[] }).cards
      : []
  return items.map((item, index) => blend(item, cards[index]))
}

function blend(item: { term: string; sentence: string }, raw: unknown): Enriched {
  const ai = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const sentence = item.sentence.trim() || clip(ai.sentence, 400)
  return {
    partOfSpeech: clip(ai.partOfSpeech, 24),
    translation: clip(ai.translation, 200),
    sentence,
    sentenceTranslation: clip(ai.sentenceTranslation, 400),
    imagePrompt: clip(ai.imagePrompt, 500) || localImagePrompt(item.term, sentence),
    imageQuery: item.term,
    abstract: ai.abstract === true,
  }
}

const TEXT_FALLBACKS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite']

async function generate(settings: Settings, prompt: string, schema: object | null, tier: 'smart' | 'fast' = 'smart'): Promise<string> {
  const body: Record<string, unknown> = { input: prompt, store: false }
  if (schema) {
    body.response_format = {
      type: 'text',
      mime_type: 'application/json',
      schema,
    }
  }
  const smart = currentModel(settings.textModel, DEFAULT_SETTINGS.textModel)
  const fast = currentModel(settings.fastModel, DEFAULT_SETTINGS.fastModel)
  const chain = tier === 'fast' ? [fast, 'gemini-3.6-flash', smart] : [smart, ...TEXT_FALLBACKS]
  const models = chain.filter((model, index) => chain.indexOf(model) === index)
  let lastError: unknown = null
  for (const model of models) {
    try {
      const text = textOf(await postInteraction({ ...body, model }, settings.apiKey))
      if (!text) throw new Error('Gemini вернул пустой ответ')
      return text
    } catch (error) {
      lastError = error
      if (!(error instanceof GeminiError) || !(error.busy || error.missingModel)) throw error
    }
  }
  throw lastError instanceof GeminiError
    ? new Error('Gemini сейчас перегружен. Попробуйте через минуту.')
    : lastError
}

class GeminiError extends Error {
  constructor(message: string, readonly status: number, readonly busy: boolean, readonly missingModel = false) {
    super(message)
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof GeminiError && error.status === 429 && /limit: 0|per day|free tier|quota/i.test(error.message)
}

async function postInteraction(body: unknown, apiKey: string): Promise<Interaction> {
  if (!apiKey.trim()) throw new Error('Нет ключа Gemini')
  let response: Response
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim(),
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Нет связи с Gemini. Проверьте интернет.')
  }
  const data = (await response.json().catch(() => ({}))) as Interaction
  if (!response.ok) {
    const busy = response.status === 429 || response.status === 500 || response.status === 503
    const message = data.error?.message || `Ошибка Gemini (${response.status})`
    const missingModel = response.status === 404 || (response.status === 400 && /model/i.test(message) && /not (found|available|supported)/i.test(message))
    throw new GeminiError(message, response.status, busy, missingModel)
  }
  return data
}

function textOf(data: Interaction): string {
  if (data.output_text?.trim()) return data.output_text.trim()
  return steps(data)
    .flatMap((step) => step.content ?? [])
    .map((part) => part.text || '')
    .join('')
    .trim()
}

function extractImage(data: Interaction): string | null {
  const direct = data.output_image
  if (direct?.data) return dataUrl(direct.mime_type, direct.data)
  for (const part of steps(data).flatMap((step) => step.content ?? [])) {
    if (part.type === 'image' && part.data) return dataUrl(part.mime_type, part.data)
  }
  return null
}

function steps(data: Interaction) {
  return (data.steps ?? []).filter((step) => step.type === 'model_output' || !step.type)
}

function dataUrl(mime: string | undefined, data: string) {
  return `data:${mime || 'image/png'};base64,${data}`
}

function parseJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(clean)
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

interface Interaction {
  error?: { message?: string }
  output_text?: string
  output_image?: { data?: string; mime_type?: string }
  steps?: {
    type?: string
    content?: {
      type?: string
      text?: string
      data?: string
      mime_type?: string
    }[]
  }[]
}
