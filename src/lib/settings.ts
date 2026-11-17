import type { Direction, ImageSource, Settings } from '../types'

const DIRECTIONS = new Set<Direction>(['cloze', 'reverse', 'mix'])
const IMAGE_SOURCES = new Set<ImageSource>(['smart', 'photo', 'gemini', 'off'])

const KEY = 'pocket.settings'

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  textModel: 'gemini-3.8-flash',
  fastModel: 'gemini-3.5-flash-lite',
  imageModel: 'gemini-3.1-flash-lite-image',
  dailyNewLimit: 8,
  imageSource: 'smart',
  direction: 'mix',
  dailyGoalMinutes: 15,
}

const RETIRED_MODELS: Record<string, string> = {
  'gemini-2.5-flash': DEFAULT_SETTINGS.textModel,
  'gemini-2.0-flash': DEFAULT_SETTINGS.textModel,
  'gemini-2.5-flash-lite': DEFAULT_SETTINGS.fastModel,
  'gemini-2.5-flash-image': DEFAULT_SETTINGS.imageModel,
  'gemini-3.1-flash-image': DEFAULT_SETTINGS.imageModel,
}

type StoredSettings = Partial<Settings> & { imagesOnImport?: boolean }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as StoredSettings
    const { imagesOnImport, ...rest } = parsed
    const next: Settings = {
      ...DEFAULT_SETTINGS,
      ...rest,
      textModel: currentModel(parsed.textModel, DEFAULT_SETTINGS.textModel),
      fastModel: currentModel(parsed.fastModel, DEFAULT_SETTINGS.fastModel),
      imageModel: currentModel(parsed.imageModel, DEFAULT_SETTINGS.imageModel),
      dailyNewLimit: clampLimit(parsed.dailyNewLimit ?? DEFAULT_SETTINGS.dailyNewLimit),
      // Older versions had an on/off switch for Gemini drawings, which the free tier no longer serves.
      imageSource: IMAGE_SOURCES.has(parsed.imageSource as ImageSource)
        ? (parsed.imageSource as ImageSource)
        : imagesOnImport === false ? 'off' : 'smart',
      direction: DIRECTIONS.has(parsed.direction as Direction) ? (parsed.direction as Direction) : DEFAULT_SETTINGS.direction,
      dailyGoalMinutes: clampGoal(parsed.dailyGoalMinutes ?? DEFAULT_SETTINGS.dailyGoalMinutes),
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
    textModel: currentModel(settings.textModel, DEFAULT_SETTINGS.textModel),
    fastModel: currentModel(settings.fastModel, DEFAULT_SETTINGS.fastModel),
    imageModel: currentModel(settings.imageModel, DEFAULT_SETTINGS.imageModel),
    dailyNewLimit: clampLimit(settings.dailyNewLimit),
    apiKey: settings.apiKey.trim(),
  }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function currentModel(model: string | undefined, fallback: string): string {
  const name = model?.trim()
  if (!name) return fallback
  return RETIRED_MODELS[name] ?? name
}

export function clampGoal(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.dailyGoalMinutes
  return Math.min(180, Math.max(1, Math.round(value)))
}

export function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.dailyNewLimit
  return Math.min(40, Math.max(1, Math.round(value)))
}
