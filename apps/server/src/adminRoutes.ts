import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'

import type {
  AdminActionList, AdminActionRow, AdminDevice, AdminIpBan, AdminIpBanList, AdminIpDetail, AdminLessonList,
  AdminLessonRow, AdminOverview, AdminUserDetail, AdminUserFilter, AdminUserIp, AdminUserLesson, AdminUserList,
  AdminUserRow, ClientEnvironment,
} from '@grafetto/shared'
import { IP_BAN_DURATIONS_HOURS, sanitizeClientEnvironment } from '@grafetto/shared'

import { bannedCount, isBanned, isIpBanned, noteBanned, noteIpBan, noteRevoked } from './bans.js'
import { normalizeIp } from './sessions.js'
import { readDisk } from './disk.js'
import { readMemory } from './memory.js'
import { prisma } from './prisma.js'
import { getResidentRoomStats, listLiveLessons } from './roomStats.js'

/** What the admin routes need from the live socket server. Passed in rather
 *  than imported for the same reason the room routes take their notifiers:
 *  `io` is built in index.ts, and these routes are testable without one. */
export type AdminLive = {
  /** Every connected socket's user id, one entry per socket. */
  connectedUserIds: () => string[]
  /** Closes every socket this user has open, in every room. */
  disconnectUser: (userId: string) => void
  /** (#590) Closes every socket whose handshake came from this address. */
  disconnectIp: (ip: string) => void
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
    targetIp: a.targetIp,
    reason: a.reason,
    createdAt: a.createdAt.toISOString(),
  }))
}

async function ipBanRows(rows: Array<{
  id: string; ip: string; reason: string; createdById: string; createdAt: Date; expiresAt: Date; liftedAt: Date | null
}>): Promise<AdminIpBan[]> {
  const ids = [...new Set(rows.map(r => r.createdById))]
  const admins = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
    : []
  const emailOf = new Map(admins.map(a => [a.id, a.email]))
  return rows.map(r => ({
    id: r.id,
    ip: r.ip,
    reason: r.reason,
    createdById: r.createdById,
    createdByEmail: emailOf.get(r.createdById) ?? null,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    liftedAt: iso(r.liftedAt),
  }))
}

