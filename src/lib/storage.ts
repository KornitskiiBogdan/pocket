import type { DeckFile } from '../types'

const BACKUP_KEY = 'pocket.backup'
export const BACKUP_STALE_DAYS = 7

export interface StorageStatus {
  persisted: boolean | null
  usage: number | null
  quota: number | null
}

/** Asks the browser not to evict our data under storage pressure. Installed PWAs usually get it silently. */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => null) : null
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null
  return { persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null }
}

export function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia('(display-mode: standalone)').matches || standalone === true
}

export function lastBackup(): number | null {
  const value = Number(localStorage.getItem(BACKUP_KEY))
  return Number.isFinite(value) && value > 0 ? value : null
}

export function backupIsStale(now = Date.now()): boolean {
  const last = lastBackup()
  return last === null || now - last > BACKUP_STALE_DAYS * 24 * 60 * 60 * 1000
}

/**
 * On phones the share sheet lets the file land in Files, Google Drive or Telegram;
 * elsewhere it falls back to a plain download. Resolves false when the user cancels.
 */
export async function saveBackup(deck: DeckFile): Promise<boolean> {
  const name = `pocket-${new Date().toISOString().slice(0, 10)}.json`
  const file = new File([JSON.stringify(deck)], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Карман: копия колоды' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false
      download(file)
    }
  } else {
    download(file)
  }
  localStorage.setItem(BACKUP_KEY, String(Date.now()))
  return true
}

function download(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} ГБ`
}
