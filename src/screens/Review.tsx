import { useEffect, useState } from 'react'
import type { Grade } from '../types'
import { useDeck } from '../context'
import { gradeCard } from '../lib/card'
import { formatDue, formatMinutes, todayKey } from '../lib/format'
import { summarize } from '../lib/queue'
import { planGrade, returnsInSession } from '../lib/srs'
import { speakPrompt } from '../lib/play'
import { speakEnglish, stopSpeaking } from '../lib/speech'
import { isLeech } from '../lib/stats'
import { CardArt, ClozeText, MarkTerm, faceOf } from '../ui'
import { OwnPractice } from './OwnPractice'
import { SpeakTurn } from './SpeakTurn'

const GRADES: { id: Grade; label: string }[] = [
  { id: 'again', label: 'Снова' },
  { id: 'hard', label: 'Трудно' },
  { id: 'good', label: 'Хорошо' },
  { id: 'easy', label: 'Легко' },
]

export function Review() {
  const { cards, settings, updateCard, updateSettings, logActivity } = useDeck()
  const [boot] = useState(() => {
    const ids = summarize(cards, todayKey(), settings.dailyNewLimit, Date.now()).session.map((card) => card.id)
    return { ids, phase: (ids.length ? 'run' : 'done') as 'run' | 'done' }
  })
  const [queue, setQueue] = useState<string[]>(boot.ids)
  const [flipped, setFlipped] = useState(false)
  const [phase, setPhase] = useState<'run' | 'speak' | 'done'>(boot.phase)
  const [speakId, setSpeakId] = useState<string | null>(null)
  const [stats, setStats] = useState({ graded: 0, again: 0 })
  const [undo, setUndo] = useState<{ cardId: string; before: (typeof cards)[number]; queue: string[]; grade: Grade } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const begin = () => {
    const session = summarize(cards, todayKey(), settings.dailyNewLimit, Date.now()).session
    setQueue(session.map((card) => card.id))
    setFlipped(false)
    setStats({ graded: 0, again: 0 })
    setUndo(null)
    setSpeakId(null)
    setPhase(session.length ? 'run' : 'done')
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), 8000)
    return () => window.clearTimeout(timer)
  }, [undo])

  const current = cards.find((card) => card.id === queue[0])
  const speakCard = cards.find((card) => card.id === speakId)
  const summary = summarize(cards, todayKey(), settings.dailyNewLimit, now)

  useEffect(() => {
    if (phase !== 'speak') return
    if (settings.speak && speakCard && speakPrompt(speakCard)) return
    setSpeakId(null)
    setPhase(queue.length ? 'run' : 'done')
  }, [settings.speak, phase, queue.length, speakCard])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (phase !== 'run' || !current) return
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        if (!flipped) setFlipped(true)
        return
      }
      if (!flipped) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < GRADES.length) {
        event.preventDefault()
        grade(GRADES[index].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const grade = (gradeName: Grade) => {
    if (!current || !flipped) return
    stopSpeaking()
    const before = current
    const next = gradeCard(current, gradeName, Date.now(), todayKey())
    const rest = queue.slice(1).filter((id) => id !== current.id)
    if (returnsInSession(gradeName, next.intervalMinutes) && rest.length > 0) {
      rest.splice(Math.min(2, rest.length), 0, current.id)
    }
    setUndo({ cardId: current.id, before, queue, grade: gradeName })
    setStats((item) => ({
      graded: item.graded + 1,
      again: item.again + (gradeName === 'again' ? 1 : 0),
    }))
    setFlipped(false)
    setQueue(rest)
    const aloud = settings.speak && (gradeName === 'again' || gradeName === 'hard') && speakPrompt(current)
    if (aloud) {
      setSpeakId(current.id)
      setPhase('speak')
    } else if (!rest.length) {
      setSpeakId(null)
      setPhase('done')
    }
    logActivity({ reviews: 1 })
    void updateCard(next)
  }

  const finishSpeak = () => {
    stopSpeaking()
    setSpeakId(null)
    setPhase(queue.length ? 'run' : 'done')
  }

  const undoGrade = () => {
    if (!undo) return
    void updateCard(undo.before)
    setQueue(undo.queue)
    setPhase('run')
    setSpeakId(null)
    setFlipped(false)
    setStats((item) => ({
      graded: Math.max(0, item.graded - 1),
      again: Math.max(0, item.again - (undo.grade === 'again' ? 1 : 0)),
    }))
    setUndo(null)
  }

  if (phase === 'speak' && speakCard && speakPrompt(speakCard)) {
    return (
      <section className="review">
        <SpeakSwitch speak={settings.speak} onChange={(speak) => updateSettings({ ...settings, speak })} />
        <SpeakTurn key={speakCard.id} card={speakCard} onDone={finishSpeak} />
      </section>
    )
  }

  if (phase === 'done' || !current) {
    return (
      <section className="panel done">
        <p className="eyebrow">{stats.graded ? 'Сессия' : 'Повтор'}</p>
        <SpeakSwitch speak={settings.speak} onChange={(speak) => updateSettings({ ...settings, speak })} />
        <h1>{summary.session.length ? 'Есть что повторить' : 'На сейчас всё'}</h1>
        {stats.graded > 0 && (
          <p className="lead">Разобрано {stats.graded}. Снова: {stats.again}.</p>
        )}
        {summary.nextDue && !summary.session.length && (
          <p className="lead">Следующая карточка {formatDue(summary.nextDue, now)}. Можно свернуть и вернуться.</p>
        )}
        {summary.unseenLeft > 0 && (
          <p className="lead">Новые на сегодня закончились. Ещё {summary.unseenLeft} ждут завтра.</p>
        )}
        {!cards.length && (
          <p className="lead">Колода пустая. Импортируйте слова из выпуска — списком или прямо из абзаца.</p>
        )}
        {!!cards.length && !summary.session.length && !summary.nextDue && summary.unseenLeft === 0 && stats.graded === 0 && (
          <p className="lead">Свежих карточек нет. Самое время закинуть слова из сегодняшнего выпуска.</p>
        )}
        <div className="row-actions">
          {summary.session.length > 0 && (
            <button className="primary" type="button" onClick={begin}>Повторить</button>
          )}
          <a className="ghost" href="#/import">К импорту</a>
          {cards.some((card) => card.translation.trim()) && <a className="ghost" href="#/play">Погонять слова</a>}
          {undo && <button className="ghost" type="button" onClick={undoGrade}>Отменить оценку</button>}
        </div>
      </section>
    )
  }

  const face = faceOf(current, settings.direction)
  const plan = Object.fromEntries(GRADES.map((item) => [item.id, formatMinutes(planGrade(current, item.id).intervalMinutes)]))
  const total = stats.graded + queue.length

  return (
    <section className="review">
      <SpeakSwitch speak={settings.speak} onChange={(speak) => updateSettings({ ...settings, speak })} />
      <div className="review-meta">
        <span>осталось {queue.length}</span>
        <span>новые {Math.min(summary.used, settings.dailyNewLimit)}/{settings.dailyNewLimit}</span>
      </div>
      <div className="meter" aria-hidden="true"><span style={{ width: `${total ? (stats.graded / total) * 100 : 0}%` }} /></div>
      <article className="study-card">
        <CardArt card={current} alt={flipped ? current.term : ''} showLetter={flipped} />
        <div className="study-body">
          {current.source && <p className="source">{current.source}</p>}
          {!flipped && face.mode === 'cloze' && <ClozeText sentence={face.prompt} term={current.term} />}
          {!flipped && face.mode === 'term' && (
            <>
              <p className="eyebrow">Вспомните перевод</p>
              <p className="sentence">{face.prompt}</p>
            </>
          )}
          {!flipped && face.mode === 'produce' && (
            <>
              <p className="eyebrow">Скажите по-английски</p>
              <p className="sentence">{face.prompt}</p>
            </>
          )}
          {flipped && (
            <>
              <h2 className="term">{current.term}</h2>
              <p className="gloss">{[current.partOfSpeech, current.translation].filter(Boolean).join(' · ') || 'без перевода'}</p>
              {current.definition && <p className="definition">{current.definition}</p>}
              {current.sentence && (
                <p className="sentence back-sentence"><MarkTerm sentence={current.sentence} term={current.term} /></p>
              )}
              {current.sentenceTranslation && <p className="translation">{current.sentenceTranslation}</p>}
              <button className="speak" type="button" onClick={() => speakEnglish(current.sentence || current.term)}>
                Послушать
              </button>
              {isLeech(current) && (
                <p className="leech">
                  Трудная: забыта {current.lapses} раз. Скорее всего, мешает сама карточка.{' '}
                  <a href={`#/card/${current.id}`}>Переписать</a>
                </p>
              )}
            </>
          )}
        </div>
      </article>
      {flipped && <OwnPractice key={current.id} card={current} />}
      {!flipped ? (
        <button className="primary show-answer" type="button" onClick={() => setFlipped(true)}>Показать ответ</button>
      ) : (
        <>
          <div className="grades">
            {GRADES.map((item) => (
              <button key={item.id} className={`grade ${item.id}`} type="button" onClick={() => grade(item.id)}>
                <span>{item.label}</span>
                <small>{plan[item.id]}</small>
              </button>
            ))}
          </div>
          <p className="hint">Клавиши 1–4 ставят оценку.</p>
        </>
      )}
      {undo && <button className="text-button" type="button" onClick={undoGrade}>Отменить последнюю оценку</button>}
    </section>
  )
}

function SpeakSwitch({ speak, onChange }: { speak: boolean; onChange: (speak: boolean) => void }) {
  return (
    <div className="speak-switch">
      <div className="segmented" role="radiogroup" aria-label="Говорение">
        <button type="button" role="radio" aria-checked={speak} className={speak ? 'on' : ''} onClick={() => onChange(true)}>Вслух</button>
        <button type="button" role="radio" aria-checked={!speak} className={speak ? '' : 'on'} onClick={() => onChange(false)}>Молча</button>
      </div>
      <p className="hint">{speak ? 'После «Снова» и «Трудно» нужно сказать фразу.' : 'Ночной режим: только карточки, без фразы вслух.'}</p>
    </div>
  )
}
