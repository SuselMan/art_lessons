// Lightweight in-memory ring buffer + console mirror, for on-device
// debugging when there's no attached inspector (Android field reports) — see
// the debug stack's "copy logs" button (Room/index.tsx). Deliberately not a
// full console.* monkey-patch: only call sites that explicitly opt in via
// diagLog() are captured, keeping this predictable and low-noise.
const MAX_ENTRIES = 2000
const buffer: string[] = []

function formatArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return `${a.name}: ${a.message}`
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

export function diagLog(...args: unknown[]): void {
  const line = `[${new Date().toISOString().slice(11, 23)}] ${args.map(formatArg).join(' ')}`
  buffer.push(line)
  if (buffer.length > MAX_ENTRIES) buffer.shift()
  // eslint-disable-next-line no-console
  console.log('[diag]', ...args)
}

export function getDiagLogs(): string {
  return buffer.join('\n')
}

export function clearDiagLogs(): void {
  buffer.length = 0
}
