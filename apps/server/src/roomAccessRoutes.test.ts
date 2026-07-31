import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { InjectPayload, Response as LightMyRequestResponse } from 'light-my-request'

import { registerRoomAccessRoutes } from './roomAccessRoutes.js'

// Route-level tests — Prisma mocked, same pattern as roomFolderRoutes.test.ts.
const mockPrisma = vi.hoisted(() => ({
  room: { findUnique: vi.fn(), update: vi.fn() },
  roomInvite: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  roomJoinRequest: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  roomParticipant: { findMany: vi.fn() },
  roomBlock: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.resolve(ops)),
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

// The in-memory mirrors are the interesting half of PATCH — a live room that
// keeps its old mode/password admits people by rules the owner has already
// changed — so they're spies, not the real thing.
const mockRooms = vi.hoisted(() => ({
  hashRoomPassword: vi.fn((password: string) => `hashed:${password}`),
  setRoomAccessMode: vi.fn(),
  setRoomPassword: vi.fn(),
}))
vi.mock('./rooms.js', () => mockRooms)

const OWNER = 'teacher'
const ROOM = { id: 'room-1', ownerId: OWNER, accessMode: 'anyone_with_link' as const, passwordHash: null }

// (#227) The live half is injected, so these tests keep running without a
// socket harness and can still assert that the right person is told.
const notify = { joinRequestResolved: vi.fn(), kicked: vi.fn() }

function buildApp(userId = OWNER): FastifyInstance {
  const app = Fastify()
  app.addHook('preHandler', async (request) => { request.userId = userId })
  registerRoomAccessRoutes(app, notify)
  return app
}

type Res = Promise<LightMyRequestResponse>
const get = (app: FastifyInstance, url: string): Res => app.inject({ method: 'GET', url })
const post = (app: FastifyInstance, url: string, payload?: unknown): Res =>
  app.inject({ method: 'POST', url, payload: payload as InjectPayload })
const patch = (app: FastifyInstance, url: string, payload?: unknown): Res =>
  app.inject({ method: 'PATCH', url, payload: payload as InjectPayload })
const del = (app: FastifyInstance, url: string): Res => app.inject({ method: 'DELETE', url })

beforeEach(() => {
  for (const model of Object.values(mockPrisma)) {
    if (typeof model === 'function') { (model as ReturnType<typeof vi.fn>).mockClear(); continue }
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset()
  }
  for (const fn of Object.values(mockRooms)) (fn as ReturnType<typeof vi.fn>).mockClear()
  for (const fn of Object.values(notify)) fn.mockClear()

  mockPrisma.room.findUnique.mockResolvedValue(ROOM)
  mockPrisma.room.update.mockResolvedValue(ROOM)
  mockPrisma.roomInvite.findMany.mockResolvedValue([])
  mockPrisma.roomJoinRequest.findMany.mockResolvedValue([])
  mockPrisma.roomJoinRequest.findFirst.mockResolvedValue(null)
  mockPrisma.roomParticipant.findMany.mockResolvedValue([])
  mockPrisma.roomBlock.findMany.mockResolvedValue([])
})

describe('ownership (#226)', () => {
  // Every route shares one gate, so this is asserted across the set rather
  // than restated per endpoint: a member who could edit the allow-list could
  // invite themselves back after being removed.
  const calls: Array<[string, (app: FastifyInstance) => Res]> = [
    ['GET /access', app => get(app, '/api/rooms/room-1/access')],
    ['PATCH /access', app => patch(app, '/api/rooms/room-1/access', { accessMode: 'invite_only' })],
    ['POST /invites', app => post(app, '/api/rooms/room-1/invites', { email: 'a@b.com' })],
    ['DELETE /invites', app => del(app, '/api/rooms/room-1/invites/a%40b.com')],
    ['POST /approve', app => post(app, '/api/rooms/room-1/join-requests/req-1/approve')],
    ['POST /kick', app => post(app, '/api/rooms/room-1/kick', { userId: 'student' })],
    ['DELETE /blocks', app => del(app, '/api/rooms/room-1/blocks/student')],
  ]

  for (const [label, call] of calls) {
    it(`${label} is 403 for someone who merely participates`, async () => {
      expect((await call(buildApp('student'))).statusCode).toBe(403)
    })

    it(`${label} is 404 for a room that isn't there`, async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null)
      expect((await call(buildApp())).statusCode).toBe(404)
    })
  }
})

