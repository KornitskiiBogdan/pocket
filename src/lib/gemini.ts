import type { Settings } from '../types'
import { complete } from './gigachat'
import { DEFAULT_SETTINGS, textModel } from './settings'

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
  items: { term: string; sentence: string; gloss?: string }[],
  settings: Settings,
  onProgress?: (done: number, total: number) => void,
): Promise<Enriched[]> {
  const size = 6
  const chunks: { term: string; sentence: string; gloss?: string }[][] = []
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

const ENRICH_PARALLEL = 1

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
  aim?: { sentence: string; sentenceTranslation: string },
): Promise<SentenceCheck> {
  const task = aim
    ? `The learner sees only this Russian sentence and is trying to say it in English: ${JSON.stringify(aim.sentenceTranslation)}
The English sentence from the card is: ${JSON.stringify(aim.sentence)}
The target expression "${card.term}" should appear. Accept small speech-to-text mistakes. ok is true when the meaning matches and the target is used.`
    : `The learner wrote or said one sentence to practise the target expression.
Target: "${card.term}"${card.translation ? ` (meaning: ${card.translation})` : ''}`
  const prompt = `You are a friendly English tutor for a Russian speaker moving from B1 to B2.
${task}
Learner sentence: ${JSON.stringify(text)}

Return JSON:
- ok: ${aim
    ? 'true when the spoken sentence matches the Russian meaning and uses the target, even with small recognition errors'
    : 'true only if the sentence is grammatical AND uses the target with the right meaning'}
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
  if (!paragraphs.length) throw new Error('GigaChat не прислал текст')
  return { title: clip(raw.title, 120) || request.topic || 'Текст', body: paragraphs.join('\n\n') }
}

const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    paragraphs: { type: 'array', items: { type: 'string' } },
  },
  required: ['paragraphs'],
}

export function textParagraphs(body: string): string[] {
  return body.split(/\n\s*\n|\r?\n/).map((item) => item.trim()).filter(Boolean)
}

/** Russian translation of a reading text, one paragraph per source paragraph. */
export async function translateReading(body: string, settings: Settings): Promise<string> {
  const paragraphs = textParagraphs(body)
  if (!paragraphs.length) throw new Error('Нечего переводить')
  const prompt = `Translate this English text into natural Russian for a learner who sometimes understands every word and still misses the sentence.
Return JSON with "paragraphs": exactly ${paragraphs.length} strings, one Russian paragraph per input paragraph, same order. No titles, no notes, no vocabulary list.

Input paragraphs:
${JSON.stringify(paragraphs)}`
  let parsed: unknown
  try {
    parsed = parseJson(await generate(settings, prompt, TRANSLATION_SCHEMA))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!/schema|mime|json|invalid|unknown/i.test(message)) throw error
    parsed = parseJson(await generate(settings, prompt, null))
  }
  const raw = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const russian = Array.isArray(raw.paragraphs)
    ? raw.paragraphs.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
    : []
  if (!russian.length) throw new Error('GigaChat не прислал перевод')
  return russian.join('\n\n')
}

async function enrichChunk(items: { term: string; sentence: string; gloss?: string }[], settings: Settings): Promise<Enriched[]> {
  const prompt = `You create Russian glosses for an English learner moving from B1 to B2.
Return JSON with a "cards" array of the same length and order as the input.
For each item:
- term: copy the input term exactly
- partOfSpeech: a short Russian label, one of: сущ., гл., прил., нареч., местоим., предл., союз, фраза
- translation: a short natural Russian translation of the term only, not of the whole sentence. If "gloss" is present, it is the English definition and decides the meaning
- sentence: if the input sentence is non-empty, copy it exactly. If it is empty, write ONE clear English sentence at B1–B2 level that contains the term exactly as written. Never copy "gloss" into the sentence
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

async function generate(settings: Settings, prompt: string, schema: object | null, tier: 'smart' | 'fast' = 'smart'): Promise<string> {
  const model = textModel(tier === 'fast' ? settings.fastModel : settings.textModel, tier === 'fast' ? DEFAULT_SETTINGS.fastModel : DEFAULT_SETTINGS.textModel)
  return complete(prompt, settings, model, schema)
}

function parseJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(clean)
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
