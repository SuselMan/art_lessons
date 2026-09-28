import type { FastifyInstance } from 'fastify'
import type { ApiOk } from '@grafetto/shared'

import { apiRoute } from './apiRoute.js'
import { asString } from './input.js'
import { prisma } from './prisma.js'
import { ROOM_WIRE_INCLUDE, toWireRoom } from './roomMapper.js'
import { setRoomClosed } from './ownerControls.js'
import { isLesson } from './lessons.js'

/** (#222) Told when a room's closed-for-editing state changes, so whoever is
 *  currently *in* that room hears about it. Injected rather than reached for
 *  directly: this file otherwise knows nothing about socket.io, and keeping
 *  it that way is what lets roomRoutes.test.ts run without a socket harness.
 *  index.ts supplies the real one. */
export type RoomClosedNotifier = (roomId: string, closedAt: string | null) => void

/** (#176) A board id reaching a route meant for a lesson. Every route in this
 *  file addresses the *lesson* — its card, its closed state, its deletion —
 *  and a board is not a card: it is listed nowhere, has no participants of
 *  its own and is created, renamed and deleted through boardRoutes.ts, which
 *  is also where its lesson gets told. Answering 404 rather than acting on the
 *  row keeps "a board is not a room in this API" one rule. */
function isBoard(room: { lessonId?: string | null }): boolean {
  return !isLesson(room)
}

/** Backs "Мои уроки" (#116): rooms the caller owns, and rooms they were ever
 *  a participant in (join history persisted via `RoomParticipant`, not
 *  derived from who's currently connected).
 *
 *  (#176) Lessons only — `lessonId: null` on every list query here. A board
 *  is a page of a lesson and is reached through it, never as a card of its
 *  own. Belt and braces for `/mine`'s participated half: no RoomParticipant
 *  row is ever written for a board (rooms.ts's joinRoom seats people in the
 *  lesson), so it could not match anyway. */
