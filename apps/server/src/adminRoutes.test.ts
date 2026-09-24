import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerAdminRoutes, type AdminLive } from './adminRoutes.js'
import { isBanned, isIpBanned, isTokenRevoked, noteBanned, noteIpBan } from './bans.js'

// Route-level tests, Prisma mocked — same shape as roomFolderRoutes.test.ts.
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  room: { findMany: vi.fn(), count: vi.fn() },
  roomParticipant: { findMany: vi.fn(), groupBy: vi.fn() },
  operation: { groupBy: vi.fn() },
  roomThumbnail: { findUnique: vi.fn() },
  adminAction: { create: vi.fn(), findMany: vi.fn() },
  userDevice: { findMany: vi.fn(), groupBy: vi.fn() },
  ipSighting: { findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn() },
  ipBan: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

const ADMIN = { id: 'admin-1', email: 'Ilya@Example.com' }
const USERS: Record<string, { email: string | null; bannedAt: Date | null }> = {
  'admin-1': { email: ADMIN.email, bannedAt: null },
  'admin-2': { email: 'second@example.com', bannedAt: null },
  'teacher-1': { email: 'teacher@example.com', bannedAt: null },
  'guest-1': { email: null, bannedAt: null },
  'spammer-1': { email: 'spam@example.com', bannedAt: null },
}

function buildApp(userId: string, live: Partial<AdminLive> = {}) {
  const app = Fastify()
  app.addHook('preHandler', async (request) => {
    request.userId = userId
  })
  const disconnectUser = vi.fn()
  const disconnectIp = vi.fn()
  registerAdminRoutes(app, { connectedUserIds: () => [], disconnectUser, disconnectIp, ...live })
  return { app, disconnectUser, disconnectIp }
}

beforeEach(() => {
  for (const model of Object.values(mockPrisma)) {
    if (typeof model === 'function') model.mockReset()
    else for (const fn of Object.values(model)) fn.mockReset()
  }
  process.env.ADMIN_EMAILS = ' ilya@example.com , second@example.com'
  mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const user = USERS[where.id]
    return user ? { ...user } : null
  })
  mockPrisma.$transaction.mockResolvedValue([])
  mockPrisma.adminAction.findMany.mockResolvedValue([])
  noteBanned('spammer-1', false)
  noteIpBan('203.0.113.7', null)
  mockPrisma.user.findMany.mockResolvedValue([])
  mockPrisma.ipSighting.count.mockResolvedValue(0)
})

describe('who may use it (#586)', () => {
  it('answers 404 to a signed-in person who is not on the list', async () => {
    const { app } = buildApp('teacher-1')
    const res = await app.inject({ method: 'GET', url: '/api/admin/actions' })
    expect(res.statusCode).toBe(404)
  })

  it('answers 404 to a guest, who has no address to be on the list with', async () => {
    const { app } = buildApp('guest-1')
    const res = await app.inject({ method: 'GET', url: '/api/admin/actions' })
    expect(res.statusCode).toBe(404)
  })

  it('matches the list case-insensitively and ignores spaces around entries', async () => {
    const { app } = buildApp('admin-1')
    const res = await app.inject({ method: 'GET', url: '/api/admin/actions' })
    expect(res.statusCode).toBe(200)
  })

  it('has no admins at all when ADMIN_EMAILS is unset', async () => {
    delete process.env.ADMIN_EMAILS
    const { app } = buildApp('admin-1')
    const res = await app.inject({ method: 'GET', url: '/api/admin/actions' })
    expect(res.statusCode).toBe(404)
  })

  it('refuses a ban from a non-admin without touching anything', async () => {
    const { app, disconnectUser } = buildApp('teacher-1')
    const res = await app.inject({ method: 'POST', url: '/api/admin/users/spammer-1/ban', payload: { reason: 'x' } })
    expect(res.statusCode).toBe(404)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(disconnectUser).not.toHaveBeenCalled()
    expect(isBanned('spammer-1')).toBe(false)
  })
})

