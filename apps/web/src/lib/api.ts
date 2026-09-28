import {
  fillRoutePath, splitRouteKey, type ApiRouteKey, type Me, type MyRooms, type RequestedLoginCode, type Room,
  type RoomAccessInfo, type RoomAccessSettings, type RoomFolder, type RoomInvite, type RoomsAtFolder, type BoardSummary,
  type BoardUpdate, type ForkScope, type RoomAccessMode, type RouteBody, type RouteHasNoContent, type RouteParams,
  type RouteQuery, type RouteResponse,
} from '@grafetto/shared'

import { BANNED_ERROR_CODE, noteBanned } from './banned'

// Same-origin: the Vite dev server proxies /api to apps/server (see
// vite.config.ts) — needed because the dev server runs https (for
// AudioWorklet on LAN, #153) while the backend stays plain http, and a
// direct http:// request from an https:// page is blocked as mixed content
// regardless of CORS. Room/index.tsx's socket connection uses the same
// same-origin + proxy approach.
const API_BASE = ''

/** Thrown by api() on a non-ok response. Carries the parsed `{ error }`
 *  body's code (e.g. 'invalid_credentials') so callers can show a specific
 *  message instead of a generic failure. */
export class ApiError extends Error {
  status: number
  code: string | undefined
  /** Set by the endpoints that answer "not now" rather than "no" — currently
   *  the sign-in code cooldown (#316), where the wait is the whole message. */
  retryAfterSeconds: number | undefined
  /** (#627) The error body as the server sent it, for the few routes that say
   *  more than a code — a refused snapshot names the layers it would have
   *  erased. Untyped on purpose: read it with a check. */
  body: unknown

  constructor(status: number, code: string | undefined, retryAfterSeconds?: number, body?: unknown) {
    super(`request failed: ${status}${code ? ` (${code})` : ''}`)
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
    this.body = body
  }
}

/** What any route's arguments look like once the route is known — the shape
 *  the typed wrappers below hand to the one untyped function that sends. */
interface AnyArgs {
  params?: Readonly<Record<string, string | number>>
  query?: Readonly<Record<string, string | number | undefined>>
  body?: unknown
}

// (#623) Every call goes through the shared route table: the key names the
// route exactly as the server registers it, and the params, query, body and
// response all come from there — so a field the server renames breaks the
// typecheck here instead of a screen. A part the route does not declare
// cannot be passed; one it requires cannot be left out.
type Part<Name extends string, T> = T extends undefined ? { [P in Name]?: never }
  : object extends T ? { [P in Name]?: T } : { [P in Name]: T }

// Intersected with AnyArgs, which for any concrete route is already implied —
// it is there so the wrappers can hand the arguments on to send() without a
// cast while K is still generic.
export type ApiArgs<K extends ApiRouteKey> =
  & Part<'params', RouteParams<K>> & Part<'query', RouteQuery<K>> & Part<'body', RouteBody<K>> & AnyArgs

type ArgList<K extends ApiRouteKey> = object extends ApiArgs<K> ? [args?: ApiArgs<K>] : [args: ApiArgs<K>]

/** A route's success body, and `null` for one that may answer 204. */
export type ApiResult<K extends ApiRouteKey> =
  RouteResponse<K> | (RouteHasNoContent<K> extends true ? null : never)

function urlOf(key: ApiRouteKey, args: AnyArgs | undefined): string {
  const [, template] = splitRouteKey(key)
  return `${API_BASE}${fillRoutePath(template, args?.params, args?.query)}`
}

async function send(key: ApiRouteKey, args: AnyArgs | undefined, init: RequestInit | undefined): Promise<Response> {
  const [method] = splitRouteKey(key)
  const body = args?.body
  const res = await fetch(urlOf(key, args), {
    method,
    credentials: 'include', // ships the identity cookie (#41) cross-origin
    // Only sent when there's a body — Fastify's JSON body parser rejects a
    // bodyless request (e.g. logout) whose Content-Type still claims JSON.
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
    ...init,
  })
  if (!res.ok) {
    const errorBody: unknown = await res.json().catch(() => null)
    const code = errorBody && typeof errorBody === 'object' && 'error' in errorBody
      && typeof errorBody.error === 'string'
      ? errorBody.error
      : undefined
    const retryAfter = errorBody && typeof errorBody === 'object' && 'retryAfterSeconds' in errorBody
      && typeof errorBody.retryAfterSeconds === 'number'
      ? errorBody.retryAfterSeconds
      : undefined
    // (#587) Whichever request hears it first tells the whole app — see
    // lib/banned.ts.
    if (res.status === 403 && code === BANNED_ERROR_CODE) noteBanned()
    throw new ApiError(res.status, code, retryAfter, errorBody)
  }
  return res
}

/** The URL of route K — for the binary ones (images, snapshot blobs) that are
 *  loaded by URL rather than parsed, and for `<img src>`. */
export function apiPath<K extends ApiRouteKey>(key: K, ...[args]: ArgList<K>): string {
  return urlOf(key, args)
}

