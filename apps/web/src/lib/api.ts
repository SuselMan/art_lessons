// Same LAN dev server the Room socket connects to (see SERVER_PORT in
// pages/Room/index.tsx) — derived from window.location.hostname, not
// hardcoded 'localhost', so it works from other devices on the LAN.
const API_BASE = `http://${window.location.hostname}:4000`

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include', // ships the identity cookie (#41) cross-origin
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  return res.json()
}

export interface Me {
  userId: string
  email: string | null
  name: string | null
}

/** Warms up the identity cookie (#41) on first load — mints a guest User
 *  server-side if this browser has never visited before. Must resolve
 *  before the Room page opens its Socket.IO connection: a socket handshake
 *  can't itself set a cookie, so a cold visitor whose very first request is
 *  a socket connect would get a throwaway per-connection guest identity
 *  instead of a durable one (see resolveSocketIdentity's doc comment on the
 *  server). Call this once, high up the tree (e.g. on App mount). */
export function fetchMe(): Promise<Me> {
  return apiFetch<Me>('/api/me')
}
