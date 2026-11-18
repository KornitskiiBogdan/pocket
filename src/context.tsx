import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ActivityLog, Card, DayStat, Draft, ReadingText, Settings } from './types'
import { bump, deviceId, loadActivity, mergeActivity, saveActivity } from './lib/activity'
import { applyEnrich, createCard, keepDefinition } from './lib/card'
import { allCards, allTexts, clearCards, deleteCard, deleteCards, deleteText, putCards, putTexts } from './lib/db'
import { mergeByRecency, normalizeCard, normalizeText, parseDeckFile, serializeDeck } from './lib/deckFile'
import { lastBackup, requestPersistence, saveBackup } from './lib/storage'
import { todayKey } from './lib/format'
import { enrich, illustrate, ImageQuotaError, localImagePrompt } from './lib/gemini'
import { findPhoto } from './lib/photos'
import { loadSettings, saveSettings } from './lib/settings'
import { starterTexts } from './lib/starter'

const SEEDED_KEY = 'pocket.seeded'
const TICK_SECONDS = 15
const IDLE_MS = 3 * 60_000

export interface Job {
  phase: 'save' | 'text' | 'images' | 'done' | 'error'
  done: number
  total: number
  message: string
}

interface DeckContextValue {
  ready: boolean
  cards: Card[]
  settings: Settings
  job: Job | null
  toast: (message: string) => void
  toasts: { id: string; message: string }[]
  dismissToast: (id: string) => void
  updateSettings: (settings: Settings) => void
  updateCard: (card: Card) => Promise<void>
  removeCard: (id: string) => Promise<void>
  removeCards: (ids: string[]) => Promise<void>
  importDrafts: (drafts: Draft[], source: string) => Promise<void>
  completeCard: (id: string) => Promise<void>
  attachImage: (id: string, image: string | null, credit?: string) => Promise<void>
  importFile: (raw: unknown, replace: boolean) => Promise<void>
  dismissJob: () => void
  texts: ReadingText[]
  saveText: (text: ReadingText) => Promise<void>
  removeText: (id: string) => Promise<void>
  activity: ActivityLog
  logActivity: (delta: Partial<DayStat>) => void
  backupAt: number | null
  backup: () => Promise<void>
}

const DeckContext = createContext<DeckContextValue | null>(null)

