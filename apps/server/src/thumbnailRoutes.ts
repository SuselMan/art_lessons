import type { FastifyInstance } from 'fastify'

import { prisma } from './prisma.js'
import { canSeeResidentBoard, getParticipant } from './rooms.js'
import { canSeeBoard, lessonOf } from './lessons.js'

/** (#176) The two persisted checks below are about *membership*, and
 *  membership is the lesson's: a `RoomParticipant` row is only ever written
 *  under a lesson id (rooms.ts's joinRoom), so a board id has to be resolved
 *  to its lesson before the row can be found at all. One query, two answers:
 *  the board's own row for its owner and lesson, the lesson's participation
 *  for this user. For a lesson `lesson` is null and its own `participants`
 *  are read instead. */
async function persistedMembership(
  roomId: string, userId: string,
): Promise<{ lessonId: string; ownerId: string; participates: boolean; visible: boolean } | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      ownerId: true, lessonId: true, boardOwnerId: true,
      participants: { where: { userId }, select: { userId: true } },
      lesson: {
        select: {
          classVisibility: true, spotlightBoardId: true,
          participants: { where: { userId }, select: { userId: true } },
        },
      },
    },
  })
  if (!room) return null
  const participants = room.lesson?.participants ?? room.participants
  return {
    lessonId: lessonOf({ id: roomId, lessonId: room.lessonId }),
    ownerId: room.ownerId,
    participates: participants.length > 0,
    // (#595) A classmate's personal board is out of bounds unless the lesson
    // shows work to the class — the same rule the socket applies, read off
    // the rows. `ownerId` is the lesson's on every board (boardRoutes.ts).
    visible: canSeeBoard(userId, {
      board: { id: roomId, boardOwnerId: room.boardOwnerId },
      lesson: { ownerId: room.ownerId, classVisibility: room.lesson?.classVisibility, spotlightBoardId: room.lesson?.spotlightBoardId },
    }),
  }
}

/** GET is fetched from "Мои уроки" (`RoomCard`'s `<img>`), precisely when the
 *  caller is *not* live-connected to the room — `getParticipant` (the
 *  in-memory live-socket registry) would 403 almost every real request here,
 *  exactly the failure mode QA caught: the thumbnail loaded fine immediately
 *  after leaving the room but started 403ing once the in-memory participant
 *  entry aged out. Access must instead be checked against the same *persisted*
 *  signal `/api/rooms/mine` itself already uses to decide whether this room
 *  even belongs in the caller's list — owner, or a `RoomParticipant` row (only
 *  ever created in `joinRoom` after the password check passes, so this
 *  preserves the same "no guessing a password-protected room's id" property
 *  the live check was added for).
 *
 *  Deliberately does *not* consult `RoomBlock`, unlike `hasPersistedUploadAccess`
 *  below: `/api/rooms/mine` doesn't either, so a blocked ex-participant still
 *  has the room on their list, and 403ing its preview would render that card
 *  as a broken image rather than as anything meaningful. Reading a thumbnail
 *  of a room one used to be in is the same exposure as the card itself; being
 *  able to *overwrite* it is not. */
async function hasPersistedRoomAccess(roomId: string, userId: string): Promise<boolean> {
  const membership = await persistedMembership(roomId, userId)
  if (!membership || !membership.visible) return false
  return membership.ownerId === userId || membership.participates
}

/** (#382) POST's persisted fallback, for the one upload that provably cannot
 *  hold a live socket: the final bake on room exit.
 *
 *  Room/index.tsx fires `uploadThumbnail` from its unmount cleanup, and the
 *  socket effect's own cleanup calls `socket.disconnect()` in the same
 *  teardown. The upload has to export the canvas, downscale it and base64 it
 *  before it can even open the request — measured at ~870 ms on prod — so the
 *  disconnect wins the race, `leaveRoom` has already dropped the in-memory
 *  entry, and the POST 403s. That is roughly one room exit in six (14 of 83
 *  over 26.07–01.08), each one silently losing the preview that this exact
 *  call site exists to guarantee. Waiting for the upload before disconnecting
 *  was the alternative, and it is worse: a React cleanup is synchronous, so
 *  it means holding a socket open past unmount on a path that also has to
 *  survive the tab simply being closed.
 *
 *  Stricter than `hasPersistedRoomAccess` by exactly one row — a block is the
 *  durable half of a kick (see socketHandlers.ts's `removeUserFromRoom`), and
 *  a `RoomParticipant` row outlives one, so without this check the person the
 *  owner just removed would keep write access to what the room looks like on
 *  everyone's lesson list. */
async function hasPersistedUploadAccess(roomId: string, userId: string): Promise<boolean> {
  const membership = await persistedMembership(roomId, userId)
  if (!membership || !membership.visible) return false
  // The owner is exempt from their own block list for the same reason
  // roomAccess.ts's join gate exempts them: a room whose owner can be locked
  // out of it is a room that can be stolen.
  if (membership.ownerId === userId) return true
  // (#176) Blocks are written under the lesson, like every access row.
  const blocked = await prisma.roomBlock.findUnique({
    where: { roomId_userId: { roomId: membership.lessonId, userId } }, select: { id: true },
  })
  return !blocked && membership.participates
}

