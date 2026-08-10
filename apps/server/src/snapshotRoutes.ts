import type { FastifyInstance } from 'fastify'

import { getLayerSnapshot, getOperationsBefore, getParticipant, getSnapshotIndex, saveSnapshot } from './rooms.js'

const MAX_BACKFILL_PAGE_SIZE = 500
// Fastify's default bodyLimit is 1MB — comfortably too small for a gzipped,
// base64'd, full-room tile payload. 20MB is a generous cap on a single
// room's snapshot while still bounding a broken/malicious upload.
const SNAPSHOT_UPLOAD_BODY_LIMIT_BYTES = 20 * 1024 * 1024

/** HTTP surface for the #149 epic's client-baked snapshots — kept off the
 *  Socket.io channel (see saveSnapshot's own doc comment on why: infrequent,
 *  several-MB, non-realtime payloads don't belong on the same transport as
 *  live stroke relay). All three routes require the caller to currently be a
 *  live participant of the room (i.e. already passed join_room's own
 *  password check) — otherwise a plain HTTP client could pull a password-
 *  protected room's content by guessing its id, bypassing the socket-level
 *  password check entirely. */
export function registerSnapshotRoutes(app: FastifyInstance): void {
  app.post<{
    Params: { roomId: string }
    Body: { seq: number; layerState: unknown; layers: Record<string, string> }
  }>(
    '/api/rooms/:roomId/snapshots',
    { bodyLimit: SNAPSHOT_UPLOAD_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const { roomId } = request.params
      if (!getParticipant(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })

      const { seq, layerState, layers } = request.body
      // (#371) `layers` maps layerId to one base64 gzipped `encodeLayerTiles`
      // payload. A client sends only the layers it re-baked, so a small — even
      // empty — object is normal traffic, not a truncated upload.
      if (typeof seq !== 'number' || typeof layers !== 'object' || layers === null) {
        return reply.code(400).send({ error: 'bad_request' })
      }
      if (Object.values(layers).some(data => typeof data !== 'string')) {
        return reply.code(400).send({ error: 'bad_request' })
      }

      const decoded = new Map(
        Object.entries(layers).map(([layerId, data]) => [layerId, Buffer.from(data, 'base64')]),
      )
      const result = await saveSnapshot(roomId, seq, layerState, decoded)
      if (!result.ok) return reply.code(result.error === 'unknown_room' ? 404 : 400).send(result)
      if (result.mismatched.length > 0) {
        // #149: a second client independently baked the same layer at the same
        // checkpoint and got different pixels — a live cross-device
        // determinism violation, the exact class of bug this project's
        // paper-grain work spent a week chasing down manually.
        request.log.warn(
          { roomId, seq, layerIds: result.mismatched },
          '#149: snapshot hash mismatch on duplicate upload — possible cross-device determinism violation',
        )
      }
      return { ok: true, stored: result.created.length, duplicate: result.duplicated.length }
    },
  )

  // (#427) The restore path is two requests, not one: a small always-fresh
  // index, then one immutable blob per layer. It used to be a single
  // `/snapshots/latest` that base64'd every layer's pixels into one JSON body
  // — measured on a real room, 9.7MB of stored bytes arrived as a 13.3MB JSON
  // string, which the client then had to JSON.parse and base64-decode on the
  // main thread before a single pixel could be drawn. And because that URL
  // said "latest", nothing about it could ever be cached: re-entering an
  // unchanged room re-downloaded all of it, including for the very client
  // that had baked and uploaded those pixels minutes earlier.
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/snapshots/index', async (request, reply) => {
    const { roomId } = request.params
    if (!getParticipant(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })

    const index = await getSnapshotIndex(roomId)
    if (!index) return reply.code(204).send()
    // Never cached: which seq is newest is exactly the thing that changes.
    reply.header('Cache-Control', 'no-store')
    return {
      seq: index.seq,
      layerState: index.layerState,
      // Each entry carries its own seq: layers are covered independently, so
      // the client has to know how far each one is caught up before deciding
      // which operations still have to be replayed onto it (#371). The seq is
      // also half the address of the blob to fetch next.
      layers: index.layers,
    }
  })

  app.get<{ Params: { roomId: string; layerId: string; seq: string } }>(
    '/api/rooms/:roomId/snapshots/:layerId/:seq',
    async (request, reply) => {
      const { roomId, layerId } = request.params
      if (!getParticipant(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })

      const seq = Number(request.params.seq)
      if (!Number.isInteger(seq)) return reply.code(400).send({ error: 'bad_request' })

      const snapshot = await getLayerSnapshot(roomId, layerId, seq)
      if (!snapshot) return reply.code(404).send({ error: 'not_found' })

      // `private` is load-bearing, not boilerplate: participation is checked
      // per request above, so this content is authorized to one user and must
      // never sit in a shared cache. `immutable` is honest here in the way it
      // usually isn't — the bytes for this exact (room, layer, seq) can never
      // change, since a duplicate upload at a seq already stored is discarded
      // rather than allowed to overwrite (see saveSnapshot).
      reply.header('Cache-Control', 'private, max-age=31536000, immutable')
      reply.header('ETag', `"${snapshot.hash}"`)
      // A revalidation that `immutable` was supposed to prevent still happens
      // after a cache eviction or a forced reload, and answering it with 304
      // costs one index lookup instead of several megabytes.
      const inm = request.headers['if-none-match']
      if (inm && inm.split(',').some(tag => tag.trim() === `"${snapshot.hash}"`)) {
        return reply.code(304).send()
      }

      // Sent as the gzip bytes themselves, *not* as Content-Encoding: gzip.
      // Declaring the encoding would make fetch() transparently inflate it,
      // handing the client ~33MB per layer where 5MB arrived — bytes it would
      // then have to re-compress to cache. Keeping the payload opaque and
      // compressed end to end means the client stores exactly what it
      // received, and `decompressLayerTiles` (which already exists, and used
      // to run on the base64-decoded body) inflates it at the last moment.
      //
      // nginx must not re-gzip this: it is already-compressed data, and
      // deploy/nginx.conf's gzip_types includes application/octet-stream for
      // the sake of the JSON routes. See the `gzip off` location it has for
      // exactly this path.
      reply.header('Content-Type', 'application/octet-stream')
      return reply.send(Buffer.from(snapshot.data))
    },
  )

  app.get<{ Params: { roomId: string }; Querystring: { beforeSeq: string; limit?: string } }>(
    '/api/rooms/:roomId/operations',
    async (request, reply) => {
      const { roomId } = request.params
      if (!getParticipant(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })

      const beforeSeq = Number(request.query.beforeSeq)
      const limit = Math.min(Number(request.query.limit ?? String(MAX_BACKFILL_PAGE_SIZE)), MAX_BACKFILL_PAGE_SIZE)
      if (!Number.isFinite(beforeSeq) || !Number.isFinite(limit)) {
        return reply.code(400).send({ error: 'bad_request' })
      }

      return await getOperationsBefore(roomId, beforeSeq, limit)
    },
  )
}
