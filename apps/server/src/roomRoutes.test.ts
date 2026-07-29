import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerRoomRoutes } from './roomRoutes.js'

// Route-level tests in the style of thumbnailRoutes.test.ts — Prisma mocked,
// a bare Fastify() instance with a preHandler stub filling request.userId.
const mockPrisma = vi.hoisted(() => ({
  room: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  roomParticipant: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

// (#222) The route mirrors the closed state into rooms.ts's live record;
// stubbed here so this stays a route test — rooms.ts's own half of the
// behavior is covered in rooms.test.ts.
const mockSetRoomClosed = vi.hoisted(() => vi.fn())
vi.mock('./rooms.js', () => ({ setRoomClosed: mockSetRoomClosed }))

function buildApp(userId = 'user-1', notifyRoomClosed?: (roomId: string, closedAt: string | null) => void)
: FastifyInstance {
  const app = Fastify()
  app.addHook('preHandler', async (request) => {
    request.userId = userId
  })
  registerRoomRoutes(app, notifyRoomClosed)
  return app
}

function leaveRoom(app: FastifyInstance, roomId: string) {
  return app.inject({ method: 'DELETE', url: `/api/rooms/${roomId}/participation` })
}

function search(app: FastifyInstance, q?: string) {
  return app.inject({
    method: 'GET',
    url: q === undefined ? '/api/rooms/search' : `/api/rooms/search?q=${encodeURIComponent(q)}`,
  })
}

const dbRoom = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'room-1', name: 'Still Life Study', paper: 'coarse', infinite: false,
  canvasWidth: 800, canvasHeight: 600, passwordHash: null, ownerId: 'user-1',
  createdAt: new Date('2026-01-01'), thumbnail: null, owner: { name: 'Ilya' },
  ...overrides,
})

beforeEach(() => {
  mockPrisma.room.findUnique.mockReset()
  mockPrisma.room.findMany.mockReset()
  mockPrisma.room.update.mockReset()
  mockPrisma.room.delete.mockReset()
  mockPrisma.roomParticipant.findUnique.mockReset()
  mockPrisma.roomParticipant.delete.mockReset()
  mockSetRoomClosed.mockReset()
})

// (#222) Owner-only toggle of "closed for editing" — REST rather than a
// socket event because it is persisted and is reachable from the lesson list,
// where the caller has no socket joined to that room.
describe('PATCH /api/rooms/:id/closed', () => {
  const closedRoom = (closedAt: Date | null) => dbRoom({ closedAt })

  function toggle(app: FastifyInstance, closed: unknown, roomId = 'room-1') {
    return app.inject({ method: 'PATCH', url: `/api/rooms/${roomId}/closed`, payload: { closed } })
  }

  it('closes an open room, stamping and returning closedAt', async () => {
    mockPrisma.room.findUnique.mockResolvedValue(closedRoom(null))
    mockPrisma.room.update.mockImplementation(({ data }: { data: { closedAt: Date | null } }) =>
      Promise.resolve(closedRoom(data.closedAt)))

    const res = await toggle(buildApp(), true)

    expect(res.statusCode).toBe(200)
    expect(typeof res.json().closedAt).toBe('string')
    expect(mockPrisma.room.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'room-1' }, data: { closedAt: expect.any(Date) },
    }))
  })

  it('reopens a closed room, clearing closedAt', async () => {
    mockPrisma.room.findUnique.mockResolvedValue(closedRoom(new Date('2026-07-01')))
    mockPrisma.room.update.mockResolvedValue(closedRoom(null))

    const res = await toggle(buildApp(), false)

    expect(res.statusCode).toBe(200)
    expect(res.json().closedAt).toBeUndefined()
    expect(mockPrisma.room.update).toHaveBeenCalledWith(expect.objectContaining({ data: { closedAt: null } }))
  })

  // The timestamp answers "when was this handed out". Restamping it on a
  // second click of an already-closed toggle would quietly destroy that.
  it('keeps the original timestamp when closing an already-closed room', async () => {
    const alreadyClosed = new Date('2026-07-01T09:00:00.000Z')
    mockPrisma.room.findUnique.mockResolvedValue(closedRoom(alreadyClosed))

    const res = await toggle(buildApp(), true)

    expect(res.statusCode).toBe(200)
    expect(res.json().closedAt).toBe(alreadyClosed.toISOString())
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
  })

  it('notifies the room and updates the live mirror, but only on a real change', async () => {
    const notify = vi.fn()
    mockPrisma.room.findUnique.mockResolvedValue(closedRoom(null))
    mockPrisma.room.update.mockImplementation(({ data }: { data: { closedAt: Date | null } }) =>
      Promise.resolve(closedRoom(data.closedAt)))

    await toggle(buildApp('user-1', notify), true)
    expect(mockSetRoomClosed).toHaveBeenCalledWith('room-1', expect.any(String))
    expect(notify).toHaveBeenCalledWith('room-1', expect.any(String))

    notify.mockReset()
    mockSetRoomClosed.mockReset()
    mockPrisma.room.findUnique.mockResolvedValue(closedRoom(new Date('2026-07-01')))
    await toggle(buildApp('user-1', notify), true)
    expect(notify).not.toHaveBeenCalled()
    expect(mockSetRoomClosed).not.toHaveBeenCalled()
  })

  it('refuses a non-owner and an unknown room', async () => {
    mockPrisma.room.findUnique.mockResolvedValue(closedRoom(null))
    expect((await toggle(buildApp('someone-else'), true)).statusCode).toBe(403)

    mockPrisma.room.findUnique.mockResolvedValue(null)
    expect((await toggle(buildApp(), true)).statusCode).toBe(404)
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
  })

  it('rejects a body without a boolean `closed`', async () => {
    mockPrisma.room.findUnique.mockResolvedValue(closedRoom(null))

    expect((await toggle(buildApp(), 'yes')).statusCode).toBe(400)
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/rooms/:id (rename)', () => {
  const dbRoom = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'room-1', name: 'New name', paper: 'coarse', infinite: false,
    canvasWidth: 800, canvasHeight: 600, passwordHash: null, ownerId: 'user-1',
    createdAt: new Date('2026-01-01'), thumbnail: null, owner: { name: 'Ilya' },
    ...overrides,
  })

  it('renames the room for its owner', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce({ id: 'room-1', ownerId: 'user-1' })
    mockPrisma.room.update.mockResolvedValueOnce(dbRoom())
    const app = buildApp('user-1')

    const res = await app.inject({ method: 'PATCH', url: '/api/rooms/room-1', payload: { name: 'New name' } })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(expect.objectContaining({ id: 'room-1', name: 'New name' }))
    expect(mockPrisma.room.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'room-1' }, data: { name: 'New name' } }),
    )
  })

  it('403s a non-owner', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce({ id: 'room-1', ownerId: 'owner-1' })
    const app = buildApp('user-2')

    const res = await app.inject({ method: 'PATCH', url: '/api/rooms/room-1', payload: { name: 'New name' } })

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
  })

  it('400s a blank name', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce({ id: 'room-1', ownerId: 'user-1' })
    const app = buildApp('user-1')

    const res = await app.inject({ method: 'PATCH', url: '/api/rooms/room-1', payload: { name: '   ' } })

    expect(res.statusCode).toBe(400)
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/rooms/:id/participation', () => {
  it('removes the caller\'s own participant row', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce({ id: 'room-1', ownerId: 'owner-1' })
    mockPrisma.roomParticipant.findUnique.mockResolvedValueOnce({ id: 'participant-1' })
    mockPrisma.roomParticipant.delete.mockResolvedValueOnce({})
    const app = buildApp('user-1')

    const res = await leaveRoom(app, 'room-1')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    expect(mockPrisma.roomParticipant.delete).toHaveBeenCalledWith({ where: { id: 'participant-1' } })
  })

  it('404s for an unknown room without touching RoomParticipant', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce(null)
    const app = buildApp('user-1')

    const res = await leaveRoom(app, 'missing-room')

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'not_found' })
    expect(mockPrisma.roomParticipant.delete).not.toHaveBeenCalled()
  })

  it('403s the owner instead of letting them leave their own room', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce({ id: 'room-1', ownerId: 'owner-1' })
    const app = buildApp('owner-1')

    const res = await leaveRoom(app, 'room-1')

    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: 'owner_cannot_leave' })
    expect(mockPrisma.roomParticipant.findUnique).not.toHaveBeenCalled()
  })

  it('404s a caller who was never a participant of the room', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce({ id: 'room-1', ownerId: 'owner-1' })
    mockPrisma.roomParticipant.findUnique.mockResolvedValueOnce(null)
    const app = buildApp('user-2')

    const res = await leaveRoom(app, 'room-1')

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'not_found' })
    expect(mockPrisma.roomParticipant.delete).not.toHaveBeenCalled()
  })
})

describe('GET /api/rooms/search', () => {
  it('returns matches scoped to the caller and maps owner name', async () => {
    mockPrisma.room.findMany.mockResolvedValueOnce([dbRoom()])
    const app = buildApp('user-1')

    const res = await search(app, 'still')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      rooms: [expect.objectContaining({ id: 'room-1', name: 'Still Life Study', ownerName: 'Ilya' })],
    })
    expect(mockPrisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: 'still', mode: 'insensitive' },
          OR: [
            { ownerId: 'user-1' },
            { participants: { some: { userId: 'user-1' } } },
          ],
        }),
        take: 50,
      }),
    )
  })

  it('returns an empty list without querying Postgres when q is missing', async () => {
    const app = buildApp()

    const res = await search(app)

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ rooms: [] })
    expect(mockPrisma.room.findMany).not.toHaveBeenCalled()
  })

  it('returns an empty list without querying Postgres when q is blank', async () => {
    const app = buildApp()

    const res = await search(app, '   ')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ rooms: [] })
    expect(mockPrisma.room.findMany).not.toHaveBeenCalled()
  })
})
