import type { Draft } from '../types'

export function parseLines(text: string): { drafts: Draft[]; skipped: string[] } {
  const drafts: Draft[] = []
  const skipped: string[] = []
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]+|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const next = lines[index + 1]
    if (next && isHeadword(line) && isGloss(next)) {
      drafts.push({ term: line, sentence: '', gloss: next })
      index += 1
      continue
    }
    const separated = splitEntry(line)
    if (separated) {
      drafts.push(separated)
      continue
    }
    if (line.length > 60) {
      skipped.push(line)
      continue
    }
    drafts.push({ term: line, sentence: '' })
  }
  return { drafts, skipped }
}

function isHeadword(line: string): boolean {
  return line.length <= 50 && line.split(/\s+/).length <= 6 && !/[.!?]$/.test(line) && !splitEntry(line)
}

function isGloss(line: string): boolean {
  return !splitEntry(line) && (line.includes(' ') || line.length > 20)
}

function splitEntry(line: string): Draft | null {
  const tabs = line.split('\t').map((part) => part.trim()).filter(Boolean)
  if (tabs.length >= 2) return { term: tabs[0], sentence: tabs.slice(1).join(' ') }
  const separated =
    line.match(/^(.{1,80}?)\s*(?:—|–|\|)\s*(.+)$/) ||
    line.match(/^(.{1,80}?)\s+-\s+(.+)$/) ||
    line.match(/^(.{1,40}?):\s+(.+)$/)
  if (!separated) return null
  const term = separated[1].trim()
  const sentence = separated[2].trim()
  return term && sentence ? { term, sentence } : null
}

export interface PassageWord {
  id: string
  sentenceIndex: number
  wordIndex: number
  start: number
  end: number
  value: string
}

export interface PassageSentence {
  text: string
  words: PassageWord[]
}

const WORD = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g

export function parseArticle(body: string): PassageSentence[][] {
  return body
    .split(/\n\s*\n|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => parsePassage(paragraph, `p${index}-`))
}

export function parsePassage(text: string, prefix = ''): PassageSentence[] {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return []
  const parts = trimmed.split(/(?<=[.!?])\s+/)
  return parts.map((sentence, sentenceIndex) => {
    const words: PassageWord[] = []
    const re = new RegExp(WORD)
    let match: RegExpExecArray | null
    let wordIndex = 0
    while ((match = re.exec(sentence))) {
      words.push({
        id: `${prefix}${sentenceIndex}:${wordIndex}`,
        sentenceIndex,
        wordIndex,
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
      })
      wordIndex += 1
    }
    return { text: sentence, words }
  })
}

export function draftsFromSelection(sentences: PassageSentence[], selected: ReadonlySet<string>): Draft[] {
  const drafts: Draft[] = []
  for (const sentence of sentences) {
    const picked = sentence.words.filter((word) => selected.has(word.id))
    let run: PassageWord[] = []
    const flush = () => {
      if (!run.length) return
      drafts.push({
        term: sentence.text.slice(run[0].start, run[run.length - 1].end),
        sentence: sentence.text,
      })
      run = []
    }
    for (const word of picked) {
      if (!run.length) {
        run = [word]
        continue
      }
      const prev = run[run.length - 1]
      const gap = sentence.text.slice(prev.end, word.start)
      if (word.wordIndex === prev.wordIndex + 1 && !/[A-Za-z]/.test(gap)) run.push(word)
      else {
        flush()
        run = [word]
      }
    }
    flush()
  }
  return drafts
}