/** The raw response of route K, after the error handling every call shares —
 *  for a caller that reads the body as bytes. */
export function apiResponse<K extends ApiRouteKey>(
  key: K, args: ApiArgs<K>, init?: RequestInit,
): Promise<Response> {
  return send(key, args, init)
}

/** Calls route K and returns its body, typed by the route table. */
export async function api<K extends ApiRouteKey>(key: K, ...[args]: ArgList<K>): Promise<ApiResult<K>> {
  const res = await send(key, args, undefined)
  const parsed: unknown = res.status === 204 ? null : await res.json()
  // The one place a response is taken on trust, and the reason it can be:
  // the server's side of the same table (apps/server/src/http/apiRoute.ts) is what
  // makes this claim true, and no caller writes a type of its own any more.
  return parsed as ApiResult<K>
}

/** Warms up the identity cookie (#41) on first load — mints a guest User
 *  server-side if this browser has never visited before. Must resolve
 *  before the Room page opens its Socket.IO connection: a socket handshake
 *  can't itself set a cookie, so a cold visitor whose very first request is
 *  a socket connect would get a throwaway per-connection guest identity
 *  instead of a durable one (see resolveSocketIdentity's doc comment on the
 *  server). Call this once, high up the tree (e.g. on App mount). */
export function fetchMe(): Promise<Me> {
  return api('GET /api/me')
}


/** Step one of signing in: mail a one-time code to `email`. There is no
 *  separate registration — an address without an account gets one when the
 *  code comes back (see authRoutes.ts).
 *
 *  `locale` picks the language of the mail. It travels per-request because
 *  the server has no dictionaries: #208 keeps translation on the client, and
 *  this one message is the exception that has no client to translate it. */
export function requestLoginCode(email: string, locale: string): Promise<RequestedLoginCode> {
  return api('POST /api/auth/code/request', { body: { email, locale } })
}

/** Step two. Only works in the browser that asked for the code: the request
 *  set a short-lived nonce cookie that this call is checked against. */
export function verifyLoginCode(email: string, code: string): Promise<Me> {
  return api('POST /api/auth/code/verify', { body: { email, code } })
}

export function logout(): Promise<Me> {
  return api('POST /api/auth/logout')
}


export function listMyRooms(): Promise<MyRooms> {
  return api('GET /api/rooms/mine')
}

export function deleteRoom(id: string): Promise<{ ok: true }> {
  return api('DELETE /api/rooms/:id', { params: { id } })
}

// (#211 epic, #216) Non-owner's own exit — drops only the caller's
// RoomParticipant row, unlike deleteRoom above (owner-only, removes the
// room for everyone).
export function leaveRoom(id: string): Promise<{ ok: true }> {
  return api('DELETE /api/rooms/:id/participation', { params: { id } })
}

export function renameRoom(id: string, name: string): Promise<Room> {
  return api('PATCH /api/rooms/:id', { params: { id }, body: { name } })
}

// (#222) Owner-only toggle of "closed for editing". Returns the updated room
// so the caller can reflect the new `closedAt` without a refetch; anyone
// currently inside the room hears about it over the socket instead
// (`room_closed_changed`).
export function setRoomClosed(id: string, closed: boolean): Promise<Room> {
  return api('PATCH /api/rooms/:id/closed', { params: { id }, body: { closed } })
}

// (#317) Copies a room's content into a new room owned by the caller — the
// mechanism homework runs on (#314 §4). The name is passed from here rather
// than composed server-side because server responses stay untranslated
// (#208), and "Still life — copy" has to be in the reader's own language.
//
// (#568, ADR 014 §5) `scope` says how much travels. `'board'` copies the one
// room whose id is given — whichever board of a lesson it is — into a
// standalone room: «взять в работу» from inside a closed lesson, the sheet the
// student was looking at. `'lesson'` copies the lesson and every board of it:
// «Форк» from the lesson list, which is how a prepared lesson is reused.
export function forkRoom(id: string, { name, scope }: { name?: string; scope: ForkScope }): Promise<{ room: Room }> {
  return api('POST /api/rooms/:id/fork', { params: { id }, body: { name, scope } })
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
  return api('GET /api/rooms/:id/access', { params: { id: roomId } })
}

/** Changes the mode, the password, or both — the two are independent, and
 *  omitting one leaves it alone. `password: null` removes it; the server
 *  rejects an empty string rather than reading it as removal. */
export function setRoomAccess(
  roomId: string, changes: { accessMode?: RoomAccessMode; password?: string | null },
): Promise<RoomAccessSettings> {
  return api('PATCH /api/rooms/:id/access', { params: { id: roomId }, body: changes })
}

/** Adds an address to the allow-list. Normalized server-side, so what comes
 *  back is what to render — not what was typed. */
export function addRoomInvite(roomId: string, email: string): Promise<RoomInvite> {
  return api('POST /api/rooms/:id/invites', { params: { id: roomId }, body: { email } })
}

export function removeRoomInvite(roomId: string, email: string): Promise<{ ok: true }> {
  return api('DELETE /api/rooms/:id/invites/:email', { params: { id: roomId, email } })
}

