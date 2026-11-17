import { useState } from 'react'
import type { Card, DayStat } from '../types'
import { useDeck } from '../context'
import { dailyTotals, EMPTY_DAY, shiftDate, streak } from '../lib/activity'
import { formatDuration, plural, todayKey } from '../lib/format'
import { breakdown, forecast, isLeech, misses, recall } from '../lib/stats'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
const DAY_TITLE = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
const WEEKDAY_SHORT = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })

export function Progress({ tab }: { tab: 'calendar' | 'stats' }) {
  return (
    <section className="panel">
      <p className="eyebrow">Прогресс</p>
      <div className="segmented" role="tablist">
        <a role="tab" aria-selected={tab === 'calendar'} className={tab === 'calendar' ? 'on' : ''} href="#/progress">Календарь</a>
        <a role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'on' : ''} href="#/progress/stats">Статистика</a>
      </div>
      {tab === 'calendar' ? <Calendar /> : <Stats />}
    </section>
  )
}

function Calendar() {
  const { activity, settings } = useDeck()
  const totals = dailyTotals(activity)
  const goal = settings.dailyGoalMinutes * 60
  const today = todayKey()
  const run = streak(totals, goal, today)
  const todayStat = totals[today] ?? EMPTY_DAY
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const [year, monthIndex] = month.split('-').map(Number)
  const first = new Date(year, monthIndex - 1, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, monthIndex, 0).getDate()
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
  ]
  const week = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6))
  const weekSeconds = week.reduce((sum, date) => sum + (totals[date]?.seconds ?? 0), 0)
  const left = Math.max(0, goal - todayStat.seconds)
  const detail = totals[selected] ?? EMPTY_DAY

  const moveMonth = (delta: number) => {
    const next = new Date(year, monthIndex - 1 + delta, 1)
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <>
      <div className={run.todayDone ? 'streak done' : 'streak'}>
        <div className="streak-count">
          <strong>{run.current}</strong>
          <span>{plural(run.current, 'день', 'дня', 'дней')} подряд</span>
        </div>
        <div className="streak-today">
          <p>
            {run.todayDone
              ? 'Цель на сегодня выполнена.'
              : `Ещё ${Math.ceil(left / 60)} мин, и серия ${run.current > 0 ? 'продлится' : 'начнётся'}.`}
          </p>
          <div className="meter"><span style={{ width: `${Math.min(100, (todayStat.seconds / goal) * 100)}%` }} /></div>
          <small>Сегодня {formatDuration(todayStat.seconds)} из {settings.dailyGoalMinutes} мин · лучшая серия {run.best}</small>
        </div>
      </div>

      <ol className="week-strip">
        {week.map((date) => {
          const seconds = totals[date]?.seconds ?? 0
          return (
            <li key={date} className={seconds >= goal ? 'hit' : seconds > 0 ? 'some' : ''}>
              <span>{WEEKDAY_SHORT.format(dateOf(date))}</span>
              <b aria-label={seconds >= goal ? 'цель выполнена' : 'цель не выполнена'} />
            </li>
          )
        })}
      </ol>
      <p className="hint">За 7 дней: {formatDuration(weekSeconds)}.</p>

      <div className="month-head">
        <button className="ghost small" type="button" onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц">←</button>
        <strong>{MONTH.format(first)}</strong>
        <button className="ghost small" type="button" onClick={() => moveMonth(1)} aria-label="Следующий месяц" disabled={month >= today.slice(0, 7)}>→</button>
      </div>
      <div className="month" role="grid">
        {WEEKDAYS.map((day) => <span key={day} className="month-weekday">{day}</span>)}
        {cells.map((date, index) => {
          if (!date) return <span key={`gap${index}`} />
          const seconds = totals[date]?.seconds ?? 0
          const level = seconds === 0 ? 0 : seconds < goal ? 1 : seconds < goal * 2 ? 2 : 3
          const classes = ['day', `l${level}`, date === today ? 'today' : '', date === selected ? 'picked' : '', date > today ? 'future' : '']
          return (
            <button key={date} type="button" className={classes.filter(Boolean).join(' ')} disabled={date > today} onClick={() => setSelected(date)}>
              {Number(date.slice(8))}
            </button>
          )
        })}
      </div>
      <div className="legend">
        <span><i className="l1" /> меньше цели</span>
        <span><i className="l2" /> цель</span>
        <span><i className="l3" /> вдвое больше</span>
      </div>

      <DayDetail date={selected} stat={detail} />
    </>
  )
}

