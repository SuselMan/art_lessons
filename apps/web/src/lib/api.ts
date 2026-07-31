import type { Room, RoomAccessInfo, RoomAccessMode, RoomFolder, RoomInvite } from '@grafetto/shared'

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
  /** Set by the endpoints that answer "not now" rather than "no" — currently
   *  the sign-in code cooldown (#316), where the wait is the whole message. */
  retryAfterSeconds: number | undefined

  constructor(status: number, code: string | undefined, retryAfterSeconds?: number) {
    super(`request failed: ${status}${code ? ` (${code})` : ''}`)
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
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
    const retryAfter = body && typeof body === 'object' && 'retryAfterSeconds' in body
      && typeof body.retryAfterSeconds === 'number'
      ? body.retryAfterSeconds
      : undefined
    throw new ApiError(res.status, code, retryAfter)
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

export interface RequestedLoginCode {
  /** Four characters also printed in the email, so the person can see the
   *  mail belongs to the page in front of them (#316). */
  confirmation: string
  expiresAt: string
  /** Only ever present in local development with no mail provider configured
   *  (#353) — the server refuses to include it otherwise. Its presence is the
   *  signal that no mail was sent and the code has nowhere else to be read. */
  devCode?: string
}

/** Step one of signing in: mail a one-time code to `email`. There is no
 *  separate registration — an address without an account gets one when the
 *  code comes back (see authRoutes.ts).
 *
 *  `locale` picks the language of the mail. It travels per-request because
 *  the server has no dictionaries: #208 keeps translation on the client, and
 *  this one message is the exception that has no client to translate it. */
export function requestLoginCode(email: string, locale: string): Promise<RequestedLoginCode> {
  return apiFetch<RequestedLoginCode>('/api/auth/code/request', {
    method: 'POST',
    body: JSON.stringify({ email, locale }),
  })
}

/** Step two. Only works in the browser that asked for the code: the request
 *  set a short-lived nonce cookie that this call is checked against. */
export function verifyLoginCode(email: string, code: string): Promise<Me> {
  return apiFetch<Me>('/api/auth/code/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
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

// (#211 epic, #216) Non-owner's own exit — drops only the caller's
// RoomParticipant row, unlike deleteRoom above (owner-only, removes the
// room for everyone).
export function leaveRoom(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/rooms/${id}/participation`, { method: 'DELETE' })
}

export function renameRoom(id: string, name: string): Promise<Room> {
  return apiFetch<Room>(`/api/rooms/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

// (#222) Owner-only toggle of "closed for editing". Returns the updated room
// so the caller can reflect the new `closedAt` without a refetch; anyone
// currently inside the room hears about it over the socket instead
// (`room_closed_changed`).
export function setRoomClosed(id: string, closed: boolean): Promise<Room> {
  return apiFetch<Room>(`/api/rooms/${id}/closed`, { method: 'PATCH', body: JSON.stringify({ closed }) })
}

// (#317) Copies a room's content into a new room owned by the caller — the
// mechanism homework runs on (#314 §4). The name is passed from here rather
// than composed server-side because server responses stay untranslated
// (#208), and "Still life — copy" has to be in the reader's own language.
export function forkRoom(id: string, name?: string): Promise<{ room: Room }> {
  return apiFetch<{ room: Room }>(`/api/rooms/${id}/fork`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

// ── Access control (#224–#227 server side, #228 the UI) ───────────────────
//
// All owner-only; the server answers 403 to anyone else (roomAccessRoutes.ts),
// so the UI hides these controls from non-owners as courtesy, not as the
// enforcement.

/** Everything the access panel renders, in one request — mode, password
 *  state, allow-list, waiting queue, and everyone who has ever been in the
 *  room. */
export function getRoomAccess(roomId: string): Promise<RoomAccessInfo> {
  return apiFetch<RoomAccessInfo>(`/api/rooms/${roomId}/access`)
}

/** Changes the mode, the password, or both — the two are independent, and
 *  omitting one leaves it alone. `password: null` removes it; the server
 *  rejects an empty string rather than reading it as removal. */
export function setRoomAccess(
  roomId: string, changes: { accessMode?: RoomAccessMode; password?: string | null },
): Promise<{ accessMode: RoomAccessMode; hasPassword: boolean }> {
  return apiFetch(`/api/rooms/${roomId}/access`, { method: 'PATCH', body: JSON.stringify(changes) })
}

/** Adds an address to the allow-list. Normalized server-side, so what comes
 *  back is what to render — not what was typed. */
export function addRoomInvite(roomId: string, email: string): Promise<RoomInvite> {
  return apiFetch<RoomInvite>(`/api/rooms/${roomId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function removeRoomInvite(roomId: string, email: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/rooms/${roomId}/invites/${encodeURIComponent(email)}`, { method: 'DELETE' })
}

/** Answers someone waiting in the queue. The person hears it live over the
 *  socket if they still have the join screen open (`join_request_resolved`,
 *  #227) — this call's own response only confirms the write. */
export function resolveJoinRequest(
  roomId: string, requestId: string, approved: boolean,
): Promise<{ ok: true; status: string }> {
  const action = approved ? 'approve' : 'deny'
  return apiFetch(`/api/rooms/${roomId}/join-requests/${requestId}/${action}`, { method: 'POST' })
}

/** Removes someone from the room for good: writes the block the join gate
 *  checks first, drops their invite and any approval, and — if they are in
 *  the room at this moment — takes them out of it (#227). */
export function kickFromRoom(roomId: string, userId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/rooms/${roomId}/kick`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

/** Undoes a kick. Gives back the right to enter for someone who had been in
 *  the room before, and the right to ask again for someone who never got past
 *  the queue — see roomAccessRoutes.ts for why those differ. */
export function unblockFromRoom(roomId: string, userId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/rooms/${roomId}/blocks/${userId}`, { method: 'DELETE' })
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
 *  caller. Shared primitive behind create-in-folder, the "Move to..." menu
 *  action (#216), and the future drag & drop (#217). */
export function moveRoomToFolder(roomId: string, folderId: string | null): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/rooms/${roomId}/folder`, {
    method: 'PATCH',
    body: JSON.stringify({ folderId }),
  })
}

export function renameFolder(id: string, name: string): Promise<RoomFolder> {
  return apiFetch<RoomFolder>(`/api/rooms/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

/** Reparents a folder — server rejects (400 `cycle`) moving it into its own
 *  descendant (#212's `isDescendantOf` guard). `parentFolderId: null` moves
 *  it to root. */
export function moveFolder(id: string, parentFolderId: string | null): Promise<RoomFolder> {
  return apiFetch<RoomFolder>(`/api/rooms/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ parentFolderId }),
  })
}

/** 409 (`not_empty`) if the folder still has any direct child room or
 *  subfolder — folders only delete empty (#212). */
export function deleteFolder(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/rooms/folders/${id}`, { method: 'DELETE' })
}

// (#211 epic, #218) Server-side, cross-folder — deliberately not filtered
// against a locally-loaded list, since folder browsing (#215) only ever
// holds one level's worth of rooms in memory. See roomRoutes.ts's own doc
// comment on the endpoint for the matching rationale.
export function searchRooms(q: string): Promise<{ rooms: Room[] }> {
  return apiFetch<{ rooms: Room[] }>(`/api/rooms/search?q=${encodeURIComponent(q)}`)
}
