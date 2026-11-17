import { describe, expect, it } from 'vitest'
import { applyGrade, freshSrs, intervalForStep, LADDER_MINUTES, planGrade } from './srs'

const now = 1_700_000_000_000
const today = '2026-11-16'

describe('Ebbinghaus ladder', () => {
  it('walks the ladder on Good', () => {
    let state = freshSrs(now)
    for (let i = 0; i < LADDER_MINUTES.length; i++) {
      state = applyGrade(state, 'good', now, today)
      expect(state.step).toBe(i + 1)
      expect(state.intervalMinutes).toBe(LADDER_MINUTES[i])
    }
    state = applyGrade(state, 'good', now, today)
    expect(state.intervalMinutes).toBe(LADDER_MINUTES.at(-1)! * 2)
  })

  it('sends Easy from a new card at least a day out', () => {
    const plan = planGrade(freshSrs(now), 'easy')
    expect(plan.intervalMinutes).toBeGreaterThanOrEqual(24 * 60)
    expect(plan.step).toBe(4)
  })

  it('drops two steps on Again and asks again in 10 minutes', () => {
    let state = freshSrs(now)
    for (let i = 0; i < 6; i++) state = applyGrade(state, 'good', now, today)
    const missed = applyGrade(state, 'again', now, today)
    expect(missed.step).toBe(4)
    expect(missed.intervalMinutes).toBe(10)
    expect(missed.lapses).toBe(1)
    expect(missed.reps).toBe(6)
    expect(missed.introducedOn).toBe(today)
    expect(missed.status).toBe('learning')
  })

  it('counts a lapse only when a learned card is forgotten', () => {
    const learning = applyGrade(freshSrs(now), 'again', now, today)
    expect(learning.lapses).toBe(0)
  })

  it('shortens Hard without changing the step', () => {
    const plan = planGrade({ step: 6, intervalMinutes: 16 * 24 * 60 }, 'hard')
    expect(plan.step).toBe(6)
    expect(plan.intervalMinutes).toBe(Math.round(16 * 24 * 60 * 0.6))
  })

  it('caps the far end of the curve at half a year', () => {
    expect(intervalForStep(30)).toBe(180 * 24 * 60)
  })
})
