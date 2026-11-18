interface KandinskyKeys {
  kandinskyKey: string
  kandinskySecret: string
}
import { shrinkDataUrl } from './image'

const API = 'https://api-key.fusionbrain.ai/'
const DRAWN_KEY = 'pocket.kandinskyDrawn'
const QUOTA_KEY = 'pocket.kandinskyQuota'

export class KandinskyError extends Error {}

/** The free FusionBrain cabinet is about 100 images a month. Stop calling it once it says so. */
export class KandinskyQuotaError extends KandinskyError {
  constructor() {
    super('Лимит Kandinsky на этот месяц закончился. Дальше для этих слов возьму фото.')
  }
}

export interface ArtistChoice {
  wantsDrawing: boolean
  hasKandinsky: boolean
  kandinskyBlocked: boolean
}

export type Artist = 'kandinsky' | 'photo'

/** Kandinsky draws abstract cards. Concrete words, a missing key, and a used-up month stay on photo search. */
export function artistFor(choice: ArtistChoice): Artist {
  if (choice.wantsDrawing && choice.hasKandinsky && !choice.kandinskyBlocked) return 'kandinsky'
  return 'photo'
}

export function hasKandinskyKeys(settings: KandinskyKeys): boolean {
  return Boolean(settings.kandinskyKey.trim() && settings.kandinskySecret.trim())
}

interface DrawnLog { month: string; count: number }

function monthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function kandinskyDrawnThisMonth(): DrawnLog {
  try {
    const log = JSON.parse(localStorage.getItem(DRAWN_KEY) || 'null') as DrawnLog | null
    if (log && log.month === monthKey() && Number.isFinite(log.count)) return { month: log.month, count: log.count }
  } catch {
    // fall through to an empty month
  }
  return { month: monthKey(), count: 0 }
}

function countKandinsky() {
  const log = kandinskyDrawnThisMonth()
  localStorage.setItem(DRAWN_KEY, JSON.stringify({ month: log.month, count: log.count + 1 }))
}

export function kandinskyQuotaHit(): boolean {
  return localStorage.getItem(QUOTA_KEY) === monthKey()
}

export function rememberKandinskyQuota() {
  localStorage.setItem(QUOTA_KEY, monthKey())
}

export function pipelineIdFrom(body: unknown): string {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: unknown[] }).data
      : []
  const ready = list.filter(isPipeline).find((item) => item.type === 'TEXT2IMAGE' && item.status !== 'DISABLED')
    ?? list.find(isPipeline)
  const id = ready ? pipelineId(ready) : ''
  if (!id) throw new KandinskyError('Kandinsky не показал доступную модель.')
  return id
}