describe('GET /api/rooms/:id/access', () => {
  it('returns the whole panel in one response, with blocks folded into the participants', async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ ...ROOM, accessMode: 'invite_only', passwordHash: 'x' })
    mockPrisma.roomInvite.findMany.mockResolvedValue([{ email: 'alice@example.com', createdAt: new Date('2026-07-01') }])
    mockPrisma.roomJoinRequest.findMany.mockResolvedValue([
      { id: 'req-1', userId: 'bob', name: 'Bob', requestedAt: new Date('2026-07-02'), user: { email: 'bob@example.com' } },
    ])
    mockPrisma.roomParticipant.findMany.mockResolvedValue([
      // The name they joined this room under wins over the account's own —
      // and for rows older than the column, the account's is all there is.
      { userId: 'carol', name: 'Carol on the tablet', user: { name: 'Carol' } },
      { userId: 'dave', name: null, user: { name: null } },
    ])
    mockPrisma.roomBlock.findMany.mockResolvedValue([{ userId: 'dave' }])

    const res = await get(buildApp(), '/api/rooms/room-1/access')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      accessMode: 'invite_only',
      hasPassword: true,
      invites: [{ email: 'alice@example.com', invitedAt: '2026-07-01T00:00:00.000Z' }],
      pendingRequests: [{
        id: 'req-1', userId: 'bob', name: 'Bob', email: 'bob@example.com',
        requestedAt: '2026-07-02T00:00:00.000Z',
      }],
      participants: [
        { userId: 'carol', name: 'Carol on the tablet', blocked: false },
        { userId: 'dave', name: null, blocked: true },
      ],
    })
  })

  it('does not hand the owner the addresses of everyone who ever opened the link', async () => {
    mockPrisma.roomParticipant.findMany.mockResolvedValue([{ userId: 'carol', name: 'Carol', user: { name: null } }])

    const res = await get(buildApp(), '/api/rooms/room-1/access')

    // Participants didn't ask the owner for anything — a name is what the
    // "remove that one" decision needs. Contrast with pendingRequests above,
    // where the person is actively asking and the address is the decision.
    expect(res.json().participants[0]).not.toHaveProperty('email')
    expect(mockPrisma.roomParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { userId: true, name: true, user: { select: { name: true } } },
    }))
  })

  it('only queues pending requests, not resolved ones', async () => {
    await get(buildApp(), '/api/rooms/room-1/access')

    expect(mockPrisma.roomJoinRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId: 'room-1', status: 'pending' },
    }))
  })
})

