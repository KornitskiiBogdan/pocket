import { useState } from 'react'
import type { Card } from '../types'
import { useDeck } from '../context'
import { localImagePrompt } from '../lib/gemini'
import { drawKandinsky, hasKandinskyKeys, KandinskyError } from '../lib/kandinsky'
import { fetchPhoto, searchPhotos, type PhotoHit } from '../lib/photos'

export function PhotoPicker({ card }: { card: Card }) {
  const { attachImage, settings, toast } = useDeck()
  const [query, setQuery] = useState(card.term)
  const [hits, setHits] = useState<PhotoHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [taking, setTaking] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)

  const search = async () => {
    setSearching(true)
    try {
      setHits(await searchPhotos(query, 9))
    } finally {
      setSearching(false)
    }
  }

  const take = async (hit: PhotoHit) => {
    setTaking(hit.thumb)
    try {
      await attachImage(card.id, await fetchPhoto(hit), hit.credit)
      setHits(null)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Фото не загрузилось')
    } finally {
      setTaking(null)
    }
  }

  const drawWithKandinsky = async () => {
    setDrawing(true)
    try {
      await attachImage(card.id, await drawKandinsky(card.imagePrompt || localImagePrompt(card.term, card.sentence), settings), 'Kandinsky')
    } catch (error) {
      toast(error instanceof KandinskyError || error instanceof Error ? error.message : 'Картинка не вышла')
    } finally {
      setDrawing(false)
    }
  }

  return (
    <div className="photo-picker">
      <form
        className="photo-search"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="что должно быть на фото, по-английски" aria-label="Поиск фото" />
        <button className="ghost" type="submit" disabled={searching || !query.trim()}>{searching ? 'Ищу…' : 'Найти фото'}</button>
      </form>
      {hasKandinskyKeys(settings) && (
        <button className="text-button" type="button" disabled={drawing} onClick={() => { void drawWithKandinsky() }}>
          {drawing ? 'Рисую…' : 'Нарисовать в Kandinsky'}
        </button>
      )}
      {hits && hits.length === 0 && <p className="hint">Ничего не нашлось. Попробуйте конкретнее: кто, что делает, где.</p>}
      {hits && hits.length > 0 && (
        <ul className="photo-grid">
          {hits.map((hit) => (
            <li key={hit.thumb}>
              <button type="button" disabled={taking !== null} onClick={() => { void take(hit) }} aria-label={`Взять фото: ${hit.credit}`}>
                <img src={hit.thumb} alt="" loading="lazy" />
                {taking === hit.thumb && <span>…</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