export function imageFromStatus(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const data = body as {
    status?: unknown
    censored?: unknown
    files?: unknown
    result?: { files?: unknown; censored?: unknown }
  }
  if (data.status !== 'DONE') return null
  if (data.result?.censored === true || data.censored === true) throw new KandinskyError('Kandinsky отклонил этот запрос.')
  const files = Array.isArray(data.result?.files) ? data.result.files : Array.isArray(data.files) ? data.files : []
  const file = files.find((item) => typeof item === 'string' && item.trim())
  if (typeof file !== 'string') return null
  const raw = file.trim()
  return raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`
}

export function isQuotaResponse(status: number, body: string): boolean {
  if (status === 429) return true
  return /quota|limit exceeded|too many requests|превыш|лимит/i.test(body)
}

export async function pingKandinsky(settings: KandinskyKeys): Promise<string> {
  const response = await call(`${API}key/api/v1/pipelines`, { headers: authHeaders(settings) })
  const text = await response.text()
  if (!response.ok) throw httpError(response.status, text)
  pipelineIdFrom(parseJson(text))
  return 'Kandinsky отвечает'
}

export async function drawKandinsky(prompt: string, settings: KandinskyKeys): Promise<string> {
  return oneAtATime(() => drawNow(prompt, settings))
}

let queue: Promise<void> = Promise.resolve()

function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.then(() => undefined, () => undefined)
  return run
}

async function drawNow(prompt: string, settings: KandinskyKeys): Promise<string> {
  if (!hasKandinskyKeys(settings)) throw new KandinskyError('Нет ключей Kandinsky')
  const headers = authHeaders(settings)
  const listed = await call(`${API}key/api/v1/pipelines`, { headers })
  const listedText = await listed.text()
  if (!listed.ok) throw httpError(listed.status, listedText)
  const pipelineId = pipelineIdFrom(parseJson(listedText))
  const params = {
    type: 'GENERATE',
    numImages: 1,
    width: 768,
    height: 768,
    generateParams: {
      query: clip(`${prompt} Square scene, one clear idea. No text, no letters, no numbers, no watermark.`),
    },
  }
  const form = new FormData()
  form.append('pipeline_id', pipelineId)
  form.append('params', new Blob([JSON.stringify(params)], { type: 'application/json' }), 'params.json')
  const run = await call(`${API}key/api/v1/pipeline/run`, { method: 'POST', headers, body: form })
  const runText = await run.text()
  if (!run.ok) throw httpError(run.status, runText)
  const accepted = parseJson(runText)
  if (isBusy(accepted)) throw new KandinskyError('Kandinsky сейчас занят. Для этого слова возьму фото.')
  const uuid = taskId(accepted)
  if (!uuid) throw new KandinskyError('Kandinsky не принял задачу.')
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(attempt === 0 ? 3000 : 2000)
    const statusResponse = await call(`${API}key/api/v1/pipeline/status/${encodeURIComponent(uuid)}`, { headers })
    const statusText = await statusResponse.text()
    if (statusResponse.status === 404) throw new KandinskyError('Kandinsky потерял картинку.')
    if (!statusResponse.ok) throw httpError(statusResponse.status, statusText)
    const statusBody = parseJson(statusText)
    const status = typeof statusBody === 'object' && statusBody && 'status' in statusBody ? String(statusBody.status) : ''
    if (status === 'FAIL' || status === 'FAILED') throw new KandinskyError('Kandinsky не смог нарисовать это слово.')
    const image = imageFromStatus(statusBody)
    if (image) {
      countKandinsky()
      return shrinkDataUrl(image)
    }
  }
  throw new KandinskyError('Kandinsky не успел нарисовать картинку.')
}

async function call(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new KandinskyError('Браузер не дошёл до Kandinsky. Для этого слова возьму фото.')
  }
}

function authHeaders(settings: KandinskyKeys): HeadersInit {
  return {
    'X-Key': `Key ${settings.kandinskyKey.trim()}`,
    'X-Secret': `Secret ${settings.kandinskySecret.trim()}`,
  }
}

function httpError(status: number, body: string): Error {
  if (status === 401 || status === 403) return new KandinskyError('Ключи Kandinsky не подошли. Проверьте API-ключ и секрет в настройках.')
  if (isQuotaResponse(status, body)) return new KandinskyQuotaError()
  return new KandinskyError('Kandinsky не ответил. Для этого слова возьму фото.')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new KandinskyError('Kandinsky вернул непонятный ответ.')
  }
}

function isPipeline(value: unknown): value is { id?: unknown; uuid?: unknown; type?: unknown; status?: unknown } {
  return Boolean(value) && typeof value === 'object'
}

function pipelineId(item: { id?: unknown; uuid?: unknown }): string {
  if (typeof item.id === 'string' && item.id.trim()) return item.id.trim()
  if (typeof item.uuid === 'string' && item.uuid.trim()) return item.uuid.trim()
  return ''
}

function isBusy(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const status = (body as { pipeline_status?: unknown }).pipeline_status
  return typeof status === 'string' && status.length > 0 && status !== 'ACTIVE'
}

function taskId(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const uuid = (body as { uuid?: unknown }).uuid
  return typeof uuid === 'string' ? uuid.trim() : ''
}

function clip(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 900 ? text.slice(0, 900).trim() : text
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
