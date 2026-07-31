import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { RoomAccessInfo, RoomAccessMode } from '@grafetto/shared'
import { isRoomAccessMode } from '@grafetto/shared'

import { prisma } from './prisma.js'
import { hashRoomPassword, setRoomAccessMode, setRoomPassword } from './rooms.js'

/** Access control's own endpoints (#226, release track #314 §6) — the surface
 *  the access panel (#228) drives, from the lesson list as well as from inside
 *  a live room. REST rather than socket events for the same reason closing a
 *  room is (#222): the caller often has no socket joined to the room they are
 *  administering, and every one of these changes is persisted anyway.
 *
 *  Every route here is owner-only. Not "owner or participant": this is the
 *  panel that decides who gets in, and a member who could edit the allow-list
 *  could invite themselves back after being removed.
 *
 *  What deliberately isn't here: telling the room live that something changed
 *  (a kicked user being disconnected mid-lesson, the owner's queue updating
 *  without a reload). That's #227, which owns the socket half; these routes
 *  move the durable state, which is what the next join is judged against
 *  either way.
 */

/** (#227) The live half, injected rather than reached for — this file knows
 *  nothing about socket.io, and keeping it that way is what lets
 *  roomAccessRoutes.test.ts run without a socket harness. Same arrangement as
 *  roomRoutes.ts's `RoomClosedNotifier`; index.ts supplies the real one.
 *
 *  Both are best-effort by design. Every decision they announce is already
 *  durable by the time they fire, and the join gate re-reads it from Postgres
 *  on the next attempt — so a notification that reaches nobody (owner offline,
 *  asker's tab closed) costs a moment of staleness, never access. */
export type RoomAccessNotifier = {
  joinRequestResolved: (roomId: string, userId: string, approved: boolean) => void
  kicked: (roomId: string, userId: string) => void
}


// Deliberately loose. This is not a validator for whether mail will arrive —
// nothing but sending can answer that — it exists to reject a typo'd or empty
// value before it becomes a permanent row nobody can match against. The
// normalization matters far more than the shape: `RoomInvite.email` is
// compared against `User.email` at join time (roomAccess.ts), and both sides
// only ever meet if both are stored trimmed and lowercased.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  return EMAIL_SHAPE.test(normalized) ? normalized : null
}

/** Resolves the room and proves the caller owns it, or sends the response
 *  itself and returns null — so each route below reads as its own logic
 *  rather than as four lines of the same preamble. 404 for a room that isn't
 *  there, 403 for one that isn't theirs. */
async function requireOwnedRoom(
  request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply,
): Promise<{ id: string; accessMode: RoomAccessMode; passwordHash: string | null } | null> {
  const room = await prisma.room.findUnique({
    where: { id: request.params.id },
    select: { id: true, ownerId: true, accessMode: true, passwordHash: true },
  })
  if (!room) {
    await reply.code(404).send({ error: 'not_found' })
    return null
  }
  if (room.ownerId !== request.userId) {
    await reply.code(403).send({ error: 'forbidden' })
    return null
  }
  return { id: room.id, accessMode: room.accessMode, passwordHash: room.passwordHash }
}

