import { useEffect, useRef, useState } from 'react'
import type { Card } from '../types'
import { useDeck } from '../context'
import { checkSentence, type SentenceCheck } from '../lib/gemini'
import { matchesTerm, speakPrompt } from '../lib/play'
import { canDictate, dictate, speakEnglish } from '../lib/speech'

export function SpeakTurn({ card, onDone }: { card: Card; onDone: () => void }) {
  const { settings, toast } = useDeck()
  const prompt = speakPrompt(card)
  const [text, setText] = useState('')
  const [result, setResult] = useState<SentenceCheck | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState('')
  const [listening, setListening] = useState(false)
  const stop = useRef<(() => void) | null>(null)
  const dictation = canDictate()

  useEffect(() => () => stop.current?.(), [])

  if (!prompt) return null

  const listen = () => {
    if (listening) {
      stop.current?.()
      return
    }
    setResult(null)
    setListening(true)
    stop.current = dictate({
      onText: setText,
      onEnd: () => {
        setListening(false)
        stop.current = null
      },
      onError: toast,
    })
  }

  const check = async () => {
    const said = text.trim()
    if (!said) return
    setFailure('')
    if (prompt.kind === 'word') {
      const ok = matchesTerm(said, card.term)
      setResult({
        ok,
        corrected: card.term,
        natural: card.term,
        comment: ok ? 'Верное слово.' : 'Другое слово.',
      })
      setRevealed(true)
      return
    }
    if (!settings.gigachatKey) {
      const ok = said.toLowerCase().includes(card.term.trim().toLowerCase())
      setResult({
        ok,
        corrected: card.sentence,
        natural: card.sentence,
        comment: ok
          ? 'Ключа нет, сверил только слово. Фраза с карточки ниже.'
          : 'Ключа нет, фразу целиком не с чем сверить. Вот она.',
      })
      setRevealed(true)
      return
    }
    setChecking(true)
    try {
      const verdict = await checkSentence(card, said, settings, {
        sentence: card.sentence,
        sentenceTranslation: card.sentenceTranslation,
      })
      setResult(verdict)
      setRevealed(true)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Проверка не удалась')
      setRevealed(true)
    } finally {
      setChecking(false)
    }
  }

  const answer = card.sentence || card.term

  return (
    <article className="study-card">
      <div className="study-body">
        <p className="eyebrow">{prompt.kind === 'sentence' ? 'Скажите фразу' : 'Скажите слово'}</p>
        <p className="sentence">{prompt.russian}</p>
        <div className="own">
          <textarea
            className="own-input"
            value={text}
            rows={2}
            spellCheck={false}
            autoCapitalize="off"
            placeholder={dictation ? 'Скажите или напишите по-английски' : 'Напишите по-английски'}
            onChange={(event) => {
              setText(event.target.value)
              setResult(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (revealed) onDone()
                else void check()
              }
            }}
          />
          <div className="row-actions">
            {dictation && (
              <button className={listening ? 'ghost listening' : 'ghost'} type="button" onClick={listen}>
                {listening ? 'Слушаю… стоп' : 'Сказать'}
              </button>
            )}
            {!revealed && (
              <button className="ghost" type="button" disabled={checking || !text.trim()} onClick={() => { void check() }}>
                {checking ? 'Проверяю…' : 'Проверить'}
              </button>
            )}
            {!revealed && (
              <button className="ghost" type="button" onClick={() => setRevealed(true)}>Не помню</button>
            )}
            {revealed && (
              <button className="primary" type="button" onClick={onDone}>Дальше</button>
            )}
          </div>
          {failure && <p className="leech" role="alert">{failure}</p>}
          {result && (
            <div className={result.ok ? 'verdict ok' : 'verdict fix'}>
              <strong>{result.ok ? 'Верно' : 'Можно лучше'}</strong>
              {result.comment && <p>{result.comment}</p>}
              {!result.ok && result.corrected && result.corrected !== text.trim() && <p className="fixed">{result.corrected}</p>}
            </div>
          )}
          {revealed && (
            <p className="translation">
              {answer}
              <button className="speak" type="button" onClick={() => speakEnglish(answer)}>Послушать</button>
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
