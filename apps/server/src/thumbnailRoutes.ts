import type { FastifyInstance } from 'fastify'

import { prisma } from './prisma.js'
import { getParticipant } from './rooms.js'

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
 *  displayed directly. Same participant guard as snapshotRoutes.ts and for
 *  the same reason: without it, a plain HTTP client could read or overwrite
 *  a password-protected room's thumbnail by guessing its id, bypassing the
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

      await prisma.roomThumbnail.upsert({
        where: { roomId },
        create: { roomId, data: buffer },
        update: { data: buffer },
      })
      return { ok: true }
    },
  )

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/thumbnail', async (request, reply) => {
    const { roomId } = request.params
    if (!getParticipant(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })

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
