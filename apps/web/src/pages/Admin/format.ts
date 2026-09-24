// (#588) Formatting for the admin tables. English only, like every other
// internal panel (ADR 006), so plain Intl rather than the i18n layer.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "5 min ago", "3 h ago", "12 d ago" — the admin reads recency, not dates. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return '—'
  const ms = now - new Date(iso).getTime()
  if (ms < MINUTE) return 'just now'
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`
  return `${Math.floor(ms / DAY)} d ago`
}

export function date(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

export function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}
