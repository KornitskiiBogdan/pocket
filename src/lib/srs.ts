import type { CardStatus, Grade } from '../types'

/** Intervals after a successful recall: 20 min, 1 h, 8 h, then days. */
export const LADDER_MINUTES = [20, 60, 8 * 60, 24 * 60, 3 * 24 * 60, 7 * 24 * 60, 16 * 24 * 60, 35 * 24 * 60]

const DAY = 24 * 60
const MAX_MINUTES = 180 * DAY

export interface SrsState {
  step: number
  intervalMinutes: number
  due: number
  reps: number
  lapses: number
  lastReviewed: number | null
  status: CardStatus
  introducedOn: string | null
}

export function freshSrs(now: number): SrsState {
  return {
    step: 0,
    intervalMinutes: 0,
    due: now,
    reps: 0,
    lapses: 0,
    lastReviewed: null,
    status: 'new',
    introducedOn: null,
  }
}

export function intervalForStep(step: number): number {
  if (step <= 0) return 10
  if (step <= LADDER_MINUTES.length) return LADDER_MINUTES[step - 1]
  const extra = step - LADDER_MINUTES.length
  return Math.min(MAX_MINUTES, LADDER_MINUTES[LADDER_MINUTES.length - 1] * 2 ** extra)
}

export function planGrade(
  state: Pick<SrsState, 'step' | 'intervalMinutes'>,
  grade: Grade,
): { step: number; intervalMinutes: number } {
  if (grade === 'again') {
    return { step: Math.max(0, state.step - 2), intervalMinutes: 10 }
  }
  if (grade === 'hard') {
    if (state.step <= 0 || state.intervalMinutes <= 0) return { step: 0, intervalMinutes: 10 }
    return { step: state.step, intervalMinutes: Math.max(10, Math.round(state.intervalMinutes * 0.6)) }
  }
  if (grade === 'easy') {
    let step = state.step + 2
    while (intervalForStep(step) < DAY && step < 12) step += 1
    return { step, intervalMinutes: intervalForStep(step) }
  }
  const step = state.step + 1
  return { step, intervalMinutes: intervalForStep(step) }
}

export function applyGrade(state: SrsState, grade: Grade, now: number, today: string): SrsState {
  const plan = planGrade(state, grade)
  return {
    step: plan.step,
    intervalMinutes: plan.intervalMinutes,
    due: now + plan.intervalMinutes * 60_000,
    reps: state.reps + (grade === 'again' ? 0 : 1),
    lapses: state.lapses + (grade === 'again' && state.status === 'review' ? 1 : 0),
    lastReviewed: now,
    status: plan.intervalMinutes >= DAY ? 'review' : 'learning',
    introducedOn: state.introducedOn ?? today,
  }
}

export function returnsInSession(grade: Grade, intervalMinutes: number): boolean {
  return grade === 'again' || (grade === 'hard' && intervalMinutes <= 20)
}
