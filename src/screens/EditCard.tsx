import { useEffect, useState } from 'react'
import { useDeck } from '../context'
import { resetProgress } from '../lib/card'
import { formatDue } from '../lib/format'
import { readImageFile, shrinkDataUrl } from '../lib/image'
import { isLeech } from '../lib/stats'
import { PhotoPicker } from './PhotoPicker'

export function EditCard({ id }: { id: string }) {
  const { cards, updateCard, removeCard, completeCard, attachImage, toast, job } = useDeck()
  const card = cards.find((item) => item.id === id)
  const [term, setTerm] = useState(card?.term ?? '')
  const [partOfSpeech, setPartOfSpeech] = useState(card?.partOfSpeech ?? '')
  const [translation, setTranslation] = useState(card?.translation ?? '')
  const [sentence, setSentence] = useState(card?.sentence ?? '')
  const [sentenceTranslation, setSentenceTranslation] = useState(card?.sentenceTranslation ?? '')
  const [source, setSource] = useState(card?.source ?? '')

  useEffect(() => {
    if (!card) return
    setTerm(card.term)
    setPartOfSpeech(card.partOfSpeech)
    setTranslation(card.translation)
    setSentence(card.sentence)
    setSentenceTranslation(card.sentenceTranslation)
    setSource(card.source)
  }, [card?.id])

  useEffect(() => {
    if (!card) return
    setPartOfSpeech((value) => value || card.partOfSpeech)
    setTranslation((value) => value || card.translation)
    setSentence((value) => value || card.sentence)
    setSentenceTranslation((value) => value || card.sentenceTranslation)
  }, [card?.partOfSpeech, card?.translation, card?.sentence, card?.sentenceTranslation])

  if (!card) {
    return (
      <section className="panel">
        <h1>Карточка не найдена</h1>
        <a className="ghost" href="#/deck">В колоду</a>
      </section>
    )
  }

  const save = async () => {
    const nextTerm = term.trim()
    if (!nextTerm) {
      toast('Нужно слово или выражение')
      return null
    }
    const latest = cards.find((item) => item.id === card.id) ?? card
    const next = {
      ...latest,
      term: nextTerm,
      partOfSpeech: partOfSpeech.trim(),
      translation: translation.trim(),
      sentence: sentence.trim(),
      sentenceTranslation: sentenceTranslation.trim(),
      source: source.trim(),
      updatedAt: Date.now(),
    }
    await updateCard(next)
    return next
  }

  const working = job?.phase === 'text' || job?.phase === 'images' || job?.phase === 'save'

  return (
    <section className="panel">
      <a className="back" href="#/deck">← Колода</a>
      <h1>Карточка</h1>
      {card.image && <img className="edit-shot" src={card.image} alt="" />}
      {card.image && card.imageCredit && <p className="credit">Фото: {card.imageCredit}</p>}
      <label className="field"><span>Слово</span><input value={term} onChange={(event) => setTerm(event.target.value)} /></label>
      <div className="split">
        <label className="field"><span>Часть речи</span><input value={partOfSpeech} onChange={(event) => setPartOfSpeech(event.target.value)} /></label>
        <label className="field"><span>Перевод</span><input value={translation} onChange={(event) => setTranslation(event.target.value)} /></label>
      </div>
      <label className="field">
        <span>Предложение</span>
        <textarea value={sentence} onChange={(event) => setSentence(event.target.value)} />
      </label>
      <label className="field">
        <span>Перевод предложения</span>
        <textarea value={sentenceTranslation} onChange={(event) => setSentenceTranslation(event.target.value)} />
      </label>
      <label className="field"><span>Источник</span><input value={source} onChange={(event) => setSource(event.target.value)} /></label>
      <p className="hint">
        Ступень {card.step}. {card.status === 'new' ? 'Ещё не открывали.' : `Повтор ${formatDue(card.due, Date.now())}.`}
        {' '}Забыта после заучивания: {card.lapses}.
      </p>
      {isLeech(card) && (
        <p className="leech">Трудная карточка. Помогает другое предложение, более узкий перевод или своя картинка. После правки можно сбросить прогресс.</p>
      )}
      {card.mine.length > 0 && (
        <div className="mine">
          <p className="eyebrow">Мои фразы</p>
          <ul>
            {[...card.mine].reverse().map((item) => (
              <li key={item.at}>
                <span className={item.ok ? 'mine-ok' : 'mine-fix'}>{item.ok ? '✓' : '✎'}</span>
                <span>
                  {item.ok ? item.text : item.corrected}
                  {!item.ok && <small>было: {item.text}</small>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="row-actions">
        <button className="primary" type="button" onClick={() => { void save().then((saved) => saved && toast('Сохранено')) }}>Сохранить</button>
        <button
          className="ghost"
          type="button"
          disabled={working}
          onClick={() => { void save().then((saved) => saved && completeCard(saved.id)) }}
        >
          Дополнить
        </button>
      </div>
      <div className="row-actions">
        <label className="ghost file">
          Своя картинка
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void readImageFile(file)
                .then((url) => shrinkDataUrl(url))
                .then((url) => attachImage(card.id, url))
                .catch((error: Error) => toast(error.message))
            }}
          />
        </label>
        {card.image && (
          <button className="ghost" type="button" onClick={() => { void attachImage(card.id, null) }}>Убрать картинку</button>
        )}
      </div>
      <PhotoPicker key={card.id} card={card} />
      <div className="row-actions">
        <button
          className="ghost"
          type="button"
          onClick={() => {
            if (window.confirm('Сбросить прогресс этой карточки?')) void updateCard(resetProgress(card, Date.now()))
          }}
        >
          Сбросить прогресс
        </button>
        <button
          className="danger"
          type="button"
          onClick={() => {
            if (window.confirm(`Удалить «${card.term}»?`)) {
              void removeCard(card.id).then(() => { window.location.hash = '#/deck' })
            }
          }}
        >
          Удалить
        </button>
      </div>
    </section>
  )
}
