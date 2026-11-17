export interface CleanedTranscript {
  detected: boolean
  title: string
  body: string
  vocabulary: string[]
}

const BOILERPLATE = [
  /^6 minute english\b/i,
  /^bbc learning english\b/i,
  /^this is not a word.for.word transcript/i,
  /^note:/i,
  /^episode\s+\d+/i,
  /^\d{6}$/,
  /^©/,
  /^(download|transcript|intermediate level)\b/i,
]

const SPEAKER_LINE = /^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/
const SPEAKER_PREFIX = /^([A-Z][a-z]+(?: [A-Z][a-z]+)?):\s+(.+)$/

/** Turns a pasted 6 Minute English transcript into a clean reading text plus its Vocabulary terms. */
export function cleanTranscript(raw: string): CleanedTranscript {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const vocabAt = lines.findIndex((line) => /^vocabulary:?$/i.test(line))
  const spoken = vocabAt >= 0 ? lines.slice(0, vocabAt) : lines
  const vocabLines = vocabAt >= 0 ? lines.slice(vocabAt + 1) : []

  const counts = new Map<string, number>()
  for (const line of spoken) {
    if (SPEAKER_LINE.test(line)) counts.set(line, (counts.get(line) ?? 0) + 1)
    const prefixed = line.match(SPEAKER_PREFIX)
    if (prefixed) counts.set(prefixed[1], (counts.get(prefixed[1]) ?? 0) + 1)
  }
  const speakers = new Set([...counts].filter(([, count]) => count >= 2).map(([name]) => name))

  const header = lines.slice(0, 4)
  const seriesAt = header.findIndex((line) => /^6 minute english\b/i.test(line))
  const titleCandidate = seriesAt >= 0 ? lines[seriesAt + 1] : ''
  const title = titleCandidate && !speakers.has(titleCandidate) && !isBoilerplate(titleCandidate) && titleCandidate.length <= 80
    ? titleCandidate
    : ''

  const turns: string[] = []
  let current: string[] = []
  const flush = () => {
    if (current.length) turns.push(current.join(' '))
    current = []
  }
  for (const line of spoken) {
    if (line === title || isBoilerplate(line)) continue
    if (speakers.has(line)) {
      flush()
      continue
    }
    const prefixed = line.match(SPEAKER_PREFIX)
    if (prefixed && speakers.has(prefixed[1])) {
      flush()
      current.push(prefixed[2])
      continue
    }
    current.push(line)
  }
  flush()

  const vocabulary = readVocabulary(vocabLines)
  return {
    detected: speakers.size > 0 || vocabulary.length > 0 || seriesAt >= 0,
    title,
    body: turns.join('\n\n'),
    vocabulary,
  }
}

function readVocabulary(lines: string[]): string[] {
  const terms: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (isBoilerplate(line)) continue
    const inline = line.match(/^(.{1,40}?)\s*[–—:-]\s+.+$/)
    if (inline) {
      terms.push(inline[1].trim())
      continue
    }
    const next = lines[index + 1]
    if (line.length <= 40 && !/[.!?]$/.test(line) && next) {
      terms.push(line)
      index += 1
    }
  }
  return [...new Set(terms.map((term) => term.replace(/^\(.*?\)\s*/, '').trim()).filter(Boolean))].slice(0, 20)
}

function isBoilerplate(line: string) {
  return BOILERPLATE.some((pattern) => pattern.test(line))
}
