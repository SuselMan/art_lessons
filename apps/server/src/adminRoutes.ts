import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'

import type {
  AdminActionList, AdminActionRow, AdminLessonList, AdminLessonRow, AdminOverview, AdminUserDetail,
  AdminUserFilter, AdminUserLesson, AdminUserList, AdminUserRow,
} from '@grafetto/shared'

import { bannedCount, noteBanned } from './bans.js'
import { readDisk } from './disk.js'
import { readMemory } from './memory.js'
import { prisma } from './prisma.js'
import { getResidentRoomStats, listLiveLessons } from './rooms.js'

/** What the admin routes need from the live socket server. Passed in rather
 *  than imported for the same reason the room routes take their notifiers:
 *  `io` is built in index.ts, and these routes are testable without one. */
export type AdminLive = {
  /** Every connected socket's user id, one entry per socket. */
  connectedUserIds: () => string[]
  /** Closes every socket this user has open, in every room. */
  disconnectUser: (userId: string) => void
}

const PAGE_SIZE = 50
const MAX_REASON_LENGTH = 500
const DAY_MS = 24 * 60 * 60 * 1000

/** (#586) Who is an admin: the addresses in `ADMIN_EMAILS`, comma-separated.
 *
 *  An env allow-list rather than `User.role`, which is the subscription tier
 *  (#5) and already has an unused `ADMIN` member nobody should start reading:
 *  making someone an admin should take a deploy, not one UPDATE that anyone
 *  with database access — or a future bug in a role-editing route — can run.
 *  Read per call, not at import, so a test can set it. */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

async function adminEmailOf(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user?.email) return null
  return adminEmails().has(user.email.toLowerCase()) ? user.email : null
}

/** 404, not 403, for everyone else: a 403 would confirm to anybody poking at
 *  `/api/admin/*` that there is something here worth getting into. */
async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (!(await adminEmailOf(request.userId))) return reply.code(404).send({ error: 'not_found' })
  return undefined
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

function parseOffset(raw: string | undefined): number {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : 0
}

function userWhere(filter: AdminUserFilter, q: string): Prisma.UserWhereInput {
  // Guests who never entered a room are left out of every filter, "all"
  // included. Each is a browser that loaded one page — the health probe alone
  // would be thousands of them if it didn't skip identity (#178) — and a list
  // made of them hides the handful of people who actually did something.
  const byFilter: Record<AdminUserFilter, Prisma.UserWhereInput> = {
    all: { OR: [{ email: { not: null } }, { participatedRooms: { some: {} } }, { ownedRooms: { some: {} } }] },
    registered: { email: { not: null } },
    guests: { email: null, OR: [{ participatedRooms: { some: {} } }, { ownedRooms: { some: {} } }] },
    banned: { bannedAt: { not: null } },
  }
  if (!q) return byFilter[filter]
  return {
    AND: [
      byFilter[filter],
      { OR: [{ id: q }, { email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] },
    ],
  }
}

const USER_ROW_SELECT = {
  id: true, email: true, name: true, createdAt: true, lastSeenAt: true, bannedAt: true,
  _count: { select: { ownedRooms: { where: { lessonId: null } }, participatedRooms: true } },
} as const satisfies Prisma.UserSelect

type UserRowSource = Prisma.UserGetPayload<{ select: typeof USER_ROW_SELECT }>

function toUserRow(user: UserRowSource, online: Set<string>): AdminUserRow {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: iso(user.lastSeenAt),
    bannedAt: iso(user.bannedAt),
    ownedLessons: user._count.ownedRooms,
    joinedRooms: user._count.participatedRooms,
    online: online.has(user.id),
  }
}

