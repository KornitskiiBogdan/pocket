import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.join(here, 'certs')
const HTTPS_PORT = 8443
const HTTP_PORT = 8787
const PFX_PASS = 'pocket-local'
const OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
const CA_URLS = [
  'https://gu-st.ru/content/Other/doc/russian_trusted_root_ca.cer',
  'https://gu-st.ru/content/Other/doc/russian_trusted_sub_ca.cer',
]

function lanAddresses() {
  const ips = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address)
    }
  }
  return [...new Set(ips)]
}

function ensureCert(ips) {
  fs.mkdirSync(certDir, { recursive: true })
  const names = ['localhost', '127.0.0.1', ...ips]
  const markerPath = path.join(certDir, 'ips.json')
  const pfx = path.join(certDir, 'server.pfx')
  const cer = path.join(certDir, 'ca.cer')
  const marker = JSON.stringify(names)
  if (fs.existsSync(pfx) && fs.existsSync(cer) && fs.existsSync(markerPath) && fs.readFileSync(markerPath, 'utf8') === marker) {
    return { pfx, cer, renewed: false }
  }
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-File', path.join(here, 'issue-cert.ps1'), '-Pfx', pfx, '-Cer', cer, '-Pass', PFX_PASS, '-Dns', names.join(',')],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Не удалось выпустить локальный сертификат')
  }
  fs.writeFileSync(markerPath, marker)
  return { pfx, cer, renewed: true }
}

function derToPem(bytes) {
  const text = bytes.toString('utf8')
  if (text.includes('BEGIN CERTIFICATE')) return text
  const body = Buffer.from(bytes).toString('base64').replace(/(.{64})/g, '$1\n')
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`
}

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve, reject)
        res.resume()
        return
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Сертификат Минцифры не скачался: ${res.statusCode}`))
          return
        }
        resolve(Buffer.concat(chunks))
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('Таймаут при скачивании сертификата Минцифры')))
  })
}

async function russianCas() {
  const file = path.join(certDir, 'russian-ca.pem')
  if (fs.existsSync(file)) return fs.readFileSync(file)
  const parts = []
  for (const url of CA_URLS) parts.push(derToPem(await download(url)))
  const pem = parts.join('\n')
  fs.writeFileSync(file, pem)
  return pem
}

function cors(req, res) {
  const origin = req.headers.origin
  res.setHeader('Access-Control-Allow-Origin', typeof origin === 'string' && origin ? origin : '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  res.setHeader('Vary', 'Origin')
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 16_384) {
        reject(new Error('Слишком большой запрос'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function basicAuthorization(key) {
  const trimmed = key.trim()
  if (/^basic\s+/i.test(trimmed)) return `Basic ${trimmed.replace(/^basic\s+/i, '')}`
  return `Basic ${trimmed}`
}

function exchange(key, ca) {
  const body = 'scope=GIGACHAT_API_PERS'
  return new Promise((resolve, reject) => {
    const req = https.request(OAUTH_URL, {
      method: 'POST',
      ca,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        RqUID: crypto.randomUUID(),
        Authorization: basicAuthorization(key),
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 20000,
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('Порт 9443 не ответил')))
    req.end(body)
  })
}

async function handleToken(req, res, ca) {
  let raw
  try {
    raw = await readBody(req)
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'Плохой запрос' })
    return
  }
  let key = ''
  try {
    const parsed = JSON.parse(raw)
    key = parsed && typeof parsed.key === 'string' ? parsed.key : ''
  } catch {
    sendJson(res, 400, { error: 'Нужен json с полем key' })
    return
  }
  if (!key.trim()) {
    sendJson(res, 400, { error: 'Нет ключа GigaChat' })
    return
  }
  let result
  try {
    result = await exchange(key, ca)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Порт 9443 не ответил'
    sendJson(res, 502, { error: `Ноутбук не открыл обмен токена: ${message}` })
    return
  }
  let body
  try {
    body = JSON.parse(result.text)
  } catch {
    sendJson(res, 502, { error: 'Сбер вернул непонятный ответ' })
    return
  }
  const token = body && typeof body.access_token === 'string' ? body.access_token : ''
  if (result.status < 200 || result.status >= 300 || !token) {
    const rejected = result.status === 401 || result.status === 403
    sendJson(res, rejected ? 401 : 502, {
      error: rejected ? 'Ключ GigaChat не подошёл' : 'Сбер не выдал токен',
    })
    return
  }
  sendJson(res, 200, { access_token: token, expires_at: body.expires_at ?? 0 })
}

function httpsHandler(ca, cer) {
  return (req, res) => {
    cors(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const url = req.url?.split('?')[0] ?? '/'
    if (req.method === 'GET' && url === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }
    if (req.method === 'GET' && url === '/ca.cer') {
      res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert' })
      res.end(fs.readFileSync(cer))
      return
    }
    if (req.method === 'POST' && url === '/token') {
      handleToken(req, res, ca).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: 'Сервер токена сломался' })
      })
      return
    }
    sendJson(res, 404, { error: 'Нет такого адреса' })
  }
}

function httpHandler(cer, ips) {
  const links = ips.map((ip) => `https://${ip}:${HTTPS_PORT}`).join(', ')
  return (req, res) => {
    const url = req.url?.split('?')[0] ?? '/'
    if (url === '/ca.cer') {
      res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert' })
      res.end(fs.readFileSync(cer))
      return
    }
    const page = `<!doctype html><meta charset="utf-8"><title>Сертификат Кармана</title><p>Скачайте <a href="/ca.cer">сертификат</a> и включите ему доверие на телефоне.</p><p>Потом в настройках приложения укажите ${links || 'адрес ноутбука'}.</p>`
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(page)
  }
}

const ips = lanAddresses()
const { pfx, cer, renewed } = ensureCert(ips)
const ca = await russianCas()
const secure = https.createServer({ pfx: fs.readFileSync(pfx), passphrase: PFX_PASS }, httpsHandler(ca, cer))
const plain = http.createServer(httpHandler(cer, ips))

await new Promise((resolve) => secure.listen(HTTPS_PORT, '0.0.0.0', resolve))
await new Promise((resolve) => plain.listen(HTTP_PORT, '0.0.0.0', resolve))

const shown = ips.length ? ips : ['127.0.0.1']
console.log(renewed ? 'Локальный сертификат выпущен и добавлен в доверенные на этом ноутбуке.' : 'Локальный сертификат уже есть.')
for (const ip of shown) {
  console.log(`Токен: https://${ip}:${HTTPS_PORT}`)
  console.log(`Сертификат для телефона: http://${ip}:${HTTP_PORT}/ca.cer`)
}
