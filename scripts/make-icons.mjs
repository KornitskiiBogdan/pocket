import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const table = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  table[n] = c
}

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size)
      const i = row + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const idat = zlib.deflateSync(raw)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function paint(x, y, size) {
  const bg = [20, 63, 54, 255]
  const card = [247, 243, 234, 255]
  const line = [14, 107, 82, 255]
  const margin = size * 0.16
  const left = size * 0.28
  const top = size * 0.22
  const right = size * 0.78
  const bottom = size * 0.78
  const radius = size * 0.06
  if (x < margin || y < margin || x >= size - margin || y >= size - margin) return bg
  if (x < left || y < top || x >= right || y >= bottom) return bg
  const dx = x < left + radius ? left + radius - x : x > right - radius ? x - (right - radius) : 0
  const dy = y < top + radius ? top + radius - y : y > bottom - radius ? y - (bottom - radius) : 0
  if (dx || dy) {
    if (dx * dx + dy * dy > radius * radius) return bg
  }
  const lineTop = size * 0.56
  const lineBottom = size * 0.62
  const lineLeft = size * 0.36
  const lineRight = size * 0.7
  if (x >= lineLeft && x < lineRight && y >= lineTop && y < lineBottom) return line
  return card
}

const dir = path.resolve('public')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'icon-192.png'), png(192, paint))
fs.writeFileSync(path.join(dir, 'icon-512.png'), png(512, paint))