// Base64 JSON, matching snapshotRoutes.ts's POST /snapshots — kept
// consistent with the existing upload route's style rather than accepting a
// raw octet-stream body.
const THUMBNAIL_UPLOAD_BODY_LIMIT_BYTES = 2 * 1024 * 1024

// #116/#209: room-list cards only ever need a small preview, never a
// full-resolution image — anything claiming to be bigger than this on either
// side is either a bug in the client's downscale step or a hostile upload,
// not a legitimate thumbnail.
const MAX_THUMBNAIL_DIMENSION_PX = 800

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
// Signature (8) + IHDR chunk's length (4) + type (4) + width (4) + height (4).
const MIN_PNG_HEADER_BYTES = 24

const WEBP_MIN_HEADER_BYTES = 30

/** (#595) The WebP counterpart of `sniffPng` below, for the cheap live preview
 *  (engine.bakePreview). Same standing: not a decoder, just enough of the
 *  container — `RIFF`, size, `WEBP`, then the first chunk — to read the
 *  canvas size and refuse anything that isn't a plausibly-sized WebP. The
 *  three chunk kinds a browser encoder can open with each keep the size in a
 *  different place (RFC 9649 §2.5–2.7). */
function sniffWebp(buffer: Buffer): { ok: true; width: number; height: number } | { ok: false } {
  if (buffer.length < WEBP_MIN_HEADER_BYTES) return { ok: false }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return { ok: false }
  const chunk = buffer.toString('ascii', 12, 16)
  let width: number
  let height: number
  if (chunk === 'VP8X') {
    width = 1 + buffer.readUIntLE(24, 3)
    height = 1 + buffer.readUIntLE(27, 3)
  } else if (chunk === 'VP8L') {
    if (buffer[20] !== 0x2f) return { ok: false }
    const bits = buffer.readUInt32LE(21)
    width = 1 + (bits & 0x3fff)
    height = 1 + ((bits >> 14) & 0x3fff)
  } else if (chunk === 'VP8 ') {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return { ok: false }
    width = buffer.readUInt16LE(26) & 0x3fff
    height = buffer.readUInt16LE(28) & 0x3fff
  } else {
    return { ok: false }
  }
  if (width <= 0 || height <= 0 || width > MAX_THUMBNAIL_DIMENSION_PX || height > MAX_THUMBNAIL_DIMENSION_PX) {
    return { ok: false }
  }
  return { ok: true, width, height }
}

/** Which image a thumbnail upload is, by its bytes — never by a header the
 *  client chose. Null for anything else. */
export function sniffThumbnail(buffer: Buffer): 'image/png' | 'image/webp' | null {
  if (sniffPng(buffer).ok) return 'image/png'
  if (sniffWebp(buffer).ok) return 'image/webp'
  return null
}

/** (#595, ADR 015 §4) At most one stored preview per board per this many ms.
 *  The class grid is the first thing that uploads often on purpose (a
 *  student's tablet every few seconds while they draw), and #324 left this
 *  route unlimited until something did. Excess is answered 429 and the
 *  client drops it silently — the next one is seconds away. In memory, like
 *  every other limit here: one process, and a restart forgetting it is fine. */
export const THUMBNAIL_MIN_INTERVAL_MS = 3000
const lastThumbnailAt = new Map<string, number>()

function thumbnailTooSoon(roomId: string, now: number): boolean {
  const last = lastThumbnailAt.get(roomId)
  if (last !== undefined && now - last < THUMBNAIL_MIN_INTERVAL_MS) return true
  lastThumbnailAt.set(roomId, now)
  // Keeps the map from growing without bound over a long uptime: anything
  // older than the window is no longer limiting anybody.
  if (lastThumbnailAt.size > 10_000) {
    for (const [id, at] of lastThumbnailAt) if (now - at >= THUMBNAIL_MIN_INTERVAL_MS) lastThumbnailAt.delete(id)
  }
  return false
}

/** Test seam: forget every board's last upload. */
export function _resetThumbnailLimit(): void {
  lastThumbnailAt.clear()
}

/** (#595) Told after every stored preview, so the lesson can refresh the
 *  picture live (index.ts wires it to the socket side). */
export type ThumbnailNotifier = (roomId: string, updatedAt: string) => void

/** Manual PNG-header sniff — deliberately not a real decoder (no new
 *  dependency, see .claude/rules.md's "no deps without a clear reason"): just
 *  enough of the spec (signature, then the IHDR chunk's big-endian width/
 *  height at byte offsets 16/20) to reject anything that isn't a plausibly-
 *  sized PNG before it ever reaches Postgres. The uploader is a browser
 *  client, not a trusted internal service, so every failure mode here
 *  (truncated buffer, wrong signature, oversized dimensions) returns a
 *  tagged failure rather than throwing. */