/** Answers someone waiting in the queue. The person hears it live over the
 *  socket if they still have the join screen open (`join_request_resolved`,
 *  #227) — this call's own response only confirms the write. */
export function resolveJoinRequest(
  roomId: string, requestId: string, approved: boolean,
): Promise<{ ok: true; status: 'approved' | 'denied' }> {
  const params = { id: roomId, requestId }
  return approved
    ? api('POST /api/rooms/:id/join-requests/:requestId/approve', { params })
    : api('POST /api/rooms/:id/join-requests/:requestId/deny', { params })
}

/** Removes someone from the room for good: writes the block the join gate
 *  checks first, drops their invite and any approval, and — if they are in
 *  the room at this moment — takes them out of it (#227). */
export function kickFromRoom(roomId: string, userId: string): Promise<{ ok: true }> {
  return api('POST /api/rooms/:id/kick', { params: { id: roomId }, body: { userId } })
}

/** Undoes a kick. Gives back the right to enter for someone who had been in
 *  the room before, and the right to ask again for someone who never got past
 *  the queue — see roomAccessRoutes.ts for why those differ. */
export function unblockFromRoom(roomId: string, userId: string): Promise<{ ok: true }> {
  return api('DELETE /api/rooms/:id/blocks/:userId', { params: { id: roomId, userId } })
}

// (#211 epic, #215) Folder-scoped browsing — only the direct children of one
// level (folders + rooms), not the whole tree (see roomFolderRoutes.ts's own
// doc comment for the perf rationale). Omitted folderId = root level.

export function listRoomsAt(folderId?: string): Promise<RoomsAtFolder> {
  return api('GET /api/rooms', { query: { folderId: folderId || undefined } })
}

export function createFolder(name: string, parentFolderId?: string): Promise<RoomFolder> {
  return api('POST /api/rooms/folders', { body: { name, parentFolderId } })
}

/** Files (or un-files, with `folderId: null`) a room into a folder for the
 *  caller. Shared primitive behind create-in-folder, the "Move to..." menu
 *  action (#216), and the future drag & drop (#217). */
export function moveRoomToFolder(roomId: string, folderId: string | null): Promise<{ ok: true }> {
  return api('PATCH /api/rooms/:id/folder', { params: { id: roomId }, body: { folderId } })
}

export function renameFolder(id: string, name: string): Promise<RoomFolder> {
  return api('PATCH /api/rooms/folders/:id', { params: { id }, body: { name } })
}

/** Reparents a folder — server rejects (400 `cycle`) moving it into its own
 *  descendant (#212's `isDescendantOf` guard). `parentFolderId: null` moves
 *  it to root. */
export function moveFolder(id: string, parentFolderId: string | null): Promise<RoomFolder> {
  return api('PATCH /api/rooms/folders/:id', { params: { id }, body: { parentFolderId } })
}

/** 409 (`not_empty`) if the folder still has any direct child room or
 *  subfolder — folders only delete empty (#212). */
export function deleteFolder(id: string): Promise<{ ok: true }> {
  return api('DELETE /api/rooms/folders/:id', { params: { id } })
}

// (#211 epic, #218) Server-side, cross-folder — deliberately not filtered
// against a locally-loaded list, since folder browsing (#215) only ever
// holds one level's worth of rooms in memory. See roomRoutes.ts's own doc
// comment on the endpoint for the matching rationale.
export function searchRooms(q: string): Promise<{ rooms: Room[] }> {
  return api('GET /api/rooms/search', { query: { q } })
}

// ── Boards (#176, ADR 014) ────────────────────────────────────────────────
//
// Owner-only, all addressed by the *lesson* id (boardRoutes.ts answers 404 for
// a board id in that position). The live half of each — `board_created`,
// `board_renamed`, `boards_reordered`, `board_deleted` — reaches everyone in
// the lesson over the socket, the caller included, so the reply here is only
// for acting on the result at once (switching to the board just made).

export function createBoard(lessonId: string, name?: string): Promise<BoardSummary> {
  return api('POST /api/rooms/:id/boards', { params: { id: lessonId }, body: name === undefined ? {} : { name } })
}

export function renameBoard(lessonId: string, boardId: string, name: string): Promise<BoardUpdate> {
  return api('PATCH /api/rooms/:id/boards/:boardId', { params: { id: lessonId, boardId }, body: { name } })
}

/** `order` is the board's new position in the strip; the reply carries the
 *  whole resulting order, lesson first. */
export function reorderBoard(lessonId: string, boardId: string, order: number): Promise<BoardUpdate> {
  return api('PATCH /api/rooms/:id/boards/:boardId', { params: { id: lessonId, boardId }, body: { order } })
}

/** Hard delete, content and all — the caller confirms first (ADR 014 §3). */
export function deleteBoard(lessonId: string, boardId: string): Promise<{ ok: true }> {
  return api('DELETE /api/rooms/:id/boards/:boardId', { params: { id: lessonId, boardId } })
}
