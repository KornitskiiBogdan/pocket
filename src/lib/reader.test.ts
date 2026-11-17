import { describe, expect, it } from 'vitest'
import { parseArticle } from './parse'
import { findPhrase, inflects, knownIds } from './reader'
import { starterTexts } from './starter'

describe('reader matching', () => {
  it('accepts regular inflections and nothing looser', () => {
    expect(inflects('turned', 'turn')).toBe(true)
    expect(inflects('Chatting', 'chat')).toBe(true)
    expect(inflects('struggling', 'struggle')).toBe(true)
    expect(inflects('tries', 'try')).toBe(true)
    expect(inflects('turnover', 'turn')).toBe(false)
    expect(inflects('lasting', 'last')).toBe(true)
  })

  it('marks every occurrence of a deck phrase', () => {
    const sentences = parseArticle('They gave up early. We never give up.').flat()
    const ids = knownIds(sentences, ['give up'])
    expect(ids.size).toBe(2)
  })

  it('finds every starter vocabulary item in its own text', () => {
    for (const text of starterTexts(0)) {
      const sentences = parseArticle(text.body).flat()
      const missing = text.focus.filter((term) => !findPhrase(sentences, term))
      expect({ title: text.title, missing }).toEqual({ title: text.title, missing: [] })
    }
  })
})
