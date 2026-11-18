import { useEffect, useRef, useState } from 'react'
import type { Card } from '../types'
import { useDeck } from '../context'
import { MINE_LIMIT } from '../lib/card'
import { checkSentence, type SentenceCheck } from '../lib/gemini'
import { canDictate, dictate, speakEnglish } from '../lib/speech'

export function OwnPractice({ card }: { card: Card }) {
  const { cards, settings, updateCard, toast } = useDeck()
  const [text, setText] = useState('')
  const [result, setResult] = useState<SentenceCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState('')
  const [listening, setListening] = useState(false)
  const stop = useRef<(() => void) | null>(null)
  const dictation = canDictate()

  useEffect(() => () => stop.current?.(), [])

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
    const sentence = text.trim()
    if (!sentence) return
    if (!settings.gigachatKey) {
      setFailure('Для проверки нужен ключ GigaChat в настройках')
      return
    }
    setChecking(true)
    setFailure('')
    try {
      const verdict = await checkSentence(card, sentence, settings)
      setResult(verdict)
      const latest = cards.find((item) => item.id === card.id) ?? card
      await updateCard({
        ...latest,
        mine: [...latest.mine, { text: sentence, ...verdict, at: Date.now() }].slice(-MINE_LIMIT),
        updatedAt: Date.now(),
      })
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Проверка не удалась')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="own">
      <p className="eyebrow">Своя фраза с «{card.term}»</p>
      <textarea
        className="own-input"
        value={text}
        rows={2}
        spellCheck={false}
        autoCapitalize="sentences"
        placeholder={dictation ? 'Скажите или напишите своё предложение' : 'Напишите своё предложение'}
        onChange={(event) => {
          setText(event.target.value)
          setResult(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void check()
          }
        }}
      />
      <div className="row-actions">
        {dictation && (
          <button className={listening ? 'ghost listening' : 'ghost'} type="button" onClick={listen}>
            {listening ? 'Слушаю… стоп' : 'Сказать'}
          </button>
        )}
        <button className="ghost" type="button" disabled={checking || !text.trim()} onClick={() => { void check() }}>
          {checking ? 'Проверяю…' : 'Проверить'}
        </button>
      </div>
      {failure && <p className="leech" role="alert">{failure}</p>}
      {result && (
        <div className={result.ok ? 'verdict ok' : 'verdict fix'}>
          <strong>{result.ok ? 'Верно' : 'Можно лучше'}</strong>
          {!result.ok && result.corrected !== text.trim() && <p className="fixed">{result.corrected}</p>}
          {result.comment && <p>{result.comment}</p>}
          {result.natural && result.natural !== result.corrected && (
            <p className="natural">
              Как сказал бы носитель: <span>{result.natural}</span>
            </p>
          )}
          <button className="speak" type="button" onClick={() => speakEnglish(result.natural || result.corrected)}>
            Послушать правильно
          </button>
        </div>
      )}
    </div>
  )
}
