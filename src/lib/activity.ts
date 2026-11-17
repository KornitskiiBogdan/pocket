import type { ActivityLog, DayStat } from '../types'

const KEY = 'pocket.activity'
const DEVICE_KEY = 'pocket.device'

export const EMPTY_DAY: DayStat = { seconds: 0, reviews: 0, added: 0 }

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function loadActivity(): ActivityLog {
  try {
    return normalizeActivity(JSON.parse(localStorage.getItem(KEY) || '{}'))
  } catch {
    return {}
  }
}

export function saveActivity(log: ActivityLog) {
  localStorage.setItem(KEY, JSON.stringify(log))
}

export function bump(log: ActivityLog, device: string, date: string, delta: Partial<DayStat>): ActivityLog {
  const days = log[device] ?? {}
  const day = days[date] ?? EMPTY_DAY
  return {
    ...log,
    [device]: {
      ...days,
      [date]: {
        seconds: day.seconds + (delta.seconds ?? 0),
        reviews: day.reviews + (delta.reviews ?? 0),
        added: day.added + (delta.added ?? 0),
      },
    },
  }
}

/** Each device only ever grows its own counters, so the larger value is always the newer one. */
export function mergeActivity(a: ActivityLog, b: ActivityLog): ActivityLog {
  const out: ActivityLog = { ...a }
  for (const [device, days] of Object.entries(b)) {
    const mine = { ...(out[device] ?? {}) }
    for (const [date, day] of Object.entries(days)) {
      const prev = mine[date] ?? EMPTY_DAY
      mine[date] = {
        seconds: Math.max(prev.seconds, day.seconds),
        reviews: Math.max(prev.reviews, day.reviews),
        added: Math.max(prev.added, day.added),
      }
    }
    out[device] = mine
  }
  return out
}

export function dailyTotals(log: ActivityLog): Record<string, DayStat> {
  const out: Record<string, DayStat> = {}
  for (const days of Object.values(log)) {
    for (const [date, day] of Object.entries(days)) {
      const prev = out[date] ?? EMPTY_DAY
      out[date] = {
        seconds: prev.seconds + day.seconds,
        reviews: prev.reviews + day.reviews,
        added: prev.added + day.added,
      }
    }
  }
  return out
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(y, m - 1, d + days)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

export function streak(days: Record<string, DayStat>, goalSeconds: number, today: string) {
  const met = (date: string) => (days[date]?.seconds ?? 0) >= goalSeconds
  const todayDone = met(today)
  let current = 0
  let cursor = todayDone ? today : shiftDate(today, -1)
  while (met(cursor)) {
    current += 1
    cursor = shiftDate(cursor, -1)
  }
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const date of Object.keys(days).filter(met).sort()) {
    run = previous && shiftDate(previous, 1) === date ? run + 1 : 1
    best = Math.max(best, run)
    previous = date
  }
  return { current, best: Math.max(best, current), todayDone }
}

export function normalizeActivity(raw: unknown): ActivityLog {
  if (!raw || typeof raw !== 'object') return {}
  const out: ActivityLog = {}
  for (const [device, days] of Object.entries(raw as Record<string, unknown>)) {
    if (!days || typeof days !== 'object') continue
    const clean: Record<string, DayStat> = {}
    for (const [date, day] of Object.entries(days as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== 'object') continue
      const value = day as Record<string, unknown>
      clean[date] = {
        seconds: count(value.seconds),
        reviews: count(value.reviews),
        added: count(value.added),
      }
    }
    out[device] = clean
  }
  return out
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}
