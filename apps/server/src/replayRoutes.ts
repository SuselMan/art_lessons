import type { FastifyInstance } from 'fastify'

import { getRoomReplay } from './rooms.js'

/** Lesson replay (#108) — a room's full operation history for the
 *  standalone `/lesson/:roomId/replay` viewer. Separate from
 *  snapshotRoutes.ts's operations endpoint on purpose: that one serves a
 *  live participant's background backfill (paginated, in-memory-Map-backed,
 *  requires a currently-live socket join); this serves anyone who ever
 *  participated (or the owner), the room's *entire* history in one shot,
 *  straight from Postgres — see getRoomReplay's own doc comment. */
export function registerReplayRoutes(app: FastifyInstance): void {
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/replay', async (request, reply) => {
    const result = await getRoomReplay(request.params.roomId, request.userId)
    if (!result.ok) return reply.code(result.error === 'not_found' ? 404 : 403).send({ error: result.error })
    return { room: result.room, operations: result.operations }
  })
}
