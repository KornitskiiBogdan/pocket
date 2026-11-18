import { describe, expect, it } from 'vitest'
import { applyEnrich, createCard, keepDefinition } from './card'
import type { Enriched } from './gemini'

const blank: Enriched = {
  partOfSpeech: '',
  translation: '',
  sentence: '',
  sentenceTranslation: '',
  imagePrompt: '',
  imageQuery: '',
  abstract: false,
}

describe('English explanation', () => {
  it('stays on the card when Gemini returns nothing', () => {
    const card = createCard({
      term: 'octopus',
      definition: 'sea animal with eight tentacles',
      now: 1,
    })
    const next = applyEnrich(card, blank)
    expect(next.definition).toBe('sea animal with eight tentacles')
    expect(next.translation).toBe('')
  })

  it('stays on the card when the request fails before a gloss arrives', () => {
    const card = createCard({ term: 'threat', definition: 'danger to someting', now: 1 })
    expect(applyEnrich(card, undefined).definition).toBe('danger to someting')
  })

  it('does not replace an explanation already on the card', () => {
    const card = createCard({ term: 'octopus', definition: 'sea animal with eight tentacles', now: 1 })
    expect(keepDefinition(card, 'a different gloss', 5)).toBe(card)
  })

  it('fills an empty explanation and leaves a filled one', () => {
    const card = createCard({ term: 'threat', now: 1 })
    const filled = keepDefinition(card, 'danger to someting', 5)
    expect(filled.definition).toBe('danger to someting')
    expect(keepDefinition(filled, '', 9).definition).toBe('danger to someting')
  })
})
