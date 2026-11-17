export function clozeSentence(sentence: string, term: string): { cloze: string; found: boolean } {
  const source = sentence.trim()
  const needle = term.trim()
  if (!needle) return { cloze: source, found: false }
  const index = source.toLowerCase().indexOf(needle.toLowerCase())
  if (index < 0) return { cloze: source, found: false }
  return {
    cloze: `${source.slice(0, index)}_____${source.slice(index + needle.length)}`.replace(/\s{2,}/g, ' ').trim(),
    found: true,
  }
}
