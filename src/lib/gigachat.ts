import type { Settings } from '../types'

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

export async function complete(prompt: string, settings: Settings, model: string, schema: object | null): Promise<string> {
  return oneAtATime(() => completeNow(prompt, settings, model, schema))
}

export async function pingGigaChat(settings: Settings): Promise<void> {
  const text = await complete('Reply with exactly: ok', settings, modelOf(settings, 'fast'), null)
  if (!text.trim()) throw new GigaChatError('GigaChat вернул пустой ответ')
}

async function completeNow(prompt: string, settings: Settings, model: string, schema: object | null): Promise<string> {
  const token = await accessToken(settings.gigachatKey)
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
    const fresh = await accessToken(settings.gigachatKey, true)
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

async function accessToken(key: string, force = false): Promise<string> {
  const direct = directAccessToken(key)
  if (direct) return direct
  const auth = basicAuthorization(key)
  if (!auth.replace(/^Basic\s+/i, '').trim()) throw new GigaChatError('Нет ключа GigaChat')
  const now = Date.now()
  if (!force && cached && cached.key === auth && cached.expiresAt - 60_000 > now) return cached.token
  let response: Response
  try {
    response = await fetch(OAUTH_URL, {
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
    throw unreachable()
  }
  const text = await response.text()
  if (!response.ok) throw httpError(response.status, false)
  const body = parseJson(text)
  const token = body && typeof body === 'object' ? (body as { access_token?: unknown }).access_token : ''
  if (typeof token !== 'string' || !token.trim()) throw new GigaChatError('GigaChat не выдал доступ')
  const expiresAt = expiryMs(body && typeof body === 'object' ? (body as { expires_at?: unknown }).expires_at : 0)
  cached = { key: auth, token, expiresAt }
  return token
}

function modelOf(settings: Settings, tier: 'smart' | 'fast'): string {
  return tier === 'fast' ? settings.fastModel : settings.textModel
}

function unreachable(): GigaChatError {
  return new GigaChatError('Браузер не открыл обмен ключа на порту 9443. Короткий токен получить не удалось.')
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