export function DeckProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [job, setJob] = useState<Job | null>(null)
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([])
  const [texts, setTexts] = useState<ReadingText[]>([])
  const [activity, setActivity] = useState<ActivityLog>(() => loadActivity())
  const [backupAt, setBackupAt] = useState(() => lastBackup())
  const cardsRef = useRef<Card[]>([])
  const textsRef = useRef<ReadingText[]>([])
  const activityRef = useRef(activity)
  const settingsRef = useRef(settings)
  const device = useRef(deviceId())
  const busy = useRef(false)
  cardsRef.current = cards
  textsRef.current = texts
  settingsRef.current = settings

  useEffect(() => {
    Promise.all([allCards(), allTexts()])
      .then(([storedCards, storedTexts]) => {
        const loaded = storedCards.map(normalizeCard).filter((card): card is Card => card !== null)
        let loadedTexts = storedTexts.map(normalizeText).filter((text): text is ReadingText => text !== null)
        if (!localStorage.getItem(SEEDED_KEY)) {
          const present = new Set(loadedTexts.map((text) => text.id))
          const seeds = starterTexts(Date.now()).filter((text) => !present.has(text.id))
          void putTexts(seeds)
          loadedTexts = [...loadedTexts, ...seeds]
          localStorage.setItem(SEEDED_KEY, '1')
        }
        cardsRef.current = loaded
        textsRef.current = loadedTexts
        setCards(loaded)
        setTexts(loadedTexts)
      })
      .catch(() => toast('Не удалось открыть колоду в этом браузере'))
      .finally(() => setReady(true))
    void requestPersistence()
  }, [])

  const commitActivity = useCallback((next: ActivityLog) => {
    activityRef.current = next
    saveActivity(next)
    setActivity(next)
  }, [])

  const logActivity = useCallback((delta: Partial<DayStat>) => {
    commitActivity(bump(activityRef.current, device.current, todayKey(), delta))
  }, [commitActivity])

  useEffect(() => {
    let lastInput = Date.now()
    const mark = () => { lastInput = Date.now() }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'] as const
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }))
    window.addEventListener('scroll', mark, { passive: true, capture: true })
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastInput > IDLE_MS) return
      logActivity({ seconds: TICK_SECONDS })
    }, TICK_SECONDS * 1000)
    return () => {
      window.clearInterval(timer)
      events.forEach((name) => window.removeEventListener(name, mark))
      window.removeEventListener('scroll', mark, { capture: true })
    }
  }, [logActivity])

  const saveText = useCallback(async (text: ReadingText) => {
    const rest = textsRef.current.filter((item) => item.id !== text.id)
    const next = [text, ...rest]
    textsRef.current = next
    setTexts(next)
    await putTexts([text])
  }, [])

  const removeText = useCallback(async (id: string) => {
    const next = textsRef.current.filter((item) => item.id !== id)
    textsRef.current = next
    setTexts(next)
    await deleteText(id)
  }, [])

  const toast = useCallback((message: string) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, message }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const remember = useCallback((next: Card[]) => {
    cardsRef.current = next
    setCards(next)
  }, [])

  const updateCard = useCallback(async (card: Card) => {
    const next = cardsRef.current.map((item) => (item.id === card.id ? card : item))
    if (!next.some((item) => item.id === card.id)) next.unshift(card)
    remember(next)
    await putCards([card])
  }, [remember])

  const updateSettings = useCallback((next: Settings) => {
    const saved = saveSettings(next)
    settingsRef.current = saved
    setSettings(saved)
  }, [])

  const removeCard = useCallback(async (id: string) => {
    remember(cardsRef.current.filter((card) => card.id !== id))
    await deleteCard(id)
  }, [remember])

  const removeCards = useCallback(async (ids: string[]) => {
    const drop = new Set(ids)
    remember(cardsRef.current.filter((card) => !drop.has(card.id)))
    await deleteCards(ids)
  }, [remember])

  const attachImage = useCallback(async (id: string, image: string | null, credit = '') => {
    const current = cardsRef.current.find((card) => card.id === id)
    if (!current) return
    await updateCard({ ...current, image, imageCredit: image ? credit : '', updatedAt: Date.now() })
  }, [updateCard])

  const importDrafts = useCallback(async (drafts: Draft[], source: string) => {
    if (busy.current) return
    const seen = new Set<string>()
    const fresh: Draft[] = []
    const retry: Card[] = []
    const explain: Card[] = []
    let dupes = 0
    const now = Date.now()
    for (const draft of drafts) {
      const term = draft.term.trim()
      const sentence = draft.sentence.trim()
      const gloss = draft.gloss?.trim() || ''
      if (!term) continue
      const key = keyOf(term, sentence)
      if (seen.has(key)) {
        dupes += 1
        continue
      }
      seen.add(key)
      const existing = cardsRef.current.find((card) => keyOf(card.term, card.sentence) === key)
      if (!existing) {
        fresh.push({ term, sentence, gloss })
        continue
      }
      const withExplanation = keepDefinition(existing, gloss, now)
      if (!existing.translation) {
        retry.push(withExplanation)
        continue
      }
      if (withExplanation !== existing) {
        explain.push(withExplanation)
        continue
      }
      dupes += 1
    }
    if (!fresh.length && !retry.length && !explain.length) {
      toast(dupes ? 'Такие карточки уже есть' : 'Нечего добавлять')
      return
    }
    if (fresh.length + retry.length > 40) {
      toast('За раз можно 40 карточек. Разбейте список.')
      return
    }

    busy.current = true
    const started = Date.now()
    const created = fresh.map((draft, index) => createCard({
      term: draft.term,
      sentence: draft.sentence,
      definition: draft.gloss,
      source,
      createdAt: started + index,
      now: started,
    }))
    // Snapshot taken before Gemini. A failed request restores these, explanation included.
    const saved = [...created, ...retry]
    const enrichItems = [
      ...fresh,
      ...retry.map((card) => ({ term: card.term, sentence: card.sentence, gloss: card.definition || undefined })),
    ]
    try {
      const toStore = [...saved, ...explain]
      setJob({ phase: 'save', done: 0, total: toStore.length, message: 'Сохраняю слова…' })
      await putCards(toStore)
      remember(mergeCards(cardsRef.current, toStore))
      if (created.length) logActivity({ added: created.length })

      const currentSettings = settingsRef.current
      if (!currentSettings.apiKey || !enrichItems.length) {
        const added = created.length ? `Добавлено ${created.length}. ` : ''
        const translated = currentSettings.apiKey || !enrichItems.length
          ? ''
          : 'Без ключа перевод и картинка не заполнились.'
        const extra = explain.length ? ` Объяснение дописано: ${explain.length}.` : ''
        setJob({
          phase: 'done',
          done: toStore.length,
          total: toStore.length,
          message: `${added}${translated}${extra}`.trim() || `Объяснение на карточке: ${explain.length}.`,
        })
        return
      }

      setJob({ phase: 'text', done: 0, total: saved.length, message: 'Перевожу…' })
      const enriched = await enrich(enrichItems, currentSettings, (done, total) => {
        setJob({ phase: 'text', done, total, message: `Перевод ${done} из ${total}` })
      })
      let skeletons = saved.map((card, index) => applyEnrich(card, enriched[index]))
      await putCards(skeletons)
      remember(mergeCards(cardsRef.current, skeletons))

      let failedImages = 0
      let quotaNote = ''
      if (currentSettings.imageSource !== 'off') {
        const gemini = currentSettings.imageSource === 'gemini'
        const drawsSome = skeletons.some((card) => wantsDrawing(card, currentSettings))
        let done = 0
        let next = 0
        const label = gemini ? 'Рисую картинки' : drawsSome ? 'Подбираю картинки' : 'Ищу фото'
        setJob({ phase: 'images', done: 0, total: skeletons.length, message: `${label}…` })
        const worker = async () => {
          while (next < skeletons.length) {
            const index = next++
            if (skeletons[index].image) {
              done += 1
              setJob({ phase: 'images', done, total: skeletons.length, message: `${label}: ${done} из ${skeletons.length}` })
              continue
            }
            try {
              const picture = await pictureFor(skeletons[index], currentSettings)
              if (picture) {
                const latest = cardsRef.current.find((card) => card.id === skeletons[index].id) ?? skeletons[index]
                skeletons[index] = {
                  ...latest,
                  definition: latest.definition || skeletons[index].definition,
                  image: picture.image,
                  imageCredit: picture.credit,
                  updatedAt: Date.now(),
                }
                await updateCard(skeletons[index])
              } else {
                failedImages += 1
              }
            } catch {
              failedImages += 1
            }
            done += 1
            setJob({ phase: 'images', done, total: skeletons.length, message: `${label}: ${done} из ${skeletons.length}` })
          }
        }
        await Promise.all(Array.from({ length: Math.min(gemini ? 2 : PHOTO_PARALLEL, skeletons.length) }, worker))
        if (drawsSome && imageQuotaHit()) quotaNote = ' Gemini не рисует на бесплатном тарифе, взял фото.'
      }

      const imageNote = (failedImages ? ` Без картинки: ${failedImages}.` : '') + quotaNote
      const dupeNote = dupes ? ` Пропустил дубли: ${dupes}.` : ''
      const retryNote = retry.length ? ` Перевод дописан: ${retry.length}.` : ''
      const explainNote = explain.length ? ` Объяснение дописано: ${explain.length}.` : ''
      const head = created.length ? `Готово: ${created.length}.` : retry.length ? 'Перевод дописан.' : 'Объяснение на карточке.'
      setJob({
        phase: 'done',
        done: skeletons.length,
        total: skeletons.length,
        message: `${head}${created.length ? retryNote : ''}${explainNote}${imageNote}${dupeNote}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Импорт остановился'
      const kept = saved.some((card) => card.definition)
      const note = kept ? ' Английское объяснение осталось на карточке.' : ''
      try {
        await putCards(saved)
        remember(mergeCards(cardsRef.current, saved))
      } catch {
        // The first save already stored the explanation.
      }
      setJob({ phase: 'error', done: 0, total: saved.length, message: message + note })
      toast(message + note)
    } finally {
      busy.current = false
    }
  }, [logActivity, remember, toast, updateCard])

  const completeCard = useCallback(async (id: string) => {
    if (busy.current) return
    const card = cardsRef.current.find((item) => item.id === id)
    if (!card) return
    if (!settingsRef.current.apiKey) {
      toast('Сначала вставьте ключ в настройках')
      return
    }
    busy.current = true
    try {
      setJob({ phase: 'text', done: 0, total: 1, message: 'Дополняю карточку…' })
      const [enriched] = await enrich(
        [{ term: card.term, sentence: card.sentence, gloss: card.definition || undefined }],
        settingsRef.current,
      )
      const base = keepDefinition(cardsRef.current.find((item) => item.id === id) ?? card, card.definition)
      let next = applyEnrich(base, enriched)
      await updateCard(next)
      if (!next.image && settingsRef.current.imageSource !== 'off') {
        setJob({ phase: 'images', done: 0, total: 1, message: wantsDrawing(next, settingsRef.current) ? 'Рисую картинку…' : 'Ищу фото…' })
        const picture = await pictureFor(next, settingsRef.current)
        if (picture) {
          const latest = cardsRef.current.find((item) => item.id === id) ?? next
          next = {
            ...latest,
            definition: latest.definition || next.definition,
            image: picture.image,
            imageCredit: picture.credit,
            updatedAt: Date.now(),
          }
          await updateCard(next)
        }
      }
      setJob({ phase: 'done', done: 1, total: 1, message: 'Карточка дополнена' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось дополнить карточку'
      setJob({ phase: 'error', done: 0, total: 1, message })
      toast(message)
    } finally {
      busy.current = false
    }
  }, [toast, updateCard])

  const importFile = useCallback(async (raw: unknown, replace: boolean) => {
    const parsed = parseDeckFile(raw)
    if (replace) {
      await clearCards()
      await putCards(parsed.cards)
      remember(parsed.cards)
    } else {
      const merged = mergeByRecency(cardsRef.current, parsed.cards)
      const incoming = new Map(parsed.cards.map((card) => [card.id, card]))
      const changed = merged.filter((card) => {
        const next = incoming.get(card.id)
        return next && next.updatedAt >= (cardsRef.current.find((item) => item.id === card.id)?.updatedAt ?? 0)
      })
      await putCards(changed)
      remember(merged)
    }
    const mergedTexts = replace ? parsed.texts : mergeByRecency(textsRef.current, parsed.texts)
    await putTexts(parsed.texts)
    textsRef.current = mergedTexts
    setTexts(mergedTexts)
    commitActivity(mergeActivity(activityRef.current, parsed.activity))
    if (parsed.dailyNewLimit) {
      updateSettings({ ...settingsRef.current, dailyNewLimit: parsed.dailyNewLimit })
    }
    toast(replace ? `Колода заменена: ${parsed.cards.length}` : `Файл разобран: ${parsed.cards.length}`)
  }, [commitActivity, remember, toast, updateSettings])

  const backup = useCallback(async () => {
    const deck = serializeDeck(cardsRef.current, settingsRef.current.dailyNewLimit, {
      texts: textsRef.current,
      activity: activityRef.current,
    })
    try {
      if (await saveBackup(deck)) {
        setBackupAt(lastBackup())
        toast('Копия сохранена')
      }
    } catch {
      toast('Не удалось сохранить копию')
    }
  }, [toast])

  const value = useMemo<DeckContextValue>(() => ({
    backupAt,
    backup,
    ready,
    cards,
    settings,
    job,
    toast,
    toasts,
    dismissToast,
    updateSettings,
    updateCard,
    removeCard,
    removeCards,
    importDrafts,
    completeCard,
    attachImage,
    importFile,
    dismissJob: () => setJob(null),
    texts,
    saveText,
    removeText,
    activity,
    logActivity,
  }), [
    backupAt,
    backup,
    texts,
    saveText,
    removeText,
    activity,
    logActivity,
    ready,
    cards,
    settings,
    job,
    toast,
    toasts,
    dismissToast,
    updateSettings,
    updateCard,
    removeCard,
    removeCards,
    importDrafts,
    completeCard,
    attachImage,
    importFile,
  ])

  return <DeckContext.Provider value={value}>{children}</DeckContext.Provider>
}

export function useDeck() {
  const value = useContext(DeckContext)
  if (!value) throw new Error('Колода ещё не готова')
  return value
}

function keyOf(term: string, sentence: string) {
  return `${term.trim().toLowerCase()}|${sentence.trim().toLowerCase()}`
}

function mergeCards(current: Card[], updates: Card[]): Card[] {
  const map = new Map(updates.map((card) => [card.id, card]))
  const known = new Set(current.map((card) => card.id))
  const added = updates.filter((card) => !known.has(card.id))
  return [...added, ...current.map((card) => map.get(card.id) ?? card)]
}

const PHOTO_PARALLEL = 4
const QUOTA_KEY = 'pocket.imageQuota'

function imageQuotaHit(): boolean {
  return localStorage.getItem(QUOTA_KEY) === todayKey()
}

function wantsDrawing(card: Card, settings: Settings): boolean {
  return settings.imageSource === 'gemini' || (settings.imageSource === 'smart' && card.abstract)
}

/** Gemini drawing when the setting asks for one and the key still allows it today, otherwise a found photo. */
async function pictureFor(card: Card, settings: Settings): Promise<{ image: string; credit: string } | null> {
  if (wantsDrawing(card, settings) && !imageQuotaHit()) {
    try {
      const image = await illustrate(card.imagePrompt || localImagePrompt(card.term, card.sentence), settings)
      return { image, credit: '' }
    } catch (error) {
      if (error instanceof ImageQuotaError) localStorage.setItem(QUOTA_KEY, todayKey())
      else if (settings.imageSource === 'gemini') throw error
    }
  }
  return findPhoto(card.term)
}
