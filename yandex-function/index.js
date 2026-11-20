// Cloud Function: Node.js, timeout 60 seconds, public invoker. The phone calls this URL.
const COMPLETION_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
const IMAGE_SYNC_URL = 'https://ai.api.cloud.yandex.net/v1/images/generations'
const IMAGE_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync'
const OPERATION_URL = 'https://llm.api.cloud.yandex.net/operations/'

module.exports.handler = async function (event) {
  const headers = cors(event)
  if (methodOf(event) === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  let request
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}')
    request = JSON.parse(raw || '{}')
  } catch {
    return json(headers, 400, { error: 'Нужен json' })
  }
  const apiKey = typeof request.apiKey === 'string' ? request.apiKey.trim() : ''
  const folderId = typeof request.folderId === 'string' ? request.folderId.trim() : ''
  if (!apiKey || !folderId) return json(headers, 400, { error: 'Нужны ключ и каталог Яндекса' })
  try {
    if (request.image === true) {
      const image = await draw(apiKey, folderId, String(request.prompt || ''))
      return json(headers, 200, { image })
    }
    const text = await complete(apiKey, folderId, request)
    return json(headers, 200, { text })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Яндекс не ответил'
    return json(headers, 502, { error: message })
  }
}

function cors(event) {
  const raw = event.headers || {}
  const origin = raw.origin || raw.Origin || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function methodOf(event) {
  return event.httpMethod || event.requestContext?.http?.method || 'POST'
}

function json(headers, statusCode, body) {
  return { statusCode, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }
}

async function complete(apiKey, folderId, request) {
  const model = typeof request.model === 'string' && request.model.trim() ? request.model.trim() : 'aliceai-llm'
  const response = await fetch(COMPLETION_URL, {
    method: 'POST',
    headers: auth(apiKey),
    body: JSON.stringify({
      modelUri: model.includes('://') ? model : `gpt://${folderId}/${model}`,
      completionOptions: {
        stream: false,
        temperature: Number(request.temperature) || 0.2,
        maxTokens: String(Math.min(8000, Number(request.maxTokens) || 2000)),
      },
      messages: [{ role: 'user', text: String(request.prompt || '') }],
    }),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(yandexMessage(response.status, body))
  const text = body?.result?.alternatives?.[0]?.message?.text
  if (typeof text !== 'string' || !text.trim()) throw new Error('Яндекс вернул пустой ответ')
  return text
}

async function draw(apiKey, folderId, prompt) {
  const text = prompt.slice(0, 500)
  const modelUri = `art://${folderId}/aliceai-image-art-3.0`
  try {
    return await drawSync(apiKey, modelUri, text)
  } catch (error) {
    if (error instanceof Error && /не подош|нет доступа/i.test(error.message)) throw error
    return drawAsync(apiKey, modelUri, text)
  }
}

async function drawSync(apiKey, modelUri, prompt) {
  const response = await fetch(IMAGE_SYNC_URL, {
    method: 'POST',
    headers: auth(apiKey),
    body: JSON.stringify({ model: modelUri, prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(yandexMessage(response.status, body, true))
  const image = body?.data?.[0]?.b64_json
  if (typeof image !== 'string' || !image) throw new Error('Яндекс не прислал картинку')
  return image
}

async function drawAsync(apiKey, modelUri, prompt) {
  const started = await fetch(IMAGE_URL, {
    method: 'POST',
    headers: auth(apiKey),
    body: JSON.stringify({
      modelUri,
      generationOptions: { aspectRatio: { widthRatio: '1', heightRatio: '1' } },
      messages: [{ weight: '1', text: prompt }],
    }),
  })
  const operation = await readJson(started)
  if (!started.ok) throw new Error(yandexMessage(started.status, operation, true))
  const id = operation.id
  if (!id) throw new Error('Яндекс не принял рисунок')
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(attempt === 0 ? 1500 : 2000)
    const response = await fetch(`${OPERATION_URL}${id}`, { headers: auth(apiKey) })
    const body = await readJson(response)
    if (!response.ok) throw new Error(yandexMessage(response.status, body, true))
    if (body.done) {
      const image = body.response?.image
      if (typeof image !== 'string' || !image) throw new Error('Яндекс не прислал картинку')
      return image
    }
  }
  throw new Error('Яндекс не успел нарисовать картинку')
}

function auth(apiKey) {
  return { Authorization: `Api-Key ${apiKey}`, 'Content-Type': 'application/json' }
}

async function readJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.slice(0, 300) }
  }
}

function yandexMessage(status, body, image = false) {
  const message = body?.error?.message || body?.message
  const detail = typeof message === 'string' && message.trim() ? message.trim().slice(0, 240) : ''
  if (status === 401) return 'Ключ Яндекса не подошёл'
  if (status === 403) {
    return image
      ? 'Нет доступа к рисункам. У ключа нужна область yc.ai.imageGeneration.execute, у сервисного аккаунта — роль ai.imageGeneration.user.'
      : detail || 'Ключ Яндекса не подошёл'
  }
  if (status === 429) return 'Яндекс занят или грант закончился'
  return detail || 'Яндекс не ответил'
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
