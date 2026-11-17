import { shrinkDataUrl } from './image'

export interface PhotoHit {
  thumb: string
  credit: string
}

const LICENCES: Record<string, string> = {
  by: 'CC BY',
  'by-sa': 'CC BY-SA',
  'by-nd': 'CC BY-ND',
  'by-nc': 'CC BY-NC',
  'by-nc-sa': 'CC BY-NC-SA',
  'by-nc-nd': 'CC BY-NC-ND',
  cc0: 'CC0',
  pdm: 'Public domain',
}

/** Openverse first (everyday Flickr photos), Wikimedia Commons when it has nothing. Both allow browser requests without a key. */
export async function searchPhotos(query: string, count = 6): Promise<PhotoHit[]> {
  const q = query.trim()
  if (!q) return []
  const fromOpenverse = await openverse(q, count).catch(() => [])
  if (fromOpenverse.length) return fromOpenverse
  return wikimedia(q, count).catch(() => [])
}

export async function fetchPhoto(hit: PhotoHit): Promise<string> {
  const response = await fetch(hit.thumb)
  if (!response.ok) throw new Error('Фото не загрузилось')
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('Это не картинка')
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Фото не прочиталось')))
    reader.onerror = () => reject(new Error('Фото не прочиталось'))
    reader.readAsDataURL(blob)
  })
  return shrinkDataUrl(url)
}

/** Picks the first hit that actually downloads. */
export async function findPhoto(query: string): Promise<{ image: string; credit: string } | null> {
  for (const hit of await searchPhotos(query, 4)) {
    try {
      return { image: await fetchPhoto(hit), credit: hit.credit }
    } catch {
      // try the next hit
    }
  }
  return null
}

async function openverse(query: string, count: number): Promise<PhotoHit[]> {
  const params = new URLSearchParams({ q: query, page_size: String(count), mature: 'false', aspect_ratio: 'square,wide' })
  const response = await fetch(`https://api.openverse.org/v1/images/?${params}`)
  if (!response.ok) return []
  const data = (await response.json()) as { results?: { thumbnail?: string; creator?: string; license?: string }[] }
  return (data.results ?? [])
    .filter((item) => item.thumbnail)
    .map((item) => ({
      thumb: item.thumbnail as string,
      credit: [item.creator?.trim(), LICENCES[item.license ?? ''] ?? item.license?.toUpperCase()].filter(Boolean).join(' · '),
    }))
}

async function wikimedia(query: string, count: number): Promise<PhotoHit[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: String(count),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '640',
  })
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
  if (!response.ok) return []
  const data = (await response.json()) as {
    query?: { pages?: Record<string, { index?: number; imageinfo?: { thumburl?: string; extmetadata?: Record<string, { value?: string }> }[] }> }
  }
  return Object.values(data.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((page) => page.imageinfo?.[0])
    .filter((info) => info?.thumburl)
    .map((info) => {
      const meta = info?.extmetadata ?? {}
      const artist = stripTags(meta.Artist?.value ?? '')
      const licence = stripTags(meta.LicenseShortName?.value ?? '')
      return { thumb: info?.thumburl as string, credit: [artist, licence, 'Wikimedia'].filter(Boolean).join(' · ') }
    })
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}
