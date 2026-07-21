import type { Room, RoomFolder } from '@art-lessons/shared'

// Same-origin: the Vite dev server proxies /api to apps/server (see
// vite.config.ts) — needed because the dev server runs https (for
// AudioWorklet on LAN, #153) while the backend stays plain http, and a
// direct http:// request from an https:// page is blocked as mixed content
// regardless of CORS. Room/index.tsx's socket connection uses the same
// same-origin + proxy approach.
const API_BASE = ''

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
    // Only sent when there's a body — Fastify's JSON body parser rejects a
    // bodyless request (e.g. logout) whose Content-Type still claims JSON.
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
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

// (#211 epic, #215) Folder-scoped browsing — only the direct children of one
// level (folders + rooms), not the whole tree (see roomFolderRoutes.ts's own
// doc comment for the perf rationale). Omitted folderId = root level.
export interface RoomsAtFolder {
  folders: RoomFolder[]
  rooms: Room[]
}

export function listRoomsAt(folderId?: string): Promise<RoomsAtFolder> {
  const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
  return apiFetch<RoomsAtFolder>(`/api/rooms${qs}`)
}

export function createFolder(name: string, parentFolderId?: string): Promise<RoomFolder> {
  return apiFetch<RoomFolder>('/api/rooms/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentFolderId }),
  })
}

/** Files (or un-files, with `folderId: null`) a room into a folder for the
 *  caller. Shared primitive behind create-in-folder, the future "Move
 *  to..." menu action, and drag & drop. */
export function moveRoomToFolder(roomId: string, folderId: string | null): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/rooms/${roomId}/folder`, {
    method: 'PATCH',
    body: JSON.stringify({ folderId }),
  })
}

// (#211 epic, #218) Server-side, cross-folder — deliberately not filtered
// against a locally-loaded list, since folder browsing (#215) only ever
// holds one level's worth of rooms in memory. See roomRoutes.ts's own doc
// comment on the endpoint for the matching rationale.
export function searchRooms(q: string): Promise<{ rooms: Room[] }> {
  return apiFetch<{ rooms: Room[] }>(`/api/rooms/search?q=${encodeURIComponent(q)}`)
}