describe('banning (#587)', () => {
  it('writes the ban and its journal entry together, then closes the person\'s sockets', async () => {
    const { app, disconnectUser } = buildApp('admin-1')

    const res = await app.inject({
      method: 'POST', url: '/api/admin/users/spammer-1/ban', payload: { reason: '  spam rooms  ' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'spammer-1' },
      data: { bannedAt: expect.any(Date), banReason: 'spam rooms', bannedById: 'admin-1' },
    })
    expect(mockPrisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 'admin-1', action: 'ban', targetUserId: 'spammer-1', reason: 'spam rooms' },
    })
    expect(isBanned('spammer-1')).toBe(true)
    expect(disconnectUser).toHaveBeenCalledWith('spammer-1')
  })

  it('leaves nobody banned in memory when the write fails', async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error('db down'))
    const { app, disconnectUser } = buildApp('admin-1')

    const res = await app.inject({ method: 'POST', url: '/api/admin/users/spammer-1/ban', payload: { reason: 'spam' } })

    expect(res.statusCode).toBe(500)
    expect(isBanned('spammer-1')).toBe(false)
    expect(disconnectUser).not.toHaveBeenCalled()
  })

  it('requires a reason', async () => {
    const { app } = buildApp('admin-1')
    const res = await app.inject({ method: 'POST', url: '/api/admin/users/spammer-1/ban', payload: { reason: '   ' } })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'reason_required' })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('will not ban the admin doing it, nor another admin', async () => {
    const { app } = buildApp('admin-1')
    const self = await app.inject({ method: 'POST', url: '/api/admin/users/admin-1/ban', payload: { reason: 'x' } })
    const other = await app.inject({ method: 'POST', url: '/api/admin/users/admin-2/ban', payload: { reason: 'x' } })
    expect(self.json()).toEqual({ error: 'cannot_ban_self' })
    expect(other.json()).toEqual({ error: 'cannot_ban_admin' })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('says 409 for someone already banned rather than stacking a second entry', async () => {
    USERS['spammer-1'].bannedAt = new Date()
    try {
      const { app } = buildApp('admin-1')
      const res = await app.inject({ method: 'POST', url: '/api/admin/users/spammer-1/ban', payload: { reason: 'x' } })
      expect(res.statusCode).toBe(409)
      expect(mockPrisma.adminAction.create).not.toHaveBeenCalled()
    } finally {
      USERS['spammer-1'].bannedAt = null
    }
  })

  it('unbans, clearing the fields and journaling it', async () => {
    USERS['spammer-1'].bannedAt = new Date()
    noteBanned('spammer-1', true)
    try {
      const { app } = buildApp('admin-1')
      const res = await app.inject({ method: 'POST', url: '/api/admin/users/spammer-1/unban', payload: {} })
      expect(res.statusCode).toBe(200)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'spammer-1' }, data: { bannedAt: null, banReason: null, bannedById: null },
      })
      expect(mockPrisma.adminAction.create).toHaveBeenCalledWith({
        data: { adminId: 'admin-1', action: 'unban', targetUserId: 'spammer-1', reason: null },
      })
      expect(isBanned('spammer-1')).toBe(false)
    } finally {
      USERS['spammer-1'].bannedAt = null
    }
  })
})

describe('user list (#586)', () => {
  it('defaults to registered accounts and never lists a guest who did nothing', async () => {
    mockPrisma.user.findMany.mockResolvedValue([])
    mockPrisma.user.count.mockResolvedValue(0)
    const { app } = buildApp('admin-1')

    await app.inject({ method: 'GET', url: '/api/admin/users' })
    await app.inject({ method: 'GET', url: '/api/admin/users?filter=all' })

    expect(mockPrisma.user.findMany.mock.calls[0][0].where).toEqual({ email: { not: null } })
    // "all" still means "everyone who did something": an address, or a room.
    const all = mockPrisma.user.findMany.mock.calls[1][0].where
    expect(all.OR).toContainEqual({ email: { not: null } })
    expect(all.OR).toContainEqual({ participatedRooms: { some: {} } })
    expect(all.OR).not.toContainEqual({})
  })

  it('marks who is connected right now', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'teacher-1', email: 'teacher@example.com', name: null, createdAt: new Date(), lastSeenAt: null,
        bannedAt: null, _count: { ownedRooms: 2, participatedRooms: 3 },
      },
    ])
    mockPrisma.user.count.mockResolvedValue(1)
    const { app } = buildApp('admin-1', { connectedUserIds: () => ['teacher-1', 'teacher-1'] })

    const res = await app.inject({ method: 'GET', url: '/api/admin/users' })

    expect(res.json()).toMatchObject({ total: 1, users: [{ id: 'teacher-1', online: true, ownedLessons: 2 }] })
  })
})