function DayDetail({ date, stat }: { date: string; stat: DayStat }) {
  return (
    <div className="day-detail">
      <strong>{DAY_TITLE.format(dateOf(date))}</strong>
      {stat.seconds === 0 && stat.reviews === 0 && stat.added === 0 ? (
        <p>В этот день занятий не было.</p>
      ) : (
        <p>
          {formatDuration(stat.seconds)} · {stat.reviews} {plural(stat.reviews, 'повтор', 'повтора', 'повторов')} · {stat.added} {plural(stat.added, 'новое слово', 'новых слова', 'новых слов')}
        </p>
      )}
    </div>
  )
}

function Stats() {
  const { cards, activity } = useDeck()
  const now = Date.now()
  const parts = breakdown(cards)
  const missed = misses(cards, now)
  const memory = recall(cards, now)
  const totals = Object.values(dailyTotals(activity))
  const seconds = totals.reduce((sum, day) => sum + day.seconds, 0)
  const reviews = totals.reduce((sum, day) => sum + day.reviews, 0)
  const leeches = cards.filter(isLeech).length

  if (!cards.length) {
    return <p className="lead">Колода пустая. Добавьте слова из чтения или импорта, и здесь появятся цифры.</p>
  }

  return (
    <>
      <div className="tiles">
        <div className="tile"><strong>{parts.total}</strong><span>всего слов</span></div>
        <div className="tile"><strong>{parts.learned}</strong><span>выучено</span></div>
        <div className="tile"><strong>{parts.learning}</strong><span>в процессе</span></div>
        <div className="tile"><strong>{parts.fresh}</strong><span>ещё не начаты</span></div>
      </div>
      <div className="stack" aria-hidden="true">
        <span className="s-learned" style={{ flex: parts.learned }} />
        <span className="s-learning" style={{ flex: parts.learning }} />
        <span className="s-fresh" style={{ flex: parts.fresh }} />
      </div>
      <p className="hint">«Выучено» — карточка, которая уходит на повтор через 21 день и дальше. Раньше этого слово ещё может забыться.</p>

      <h2>Промахи</h2>
      <div className="tiles">
        <div className="tile"><strong>{missed.again}</strong><span>«Снова» за 30 дней</span></div>
        <div className="tile"><strong>{missed.lapses}</strong><span>забыто после заучивания</span></div>
        <div className="tile">
          <strong>{memory.share === null ? '—' : `${Math.round(memory.share * 100)}%`}</strong>
          <span>вспоминаю с первого раза</span>
        </div>
        <div className="tile"><strong>{leeches}</strong><span>трудных карточек</span></div>
      </div>
      {missed.worst.length > 0 && (
        <>
          <p className="eyebrow">Чаще всего забываю</p>
          <ul className="worst">
            {missed.worst.map(({ card, misses: count }) => (
              <li key={card.id}>
                <a href={`#/card/${card.id}`}>
                  <strong>{card.term}</strong>
                  <span>{card.translation}</span>
                  <em>{count} {plural(count, 'промах', 'промаха', 'промахов')}</em>
                </a>
              </li>
            ))}
          </ul>
          {leeches > 0 && <a className="text-button" href="#/deck/leech">Все трудные карточки</a>}
        </>
      )}

      <h2>Нагрузка</h2>
      <Load cards={cards} now={now} />

      <h2>Время</h2>
      <div className="tiles">
        <div className="tile"><strong>{formatDuration(seconds)}</strong><span>всего в приложении</span></div>
        <div className="tile"><strong>{reviews}</strong><span>повторов всего</span></div>
      </div>
    </>
  )
}

function Load({ cards, now }: { cards: Card[]; now: number }) {
  const days = forecast(cards, now)
  const peak = Math.max(1, ...days.map((day) => day.count))
  const week = days.reduce((sum, day) => sum + day.count, 0)
  return (
    <div className="load">
      <div className="load-head">
        <span>Повторов на 7 дней: <strong>{week}</strong></span>
      </div>
      <ol className="bars" aria-label="Повторы по дням">
        {days.map((day, index) => (
          <li key={day.start} title={`${day.count}`}>
            <span className="bar-count">{day.count || ''}</span>
            <span className="bar" style={{ height: `${Math.max(4, (day.count / peak) * 64)}px` }} />
            <span className="bar-day">{index === 0 ? 'сег' : WEEKDAY_SHORT.format(day.start)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function dateOf(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