describe('PATCH /api/rooms/:id/access', () => {
  it('changes the mode and tells the live room about it', async () => {
    const res = await patch(buildApp(), '/api/rooms/room-1/access', { accessMode: 'invite_only' })

    expect(res.json()).toEqual({ accessMode: 'invite_only', hasPassword: false })
    expect(mockPrisma.room.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { accessMode: 'invite_only' },
    }))
    // Without this the room keeps admitting people by the old mode until it
    // goes idle and reloads from Postgres.
    expect(mockRooms.setRoomAccessMode).toHaveBeenCalledWith('room-1', 'invite_only')
    expect(mockRooms.setRoomPassword).not.toHaveBeenCalled()
  })

  it('sets a password without touching the mode', async () => {
    const res = await patch(buildApp(), '/api/rooms/room-1/access', { password: 'chalk' })

    expect(res.json()).toEqual({ accessMode: 'anyone_with_link', hasPassword: true })
    expect(mockPrisma.room.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { passwordHash: 'hashed:chalk' },
    }))
    expect(mockRooms.setRoomPassword).toHaveBeenCalledWith('room-1', 'hashed:chalk')
    expect(mockRooms.setRoomAccessMode).not.toHaveBeenCalled()
  })

  it('removes the password on an explicit null', async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ ...ROOM, passwordHash: 'old' })

    const res = await patch(buildApp(), '/api/rooms/room-1/access', { password: null })

    expect(res.json().hasPassword).toBe(false)
    expect(mockRooms.setRoomPassword).toHaveBeenCalledWith('room-1', null)
  })

  it('rejects an empty password rather than reading it as removal', async () => {
    // A blank input is far more likely to be a mistake than a decision, and
    // the decision has its own spelling (null).
    const res = await patch(buildApp(), '/api/rooms/room-1/access', { password: '' })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'invalid_password' })
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
  })

  it('rejects a mode it has never heard of', async () => {
    const res = await patch(buildApp(), '/api/rooms/room-1/access', { accessMode: 'public' })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'invalid_access_mode' })
    expect(mockRooms.setRoomAccessMode).not.toHaveBeenCalled()
  })

  it('rejects an empty patch instead of pretending to have done something', async () => {
    expect((await patch(buildApp(), '/api/rooms/room-1/access', {})).statusCode).toBe(400)
  })
})

describe('invites', () => {
  it('normalizes the address before storing it', async () => {
    mockPrisma.roomInvite.upsert.mockResolvedValue({ email: 'alice@example.com', createdAt: new Date('2026-07-01') })

    const res = await post(buildApp(), '/api/rooms/room-1/invites', { email: '  Alice@Example.COM ' })

    expect(res.statusCode).toBe(201)
    // The join gate matches this against User.email; both sides only ever meet
    // if both are stored trimmed and lowercased.
    expect(mockPrisma.roomInvite.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId_email: { roomId: 'room-1', email: 'alice@example.com' } },
      create: { roomId: 'room-1', email: 'alice@example.com', invitedByUserId: OWNER },
    }))
  })

  it('rejects something that is not an address', async () => {
    for (const email of ['', 'alice', 'alice@example', 'ali ce@example.com', 42]) {
      const res = await post(buildApp(), '/api/rooms/room-1/invites', { email })
      expect(res.statusCode, `${String(email)} should not become a permanent row`).toBe(400)
    }
    expect(mockPrisma.roomInvite.upsert).not.toHaveBeenCalled()
  })

  it('inviting someone already in the queue resolves their request too', async () => {
    mockPrisma.roomInvite.upsert.mockResolvedValue({ email: 'bob@example.com', createdAt: new Date() })
    mockPrisma.roomJoinRequest.findFirst.mockResolvedValue({ id: 'req-1', userId: 'bob' })

    await post(buildApp(), '/api/rooms/room-1/invites', { email: 'bob@example.com' })

    // Inviting someone standing in the queue is an approval by any reading;
    // leaving them queued makes the owner click twice on the same decision.
    expect(mockPrisma.roomJoinRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'req-1' },
      data: expect.objectContaining({ status: 'approved' }),
    }))
    // (#227) An implicit approval is still an approval, so the person waiting
    // on the join screen is let in by it rather than left watching a queue
    // they have already silently left.
    expect(notify.joinRequestResolved).toHaveBeenCalledWith('room-1', 'bob', true)
  })

  it('removes an address from the list, and is fine with one that was already gone', async () => {
    mockPrisma.roomInvite.deleteMany.mockResolvedValue({ count: 0 })

    const res = await del(buildApp(), '/api/rooms/room-1/invites/Alice%40Example.com')

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.roomInvite.deleteMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', email: 'alice@example.com' },
    })
  })
})