async function actionRows(where: Prisma.AdminActionWhereInput, take: number): Promise<AdminActionRow[]> {
  const actions = await prisma.adminAction.findMany({ where, orderBy: { createdAt: 'desc' }, take })
  const ids = [...new Set(actions.flatMap(a => [a.adminId, a.targetUserId]).filter((id): id is string => !!id))]
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
    : []
  const emailOf = new Map(users.map(u => [u.id, u.email]))
  return actions.map(a => ({
    id: a.id,
    adminId: a.adminId,
    adminEmail: emailOf.get(a.adminId) ?? null,
    action: a.action,
    targetUserId: a.targetUserId,
    targetEmail: a.targetUserId ? emailOf.get(a.targetUserId) ?? null : null,
    targetRoomId: a.targetRoomId,
    reason: a.reason,
    createdAt: a.createdAt.toISOString(),
  }))
}

/** (#586, #587) The admin panel's API. Every route sits behind `requireAdmin`;
 *  everything here is read-only except ban and unban, and both of those write
 *  a journal entry in the same transaction as the change itself — an action
 *  that happened without its entry is exactly the one worth asking about. */
export function registerAdminRoutes(app: FastifyInstance, live: AdminLive): void {
  const onlineUserIds = () => new Set(live.connectedUserIds())

  app.get('/api/admin/overview', { preHandler: requireAdmin }, async (): Promise<AdminOverview> => {
    const now = Date.now()
    const day = new Date(now - DAY_MS)
    const week = new Date(now - 7 * DAY_MS)
    const lesson = { lessonId: null }

    const [
      registered, registeredLast24h, registeredLast7d, activeGuests, seenLast24h,
      lessonsTotal, lessonsLast24h, lessonsLast7d, lessonsActive,
    ] = await Promise.all([
      prisma.user.count({ where: { email: { not: null } } }),
      prisma.user.count({ where: { registeredAt: { gte: day } } }),
      prisma.user.count({ where: { registeredAt: { gte: week } } }),
      prisma.user.count({ where: userWhere('guests', '') }),
      prisma.user.count({ where: { lastSeenAt: { gte: day } } }),
      prisma.room.count({ where: lesson }),
      prisma.room.count({ where: { ...lesson, createdAt: { gte: day } } }),
      prisma.room.count({ where: { ...lesson, createdAt: { gte: week } } }),
      prisma.room.count({ where: { ...lesson, participants: { some: { lastActiveAt: { gte: day } } } } }),
    ])

    const socketUserIds = live.connectedUserIds()
    const liveLessons = listLiveLessons()
    const owners = liveLessons.length
      ? await prisma.user.findMany({
        where: { id: { in: [...new Set(liveLessons.map(l => l.ownerId))] } },
        select: { id: true, email: true },
      })
      : []
    const ownerEmail = new Map(owners.map(o => [o.id, o.email]))

    const memory = readMemory()
    const disk = await readDisk()
    const resident = getResidentRoomStats()

    return {
      users: { registered, registeredLast24h, registeredLast7d, activeGuests, seenLast24h, banned: bannedCount() },
      lessons: {
        total: lessonsTotal, createdLast24h: lessonsLast24h, createdLast7d: lessonsLast7d, activeLast24h: lessonsActive,
      },
      live: {
        sockets: socketUserIds.length,
        people: new Set(socketUserIds).size,
        lessons: liveLessons.map(l => ({
          lessonId: l.lessonId,
          name: l.name,
          ownerId: l.ownerId,
          ownerEmail: ownerEmail.get(l.ownerId) ?? null,
          boards: l.boards,
          participants: l.participants.map(p => ({ userId: p.userId, name: p.name, role: p.role })),
        })),
      },
      server: {
        uptimeSeconds: Math.round(process.uptime()),
        rssMb: memory.rssMb,
        heapUsedMb: memory.heapUsedMb,
        heapLimitMb: memory.heapLimitMb,
        residentRooms: resident.total,
        residentOperations: resident.operations,
        diskUsedPct: disk?.usedPct ?? null,
        diskFreeGb: disk?.freeGb ?? null,
      },
    }
  })

  app.get<{ Querystring: { filter?: string; q?: string; offset?: string } }>(
    '/api/admin/users', { preHandler: requireAdmin },
    async (request): Promise<AdminUserList> => {
      const filters: readonly AdminUserFilter[] = ['all', 'registered', 'guests', 'banned']
      const filter = filters.find(f => f === request.query.filter) ?? 'registered'
      const where = userWhere(filter, (request.query.q ?? '').trim())
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: USER_ROW_SELECT,
          orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
          skip: parseOffset(request.query.offset),
          take: PAGE_SIZE,
        }),
        prisma.user.count({ where }),
      ])
      const online = onlineUserIds()
      return { users: users.map(u => toUserRow(u, online)), total }
    },
  )

  app.get<{ Params: { id: string } }>('/api/admin/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params
    const user = await prisma.user.findUnique({
      where: { id },
      select: { ...USER_ROW_SELECT, banReason: true, bannedById: true },
    })
    if (!user) return reply.code(404).send({ error: 'not_found' })

    const [owned, joined, actions] = await Promise.all([
      prisma.room.findMany({
        where: { ownerId: id, lessonId: null },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.roomParticipant.findMany({
        where: { userId: id, room: { lessonId: null } },
        select: { name: true, lastActiveAt: true, room: { select: { id: true, name: true, createdAt: true, ownerId: true } } },
        orderBy: { lastActiveAt: 'desc' },
        take: 200,
      }),
      actionRows({ targetUserId: id }, 50),
    ])

    // The owner usually has a participant row for their own lesson too; one
    // entry per lesson, with whichever facts each source knows.
    const lessons = new Map<string, AdminUserLesson>()
    for (const row of joined) {
      lessons.set(row.room.id, {
        id: row.room.id,
        name: row.room.name,
        createdAt: row.room.createdAt.toISOString(),
        role: row.room.ownerId === id ? 'owner' : 'member',
        nameInRoom: row.name,
        lastActiveAt: row.lastActiveAt.toISOString(),
      })
    }
    for (const room of owned) {
      if (lessons.has(room.id)) continue
      lessons.set(room.id, {
        id: room.id, name: room.name, createdAt: room.createdAt.toISOString(),
        role: 'owner', nameInRoom: null, lastActiveAt: null,
      })
    }

    const detail: AdminUserDetail = {
      ...toUserRow(user, onlineUserIds()),
      banReason: user.banReason,
      bannedById: user.bannedById,
      lessons: [...lessons.values()],
      actions,
    }
    return detail
  })

  app.post<{ Params: { id: string }; Body: { reason?: unknown } }>(
    '/api/admin/users/:id/ban', { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params
      const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : ''
      // Required: a ban read back in three months with no reason is one nobody
      // can decide whether to lift.
      if (!reason) return reply.code(400).send({ error: 'reason_required' })
      if (reason.length > MAX_REASON_LENGTH) return reply.code(400).send({ error: 'reason_too_long' })
      if (id === request.userId) return reply.code(400).send({ error: 'cannot_ban_self' })

      const target = await prisma.user.findUnique({ where: { id }, select: { email: true, bannedAt: true } })
      if (!target) return reply.code(404).send({ error: 'not_found' })
      // Another admin is removed from ADMIN_EMAILS, not banned: a ban would
      // leave them locked out and still listed as an admin.
      if (target.email && adminEmails().has(target.email.toLowerCase())) {
        return reply.code(400).send({ error: 'cannot_ban_admin' })
      }
      if (target.bannedAt) return reply.code(409).send({ error: 'already_banned' })

      await prisma.$transaction([
        prisma.user.update({
          where: { id },
          data: { bannedAt: new Date(), banReason: reason, bannedById: request.userId },
        }),
        prisma.adminAction.create({
          data: { adminId: request.userId, action: 'ban', targetUserId: id, reason },
        }),
      ])
      noteBanned(id, true)
      // After the write, so a socket that reconnects in the gap already meets
      // the ban at the handshake (socketHandlers.ts).
      live.disconnectUser(id)
      request.log.info({ adminId: request.userId, targetUserId: id }, 'admin banned user')
      return { ok: true }
    },
  )

  app.post<{ Params: { id: string }; Body: { reason?: unknown } }>(
    '/api/admin/users/:id/unban', { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params
      const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim().slice(0, MAX_REASON_LENGTH) : ''
      const target = await prisma.user.findUnique({ where: { id }, select: { bannedAt: true } })
      if (!target) return reply.code(404).send({ error: 'not_found' })
      if (!target.bannedAt) return reply.code(409).send({ error: 'not_banned' })

      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { bannedAt: null, banReason: null, bannedById: null } }),
        prisma.adminAction.create({
          data: { adminId: request.userId, action: 'unban', targetUserId: id, reason: reason || null },
        }),
      ])
      noteBanned(id, false)
      request.log.info({ adminId: request.userId, targetUserId: id }, 'admin unbanned user')
      return { ok: true }
    },
  )

  app.get<{ Querystring: { q?: string; offset?: string } }>(
    '/api/admin/lessons', { preHandler: requireAdmin },
    async (request): Promise<AdminLessonList> => {
      const q = (request.query.q ?? '').trim()
      const where: Prisma.RoomWhereInput = q
        ? { lessonId: null, OR: [{ id: q }, { name: { contains: q, mode: 'insensitive' } }, { owner: { email: { contains: q, mode: 'insensitive' } } }] }
        : { lessonId: null }
      const [rooms, total] = await Promise.all([
        prisma.room.findMany({
          where,
          select: {
            id: true, name: true, createdAt: true, closedAt: true, ownerId: true,
            owner: { select: { email: true } },
            boards: { select: { id: true } },
            thumbnail: { select: { id: true } },
            _count: { select: { participants: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: parseOffset(request.query.offset),
          take: PAGE_SIZE,
        }),
        prisma.room.count({ where }),
      ])

      const lessonIds = rooms.map(r => r.id)
      const allIds = rooms.flatMap(r => [r.id, ...r.boards.map(b => b.id)])
      const [opCounts, lastActive] = allIds.length
        ? await Promise.all([
          prisma.operation.groupBy({ by: ['roomId'], where: { roomId: { in: allIds } }, _count: { _all: true } }),
          prisma.roomParticipant.groupBy({ by: ['roomId'], where: { roomId: { in: lessonIds } }, _max: { lastActiveAt: true } }),
        ])
        : [[], []]
      const opsOf = new Map(opCounts.map(row => [row.roomId, row._count._all]))
      const lastActiveOf = new Map(lastActive.map(row => [row.roomId, row._max.lastActiveAt]))
      const liveIds = new Set(listLiveLessons().map(l => l.lessonId))

      const lessons: AdminLessonRow[] = rooms.map(room => ({
        id: room.id,
        name: room.name,
        createdAt: room.createdAt.toISOString(),
        closedAt: iso(room.closedAt),
        ownerId: room.ownerId,
        ownerEmail: room.owner.email,
        participants: room._count.participants,
        boards: 1 + room.boards.length,
        operations: [room.id, ...room.boards.map(b => b.id)].reduce((sum, id) => sum + (opsOf.get(id) ?? 0), 0),
        lastActiveAt: iso(lastActiveOf.get(room.id)),
        live: liveIds.has(room.id),
        hasThumbnail: room.thumbnail !== null,
      }))
      return { lessons, total }
    },
  )

  // A picture of the lesson and nothing more. The admin panel deliberately
  // has no way into the room itself: being able to stop abuse does not need
  // reading everyone's work, and a panel that could would be the most
  // sensitive page in the product for no gain.
  app.get<{ Params: { id: string } }>('/api/admin/lessons/:id/thumbnail', { preHandler: requireAdmin }, async (request, reply) => {
    const thumbnail = await prisma.roomThumbnail.findUnique({
      where: { roomId: request.params.id },
      select: { data: true },
    })
    if (!thumbnail) return reply.code(404).send({ error: 'not_found' })
    reply.header('Content-Type', 'image/png').header('Cache-Control', 'private, max-age=300')
    return reply.send(thumbnail.data)
  })

  app.get('/api/admin/actions', { preHandler: requireAdmin }, async (): Promise<AdminActionList> => {
    return { actions: await actionRows({}, 200) }
  })
}
