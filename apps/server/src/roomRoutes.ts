import type { FastifyInstance } from 'fastify'

import { prisma } from './prisma.js'
import { toWireRoom } from './roomMapper.js'

/** Backs "Мои уроки" (#116): rooms the caller owns, and rooms they were ever
 *  a participant in (join history persisted via `RoomParticipant`, not
 *  derived from who's currently connected). */
export function registerRoomRoutes(app: FastifyInstance): void {
  app.get('/api/rooms/mine', async (request) => {
    // (#209) `include` the thumbnail relation `select`-narrowed to just
    // `updatedAt` — this list can be long, and pulling every room's full PNG
    // `data` blob in just to build a card list would be wasteful; the actual
    // image bytes are fetched separately via GET /api/rooms/:roomId/thumbnail.
    const [owned, participated] = await Promise.all([
      prisma.room.findMany({
        where: { ownerId: request.userId },
        orderBy: { createdAt: 'desc' },
        include: { thumbnail: { select: { updatedAt: true } }, owner: { select: { name: true } } },
      }),
      prisma.room.findMany({
        where: {
          ownerId: { not: request.userId },
          participants: { some: { userId: request.userId } },
        },
        orderBy: { createdAt: 'desc' },
        include: { thumbnail: { select: { updatedAt: true } }, owner: { select: { name: true } } },
      }),
    ])
    return { owned: owned.map(toWireRoom), participated: participated.map(toWireRoom) }
  })

  // (#211 epic, #214) Search is server-side and deliberately ignores the
  // caller's current folder — folder browsing (#212) is scoped to one level
  // at a time for perf, so the client has nothing to filter locally across
  // the whole tree. Same "owned OR participated" universe as `/mine`.
  app.get<{ Querystring: { q?: string } }>('/api/rooms/search', async (request) => {
    const q = request.query.q?.trim()
    // Empty/missing q -> empty result rather than 400: keeps a debounced
    // search box simple (clearing the input just clears results, no error).
    if (!q) return { rooms: [] }

    const rooms = await prisma.room.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        OR: [
          { ownerId: request.userId },
          { participants: { some: { userId: request.userId } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // bound the response; "top 50 matches" is plenty for a name search
      include: { thumbnail: { select: { updatedAt: true } }, owner: { select: { name: true } } },
    })
    return { rooms: rooms.map(toWireRoom) }
  })

  app.delete<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    const room = await prisma.room.findUnique({ where: { id: request.params.id } })
    if (!room) return reply.code(404).send({ error: 'not_found' })
    if (room.ownerId !== request.userId) return reply.code(403).send({ error: 'forbidden' })

    // Operation/RoomParticipant rows cascade (onDelete: Cascade in schema).
    await prisma.room.delete({ where: { id: room.id } })
    return { ok: true }
  })
}