describe('the queue', () => {
  beforeEach(() => {
    mockPrisma.roomJoinRequest.findFirst.mockResolvedValue({ id: 'req-1', userId: 'bob' })
  })

  it('approves and denies through the same write, and tells the asker either way', async () => {
    expect((await post(buildApp(), '/api/rooms/room-1/join-requests/req-1/approve')).json())
      .toEqual({ ok: true, status: 'approved' })
    expect(notify.joinRequestResolved).toHaveBeenCalledWith('room-1', 'bob', true)

    expect((await post(buildApp(), '/api/rooms/room-1/join-requests/req-1/deny')).json())
      .toEqual({ ok: true, status: 'denied' })
    // Denial is announced too: someone waiting on the join screen deserves an
    // answer, not a spinner that never resolves.
    expect(notify.joinRequestResolved).toHaveBeenCalledWith('room-1', 'bob', false)
  })

  it('cannot resolve a request belonging to another room', async () => {
    mockPrisma.roomJoinRequest.findFirst.mockResolvedValue(null)

    const res = await post(buildApp(), '/api/rooms/room-1/join-requests/req-elsewhere/approve')

    expect(res.statusCode).toBe(404)
    // The scoping is in the where clause, not in a check that could be
    // forgotten: a request id from another room simply matches nothing here.
    expect(mockPrisma.roomJoinRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'req-elsewhere', roomId: 'room-1' },
    }))
    expect(mockPrisma.roomJoinRequest.update).not.toHaveBeenCalled()
    expect(notify.joinRequestResolved).not.toHaveBeenCalled()
  })
})

describe('kick and unkick', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'student@example.com' })
  })

  it('blocks the user and clears what would let them back in', async () => {
    const res = await post(buildApp(), '/api/rooms/room-1/kick', { userId: 'student' })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.roomBlock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId_userId: { roomId: 'room-1', userId: 'student' } },
    }))
    // An approved request or a live invite would silently restore access the
    // moment the owner ever unblocked them.
    expect(mockPrisma.roomJoinRequest.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'room-1', userId: 'student' } })
    expect(mockPrisma.roomInvite.deleteMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', email: 'student@example.com' },
    })
    // (#227) And out of the room they are sitting in, if they are — a block
    // that only takes effect on their next reconnect is, mid-lesson, a block
    // that never takes effect.
    expect(notify.kicked).toHaveBeenCalledWith('room-1', 'student')
  })

  it('skips the invite cleanup for a guest who has no address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: null })

    await post(buildApp(), '/api/rooms/room-1/kick', { userId: 'guest' })

    expect(mockPrisma.roomBlock.upsert).toHaveBeenCalled()
    // The allow-list is keyed by email; it cannot have listed them.
    expect(mockPrisma.roomInvite.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses to let the owner block themselves', async () => {
    // The participants list the panel renders includes the owner, so this is
    // one tap away — and a room whose owner is blocked can never be opened.
    const res = await post(buildApp(), '/api/rooms/room-1/kick', { userId: OWNER })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'cannot_kick_owner' })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(notify.kicked).not.toHaveBeenCalled()
  })

  it('400s without a userId, 404s on someone who does not exist', async () => {
    expect((await post(buildApp(), '/api/rooms/room-1/kick', {})).statusCode).toBe(400)
    mockPrisma.user.findUnique.mockResolvedValue(null)
    expect((await post(buildApp(), '/api/rooms/room-1/kick', { userId: 'ghost' })).statusCode).toBe(404)
  })

  it('unblocks by removing only the block, restoring nothing else', async () => {
    mockPrisma.roomBlock.deleteMany.mockResolvedValue({ count: 1 })

    const res = await del(buildApp(), '/api/rooms/room-1/blocks/student')

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.roomBlock.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'room-1', userId: 'student' } })
    // The invite and the approval the kick dropped stay dropped. What the
    // person gets back therefore depends on what they were: a former
    // participant walks back in (the gate admits prior participants), while
    // someone who never got past the queue only gets to ask again. Verified
    // live end-to-end, not just here.
    expect(mockPrisma.roomInvite.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.roomJoinRequest.update).not.toHaveBeenCalled()
  })
})
