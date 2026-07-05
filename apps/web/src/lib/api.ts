import type { Room } from '@art-lessons/shared'

// Same LAN dev server the Room socket connects to (see SERVER_PORT in
// pages/Room/index.tsx) — derived from window.location.hostname, not
// hardcoded 'localhost', so it works from other devices on the LAN.
const API_BASE = `http://${window.location.hostname}:4000`

/** Thrown by apiFetch on a non-ok response. Carries the parsed `{ error }`
 *  body's code (e.g. 'invalid_credentials') so callers can show a specific
 *  message instead of a generic failure. */
export class ApiError extends Error {
  status: number
  code: string | undefined

  constructor(status: number, code: string | undefined) {
    super(`request failed: ${status}${code ? ` (${code})` : ''}`)
    this.status = status
    this.code = code
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include', // ships the identity cookie (#41) cross-origin
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    const code = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : undefined
    throw new ApiError(res.status, code)
  }
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

export function register(email: string, password: string, name?: string): Promise<Me> {
  return apiFetch<Me>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  })
}

export function login(email: string, password: string): Promise<Me> {
  return apiFetch<Me>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function logout(): Promise<Me> {
  return apiFetch<Me>('/api/auth/logout', { method: 'POST' })
}

export interface MyRooms {
  owned: Room[]
  participated: Room[]
}

export function listMyRooms(): Promise<MyRooms> {
  return apiFetch<MyRooms>('/api/rooms/mine')
}

export function deleteRoom(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/rooms/${id}`, { method: 'DELETE' })
}
