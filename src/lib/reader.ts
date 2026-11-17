import type { PassageSentence } from './parse'

const SUFFIX = /^[a-z]?(?:s|es|ed|d|ing)$/

/** Loose match for regular inflections: turn → turned, chat → chatting, struggle → struggling, try → tries. */
export function inflects(word: string, base: string): boolean {
  const w = word.toLowerCase().replace(/’/g, "'")
  const b = base.toLowerCase().replace(/’/g, "'")
  if (w === b) return true
  if (b.length < 3) return false
  if (w.startsWith(b) && SUFFIX.test(w.slice(b.length))) return true
  if (b.endsWith('e') && w.startsWith(b.slice(0, -1)) && /^(?:ing|ed)$/.test(w.slice(b.length - 1))) return true
  if (b.endsWith('y') && w.startsWith(b.slice(0, -1)) && /^(?:ies|ied)$/.test(w.slice(b.length - 1))) return true
  return false
}

function phraseWords(phrase: string): string[] {
  return phrase.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) ?? []
}

function matchesAt(sentence: PassageSentence, start: number, parts: string[]): boolean {
  if (start + parts.length > sentence.words.length) return false
  return parts.every((part, offset) => inflects(sentence.words[start + offset].value, part))
}

export function findPhrase(sentences: PassageSentence[], phrase: string): string[] | null {
  const parts = phraseWords(phrase)
  if (!parts.length) return null
  for (const sentence of sentences) {
    for (let index = 0; index < sentence.words.length; index++) {
      if (matchesAt(sentence, index, parts)) {
        return sentence.words.slice(index, index + parts.length).map((word) => word.id)
      }
    }
  }
  return null
}

export function knownIds(sentences: PassageSentence[], terms: string[]): Set<string> {
  const out = new Set<string>()
  const phrases = terms.map(phraseWords).filter((parts) => parts.length > 0)
  for (const sentence of sentences) {
    for (let index = 0; index < sentence.words.length; index++) {
      for (const parts of phrases) {
        if (!matchesAt(sentence, index, parts)) continue
        for (let offset = 0; offset < parts.length; offset++) out.add(sentence.words[index + offset].id)
      }
    }
  }
  return out
}

export function wordCount(body: string): number {
  return body.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0
}
