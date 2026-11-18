import type { Direction, Settings } from '../types'

const DIRECTIONS = new Set<Direction>(['cloze', 'reverse', 'mix'])

const KEY = 'pocket.settings'

export const DEFAULT_SETTINGS: Settings = {
  gigachatKey: '',
  kandinskyKey: '',
  kandinskySecret: '',
  textModel: 'GigaChat-2-Pro',
  fastModel: 'GigaChat-2',
  dailyNewLimit: 8,
  imageSource: 'smart',
  direction: 'mix',
  dailyGoalMinutes: 15,
  speak: true,
}

type StoredSettings = Partial<Settings> & { imagesOnImport?: boolean; apiKey?: string; imageModel?: string; imageSource?: string }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as StoredSettings
    const { imagesOnImport, apiKey, imageModel, imageSource, ...rest } = parsed
    void apiKey
    void imageModel
    const next: Settings = {
      ...DEFAULT_SETTINGS,
      ...rest,
      gigachatKey: typeof parsed.gigachatKey === 'string' ? parsed.gigachatKey : '',
      kandinskyKey: typeof parsed.kandinskyKey === 'string' ? parsed.kandinskyKey : '',
      kandinskySecret: typeof parsed.kandinskySecret === 'string' ? parsed.kandinskySecret : '',
      textModel: textModel(parsed.textModel, DEFAULT_SETTINGS.textModel),
      fastModel: textModel(parsed.fastModel, DEFAULT_SETTINGS.fastModel),
      dailyNewLimit: clampLimit(parsed.dailyNewLimit ?? DEFAULT_SETTINGS.dailyNewLimit),
      // Older versions had an on/off switch for Gemini drawings, which the free tier no longer serves.
      imageSource: imageSource === 'photo' || imageSource === 'off' || imageSource === 'smart'
        ? imageSource
        : imagesOnImport === false ? 'off' : 'smart',
      direction: DIRECTIONS.has(parsed.direction as Direction) ? (parsed.direction as Direction) : DEFAULT_SETTINGS.direction,
      dailyGoalMinutes: clampGoal(parsed.dailyGoalMinutes ?? DEFAULT_SETTINGS.dailyGoalMinutes),
      speak: parsed.speak !== false,
    }
    if (JSON.stringify(next) !== raw) localStorage.setItem(KEY, JSON.stringify(next))
    return next
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings) {
  const next = {
    ...settings,
    textModel: textModel(settings.textModel, DEFAULT_SETTINGS.textModel),
    fastModel: textModel(settings.fastModel, DEFAULT_SETTINGS.fastModel),
    dailyNewLimit: clampLimit(settings.dailyNewLimit),
    gigachatKey: settings.gigachatKey.trim(),
    kandinskyKey: settings.kandinskyKey.trim(),
    kandinskySecret: settings.kandinskySecret.trim(),
  }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

/** Gemini names left in older settings are not valid GigaChat models. */
export function textModel(model: string | undefined, fallback: string): string {
  const name = model?.trim()
  if (!name || name.startsWith('gemini')) return fallback
  return name
}

export function clampGoal(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.dailyGoalMinutes
  return Math.min(180, Math.max(1, Math.round(value)))
}

export function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.dailyNewLimit
  return Math.min(40, Math.max(1, Math.round(value)))
}
