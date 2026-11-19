import type { Settings } from '../types'
import { shrinkDataUrl } from './image'

const FILES_URL = 'https://api.giga.chat/v1/files/'

const OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
const CHAT_URL = 'https://api.giga.chat/v1/chat/completions'

export class GigaChatError extends Error {
  constructor(message: string, readonly schema = false) {
    super(message)
  }
}

/** Personal accounts answer one request at a time. Overlapping calls get rejected. */
let queue: Promise<void> = Promise.resolve()

function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.then(() => undefined, () => undefined)
  return run
}

let cached: { key: string; token: string; expiresAt: number } | null = null

export function basicAuthorization(key: string): string {
  const trimmed = key.trim()
  if (/^basic\s+/i.test(trimmed)) return `Basic ${trimmed.replace(/^basic\s+/i, '')}`
  return `Basic ${trimmed}`
}

/** An access token from the cabinet starts with eyJ. The browser can send it directly and skip port 9443. */
export function directAccessToken(key: string): string | null {
  const raw = key.trim().replace(/^(bearer|basic)\s+/i, '')
  return raw.startsWith('eyJ') ? raw : null
}

export function expiryMs(value: unknown, now = Date.now()): number {
  const stamp = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(stamp) || stamp <= 0) return now + 25 * 60_000
  return stamp > 1e12 ? stamp : stamp * 1000
}

export function contentFrom(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return ''
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content
  return typeof content === 'string' ? content : ''
}

/** The file id sits in `<img src="uuid" fuse="true"/>` inside the model reply. */
export function imageIdFrom(content: string): string | null {
  const match = /<img\b[^>]*\bsrc=["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/i.exec(content)
  return match ? match[1] : null
}

export async function drawGigaChat(prompt: string, settings: Settings): Promise<string> {
  return oneAtATime(() => drawNow(prompt, settings))
}

export async function complete(prompt: string, settings: Settings, model: string, schema: object | null): Promise<string> {
  return oneAtATime(() => completeNow(prompt, settings, model, schema))
}

export async function pingGigaChat(settings: Settings): Promise<void> {
  const text = await complete('Reply with exactly: ok', settings, modelOf(settings, 'fast'), null)
  if (!text.trim()) throw new GigaChatError('GigaChat вернул пустой ответ')
}

async function completeNow(prompt: string, settings: Settings, model: string, schema: object | null): Promise<string> {
  const token = await accessToken(settings.gigachatKey, settings.tokenProxy)
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    temperature: 0.2,
  }
  if (schema) body.response_format = { type: 'json_schema', schema, strict: true }
  let response: Response
  try {
    response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw unreachable()
  }
  if (response.status === 401) {
    cached = null
    const fresh = await accessToken(settings.gigachatKey, settings.tokenProxy, true)
    try {
      response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fresh}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch {
      throw unreachable()
    }
  }
  const text = await response.text()
  if (!response.ok) throw httpError(response.status, schema !== null)
  const content = contentFrom(parseJson(text))
  if (!content.trim()) throw new GigaChatError('GigaChat вернул пустой ответ')
  return content
}

/** The laptop server exchanges the long key. Empty means the page calls Sber itself. */
export function proxyTokenUrl(proxy: string): string | null {
  let trimmed = proxy.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) trimmed = `https://${trimmed}`
  return `${trimmed}/token`
}

async function accessToken(key: string, proxy: string, force = false): Promise<string> {
  const direct = directAccessToken(key)
  if (direct) return direct
  const auth = basicAuthorization(key)
  if (!auth.replace(/^Basic\s+/i, '').trim()) throw new GigaChatError('Нет ключа GigaChat')
  const now = Date.now()
  if (!force && cached && cached.key === auth && cached.expiresAt - 60_000 > now) return cached.token
  const proxyUrl = proxyTokenUrl(proxy)
  let response: Response
  try {
    response = proxyUrl
      ? await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ key: key.trim() }),
        })
      : await fetch(OAUTH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            RqUID: crypto.randomUUID(),
            Authorization: auth,
          },
          body: 'scope=GIGACHAT_API_PERS',
        })
  } catch {
    throw proxyUrl ? proxyUnreachable() : unreachable()
  }
  const text = await response.text()
  if (!response.ok) throw proxyUrl ? proxyError(text, response.status) : httpError(response.status, false)
  const body = parseJson(text)
  const token = body && typeof body === 'object' ? (body as { access_token?: unknown }).access_token : ''
  if (typeof token !== 'string' || !token.trim()) throw new GigaChatError('GigaChat не выдал доступ')
  const expiresAt = expiryMs(body && typeof body === 'object' ? (body as { expires_at?: unknown }).expires_at : 0)
  cached = { key: auth, token, expiresAt }
  return token
}