describe('sign out everywhere (#589)', () => {
  it('stamps the revocation, journals it, refuses older tokens and closes live sockets', async () => {
    const { app, disconnectUser } = buildApp('admin-1')
    const before = Math.floor(Date.now() / 1000) - 5

    const res = await app.inject({ method: 'POST', url: '/api/admin/users/teacher-1/revoke-sessions' })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'teacher-1' }, data: { sessionsRevokedAt: expect.any(Date) },
    })
    expect(mockPrisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 'admin-1', action: 'revoke_sessions', targetUserId: 'teacher-1' },
    })
    expect(isTokenRevoked('teacher-1', before)).toBe(true)
    // A token signed in the same second as the revocation is the sign-in that
    // follows it, not one the revocation was aimed at.
    expect(isTokenRevoked('teacher-1', Math.floor(Date.now() / 1000))).toBe(false)
    expect(disconnectUser).toHaveBeenCalledWith('teacher-1')
  })
})

describe('IP bans (#590)', () => {
  const ban = (app: FastifyInstance, ip: string, payload: object) =>
    app.inject({ method: 'POST', url: `/api/admin/ips/${encodeURIComponent(ip)}/ban`, payload, remoteAddress: '198.51.100.1' })

  it('bans for one of the fixed durations, journals it, and closes sockets from the address', async () => {
    const { app, disconnectIp } = buildApp('admin-1')

    const res = await ban(app, '203.0.113.7', { reason: 'ban evasion', hours: 24 })

    expect(res.statusCode).toBe(200)
    const created = mockPrisma.ipBan.create.mock.calls[0][0].data
    expect(created).toMatchObject({ ip: '203.0.113.7', reason: 'ban evasion', createdById: 'admin-1' })
    const hours = (created.expiresAt.getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(23.9)
    expect(hours).toBeLessThanOrEqual(24)
    expect(mockPrisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 'admin-1', action: 'ip_ban', targetIp: '203.0.113.7', reason: 'ban evasion (24 h)' },
    })
    expect(isIpBanned('203.0.113.7')).toBe(true)
    expect(disconnectIp).toHaveBeenCalledWith('203.0.113.7')
  })

  it('has no "forever": any duration outside the menu is refused', async () => {
    const { app } = buildApp('admin-1')
    for (const hours of [0, 2, 24 * 365, 'forever', undefined]) {
      const res = await ban(app, '203.0.113.7', { reason: 'x', hours })
      expect(res.json()).toEqual({ error: 'invalid_duration' })
    }
    expect(mockPrisma.ipBan.create).not.toHaveBeenCalled()
  })

  it('will not ban the address the admin is using, nor one an admin was seen on', async () => {
    const { app } = buildApp('admin-1')
    const own = await ban(app, '198.51.100.1', { reason: 'x', hours: 1 })
    expect(own.json()).toEqual({ error: 'cannot_ban_own_ip' })

    mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin-2' }])
    mockPrisma.ipSighting.count.mockResolvedValue(1)
    const shared = await ban(app, '203.0.113.7', { reason: 'x', hours: 1 })
    expect(shared.json()).toEqual({ error: 'admin_seen_on_ip' })
    expect(mockPrisma.ipBan.create).not.toHaveBeenCalled()
  })

  it('lifts every active ban on the address', async () => {
    noteIpBan('203.0.113.7', Date.now() + 3_600_000)
    mockPrisma.ipBan.count.mockResolvedValue(1)
    const { app } = buildApp('admin-1')

    const res = await app.inject({ method: 'POST', url: '/api/admin/ips/203.0.113.7/unban', payload: {} })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.ipBan.updateMany).toHaveBeenCalledWith({
      where: { ip: '203.0.113.7', liftedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { liftedAt: expect.any(Date) },
    })
    expect(isIpBanned('203.0.113.7')).toBe(false)
  })

  it('forgets a ban the moment it expires, without anyone lifting it', () => {
    const now = Date.now()
    noteIpBan('203.0.113.7', now + 1000)
    expect(isIpBanned('203.0.113.7', now)).toBe(true)
    expect(isIpBanned('203.0.113.7', now + 1000)).toBe(false)
  })
})
