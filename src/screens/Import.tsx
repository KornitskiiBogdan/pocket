import { useMemo, useState, type ReactNode } from 'react'
import { useDeck } from '../context'
import { draftsFromSelection, parseLines, parsePassage } from '../lib/parse'

export function Import() {
  const { importDrafts, job, settings } = useDeck()
  const [mode, setMode] = useState<'lines' | 'passage'>('lines')
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const working = job?.phase === 'save' || job?.phase === 'text' || job?.phase === 'images'
  const passage = useMemo(() => parsePassage(text), [text])
  const selectedDrafts = useMemo(() => draftsFromSelection(passage, picked), [passage, picked])

  const submitLines = () => {
    const { drafts, skipped } = parseLines(text)
    if (skipped.length) {
      const preview = skipped.slice(0, 2).join(' / ')
      window.alert(`Не разобрал ${skipped.length} стр. Нужен вид «слово — предложение».\n${preview}`)
      if (!drafts.length) return
    }
    void importDrafts(drafts, source.trim())
    if (drafts.length) setText('')
  }

  const submitPassage = () => {
    void importDrafts(selectedDrafts, source.trim())
    setPicked(new Set())
    setText('')
  }

  const toggle = (id: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="panel">
      <p className="eyebrow">Импорт</p>
      <h1>Быстро в колоду</h1>
      <p className="lead">
        Список «слово — предложение», словарь «слово на строке, определение под ним» или абзац, в котором нажимаете незнакомое.
        В повтор сегодня попадёт не больше {settings.dailyNewLimit} новых, остальные подождут.
      </p>
      <div className="segmented" role="tablist">
        <button type="button" className={mode === 'lines' ? 'on' : ''} onClick={() => setMode('lines')}>Список</button>
        <button type="button" className={mode === 'passage' ? 'on' : ''} onClick={() => setMode('passage')}>Абзац</button>
      </div>
      <label className="field">
        <span>Откуда</span>
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="6 Minute English · 16 ноября"
          autoCapitalize="off"
        />
      </label>
      {mode === 'lines' ? (
        <>
          <label className="field">
            <span>Слова</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder={'octopus\nsea animal with eight tentacles\n\nreluctant — She was reluctant to leave.\noutcome'}
            />
          </label>
          <button className="primary" type="button" disabled={working || !text.trim()} onClick={submitLines}>
            В колоду
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span>Текст</span>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setPicked(new Set())
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="Вставьте абзац и нажмите незнакомые слова. Соседние слова склеятся: give up."
            />
          </label>
          {passage.length > 0 && (
            <div className="passage">
              {passage.map((sentence) => (
                <p key={sentence.text}>
                  <SentenceWords sentence={sentence} picked={picked} onToggle={toggle} />
                </p>
              ))}
            </div>
          )}
          <button className="primary" type="button" disabled={working || selectedDrafts.length === 0} onClick={submitPassage}>
            В колоду{selectedDrafts.length ? ` · ${selectedDrafts.length}` : ''}
          </button>
          {selectedDrafts.length > 0 && (
            <ul className="chips">
              {selectedDrafts.map((draft) => <li key={`${draft.term}|${draft.sentence}`}>{draft.term}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function SentenceWords({
  sentence,
  picked,
  onToggle,
}: {
  sentence: { text: string; words: { id: string; start: number; end: number; value: string }[] }
  picked: Set<string>
  onToggle: (id: string) => void
}) {
  const nodes: ReactNode[] = []
  let cursor = 0
  sentence.words.forEach((word) => {
    if (word.start > cursor) nodes.push(<span key={`t${cursor}`}>{sentence.text.slice(cursor, word.start)}</span>)
    nodes.push(
      <button
        key={word.id}
        type="button"
        className={picked.has(word.id) ? 'word on' : 'word'}
        onClick={() => onToggle(word.id)}
      >
        {word.value}
      </button>,
    )
    cursor = word.end
  })
  if (cursor < sentence.text.length) nodes.push(<span key="tail">{sentence.text.slice(cursor)}</span>)
  return <>{nodes}</>
}