async function drawNow(prompt: string, settings: Settings): Promise<string> {
  const clipped = prompt.replace(/\s+/g, ' ').trim().slice(0, 900)
  const body = {
    model: modelOf(settings, 'smart'),
    messages: [
      { role: 'system', content: 'Ты рисуешь одну простую учебную картинку. На картинке не должно быть букв и надписей.' },
      { role: 'user', content: `Нарисуй: ${clipped}` },
    ],
    function_call: 'auto',
    stream: false,
    temperature: 0.4,
  }
  const text = await postChat(settings, body)
  const id = imageIdFrom(text)
  if (!id) throw new GigaChatError('GigaChat не прислал картинку')
  const bytes = await downloadFile(settings, id)
  return shrinkDataUrl(bytesToDataUrl(bytes))
}

async function postChat(settings: Settings, body: Record<string, unknown>): Promise<string> {
  let token = await accessToken(settings.gigachatKey, settings.tokenProxy)
  let response = await sendChat(token, body)
  if (response.status === 401) {
    cached = null
    token = await accessToken(settings.gigachatKey, settings.tokenProxy, true)
    response = await sendChat(token, body)
  }
  const text = await response.text()
  if (!response.ok) throw httpError(response.status, false)
  const content = contentFrom(parseJson(text))
  if (!content.trim()) throw new GigaChatError('GigaChat вернул пустой ответ')
  return content
}

async function sendChat(token: string, body: Record<string, unknown>): Promise<Response> {
  try {
    return await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw unreachable()
  }
}

async function downloadFile(settings: Settings, id: string): Promise<Uint8Array> {
  let token = await accessToken(settings.gigachatKey, settings.tokenProxy)
  let response = await fetchFile(token, id)
  if (response.status === 401) {
    cached = null
    token = await accessToken(settings.gigachatKey, settings.tokenProxy, true)
    response = await fetchFile(token, id)
  }
  if (!response.ok) throw httpError(response.status, false)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length) throw new GigaChatError('GigaChat не прислал картинку')
  return bytes
}

async function fetchFile(token: string, id: string): Promise<Response> {
  try {
    return await fetch(`${FILES_URL}${id}/content`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'image/jpeg' },
    })
  } catch {
    throw new GigaChatError('Браузер не скачал картинку GigaChat')
  }
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = ''
  const size = 0x8000
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size))
  }
  return `data:image/jpeg;base64,${btoa(binary)}`
}

function modelOf(settings: Settings, tier: 'smart' | 'fast'): string {
  return tier === 'fast' ? settings.fastModel : settings.textModel
}

function unreachable(): GigaChatError {
  return new GigaChatError('Браузер не открыл обмен ключа на порту 9443. Короткий токен получить не удалось.')
}

function proxyUnreachable(): GigaChatError {
  return new GigaChatError('Сервер токена на ноутбуке не ответил. Он должен быть запущен, а телефон — в той же сети Wi-Fi.')
}

function proxyError(text: string, status: number): GigaChatError {
  const body = (() => {
    try {
      return JSON.parse(text) as { error?: unknown }
    } catch {
      return null
    }
  })()
  if (body && typeof body.error === 'string' && body.error.trim()) return new GigaChatError(body.error)
  return httpError(status, false)
}

function httpError(status: number, schema: boolean): GigaChatError {
  if (status === 401 || status === 403) return new GigaChatError('Ключ GigaChat не подошёл. В настройках нужен Authorization key из кабинета Studio.')
  if (schema && status === 400) return new GigaChatError('GigaChat не принял json', true)
  if (status === 429) return new GigaChatError('GigaChat занят или бесплатные токены на эту модель закончились.')
  return new GigaChatError('GigaChat не ответил. Попробуйте ещё раз.')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new GigaChatError('GigaChat вернул непонятный ответ')
  }
}