function sniffPng(buffer: Buffer): { ok: true; width: number; height: number } | { ok: false } {
  if (buffer.length < MIN_PNG_HEADER_BYTES) return { ok: false }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (buffer[i] !== PNG_SIGNATURE[i]) return { ok: false }
  }
  // Bytes 12..16 are the first chunk's type — must be "IHDR" for a
  // well-formed PNG (it's always the first chunk per spec).
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return { ok: false }

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width <= 0 || height <= 0 || width > MAX_THUMBNAIL_DIMENSION_PX || height > MAX_THUMBNAIL_DIMENSION_PX) {
    return { ok: false }
  }
  return { ok: true, width, height }
}

/** HTTP surface for #209: a periodically-POSTed, client-downscaled composite
 *  PNG per room, shown as a preview on "Мои уроки" room cards (#116). Not to
 *  be confused with the #149 epic's RoomSnapshot — that's opaque per-layer
 *  tile blobs for fast rejoin; this is a single flat image meant to be
 *  displayed directly. Neither verb can use snapshotRoutes.ts's plain
 *  live-participant guard: GET is fetched from outside the room entirely, and
 *  POST has one call site (#382) that fires as the room is closing — see
 *  hasPersistedRoomAccess and hasPersistedUploadAccess for what each takes
 *  instead. Both exist for the same underlying reason:
 *  without a guard, a plain HTTP client could read or overwrite a
 *  password-protected room's thumbnail by guessing its id, bypassing the
 *  socket-level password check entirely. */
export function registerThumbnailRoutes(app: FastifyInstance, notify?: ThumbnailNotifier): void {
  app.post<{ Params: { roomId: string }; Body: { data: string } }>(
    '/api/rooms/:roomId/thumbnail',
    { bodyLimit: THUMBNAIL_UPLOAD_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const { roomId } = request.params
      // Live registry first: it is synchronous, it covers every upload made
      // from inside an open room, and it is the only branch that answers
      // correctly in the window where a join's own `persistParticipant` write
      // is still queued (rooms.ts's `enqueueWrite` — it is fire-and-forget, so
      // a live participant can briefly have no row yet). The persisted check
      // is the exit path's fallback; see hasPersistedUploadAccess.
      // (#595) The live branch now also asks whether this person may see the
      // board at all: being in the lesson is no longer being allowed at every
      // board of it (a classmate's personal board).
      const live = getParticipant(roomId, request.userId) !== undefined && canSeeResidentBoard(roomId, request.userId)
      if (!live && !(await hasPersistedUploadAccess(roomId, request.userId))) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const { data } = request.body
      if (typeof data !== 'string') return reply.code(400).send({ error: 'bad_request' })

      let buffer: Buffer
      try {
        buffer = Buffer.from(data, 'base64')
      } catch {
        return reply.code(400).send({ error: 'bad_request' })
      }

      // `invalid_png` kept as the code for anything unrecognised: older
      // clients read it, and it still says what went wrong.
      const contentType = sniffThumbnail(buffer)
      if (!contentType) return reply.code(400).send({ error: 'invalid_png' })
      // After validation, so a malformed upload does not use up the window.
      if (thumbnailTooSoon(roomId, Date.now())) return reply.code(429).send({ error: 'rate_limited' })

      // Copied into a fresh, plain-ArrayBuffer-backed Uint8Array — same
      // reason as rooms.ts's saveSnapshot: Prisma's generated Bytes-field
      // type is narrower than Buffer's own (SharedArrayBuffer-compatible)
      // backing type, so a straight pass-through doesn't typecheck.
      const bytes = new Uint8Array(buffer)
      const stored = await prisma.roomThumbnail.upsert({
        where: { roomId },
        create: { roomId, data: bytes, contentType },
        update: { data: bytes, contentType },
        select: { updatedAt: true },
      })
      notify?.(roomId, stored.updatedAt.toISOString())
      return { ok: true }
    },
  )

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/thumbnail', async (request, reply) => {
    const { roomId } = request.params
    if (!(await hasPersistedRoomAccess(roomId, request.userId))) return reply.code(403).send({ error: 'forbidden' })

    const thumbnail = await prisma.roomThumbnail.findUnique({
      where: { roomId },
      select: { data: true, contentType: true, updatedAt: true },
    })
    if (!thumbnail) return reply.code(404).send({ error: 'not_found' })

    // Weak ETag derived from updatedAt — good enough here since the only
    // thing that ever changes a row is a full replace (upsert above), so
    // "same updatedAt" already implies "same bytes" without hashing the blob.
    const etag = `"${thumbnail.updatedAt.getTime()}"`
    if (request.headers['if-none-match'] === etag) return reply.code(304).send()

    reply
      .header('Content-Type', thumbnail.contentType)
      // Private (never a shared/CDN cache — this can be a password-protected
      // room's content) and short-lived: the client re-POSTs periodically, so
      // a long max-age would just mean stale room-card previews.
      .header('Cache-Control', 'private, max-age=300')
      .header('ETag', etag)
    return reply.send(thumbnail.data)
  })
}