export function registerRoomRoutes(app: FastifyInstance, notifyRoomClosed?: RoomClosedNotifier): void {
  apiRoute(app, 'GET /api/rooms/mine', async (request) => {
    // (#209) `include` the thumbnail relation `select`-narrowed to just
    // `updatedAt` — this list can be long, and pulling every room's full PNG
    // `data` blob in just to build a card list would be wasteful; the actual
    // image bytes are fetched separately via GET /api/rooms/:roomId/thumbnail.
    const [owned, participated] = await Promise.all([
      prisma.room.findMany({
        where: { ownerId: request.userId, lessonId: null },
        orderBy: { createdAt: 'desc' },
        include: ROOM_WIRE_INCLUDE,
      }),
      prisma.room.findMany({
        where: {
          ownerId: { not: request.userId },
          participants: { some: { userId: request.userId } },
          lessonId: null,
        },
        orderBy: { createdAt: 'desc' },
        include: ROOM_WIRE_INCLUDE,
      }),
    ])
    return { owned: owned.map(toWireRoom), participated: participated.map(toWireRoom) }
  })

  // (#211 epic, #214) Search is server-side and deliberately ignores the
  // caller's current folder — folder browsing (#212) is scoped to one level
  // at a time for perf, so the client has nothing to filter locally across
  // the whole tree. Same "owned OR participated" universe as `/mine`.
  apiRoute(app, 'GET /api/rooms/search', async (request) => {
    const q = asString(request.query.q)?.trim()
    // Empty/missing q -> empty result rather than 400: keeps a debounced
    // search box simple (clearing the input just clears results, no error).
    if (!q) return { rooms: [] }

    const rooms = await prisma.room.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        lessonId: null,
        OR: [
          { ownerId: request.userId },
          { participants: { some: { userId: request.userId } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // bound the response; "top 50 matches" is plenty for a name search
      include: ROOM_WIRE_INCLUDE,
    })
    return { rooms: rooms.map(toWireRoom) }
  })

  // (#211 epic, #216) Owner-only rename — same ownership gate as delete
  // below, since renaming is a structural change to shared room metadata,
  // not per-user organization (contrast with folder placement, which is the
  // caller's own and needs no ownership check).
  apiRoute(app, 'PATCH /api/rooms/:id', async (request, reply) => {
    const room = await prisma.room.findUnique({ where: { id: request.params.id } })
    if (!room || isBoard(room)) return reply.code(404).send({ error: 'not_found' })
    if (room.ownerId !== request.userId) return reply.code(403).send({ error: 'forbidden' })

    // (#623) Read, not assumed: a missing body used to throw here and answer 500.
    const name = asString(request.body?.name)?.trim()
    if (!name) return reply.code(400).send({ error: 'invalid_name' })

    const updated = await prisma.room.update({
      where: { id: room.id }, data: { name },
      include: ROOM_WIRE_INCLUDE,
    })
    return toWireRoom(updated)
  })

  // (#222) Owner-only toggle of "closed for editing" — the state a lesson
  // sits in once it has been handed out as homework (release track #314 §4).
  //
  // REST rather than a socket event, unlike its neighbours room/participant
  // freeze (#256/#257), for two reasons that both point the same way: it is
  // persisted, and it is reachable from the lesson list, where the caller has
  // no socket joined to that room to send one on. Someone who *is* in the
  // room learns about it through `room_closed_changed` below.
  //
  // Idempotent by design: closing an already-closed room keeps the original
  // timestamp rather than restamping it, so "when was this handed out"
  // survives a double click on the toggle.
  apiRoute(app, 'PATCH /api/rooms/:id/closed',
    async (request, reply) => {
      // (#627) Read with the same include the update returns, so the answer is
      // the same full Room whether or not the state changed.
      const room = await prisma.room.findUnique({ where: { id: request.params.id }, include: ROOM_WIRE_INCLUDE })
      if (!room || isBoard(room)) return reply.code(404).send({ error: 'not_found' })
      if (room.ownerId !== request.userId) return reply.code(403).send({ error: 'forbidden' })
      if (typeof request.body?.closed !== 'boolean') return reply.code(400).send({ error: 'invalid_closed' })

      const alreadyInState = (room.closedAt !== null) === request.body.closed
      const closedAt = alreadyInState ? room.closedAt : (request.body.closed ? new Date() : null)

      const updated = alreadyInState ? room : await prisma.room.update({
        where: { id: room.id }, data: { closedAt }, include: ROOM_WIRE_INCLUDE,
      })

      // The in-memory mirror has to move before the broadcast, not after: a
      // client told the room is open again will send its next stroke
      // immediately, and rooms.ts is what judges it.
      if (!alreadyInState) {
        const iso = closedAt?.toISOString() ?? null
        setRoomClosed(room.id, iso)
        notifyRoomClosed?.(room.id, iso)
      }
      return toWireRoom(updated)
    },
  )

  apiRoute(app, 'DELETE /api/rooms/:id', async (request, reply) => {
    const room = await prisma.room.findUnique({ where: { id: request.params.id } })
    if (!room || isBoard(room)) return reply.code(404).send({ error: 'not_found' })
    if (room.ownerId !== request.userId) return reply.code(403).send({ error: 'forbidden' })

    // Operation/RoomParticipant rows cascade (onDelete: Cascade in schema),
    // and so do the lesson's boards (#176) with everything under them.
    await prisma.room.delete({ where: { id: room.id } })
    return { ok: true } satisfies ApiOk
  })

  // (#213) Lets a non-owner participant remove themselves from a room —
  // unlike the owner-only DELETE above, this only drops the caller's own
  // `RoomParticipant` row. `Room` and every other participant's data (and
  // that participant's own Operations) are untouched.
  apiRoute(app, 'DELETE /api/rooms/:id/participation', async (request, reply) => {
    const room = await prisma.room.findUnique({ where: { id: request.params.id } })
    if (!room || isBoard(room)) return reply.code(404).send({ error: 'not_found' })
    if (room.ownerId === request.userId) return reply.code(403).send({ error: 'owner_cannot_leave' })

    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: request.userId } },
    })
    if (!participant) return reply.code(404).send({ error: 'not_found' })

    await prisma.roomParticipant.delete({ where: { id: participant.id } })
    return { ok: true } satisfies ApiOk
  })
}
