import { useEffect, useMemo, useState } from 'react'
import { useDeck } from '../context'
import { matchesTerm, orderIds } from '../lib/play'
import { CardArt } from '../ui'

export function Play() {
  const { cards } = useDeck()
  const pool = useMemo(
    () => cards.filter((card) => card.term.trim() && card.translation.trim()),
    [cards],
  )
  const [order, setOrder] = useState<string[]>(() => orderIds(pool.map((card) => card.id)))
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [missed, setMissed] = useState(false)
  const [tally, setTally] = useState({ hit: 0, miss: 0 })

  useEffect(() => {
    setOrder(pool.length ? orderIds(pool.map((card) => card.id)) : [])
    setIndex(0)
    setAnswer('')
    setMissed(false)
  }, [pool])

  const card = pool.find((item) => item.id === order[index])

  const advance = (fromId: string) => {
    const ids = pool.map((item) => item.id)
    if (!ids.length) return
    const nextIndex = index + 1
    if (nextIndex < order.length && ids.includes(order[nextIndex])) {
      setIndex(nextIndex)
    } else {
      setOrder(orderIds(ids, Math.random, fromId))
      setIndex(0)
    }
    setAnswer('')
    setMissed(false)
  }

  const submit = () => {
    if (!card) return
    if (missed) {
      advance(card.id)
      return
    }
    if (!answer.trim()) return
    if (matchesTerm(answer, card.term)) {
      setTally((item) => ({ ...item, hit: item.hit + 1 }))
      advance(card.id)
      return
    }
    setTally((item) => ({ ...item, miss: item.miss + 1 }))
    setMissed(true)
  }

  if (!pool.length) {
    return (
      <section className="panel">
        <p className="eyebrow">Слова</p>
        <h1>Пока нечего угадывать</h1>
        <p className="lead">Нужна карточка с русским переводом. Расписание повторов этот экран не меняет.</p>
        <a className="ghost" href="#/import">К импорту</a>
      </section>
    )
  }

  if (!card) return null

  return (
    <section className="review">
      <div className="review-meta">
        <span>верно {tally.hit}</span>
        <span>мимо {tally.miss}</span>
      </div>
      <p className="eyebrow">Без расписания</p>
      {card.image && (
        <article className="study-card play-card">
          <CardArt card={card} alt={missed ? card.term : ''} />
        </article>
      )}
      <h1 className="play-prompt">{card.translation}</h1>
      {card.partOfSpeech && <p className="hint">{card.partOfSpeech}</p>}
      <label className="field">
        <span>Английское слово</span>
        <input
          value={answer}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="напишите по-английски"
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
        />
      </label>
      {missed && (
        <p className="play-answer" role="status">
          {card.term}
          {card.sentence && <small>{card.sentence}</small>}
        </p>
      )}
      <button className="primary" type="button" disabled={!missed && !answer.trim()} onClick={submit}>
        {missed ? 'Дальше' : 'Проверить'}
      </button>
      <p className="hint">Круг из всех слов колоды, в случайном порядке. Оценки и сроки не меняются.</p>
    </section>
  )
}
