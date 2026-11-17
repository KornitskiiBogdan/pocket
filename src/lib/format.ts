export function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`
}

export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes))
  if (rounded < 55) return `${rounded} мин`
  const hours = Math.round(rounded / 60)
  if (hours < 20) return `${hours} ч`
  const days = Math.max(1, Math.round(rounded / (60 * 24)))
  return `${days} ${plural(days, 'день', 'дня', 'дней')}`
}

export function formatDue(due: number, now: number): string {
  const diffMin = Math.round((due - now) / 60_000)
  if (Math.abs(diffMin) <= 1) return 'сейчас'
  const text = formatMinutes(Math.abs(diffMin))
  return diffMin > 0 ? `через ${text}` : `${text} назад`
}
