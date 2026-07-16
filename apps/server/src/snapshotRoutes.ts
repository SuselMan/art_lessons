import type { FastifyInstance } from 'fastify'

import { getLatestSnapshot, getOperationsBefore, getParticipant, saveSnapshot } from './rooms.js'

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
  app.post<{ Params: { roomId: string }; Body: { seq: number; layerState: unknown; data: string } }>(
    '/api/rooms/:roomId/snapshots',
    { bodyLimit: SNAPSHOT_UPLOAD_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const { roomId } = request.params
      if (!getParticipant(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })

      const { seq, layerState, data } = request.body
      if (typeof seq !== 'number' || typeof data !== 'string') {
        return reply.code(400).send({ error: 'bad_request' })
      }

      const result = await saveSnapshot(roomId, seq, layerState, Buffer.from(data, 'base64'))
      if (!result.ok) return reply.code(result.error === 'unknown_room' ? 404 : 400).send(result)
      if (!result.created && result.hashMismatch) {
        // #149: a second client independently baked the same checkpoint
        // (same seq) and got different pixels — a live cross-device
        // determinism violation, the exact class of bug this project's
        // paper-grain work spent a week chasing down manually.
        request.log.warn(
          { roomId, seq },
          '#149: snapshot hash mismatch on duplicate upload — possible cross-device determinism violation',
        )
      }
      return { ok: true }
    },
  )

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/snapshots/latest', async (request, reply) => {
    const { roomId } = request.params
    if (!getParticipant(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })

    const snapshot = await getLatestSnapshot(roomId)
    if (!snapshot) return reply.code(204).send()
    return { seq: snapshot.seq, layerState: snapshot.layerState, data: Buffer.from(snapshot.data).toString('base64') }
  })

  app.get<{ Params: { roomId: string }; Querystring: { beforeSeq: string; cursorSeq?: string; limit?: string } }>(
    '/api/rooms/:roomId/operations',
    async (request, reply) => {
      const { roomId } = request.params
      if (!getParticipant(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })

      const beforeSeq = Number(request.query.beforeSeq)
      const cursorSeq = Number(request.query.cursorSeq ?? '0')
      const limit = Math.min(Number(request.query.limit ?? String(MAX_BACKFILL_PAGE_SIZE)), MAX_BACKFILL_PAGE_SIZE)
      if (!Number.isFinite(beforeSeq) || !Number.isFinite(cursorSeq) || !Number.isFinite(limit)) {
        return reply.code(400).send({ error: 'bad_request' })
      }

      return getOperationsBefore(roomId, beforeSeq, cursorSeq, limit)
    },
  )
}
