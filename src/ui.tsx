import { useEffect, useState } from 'react'
import type { Card, Direction } from './types'
import { clozeSentence } from './lib/cloze'

export function CardArt({ card, alt, showLetter = false }: { card: Card; alt: string; showLetter?: boolean }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [card.id, card.image])
  const letter = (card.term.trim()[0] || '?').toUpperCase()
  const hasImage = Boolean(card.image) && !broken
  return (
    <div className={hasImage ? 'shot' : 'shot shot-empty'}>
      {hasImage ? (
        <img src={card.image!} alt={alt} draggable={false} onError={() => setBroken(true)} />
      ) : (
        showLetter && <span className="shot-fallback" aria-hidden="true">{letter}</span>
      )}
    </div>
  )
}

export function ClozeText({ sentence, term }: { sentence: string; term: string }) {
  const { cloze, found } = clozeSentence(sentence, term)
  if (!found) return <p className="sentence">{sentence || term}</p>
  const parts = cloze.split('_____')
  return (
    <p className="sentence">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && <span className="blank" aria-label="пропуск" />}
        </span>
      ))}
    </p>
  )
}

export function MarkTerm({ sentence, term }: { sentence: string; term: string }) {
  const needle = term.trim()
  const index = sentence.toLowerCase().indexOf(needle.toLowerCase())
  if (!needle || index < 0) return <>{sentence}</>
  const end = index + needle.length
  return (
    <>
      {sentence.slice(0, index)}
      <mark>{sentence.slice(index, end)}</mark>
      {sentence.slice(end)}
    </>
  )
}

export function faceOf(card: Card, direction: Direction): { mode: 'cloze' | 'produce' | 'term'; prompt: string } {
  const reverse = card.sentenceTranslation || card.translation
  const wantsReverse = direction === 'reverse' || (direction === 'mix' && card.reps % 2 === 1)
  if (wantsReverse && reverse) return { mode: 'produce', prompt: reverse }
  if (!card.sentence.trim()) return { mode: 'term', prompt: card.term }
  const { found } = clozeSentence(card.sentence, card.term)
  if (found) return { mode: 'cloze', prompt: card.sentence }
  if (card.sentenceTranslation) return { mode: 'produce', prompt: card.sentenceTranslation }
  if (card.translation) return { mode: 'produce', prompt: card.translation }
  return { mode: 'cloze', prompt: card.sentence }
}