/** Whether any admin has been seen from this address — see the IP ban route. */
async function adminSeenOn(ip: string): Promise<boolean> {
  const emails = [...adminEmails()]
  if (emails.length === 0) return false
  const admins = await prisma.user.findMany({
    where: { email: { in: emails, mode: 'insensitive' } },
    select: { id: true },
  })
  if (admins.length === 0) return false
  const seen = await prisma.ipSighting.count({ where: { ip, userId: { in: admins.map(a => a.id) } } })
  return seen > 0
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

    const [byPlatform, byBrowser] = await Promise.all([
      prisma.userDevice.groupBy({ by: ['platform'], where: { lastSeenAt: { gte: week } }, _count: { _all: true } }),
      prisma.userDevice.groupBy({ by: ['browser'], where: { lastSeenAt: { gte: week } }, _count: { _all: true } }),
    ])
    const tally = (rows: Array<{ key: string; count: number }>) => rows.sort((a, b) => b.count - a.count)

    const memory = readMemory()
    const disk = await readDisk()
    const resident = getResidentRoomStats()

    return {
      devices: {
        byPlatform: tally(byPlatform.map(r => ({ key: r.platform, count: r._count._all }))),
        byBrowser: tally(byBrowser.map(r => ({ key: r.browser, count: r._count._all }))),
      },
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
      select: { ...USER_ROW_SELECT, banReason: true, bannedById: true, sessionsRevokedAt: true },
    })
    if (!user) return reply.code(404).send({ error: 'not_found' })

    const [owned, joined, actions, deviceRows, ipRows] = await Promise.all([
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
      prisma.userDevice.findMany({ where: { userId: id }, orderBy: { lastSeenAt: 'desc' }, take: 50 }),
      prisma.ipSighting.groupBy({
        by: ['ip'], where: { userId: id }, _min: { firstSeenAt: true }, _max: { lastSeenAt: true },
      }),
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

    const devices: AdminDevice[] = deviceRows.map(d => ({
      deviceId: d.deviceId,
      platform: d.platform,
      browser: d.browser,
      userAgent: d.userAgent,
      lastIp: d.lastIp,
      // Re-sanitized on the way out as well as in: the column is Json, and a
      // row written by some later build must not reach the page as anything
      // but the fields this one knows how to show.
      env: d.env === null ? null : sanitizeClientEnvironment(d.env) satisfies ClientEnvironment,
      envAt: iso(d.envAt),
      firstSeenAt: d.firstSeenAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
    }))
    const ips: AdminUserIp[] = ipRows
      .map(r => ({
        ip: r.ip,
        firstSeenAt: (r._min.firstSeenAt ?? new Date(0)).toISOString(),
        lastSeenAt: (r._max.lastSeenAt ?? new Date(0)).toISOString(),
        banned: isIpBanned(r.ip),
      }))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))

    const detail: AdminUserDetail = {
      ...toUserRow(user, onlineUserIds()),
      banReason: user.banReason,
      bannedById: user.bannedById,
      sessionsRevokedAt: iso(user.sessionsRevokedAt),
      lessons: [...lessons.values()],
      devices,
      ips,
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

  // (#589) Every browser this person is signed in on becomes a guest on its
  // next request. The account itself is untouched — this is for "I signed in
  // on a school computer and left", or for a ban that should also end the
  // session on a device the ban alone would not reach (it does, but this says
  // so explicitly in the journal).
  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/revoke-sessions', { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params
      if (id === request.userId) return reply.code(400).send({ error: 'cannot_revoke_self' })
      const target = await prisma.user.findUnique({ where: { id }, select: { email: true } })
      if (!target) return reply.code(404).send({ error: 'not_found' })
      const at = new Date()
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { sessionsRevokedAt: at } }),
        prisma.adminAction.create({ data: { adminId: request.userId, action: 'revoke_sessions', targetUserId: id } }),
      ])
      noteRevoked(id, at)
      live.disconnectUser(id)
      request.log.info({ adminId: request.userId, targetUserId: id }, 'admin revoked sessions')
      return { ok: true }
    },
  )

  app.get('/api/admin/ip-bans', { preHandler: requireAdmin }, async (): Promise<AdminIpBanList> => {
    const rows = await prisma.ipBan.findMany({
      where: { liftedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { bans: await ipBanRows(rows) }
  })

  app.get<{ Params: { ip: string } }>('/api/admin/ips/:ip', { preHandler: requireAdmin }, async (request): Promise<AdminIpDetail> => {
    const ip = normalizeIp(request.params.ip)
    const [sightings, bans] = await Promise.all([
      prisma.ipSighting.findMany({ where: { ip }, orderBy: { lastSeenAt: 'desc' }, take: 200 }),
      prisma.ipBan.findMany({ where: { ip }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ])
    const users = sightings.length
      ? await prisma.user.findMany({
        where: { id: { in: [...new Set(sightings.map(s => s.userId))] } },
        select: { id: true, email: true, name: true },
      })
      : []
    const userOf = new Map(users.map(u => [u.id, u]))
    const banRows = await ipBanRows(bans)
    const now = Date.now()
    return {
      ip,
      activeBan: banRows.find(b => !b.liftedAt && new Date(b.expiresAt).getTime() > now) ?? null,
      sightings: sightings.map(s => ({
        userId: s.userId,
        email: userOf.get(s.userId)?.email ?? null,
        name: userOf.get(s.userId)?.name ?? null,
        deviceId: s.deviceId,
        firstSeenAt: s.firstSeenAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        userBanned: isBanned(s.userId),
      })),
      bans: banRows,
    }
  })

  app.post<{ Params: { ip: string }; Body: { reason?: unknown; hours?: unknown } }>(
    '/api/admin/ips/:ip/ban', { preHandler: requireAdmin },
    async (request, reply) => {
      const ip = normalizeIp(request.params.ip)
      const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : ''
      if (!reason) return reply.code(400).send({ error: 'reason_required' })
      if (reason.length > MAX_REASON_LENGTH) return reply.code(400).send({ error: 'reason_too_long' })
      const hours = IP_BAN_DURATIONS_HOURS.find(h => h === request.body?.hours)
      if (hours === undefined) return reply.code(400).send({ error: 'invalid_duration' })
      if (ip === 'unknown') return reply.code(400).send({ error: 'invalid_ip' })
      // The ban is enforced before identity is resolved, so it would lock out
      // an admin as surely as anyone else — and an admin locked out of the
      // panel cannot lift it. Refused rather than exempted: an exemption
      // needs a database lookup on the one path that is built to avoid one.
      if (ip === normalizeIp(request.ip)) return reply.code(400).send({ error: 'cannot_ban_own_ip' })
      if (await adminSeenOn(ip)) return reply.code(400).send({ error: 'admin_seen_on_ip' })

      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)
      await prisma.$transaction([
        prisma.ipBan.create({ data: { ip, reason, createdById: request.userId, expiresAt } }),
        prisma.adminAction.create({
          data: { adminId: request.userId, action: 'ip_ban', targetIp: ip, reason: `${reason} (${hours} h)` },
        }),
      ])
      noteIpBan(ip, expiresAt.getTime())
      live.disconnectIp(ip)
      request.log.info({ adminId: request.userId, ip, hours }, 'admin banned ip')
      return { ok: true }
    },
  )

  app.post<{ Params: { ip: string }; Body: { reason?: unknown } }>(
    '/api/admin/ips/:ip/unban', { preHandler: requireAdmin },
    async (request, reply) => {
      const ip = normalizeIp(request.params.ip)
      const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim().slice(0, MAX_REASON_LENGTH) : ''
      const now = new Date()
      const active = { ip, liftedAt: null, expiresAt: { gt: now } }
      if ((await prisma.ipBan.count({ where: active })) === 0) return reply.code(409).send({ error: 'not_banned' })
      await prisma.$transaction([
        prisma.ipBan.updateMany({ where: active, data: { liftedAt: now } }),
        prisma.adminAction.create({
          data: { adminId: request.userId, action: 'ip_unban', targetIp: ip, reason: reason || null },
        }),
      ])
      noteIpBan(ip, null)
      request.log.info({ adminId: request.userId, ip }, 'admin lifted ip ban')
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
