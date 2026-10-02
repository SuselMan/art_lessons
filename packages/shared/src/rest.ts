import type {
  AdminActionList, AdminIpBanList, AdminIpDetail, AdminLessonList, AdminOverview, AdminUserDetail, AdminUserFilter,
  AdminUserList, ClientEnvironment, IpBanDurationHours,
} from './admin.js'
import type { Operation } from './operations.js'
import type { RoomOpenMeasurement } from './roomOpen.js'
import type {
  BoardSummary, Room, RoomAccessInfo, RoomAccessMode, RoomFolder, RoomInvite,
} from './room.js'

/** (#623) The REST half of the contract between web and server.
 *
 *  The socket half has always been shared — ServerToClientEvents and
 *  ClientToServerEvents parameterise both `Server<…>` and `Socket<…>`, so a
 *  renamed field breaks the typecheck on both sides. REST had no such thing:
 *  the client cast `res.json()` to whatever it expected and the server built
 *  its answers as literals, so renaming a response field on the server gave a
 *  green typecheck and a broken screen.
 *
 *  This is that table: one entry per route, keyed by `"METHOD /path"` exactly
 *  as the server registers it. The server registers through it (apiRoute.ts)
 *  and the client calls through it (lib/api/api.ts), so neither side can name a
 *  path, a field or a response the other does not agree on.
 *
 *  Two roles for a body, on purpose. `body` is what the *client* sends, typed
 *  exactly. The server receives the same field names with `unknown` values
 *  (see UntrustedBody) — a request is input, not a promise, and every route
 *  checks what it reads. A renamed field still breaks the server's typecheck;
 *  a well-typed client does not make the server trust the wire.
 *
 *  Not here: `/health` and `/api/health`. Their readers are Docker and the
 *  uptime workflow, not this client, and their body is made of server-only
 *  types (memory, disk, event-loop snapshots). */

/** Every error this API answers with. `error` is always a snake_case code the
 *  client can switch on; the other fields belong to the few routes that say
 *  more (the sign-in cooldown, a rejected snapshot upload). Fastify's own
 *  400/413/500 bodies also carry `error`, as plain text. */
export interface ApiErrorBody {
  error: string
  retryAfterSeconds?: number
  /** A snapshot upload's failure keeps its result's `ok: false`. */
  ok?: false
  /** stale_layer_state: the layers the upload would have erased (#462). */
  missing?: string[]
}

export type ApiOk = { ok: true }

/** A binary answer (image, gzip blob) — fetched by URL, never parsed as JSON.
 *  See apiPath on the client. */
export type ApiBinary = { readonly __binary: unique symbol }

export interface Me {
  userId: string
  email: string | null
  name: string | null
}

export interface RequestedLoginCode {
  /** Four characters also printed in the email, so the person can see the
   *  mail belongs to the page in front of them (#316). */
  confirmation: string
  expiresAt: string
  /** Only ever present in local development with no mail provider configured
   *  (#353) — the server refuses to include it otherwise. */
  devCode?: string
}

export interface MyRooms {
  owned: Room[]
  participated: Room[]
}

/** (#211, #215) One level of the folder tree: its folders and its rooms. */
export interface RoomsAtFolder {
  folders: RoomFolder[]
  rooms: Room[]
}

/** (#568, ADR 014 §5) How much a fork copies: the one board, or the lesson
 *  with every board of it. */
export type ForkScope = 'lesson' | 'board'
export const FORK_SCOPES: readonly ForkScope[] = ['lesson', 'board']

export interface RoomAccessSettings {
  accessMode: RoomAccessMode
  hasPassword: boolean
}

export interface BoardUpdate {
  board: BoardSummary
  /** The whole strip after the change, lesson first. */
  order: string[]
}

export interface SnapshotIndexEntry {
  layerId: string
  seq: number
  /** sha256 of the layer's decompressed pixels — also the blob's ETag. */
  hash: string
}

/** (#427) Everything a joining client needs to plan its restore. `layerState`
 *  is what a client uploaded, stored as JSON the server never reads — so it is
 *  `unknown` on the wire, and the client narrows it where it restores it. */
export interface SnapshotIndex {
  seq: number
  layerState: unknown
  layers: SnapshotIndexEntry[]
}

