import { describe, expect, it } from 'vitest'
import { bump, dailyTotals, mergeActivity, shiftDate, streak } from './activity'

const goal = 600

function days(map: Record<string, number>) {
  return Object.fromEntries(Object.entries(map).map(([date, seconds]) => [date, { seconds, reviews: 0, added: 0 }]))
}

describe('streak', () => {
  it('keeps yesterday’s streak alive while today is still in progress', () => {
    const log = days({ '2026-11-14': 700, '2026-11-15': 900, '2026-11-16': 600, '2026-11-17': 120 })
    expect(streak(log, goal, '2026-11-17')).toEqual({ current: 3, best: 3, todayDone: false })
  })

  it('counts today once the goal is met and breaks on a missed day', () => {
    const log = days({ '2026-11-10': 900, '2026-11-11': 900, '2026-11-12': 900, '2026-11-15': 100, '2026-11-16': 900, '2026-11-17': 900 })
    expect(streak(log, goal, '2026-11-17')).toEqual({ current: 2, best: 3, todayDone: true })
  })

  it('crosses month boundaries', () => {
    expect(shiftDate('2026-12-01', -1)).toBe('2026-11-30')
    expect(streak(days({ '2026-11-30': 900, '2026-12-01': 900 }), goal, '2026-12-01').current).toBe(2)
  })
})

describe('activity sync', () => {
  it('adds devices together and does not double count the same file twice', () => {
    let phone = bump({}, 'phone', '2026-11-17', { seconds: 300, reviews: 10 })
    const laptop = bump({}, 'laptop', '2026-11-17', { seconds: 400, added: 3 })
    phone = mergeActivity(phone, laptop)
    phone = mergeActivity(phone, laptop)
    expect(dailyTotals(phone)['2026-11-17']).toEqual({ seconds: 700, reviews: 10, added: 3 })
  })
})
