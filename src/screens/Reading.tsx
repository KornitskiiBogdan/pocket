import { useEffect, useMemo, useState } from 'react'
import type { Card, ReadingText, TextOrigin } from '../types'
import { useDeck } from '../context'
import { cleanTranscript } from '../lib/bbc'
import { generateReading, textParagraphs, translateReading } from '../lib/gemini'
import { draftsFromSelection, parseArticle, type PassageSentence } from '../lib/parse'
import { findPhrase, knownIds, wordCount } from '../lib/reader'
import { LEARNED_MINUTES } from '../lib/stats'

const ORIGIN_LABEL: Record<TextOrigin, string> = {
  mine: 'свой',
  bbc: '6 Minute English',
  ai: 'Gemini',
  starter: 'стартовый',
}

const TOPICS = ['remote work', 'healthy habits', 'travel on a budget', 'social media', 'climate and cities', 'job interviews']

export function Reading({ view, id }: { view: 'library' | 'new' | 'text'; id: string }) {
  if (view === 'new') return <NewText />
  if (view === 'text') return <Reader id={id} />
  return <Library />
}

function Library() {
  const { texts } = useDeck()
  const sorted = [...texts].sort((a, b) => Number(Boolean(a.readAt)) - Number(Boolean(b.readAt)) || b.createdAt - a.createdAt)
  return (
    <section className="panel">
      <p className="eyebrow">Чтение</p>
      <h1>Тексты</h1>
      <p className="lead">Нажимайте незнакомые слова, и они уйдут в колоду вместе с предложением. Время чтения идёт в дневную цель.</p>
      <div className="row-actions">
        <a className="primary" href="#/read/new">Добавить текст</a>
      </div>
      {sorted.length === 0 ? (
        <p className="lead">Пока пусто. Вставьте выпуск 6 Minute English или попросите Gemini написать текст.</p>
      ) : (
        <ul className="library">
          {sorted.map((text) => {
            const words = wordCount(text.body)
            return (
              <li key={text.id} className={text.readAt ? 'read' : ''}>
                <a href={`#/read/${text.id}`}>
                  <strong>{text.title}</strong>
                  <small>
                    {ORIGIN_LABEL[text.origin]} · {words} слов · ≈ {Math.max(1, Math.round(words / 130))} мин
                    {text.readAt ? ' · прочитано' : ''}
                  </small>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function NewText() {
  const { cards, settings, saveText } = useDeck()
  const [mode, setMode] = useState<'paste' | 'generate'>('paste')
  const [title, setTitle] = useState('')
  const [raw, setRaw] = useState('')
  const [topic, setTopic] = useState('')
  const [length, setLength] = useState<'short' | 'long'>('short')
  const [weave, setWeave] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const cleaned = useMemo(() => cleanTranscript(raw), [raw])
  const weaveWords = useMemo(() => pickWeave(cards), [cards])

  const open = async (text: ReadingText) => {
    await saveText(text)
    window.location.hash = `#/read/${text.id}`
  }

  const savePasted = () => {
    const body = cleaned.detected ? cleaned.body : raw.trim()
    if (!body) return
    const now = Date.now()
    void open({
      id: crypto.randomUUID(),
      title: title.trim() || cleaned.title || body.split(/\s+/).slice(0, 6).join(' '),
      body,
      origin: cleaned.detected ? 'bbc' : 'mine',
      focus: cleaned.vocabulary,
      createdAt: now,
      updatedAt: now,
      readAt: null,
      translation: '',
    })
  }

  const generate = async () => {
    if (!settings.apiKey) {
      setFailure('Для генерации нужен ключ Gemini в настройках')
      return
    }
    setBusy(true)
    setFailure('')
    try {
      const result = await generateReading({ topic: topic.trim(), words: weave ? weaveWords : [], length }, settings)
      const now = Date.now()
      await open({
        id: crypto.randomUUID(),
        title: result.title,
        body: result.body,
        origin: 'ai',
        focus: [],
        createdAt: now,
        updatedAt: now,
        readAt: null,
        translation: '',
      })
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Текст не получился')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <a className="back" href="#/read">← Тексты</a>
      <h1>Новый текст</h1>
      <div className="segmented" role="tablist">
        <button type="button" className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')}>Вставить</button>
        <button type="button" className={mode === 'generate' ? 'on' : ''} onClick={() => setMode('generate')}>Написать с Gemini</button>
      </div>
      {mode === 'paste' ? (
        <>
          <label className="field">
            <span>Название</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={cleaned.title || 'можно оставить пустым'} />
          </label>
          <label className="field">
            <span>Текст</span>
            <textarea
              className="tall"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              spellCheck={false}
              placeholder="Скопируйте транскрипт со страницы выпуска 6 Minute English целиком, вместе с блоком Vocabulary. Или любую статью."
            />
          </label>
          {raw.trim() && cleaned.detected && (
            <p className="note">
              Похоже на 6 Minute English: уберу имена ведущих и служебные строки
              {cleaned.vocabulary.length > 0 && <>, отмечу слова из Vocabulary: {cleaned.vocabulary.join(', ')}</>}.
            </p>
          )}
          <button className="primary" type="button" disabled={!raw.trim()} onClick={savePasted}>Читать</button>
        </>
      ) : (
        <>
          <label className="field">
            <span>Тема</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="о чём текст, по-английски или по-русски" />
          </label>
          <div className="chips-row">
            {TOPICS.map((item) => (
              <button key={item} type="button" className="chip" onClick={() => setTopic(item)}>{item}</button>
            ))}
          </div>
          <div className="segmented">
            <button type="button" className={length === 'short' ? 'on' : ''} onClick={() => setLength('short')}>Короткий · 150 слов</button>
            <button type="button" className={length === 'long' ? 'on' : ''} onClick={() => setLength('long')}>Длиннее · 300 слов</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={weave} onChange={(event) => setWeave(event.target.checked)} />
            Вплести слова, которые я учу
          </label>
          {weave && (
            <p className="hint">
              {weaveWords.length ? `В тексте будут: ${weaveWords.join(', ')}.` : 'В колоде пока нечего вплетать: нужны карточки, которые вы уже начали учить.'}
            </p>
          )}
          {failure && <p className="leech" role="alert">{failure}</p>}
          <button className="primary" type="button" disabled={busy} onClick={() => { void generate() }}>
            {busy ? 'Gemini пишет… до минуты' : 'Написать текст'}
          </button>
        </>
      )}
    </section>
  )
}

function Reader({ id }: { id: string }) {
  const { texts, cards, settings, saveText, removeText, importDrafts, job } = useDeck()
  const text = texts.find((item) => item.id === id)
  const article = useMemo(() => parseArticle(text?.body ?? ''), [text?.body])
  const sentences = useMemo(() => article.flat(), [article])
  const terms = useMemo(() => cards.map((card) => card.term), [cards])
  const known = useMemo(() => knownIds(sentences, terms), [sentences, terms])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [extras, setExtras] = useState<string[]>([])
  const [showTranslation, setShowTranslation] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState('')

  useEffect(() => {
    setShowTranslation(false)
    setTranslateError('')
  }, [text?.id])

  useEffect(() => {
    if (!text) return
    const ids = new Set<string>()
    const missing: string[] = []
    const inDeck = new Set(cards.map((card) => card.term.toLowerCase()))
    for (const term of text.focus) {
      if (inDeck.has(term.toLowerCase())) continue
      const found = findPhrase(sentences, term)
      if (found) found.forEach((wordId) => ids.add(wordId))
      else missing.push(term)
    }
    setPicked(ids)
    setExtras(missing)
    // Pre-selection is computed once per opened text, not on every deck change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text?.id])

  if (!text) {
    return (
      <section className="panel">
        <h1>Текст не найден</h1>
        <a className="ghost" href="#/read">К текстам</a>
      </section>
    )
  }

  const drafts = [
    ...draftsFromSelection(sentences, picked),
    ...extras.map((term) => ({ term, sentence: '' })),
  ]
  const working = job?.phase === 'save' || job?.phase === 'text' || job?.phase === 'images'

  const toggle = (wordId: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(wordId)) next.delete(wordId)
      else next.add(wordId)
      return next
    })
  }

  const send = () => {
    void importDrafts(drafts, text.title)
    setPicked(new Set())
    setExtras([])
  }

  const russian = textParagraphs(text.translation ?? '')
  const aligned = showTranslation && russian.length === article.length && article.length > 0

  const toggleTranslation = async () => {
    if (showTranslation) {
      setShowTranslation(false)
      return
    }
    if ((text.translation ?? '').trim()) {
      setShowTranslation(true)
      return
    }
    if (!settings.apiKey) {
      setTranslateError('Для перевода нужен ключ Gemini в настройках')
      return
    }
    setTranslating(true)
    setTranslateError('')
    try {
      const translation = await translateReading(text.body, settings)
      await saveText({ ...text, translation, updatedAt: Date.now() })
      setShowTranslation(true)
    } catch (error) {
      setTranslateError(error instanceof Error ? error.message : 'Перевод не получился')
    } finally {
      setTranslating(false)
    }
  }

  return (
    <section className="panel reader">
      <a className="back" href="#/read">← Тексты</a>
      <p className="eyebrow">{ORIGIN_LABEL[text.origin]}</p>
      <h1>{text.title}</h1>
      <p className="hint">Подчёркнуто то, что уже есть в колоде. Нажмите незнакомое слово; соседние слова склеиваются во фразу.</p>
      <div className="row-actions">
        <button className="ghost" type="button" disabled={translating} onClick={() => { void toggleTranslation() }}>
          {translating ? 'Перевожу…' : showTranslation ? 'Скрыть перевод' : 'Показать перевод'}
        </button>
      </div>
      {translateError && <p className="leech" role="alert">{translateError}</p>}
      <article className="article">
        {article.map((paragraph, index) => (
          <div key={index}>
            <p>
              {paragraph.map((sentence) => (
                <ReaderSentence key={sentence.words[0]?.id ?? sentence.text} sentence={sentence} picked={picked} known={known} onToggle={toggle} />
              ))}
            </p>
            {aligned && russian[index] && <p className="ru">{russian[index]}</p>}
          </div>
        ))}
      </article>
      {showTranslation && !aligned && russian.length > 0 && (
        <div className="translation-block">
          {russian.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      )}
      <div className="row-actions">
        <button
          className={text.readAt ? 'ghost' : 'primary'}
          type="button"
          onClick={() => { void saveText({ ...text, readAt: text.readAt ? null : Date.now(), updatedAt: Date.now() }) }}
        >
          {text.readAt ? 'Прочитано ✓' : 'Прочитал'}
        </button>
        <button
          className="danger"
          type="button"
          onClick={() => {
            if (window.confirm(`Удалить «${text.title}»? Карточки из него останутся.`)) {
              void removeText(text.id).then(() => { window.location.hash = '#/read' })
            }
          }}
        >
          Удалить текст
        </button>
      </div>
      {drafts.length > 0 && (
        <div className="pick-bar">
          <ul className="chips">
            {drafts.map((draft) => (
              <li key={`${draft.term}|${draft.sentence}`}>
                {draft.term}
                {!draft.sentence && (
                  <button type="button" aria-label={`Убрать ${draft.term}`} onClick={() => setExtras((list) => list.filter((term) => term !== draft.term))}>×</button>
                )}
              </li>
            ))}
          </ul>
          <div className="pick-actions">
            <button className="text-button" type="button" onClick={() => { setPicked(new Set()); setExtras([]) }}>Снять</button>
            <button className="primary" type="button" disabled={working} onClick={send}>В колоду · {drafts.length}</button>
          </div>
        </div>
      )}
    </section>
  )
}

function ReaderSentence({
  sentence,
  picked,
  known,
  onToggle,
}: {
  sentence: PassageSentence
  picked: Set<string>
  known: Set<string>
  onToggle: (id: string) => void
}) {
  const nodes = []
  let cursor = 0
  for (const word of sentence.words) {
    if (word.start > cursor) nodes.push(<span key={`t${word.id}`}>{sentence.text.slice(cursor, word.start)}</span>)
    const classes = ['word', known.has(word.id) ? 'known' : '', picked.has(word.id) ? 'on' : ''].filter(Boolean).join(' ')
    nodes.push(
      <button key={word.id} type="button" className={classes} aria-pressed={picked.has(word.id)} onClick={() => onToggle(word.id)}>
        {word.value}
      </button>,
    )
    cursor = word.end
  }
  if (cursor < sentence.text.length) nodes.push(<span key="tail">{sentence.text.slice(cursor)}</span>)
  return <>{nodes} </>
}

function pickWeave(cards: Card[]): string[] {
  return cards
    .filter((card) => card.status !== 'new' && card.intervalMinutes < LEARNED_MINUTES)
    .sort((a, b) => b.lapses - a.lapses || a.due - b.due)
    .slice(0, 6)
    .map((card) => card.term)
}
