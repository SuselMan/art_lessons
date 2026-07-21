import type { FastifyInstance } from 'fastify'

import { prisma } from './prisma.js'
import { getParticipant } from './rooms.js'

/** GET is fetched from "Мои уроки" (`RoomCard`'s `<img>`), precisely when the
 *  caller is *not* live-connected to the room — `getParticipant` (the
 *  in-memory live-socket registry POST correctly uses below, since uploads
 *  only ever happen from inside an open room) would 403 almost every real
 *  request here, exactly the failure mode QA caught: the thumbnail loaded
 *  fine immediately after leaving the room but started 403ing once the
 *  in-memory participant entry aged out. Access must instead be checked
 *  against the same *persisted* signal `/api/rooms/mine` itself already uses
 *  to decide whether this room even belongs in the caller's list — owner, or
 *  a `RoomParticipant` row (only ever created in `joinRoom` after the
 *  password check passes, so this preserves the same "no guessing a
 *  password-protected room's id" property the live check was added for). */
async function hasPersistedRoomAccess(roomId: string, userId: string): Promise<boolean> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { ownerId: true, participants: { where: { userId }, select: { userId: true } } },
  })
  if (!room) return false
  return room.ownerId === userId || room.participants.length > 0
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
 *  displayed directly. POST reuses the same live-participant guard as
 *  snapshotRoutes.ts (uploads only ever happen from inside an open room);
 *  GET uses a persisted-access check instead — see hasPersistedRoomAccess's
 *  own doc comment for why. Both exist for the same underlying reason:
 *  without a guard, a plain HTTP client could read or overwrite a
 *  password-protected room's thumbnail by guessing its id, bypassing the
 *  socket-level password check entirely. */
export function registerThumbnailRoutes(app: FastifyInstance): void {
  app.post<{ Params: { roomId: string }; Body: { data: string } }>(
    '/api/rooms/:roomId/thumbnail',
    { bodyLimit: THUMBNAIL_UPLOAD_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const { roomId } = request.params
      if (!getParticipant(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })

      const { data } = request.body
      if (typeof data !== 'string') return reply.code(400).send({ error: 'bad_request' })

      let buffer: Buffer
      try {
        buffer = Buffer.from(data, 'base64')
      } catch {
        return reply.code(400).send({ error: 'bad_request' })
      }

      if (!sniffPng(buffer).ok) return reply.code(400).send({ error: 'invalid_png' })

      // Copied into a fresh, plain-ArrayBuffer-backed Uint8Array — same
      // reason as rooms.ts's saveSnapshot: Prisma's generated Bytes-field
      // type is narrower than Buffer's own (SharedArrayBuffer-compatible)
      // backing type, so a straight pass-through doesn't typecheck.
      const bytes = new Uint8Array(buffer)
      await prisma.roomThumbnail.upsert({
        where: { roomId },
        create: { roomId, data: bytes },
        update: { data: bytes },
      })
      return { ok: true }
    },
  )

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/thumbnail', async (request, reply) => {
    const { roomId } = request.params
    if (!(await hasPersistedRoomAccess(roomId, request.userId))) return reply.code(403).send({ error: 'forbidden' })

    const thumbnail = await prisma.roomThumbnail.findUnique({
      where: { roomId },
      select: { data: true, updatedAt: true },
    })
    if (!thumbnail) return reply.code(404).send({ error: 'not_found' })

    // Weak ETag derived from updatedAt — good enough here since the only
    // thing that ever changes a row is a full replace (upsert above), so
    // "same updatedAt" already implies "same bytes" without hashing the blob.
    const etag = `"${thumbnail.updatedAt.getTime()}"`
    if (request.headers['if-none-match'] === etag) return reply.code(304).send()

    reply
      .header('Content-Type', 'image/png')
      // Private (never a shared/CDN cache — this can be a password-protected
      // room's content) and short-lived: the client re-POSTs periodically, so
      // a long max-age would just mean stale room-card previews.
      .header('Cache-Control', 'private, max-age=300')
      .header('ETag', etag)
    return reply.send(thumbnail.data)
  })
}
