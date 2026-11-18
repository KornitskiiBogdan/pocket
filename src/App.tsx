import { useEffect, useState } from 'react'
import { useDeck } from './context'
import { summarize } from './lib/queue'
import { todayKey } from './lib/format'
import { BACKUP_STALE_DAYS } from './lib/storage'
import { Deck } from './screens/Deck'
import { EditCard } from './screens/EditCard'
import { Import } from './screens/Import'
import { Play } from './screens/Play'
import { Progress } from './screens/Progress'
import { Reading } from './screens/Reading'
import { Review } from './screens/Review'
import { Settings } from './screens/Settings'

const SNOOZE_KEY = 'pocket.backupSnooze'

type Section = 'review' | 'read' | 'import' | 'deck' | 'play' | 'progress' | 'settings'

const TABS: { id: Section; href: string; label: string }[] = [
  { id: 'review', href: '#/review', label: 'Повтор' },
  { id: 'play', href: '#/play', label: 'Слова' },
  { id: 'read', href: '#/read', label: 'Чтение' },
  { id: 'import', href: '#/import', label: 'Импорт' },
  { id: 'deck', href: '#/deck', label: 'Колода' },
  { id: 'progress', href: '#/progress', label: 'Прогресс' },
]

const TITLES: Record<Section, string> = {
  review: 'Повтор',
  play: 'Слова',
  read: 'Чтение',
  import: 'Импорт',
  deck: 'Колода',
  progress: 'Прогресс',
  settings: 'Настройки',
}

type Route =
  | { section: 'review' | 'play' | 'import' | 'settings' }
  | { section: 'deck'; view: 'list' | 'leech' | 'card'; id: string }
  | { section: 'read'; view: 'library' | 'new' | 'text'; id: string }
  | { section: 'progress'; view: 'calendar' | 'stats' }

export function App() {
  const { ready, cards, settings, job, dismissJob, toasts, dismissToast, backupAt, backup } = useDeck()
  const [snoozed, setSnoozed] = useState(() => localStorage.getItem(SNOOZE_KEY) === todayKey())
  const hash = useHash()
  const route = routeOf(hash)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])
  const due = ready ? summarize(cards, todayKey(), settings.dailyNewLimit, now).session.length : 0
  const remindBackup = cards.length >= 10 && !snoozed && route.section !== 'settings'
    && (backupAt === null || now - backupAt > BACKUP_STALE_DAYS * 24 * 60 * 60 * 1000)

  useEffect(() => {
    document.title = `${TITLES[route.section]} · Карман`
  }, [route.section])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [hash])

  if (!ready) {
    return <div className="boot">Карман</div>
  }

  const tabLinks = TABS.map((tab) => (
    <a key={tab.id} href={tab.href} className={route.section === tab.id ? 'on' : ''} aria-current={route.section === tab.id ? 'page' : undefined}>
      {tab.label}
      {tab.id === 'review' && due > 0 && <em>{due}</em>}
    </a>
  ))

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/review">
          <span className="mark" aria-hidden="true">К</span>
          <span>
            <strong>Карман</strong>
            <small>английский</small>
          </span>
        </a>
        <nav className="top-tabs">{tabLinks}</nav>
        <a className={route.section === 'settings' ? 'settings-link on' : 'settings-link'} href="#/settings" aria-label="Настройки">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm7.43-2.53a7.6 7.6 0 0 0 0-1.94l2.11-1.65-2-3.46-2.49 1a7.3 7.3 0 0 0-1.68-.97L15 3.3h-4l-.37 2.65c-.6.24-1.17.57-1.68.97l-2.49-1-2 3.46 2.11 1.65a7.6 7.6 0 0 0 0 1.94l-2.11 1.65 2 3.46 2.49-1c.51.4 1.07.73 1.68.97L11 20.7h4l.37-2.65c.6-.24 1.17-.57 1.68-.97l2.49 1 2-3.46-2.11-1.65Z" />
          </svg>
        </a>
      </header>
      {job && (
        <div className={`job ${job.phase}`} role="status">
          <div className="job-copy">
            <div className="meter"><span style={{ width: job.total ? `${(job.done / job.total) * 100}%` : '12%' }} /></div>
            <p>{job.message}</p>
          </div>
          {(job.phase === 'done' || job.phase === 'error') && (
            <button type="button" className="text-button" onClick={dismissJob}>Скрыть</button>
          )}
        </div>
      )}
      {remindBackup && (
        <div className="backup-nudge" role="status">
          <p>{backupAt ? `Последней копии больше ${BACKUP_STALE_DAYS} дней.` : 'Копии колоды ещё нет.'} Сохраните её, чтобы прогресс не потерялся.</p>
          <div>
            <button type="button" className="primary small" onClick={() => { void backup() }}>Сохранить</button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                localStorage.setItem(SNOOZE_KEY, todayKey())
                setSnoozed(true)
              }}
            >
              Не сегодня
            </button>
          </div>
        </div>
      )}
      <main>
        {route.section === 'review' && <Review />}
        {route.section === 'play' && <Play />}
        {route.section === 'import' && <Import />}
        {route.section === 'settings' && <Settings />}
        {route.section === 'deck' && route.view === 'card' && <EditCard id={route.id} />}
        {route.section === 'deck' && route.view !== 'card' && <Deck key={route.view} initialFilter={route.view === 'leech' ? 'leech' : 'all'} />}
        {route.section === 'read' && <Reading key={route.id || route.view} view={route.view} id={route.id} />}
        {route.section === 'progress' && <Progress tab={route.view} />}
      </main>
      <nav className="bottom-nav">{tabLinks}</nav>
      <div className="toasts">
        {toasts.map((item) => (
          <button key={item.id} type="button" className="toast" onClick={() => dismissToast(item.id)}>{item.message}</button>
        ))}
      </div>
    </div>
  )
}

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || '#/review')
  useEffect(() => {
    if (!window.location.hash) window.location.replace('#/review')
    const onChange = () => setHash(window.location.hash || '#/review')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

function routeOf(hash: string): Route {
  const path = hash.replace(/^#/, '')
  const parts = path.split('/').filter(Boolean)
  const [head, rest] = [parts[0], decodeURIComponent(parts.slice(1).join('/'))]
  if (head === 'card') return { section: 'deck', view: 'card', id: rest }
  if (head === 'deck') return { section: 'deck', view: rest === 'leech' ? 'leech' : 'list', id: '' }
  if (head === 'read') {
    if (!rest) return { section: 'read', view: 'library', id: '' }
    if (rest === 'new') return { section: 'read', view: 'new', id: '' }
    return { section: 'read', view: 'text', id: rest }
  }
  if (head === 'progress') return { section: 'progress', view: rest === 'stats' ? 'stats' : 'calendar' }
  if (head === 'play') return { section: 'play' }
  if (head === 'import') return { section: 'import' }
  if (head === 'settings') return { section: 'settings' }
  return { section: 'review' }
}