export function registerRoomAccessRoutes(app: FastifyInstance, notify?: RoomAccessNotifier): void {
  // Everything the access panel needs to render itself, in one request.
  app.get<{ Params: { id: string } }>('/api/rooms/:id/access', async (request, reply) => {
    const room = await requireOwnedRoom(request, reply)
    if (!room) return reply

    const [invites, pendingRequests, participants, blocks] = await Promise.all([
      prisma.roomInvite.findMany({
        where: { roomId: room.id }, orderBy: { createdAt: 'asc' },
        select: { email: true, createdAt: true },
      }),
      prisma.roomJoinRequest.findMany({
        where: { roomId: room.id, status: 'pending' }, orderBy: { requestedAt: 'asc' },
        select: { id: true, userId: true, name: true, requestedAt: true, user: { select: { email: true } } },
      }),
      prisma.roomParticipant.findMany({
        where: { roomId: room.id }, orderBy: { firstJoinedAt: 'asc' },
        // Two names, in this order of preference: what they called themselves
        // when they joined *this* room, and failing that whatever their
        // account is called. The first is null only for rows written before
        // #226 added the column; the second is null for almost everyone, since
        // the join screen's name never used to reach Postgres at all.
        select: { userId: true, name: true, user: { select: { name: true } } },
      }),
      prisma.roomBlock.findMany({ where: { roomId: room.id }, select: { userId: true } }),
    ])

    const blockedIds = new Set(blocks.map(b => b.userId))
    const info: RoomAccessInfo = {
      accessMode: room.accessMode,
      hasPassword: room.passwordHash !== null,
      invites: invites.map(i => ({ email: i.email, invitedAt: i.createdAt.toISOString() })),
      pendingRequests: pendingRequests.map(r => ({
        id: r.id, userId: r.userId, name: r.name,
        email: r.user.email, requestedAt: r.requestedAt.toISOString(),
      })),
      participants: participants.map(p => ({
        userId: p.userId, name: p.name ?? p.user.name, blocked: blockedIds.has(p.userId),
      })),
    }
    return info
  })

  // The two settings that decide who gets in. One endpoint rather than two
  // because the panel presents them as one decision ("who can join this
  // lesson") and they are routinely changed together — switching a room to
  // invite-only and dropping its now-redundant password is a single intent,
  // and splitting it would leave a window where the room is in neither of the
  // two states the owner meant.
  //
  // Both fields are optional and independently applied: `{ accessMode }` alone
  // leaves the password alone, and vice versa. `password: null` removes it;
  // an empty string is rejected rather than treated as removal, since a blank
  // input is far more likely to be a mistake than a decision.
  app.patch<{ Params: { id: string }; Body: { accessMode?: unknown; password?: unknown } }>(
    '/api/rooms/:id/access', async (request, reply) => {
      const room = await requireOwnedRoom(request, reply)
      if (!room) return reply

      const { accessMode, password } = request.body ?? {}
      const wantsMode = accessMode !== undefined
      const wantsPassword = password !== undefined
      if (!wantsMode && !wantsPassword) return reply.code(400).send({ error: 'nothing_to_update' })

      if (wantsMode && !isRoomAccessMode(accessMode)) {
        return reply.code(400).send({ error: 'invalid_access_mode' })
      }
      if (wantsPassword && password !== null && (typeof password !== 'string' || password.length === 0)) {
        return reply.code(400).send({ error: 'invalid_password' })
      }

      const nextMode = wantsMode ? accessMode as RoomAccessMode : room.accessMode
      const nextHash = wantsPassword
        ? (password === null ? null : hashRoomPassword(password as string))
        : room.passwordHash

      await prisma.room.update({
        where: { id: room.id },
        data: {
          ...(wantsMode ? { accessMode: nextMode } : {}),
          ...(wantsPassword ? { passwordHash: nextHash } : {}),
        },
      })

      // The live room has its own copy of both, and the join gate reads that
      // copy — without this, a room sitting in memory keeps admitting people
      // by the old rules until it goes idle and reloads.
      if (wantsMode) setRoomAccessMode(room.id, nextMode)
      if (wantsPassword) setRoomPassword(room.id, nextHash)

      return { accessMode: nextMode, hasPassword: nextHash !== null }
    },
  )

  app.post<{ Params: { id: string }; Body: { email?: unknown } }>(
    '/api/rooms/:id/invites', async (request, reply) => {
      const room = await requireOwnedRoom(request, reply)
      if (!room) return reply

      const email = normalizeEmail(request.body?.email)
      if (!email) return reply.code(400).send({ error: 'invalid_email' })

      const invite = await prisma.roomInvite.upsert({
        where: { roomId_email: { roomId: room.id, email } },
        create: { roomId: room.id, email, invitedByUserId: request.userId },
        update: {},
      })

      // Inviting someone who is already standing in the queue is an approval
      // by any reading of it, so don't leave them queued behind a decision the
      // owner has effectively just made — and don't make the owner click twice
      // on the same person for the same reason.
      const queued = await prisma.roomJoinRequest.findFirst({
        where: { roomId: room.id, status: 'pending', user: { email } },
        select: { id: true, userId: true },
      })
      if (queued) {
        await prisma.roomJoinRequest.update({
          where: { id: queued.id },
          data: { status: 'approved', resolvedAt: new Date() },
        })
        // (#227) An implicit approval is still an approval — the person
        // waiting on the join screen should be let in by it, not left staring
        // at a queue they have silently already left.
        notify?.joinRequestResolved(room.id, queued.userId, true)
      }

      return reply.code(201).send({ email: invite.email, invitedAt: invite.createdAt.toISOString() })
    },
  )

  // Takes the address off the allow-list. Does *not* remove anyone already in
  // the room: an invite is permission to enter, and someone who has entered is
  // a participant (see the join gate's prior-participation rule). Removing a
  // person is `kick` below, which is a different decision and says so.
  app.delete<{ Params: { id: string; email: string } }>(
    '/api/rooms/:id/invites/:email', async (request, reply) => {
      const room = await requireOwnedRoom(request, reply)
      if (!room) return reply

      const email = normalizeEmail(decodeURIComponent(request.params.email))
      if (!email) return reply.code(400).send({ error: 'invalid_email' })

      // deleteMany rather than delete: removing an invite that isn't there is
      // the state the caller asked for, not an error worth a 404 in a panel
      // that may be a click behind the truth.
      await prisma.roomInvite.deleteMany({ where: { roomId: room.id, email } })
      return { ok: true }
    },
  )

  // Resolving the queue. Approve and deny are the same write with a different
  // status, and both are idempotent-ish by way of `updateMany` scoped to the
  // room: a request id from another room can't be resolved through this one.
  for (const [suffix, status] of [['approve', 'approved'], ['deny', 'denied']] as const) {
    app.post<{ Params: { id: string; requestId: string } }>(
      `/api/rooms/:id/join-requests/:requestId/${suffix}`, async (request, reply) => {
        const room = await requireOwnedRoom(request, reply)
        if (!room) return reply

        // Read first, scoped to this room, because the answer has to reach a
        // person: `updateMany` alone would resolve the row without ever saying
        // whose it was. The scoping stays in the where clause either way — a
        // request id from another room matches nothing here.
        const target = await prisma.roomJoinRequest.findFirst({
          where: { id: request.params.requestId, roomId: room.id },
          select: { id: true, userId: true },
        })
        if (!target) return reply.code(404).send({ error: 'not_found' })

        await prisma.roomJoinRequest.update({
          where: { id: target.id },
          data: { status, resolvedAt: new Date() },
        })
        notify?.joinRequestResolved(room.id, target.userId, status === 'approved')

        return { ok: true, status }
      },
    )
  }

  // Removing a person, as opposed to closing a door. Writes the block the join
  // gate checks first, and clears the two things that would otherwise let them
  // straight back in: an invite for their address, and a request of theirs the
  // owner had already approved.
  app.post<{ Params: { id: string }; Body: { userId?: unknown } }>(
    '/api/rooms/:id/kick', async (request, reply) => {
      const room = await requireOwnedRoom(request, reply)
      if (!room) return reply

      const userId = request.body?.userId
      if (typeof userId !== 'string' || !userId) return reply.code(400).send({ error: 'invalid_user' })
      // Not a hypothetical: the participants list the panel renders includes
      // the owner, and a room whose owner has blocked themselves is a room
      // nobody can ever open again.
      if (userId === request.userId) return reply.code(400).send({ error: 'cannot_kick_owner' })

      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
      if (!user) return reply.code(404).send({ error: 'not_found' })

      await prisma.$transaction([
        prisma.roomBlock.upsert({
          where: { roomId_userId: { roomId: room.id, userId } },
          create: { roomId: room.id, userId },
          update: {},
        }),
        // A stale invite would not itself get them past the block — blocks are
        // checked first — but leaving it on the allow-list means the panel
        // shows a removed person as invited, and unblocking them later would
        // silently restore access the owner never re-granted.
        // Nothing to clear for a user with no address: the allow-list, being
        // keyed by email, cannot have listed them in the first place.
        ...(user.email
          ? [prisma.roomInvite.deleteMany({ where: { roomId: room.id, email: user.email } })]
          : []),
        prisma.roomJoinRequest.deleteMany({ where: { roomId: room.id, userId } }),
      ])

      // (#227) And out of the room they are sitting in, if they are. The block
      // above is what keeps them out; this is what makes it happen now instead
      // of at their next reconnect — which, mid-lesson, could be never.
      notify?.kicked(room.id, userId)
      return { ok: true }
    },
  )

  // Undoing a kick. Not in #226's original list, and added deliberately: a
  // block is permanent and reachable by one tap in the panel, so shipping the
  // kick without this makes a misclick unfixable except by hand in Postgres.
  app.delete<{ Params: { id: string; userId: string } }>(
    '/api/rooms/:id/blocks/:userId', async (request, reply) => {
      const room = await requireOwnedRoom(request, reply)
      if (!room) return reply

      // What this restores depends on what they were before the kick, and the
      // difference is worth knowing: someone who had actually been in the room
      // still has their `RoomParticipant` row (a kick does not erase their
      // history or their work), so the gate's prior-participation rule lets
      // them straight back in. Someone who never got past the queue has
      // nothing restored but the right to ask again — the kick dropped their
      // invite and any approval with it. Both readings of "unblock" are the
      // owner saying *you may come back*, so neither needs a second decision.
      await prisma.roomBlock.deleteMany({ where: { roomId: room.id, userId: request.params.userId } })
      return { ok: true }
    },
  )
}
