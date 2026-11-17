import { describe, expect, it } from 'vitest'
import { draftsFromSelection, parseArticle, parseLines, parsePassage } from './parse'

describe('parseLines', () => {
  it('reads dashes, hyphens, colons and bare words', () => {
    const { drafts, skipped } = parseLines(`
      reluctant — She was reluctant to leave.
      give up - I will not give up.
      outcome: The outcome surprised us.
      1. nudge
      This line is a whole paragraph without a separator so it should be skipped entirely.
    `)
    expect(skipped).toHaveLength(1)
    expect(drafts).toEqual([
      { term: 'reluctant', sentence: 'She was reluctant to leave.' },
      { term: 'give up', sentence: 'I will not give up.' },
      { term: 'outcome', sentence: 'The outcome surprised us.' },
      { term: 'nudge', sentence: '' },
    ])
  })
})

describe('article', () => {
  it('keeps word ids unique across paragraphs', () => {
    const article = parseArticle('First word here.\n\nFirst word again.')
    const ids = article.flat().flatMap((sentence) => sentence.words.map((word) => word.id))
    expect(new Set(ids).size).toBe(ids.length)
    const second = article[1][0].words[0]
    expect(draftsFromSelection(article[1], new Set([second.id]))).toEqual([{ term: 'First', sentence: 'First word again.' }])
  })
})

describe('passage selection', () => {
  it('joins neighbouring words and keeps separate taps apart', () => {
    const passage = parsePassage('I will not give up. She was reluctant to leave.')
    const give = passage[0].words.filter((word) => word.value === 'give' || word.value === 'up').map((word) => word.id)
    const reluctant = passage[1].words.find((word) => word.value === 'reluctant')!
    const drafts = draftsFromSelection(passage, new Set([...give, reluctant.id]))
    expect(drafts).toEqual([
      { term: 'give up', sentence: 'I will not give up.' },
      { term: 'reluctant', sentence: 'She was reluctant to leave.' },
    ])
  })
})
