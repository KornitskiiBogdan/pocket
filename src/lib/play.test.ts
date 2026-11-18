import { describe, expect, it } from 'vitest'
import { matchesTerm, orderIds, speakPrompt } from './play'

describe('quiet speaking round', () => {
  it('asks for the sentence when the card has a Russian sentence', () => {
    expect(speakPrompt({
      term: 'reluctant',
      translation: 'неохотно',
      sentence: 'She was reluctant to leave.',
      sentenceTranslation: 'Ей не хотелось уходить.',
    })).toEqual({ russian: 'Ей не хотелось уходить.', kind: 'sentence' })
  })

  it('asks for the word when there is only a Russian gloss', () => {
    expect(speakPrompt({
      term: 'outcome',
      translation: 'результат',
      sentence: '',
      sentenceTranslation: '',
    })).toEqual({ russian: 'результат', kind: 'word' })
  })

  it('skips a card with nothing to say from', () => {
    expect(speakPrompt({ term: 'octopus', translation: '', sentence: '', sentenceTranslation: '' })).toBeNull()
  })
})

describe('word typing', () => {
  it('accepts the English word ignoring case and extra marks', () => {
    expect(matchesTerm('  Give Up! ', 'give up')).toBe(true)
    expect(matchesTerm('octopus', 'threat')).toBe(false)
    expect(matchesTerm('   ', 'octopus')).toBe(false)
  })

  it('does not open the next round on the same word', () => {
    const ordered = orderIds(['a', 'b', 'c'], () => 0, 'a')
    expect(ordered).toHaveLength(3)
    expect(new Set(ordered)).toEqual(new Set(['a', 'b', 'c']))
    expect(ordered[0]).not.toBe('a')
  })
})
