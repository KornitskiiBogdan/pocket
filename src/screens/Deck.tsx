import { useMemo, useState } from 'react'
import type { Card, CardStatus } from '../types'
import { useDeck } from '../context'
import { formatDue, plural } from '../lib/format'
import { isLeech } from '../lib/stats'

export type Filter = 'all' | 'due' | 'new' | 'bare' | 'leech' | CardStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'due', label: 'Сейчас' },
  { id: 'new', label: 'Новые' },
  { id: 'bare', label: 'Пустые' },
  { id: 'learning', label: 'Учу' },
  { id: 'review', label: 'Знаю' },
  { id: 'leech', label: 'Трудные' },
]

export function Deck({ initialFilter = 'all' }: { initialFilter?: Filter }) {
  const { cards, removeCards } = useDeck()
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [query, setQuery] = useState('')
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const now = Date.now()
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return cards
      .filter((card) => matchFilter(card, filter, now))
      .filter((card) => {
        if (!needle) return true
        return [card.term, card.translation, card.sentence, card.source].join(' ').toLowerCase().includes(needle)
      })
      .sort((a, b) => sortCards(a, b, filter))
  }, [cards, filter, query, now])

  const allVisible = visible.length > 0 && visible.every((card) => picked.has(card.id))

  const toggle = (id: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleVisible = () => {
    setPicked((current) => {
      const next = new Set(current)
      if (allVisible) visible.forEach((card) => next.delete(card.id))
      else visible.forEach((card) => next.add(card.id))
      return next
    })
  }

  const stopPicking = () => {
    setPicking(false)
    setPicked(new Set())
  }

  const removePicked = () => {
    const ids = [...picked]
    const noun = plural(ids.length, 'карточку', 'карточки', 'карточек')
    const whose = ids.length === 1 ? 'ней' : 'ним'
    if (!window.confirm(`Удалить ${ids.length} ${noun}? Прогресс по ${whose} тоже пропадёт.`)) return
    void removeCards(ids).then(stopPicking)
  }

  return (
    <section className={picking ? 'panel picking' : 'panel'}>
      <p className="eyebrow">Колода</p>
      <div className="deck-head">
        <h1>{cards.length ? `${cards.length} в колоде` : 'Пока пусто'}</h1>
        {cards.length > 0 && (
          <button className="text-button" type="button" onClick={() => (picking ? stopPicking() : setPicking(true))}>
            {picking ? 'Готово' : 'Выбрать'}
          </button>
        )}
      </div>
      <label className="field">
        <span>Поиск</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="слово, перевод, выпуск" />
      </label>
      <div className="filters">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className={filter === item.id ? 'on' : ''} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="lead">{cards.length ? 'Ничего не нашлось.' : 'Импортируйте первые слова из выпуска.'}</p>
      ) : (
        <ul className="deck">
          {visible.map((card) => {
            const body = (
              <>
                <span className="thumb">
                  {card.image ? <img src={card.image} alt="" /> : <b>{(card.term[0] || '?').toUpperCase()}</b>}
                  {picking && <i className={picked.has(card.id) ? 'tick on' : 'tick'} />}
                </span>
                <span>
                  <strong>{card.term}</strong>
                  <small>{card.translation || 'без перевода'}</small>
                </span>
                <em>
                  {isLeech(card) && <b className="leech-tag">трудная</b>}
                  {card.status === 'new' ? 'новая' : formatDue(card.due, now)}
                </em>
              </>
            )
            return (
              <li key={card.id}>
                {picking ? (
                  <button type="button" className={picked.has(card.id) ? 'row on' : 'row'} aria-pressed={picked.has(card.id)} onClick={() => toggle(card.id)}>
                    {body}
                  </button>
                ) : (
                  <a href={`#/card/${card.id}`}>{body}</a>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {picking && (
        <div className="pick-bar">
          <span className="pick-count">Выбрано {picked.size}</span>
          <div className="pick-actions">
            <button className="text-button" type="button" onClick={toggleVisible} disabled={!visible.length}>
              {allVisible ? 'Снять' : 'Все в списке'}
            </button>
            <button className="danger" type="button" disabled={!picked.size} onClick={removePicked}>Удалить</button>
          </div>
        </div>
      )}
    </section>
  )
}

function matchFilter(card: Card, filter: Filter, now: number) {
  if (filter === 'all') return true
  if (filter === 'leech') return isLeech(card)
  if (filter === 'due') return card.status !== 'new' && card.due <= now
  if (filter === 'new') return card.status === 'new'
  if (filter === 'bare') return !card.translation.trim()
  return card.status === filter
}

function sortCards(a: Card, b: Card, filter: Filter) {
  if (filter === 'leech') return b.lapses - a.lapses
  if (filter === 'all' || filter === 'new') return b.createdAt - a.createdAt
  return a.due - b.due
}
