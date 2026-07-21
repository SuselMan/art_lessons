import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerRoomRoutes } from './roomRoutes.js'

// Route-level tests in the style of thumbnailRoutes.test.ts — Prisma mocked,
// a bare Fastify() instance with a preHandler stub filling request.userId.
const mockPrisma = vi.hoisted(() => ({
  room: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  roomParticipant: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

function buildApp(userId = 'user-1'): FastifyInstance {
  const app = Fastify()
  app.addHook('preHandler', async (request) => {
    request.userId = userId
  })
  registerRoomRoutes(app)
  return app
}

function leaveRoom(app: FastifyInstance, roomId: string) {
  return app.inject({ method: 'DELETE', url: `/api/rooms/${roomId}/participation` })
}

beforeEach(() => {
  mockPrisma.room.findUnique.mockReset()
  mockPrisma.room.findMany.mockReset()
  mockPrisma.roomParticipant.findUnique.mockReset()
  mockPrisma.roomParticipant.delete.mockReset()
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