export interface SnapshotUploadResult {
  ok: true
  stored: number
  duplicate: number
}

/** The routes. `response` is the success body; a route with `noContent` may
 *  answer 204, which the client reads as `null`. */
export interface ApiRoutes {
  // ── identity (authRoutes.ts, sessions.ts) ──────────────────────────────
  'GET /api/me': { response: Me }
  'POST /api/auth/code/request': { body: { email: string; locale?: string }; response: RequestedLoginCode }
  'POST /api/auth/code/verify': { body: { email: string; code: string }; response: Me }
  'POST /api/auth/logout': { response: Me }
  'POST /api/me/environment': { body: ClientEnvironment; response: ApiOk }
  'POST /api/me/room-open': { body: RoomOpenMeasurement; response: ApiOk }

  // ── rooms (roomRoutes.ts) ───────────────────────────────────────────────
  'GET /api/rooms/mine': { response: MyRooms }
  'GET /api/rooms/search': { query: { q?: string }; response: { rooms: Room[] } }
  'PATCH /api/rooms/:id': { params: { id: string }; body: { name: string }; response: Room }
  'PATCH /api/rooms/:id/closed': { params: { id: string }; body: { closed: boolean }; response: Room }
  'DELETE /api/rooms/:id': { params: { id: string }; response: ApiOk }
  'DELETE /api/rooms/:id/participation': { params: { id: string }; response: ApiOk }

  // ── folders (roomFolderRoutes.ts) ───────────────────────────────────────
  'GET /api/rooms': { query: { folderId?: string }; response: RoomsAtFolder }
  'POST /api/rooms/folders': { body: { name: string; parentFolderId?: string }; response: RoomFolder }
  'PATCH /api/rooms/folders/:id': {
    params: { id: string }; body: { name?: string; parentFolderId?: string | null }; response: RoomFolder
  }
  'PATCH /api/rooms/:id/folder': { params: { id: string }; body: { folderId: string | null }; response: ApiOk }
  'DELETE /api/rooms/folders/:id': { params: { id: string }; response: ApiOk }

  // ── access (roomAccessRoutes.ts) ────────────────────────────────────────
  'GET /api/rooms/:id/access': { params: { id: string }; response: RoomAccessInfo }
  'PATCH /api/rooms/:id/access': {
    params: { id: string }; body: { accessMode?: RoomAccessMode; password?: string | null }
    response: RoomAccessSettings
  }
  'POST /api/rooms/:id/invites': { params: { id: string }; body: { email: string }; response: RoomInvite }
  'DELETE /api/rooms/:id/invites/:email': { params: { id: string; email: string }; response: ApiOk }
  'POST /api/rooms/:id/join-requests/:requestId/approve': {
    params: { id: string; requestId: string }; response: { ok: true; status: 'approved' }
  }
  'POST /api/rooms/:id/join-requests/:requestId/deny': {
    params: { id: string; requestId: string }; response: { ok: true; status: 'denied' }
  }
  'POST /api/rooms/:id/kick': { params: { id: string }; body: { userId: string }; response: ApiOk }
  'DELETE /api/rooms/:id/blocks/:userId': { params: { id: string; userId: string }; response: ApiOk }

  // ── fork (forkRoutes.ts) ────────────────────────────────────────────────
  'POST /api/rooms/:id/fork': {
    params: { id: string }; body: { name?: string; scope: ForkScope }; response: { room: Room }
  }

  // ── boards (boardRoutes.ts) ─────────────────────────────────────────────
  'POST /api/rooms/:id/boards': { params: { id: string }; body: { name?: string }; response: BoardSummary }
  'PATCH /api/rooms/:id/boards/:boardId': {
    params: { id: string; boardId: string }; body: { name?: string; order?: number }; response: BoardUpdate
  }
  'DELETE /api/rooms/:id/boards/:boardId': { params: { id: string; boardId: string }; response: ApiOk }

  // ── snapshots (snapshotRoutes.ts) ───────────────────────────────────────
  'POST /api/rooms/:roomId/snapshots': {
    params: { roomId: string }
    /** `layers` maps a layer id to base64 of its gzipped tiles. */
    body: { seq: number; layerState: unknown; layers: Record<string, string> }
    response: SnapshotUploadResult
  }
  'GET /api/rooms/:roomId/snapshots/index': {
    params: { roomId: string }; response: SnapshotIndex; noContent: true
  }
  'GET /api/rooms/:roomId/snapshots/:layerId/:seq': {
    params: { roomId: string; layerId: string; seq: string | number }; response: ApiBinary
  }
  'GET /api/rooms/:roomId/operations': {
    params: { roomId: string }; query: { beforeSeq: number; limit?: number }; response: Operation[]
  }

