import type { Settings } from '../types'
import { shrinkDataUrl } from './image'

export class YandexError extends Error {}

let queue: Promise<void> = Promise.resolve()

function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.then(() => undefined, () => undefined)
  return run
}

export function modelUri(folderId: string, model: string): string {
  const name = model.trim()
  if (name.includes('://')) return name
  return `gpt://${folderId.trim()}/${name}`
}

export function hasYandex(settings: Settings): boolean {
  return Boolean(settings.yandexKey.trim() && settings.yandexFolder.trim() && settings.yandexFunction.trim())
}

export async function complete(prompt: string, settings: Settings, model: string, schema: object | null): Promise<string> {
  void schema
  const body = await oneAtATime(() => call(settings, { model, prompt, temperature: 0.2, maxTokens: 4000 }))
  if (!body.text?.trim()) throw new YandexError('Яндекс вернул пустой ответ')
  return body.text
}

export async function pingYandex(settings: Settings): Promise<void> {
  const text = await complete('Reply with exactly: ok', settings, settings.fastModel, null)
  if (!text.trim()) throw new YandexError('Яндекс вернул пустой ответ')
}

export async function drawYandex(prompt: string, settings: Settings): Promise<string> {
  const body = await oneAtATime(() => call(settings, { image: true, prompt, model: settings.fastModel }))
  if (!body.image) throw new YandexError('Яндекс не прислал картинку')
  return shrinkDataUrl(`data:image/jpeg;base64,${body.image}`)
}

async function call(settings: Settings, payload: { model: string; prompt: string; temperature?: number; maxTokens?: number; image?: boolean }): Promise<{ text?: string; image?: string }> {
  const url = settings.yandexFunction.trim()
  if (!hasYandex(settings)) throw new YandexError('В настройках нужны ключ Яндекса, каталог и адрес функции')
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        apiKey: settings.yandexKey.trim(),
        folderId: settings.yandexFolder.trim(),
        model: payload.model,
        prompt: payload.prompt,
        temperature: payload.temperature,
        maxTokens: payload.maxTokens,
        image: payload.image === true,
      }),
    })
  } catch {
    throw new YandexError('Функция Яндекса не ответила. Проверьте адрес в настройках.')
  }
  const text = await response.text()
  let body: { text?: unknown; image?: unknown; error?: unknown }
  try {
    body = JSON.parse(text) as { text?: unknown; image?: unknown; error?: unknown }
  } catch {
    throw new YandexError('Функция Яндекса вернула непонятный ответ')
  }
  if (!response.ok) {
    throw new YandexError(typeof body.error === 'string' && body.error.trim() ? body.error : 'Яндекс не ответил')
  }
  return {
    text: typeof body.text === 'string' ? body.text : '',
    image: typeof body.image === 'string' ? body.image : '',
  }
}