  // ── thumbnails (thumbnailRoutes.ts) ─────────────────────────────────────
  'POST /api/rooms/:roomId/thumbnail': { params: { roomId: string }; body: { data: string }; response: ApiOk }
  'GET /api/rooms/:roomId/thumbnail': { params: { roomId: string }; query: { v?: string }; response: ApiBinary }

  // ── admin (adminRoutes.ts) ──────────────────────────────────────────────
  'GET /api/admin/overview': { response: AdminOverview }
  'GET /api/admin/users': {
    query: { filter?: AdminUserFilter; q?: string; offset?: number }; response: AdminUserList
  }
  'GET /api/admin/users/:id': { params: { id: string }; response: AdminUserDetail }
  'POST /api/admin/users/:id/ban': { params: { id: string }; body: { reason: string }; response: ApiOk }
  'POST /api/admin/users/:id/unban': { params: { id: string }; body: { reason?: string }; response: ApiOk }
  'POST /api/admin/users/:id/revoke-sessions': { params: { id: string }; response: ApiOk }
  'GET /api/admin/ip-bans': { response: AdminIpBanList }
  'GET /api/admin/ips/:ip': { params: { ip: string }; response: AdminIpDetail }
  'POST /api/admin/ips/:ip/ban': {
    params: { ip: string }; body: { reason: string; hours: IpBanDurationHours }; response: ApiOk
  }
  'POST /api/admin/ips/:ip/unban': { params: { ip: string }; body: { reason?: string }; response: ApiOk }
  'GET /api/admin/lessons': { query: { q?: string; offset?: number }; response: AdminLessonList }
  'GET /api/admin/lessons/:id/thumbnail': { params: { id: string }; response: ApiBinary }
  'GET /api/admin/actions': { response: AdminActionList }
}

export type ApiRouteKey = keyof ApiRoutes

type Field<K extends ApiRouteKey, F extends string> = ApiRoutes[K] extends { [P in F]: infer T } ? T : undefined

export type RouteParams<K extends ApiRouteKey> = Field<K, 'params'>
export type RouteQuery<K extends ApiRouteKey> = Field<K, 'query'>
export type RouteBody<K extends ApiRouteKey> = Field<K, 'body'>
export type RouteResponse<K extends ApiRouteKey> = ApiRoutes[K]['response']
/** True for a route that may answer 204 with no body. */
export type RouteHasNoContent<K extends ApiRouteKey> = ApiRoutes[K] extends { noContent: true } ? true : false

/** What the server may assume about a request body or query: which fields
 *  exist by name, and nothing about their values. */
export type Untrusted<T> = T extends object ? { [P in keyof T]?: unknown } : undefined

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'
const API_METHODS: readonly string[] = ['GET', 'POST', 'PATCH', 'DELETE']

function isApiMethod(value: string): value is ApiMethod {
  return API_METHODS.includes(value)
}

/** `"PATCH /api/rooms/:id"` → `["PATCH", "/api/rooms/:id"]`, at runtime. */
export function splitRouteKey(key: ApiRouteKey): [method: ApiMethod, path: string] {
  const space = key.indexOf(' ')
  const method = key.slice(0, space)
  if (!isApiMethod(method)) throw new Error(`splitRouteKey: bad method in ${key}`)
  return [method, key.slice(space + 1)]
}

/** The path a route key names, with its `:params` filled in and encoded, and
 *  an optional query appended (undefined values dropped). */
export function fillRoutePath(
  template: string,
  params: Readonly<Record<string, string | number>> | undefined,
  query?: Readonly<Record<string, string | number | undefined>>,
): string {
  const path = template.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params?.[name]
    if (value === undefined) throw new Error(`fillRoutePath: no value for :${name} in ${template}`)
    return encodeURIComponent(String(value))
  })
  if (!query) return path
  const qs = Object.entries(query)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return qs ? `${path}?${qs}` : path
}
