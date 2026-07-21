import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerRoomRoutes } from './roomRoutes.js'

const mockPrisma = vi.hoisted(() => ({
  room: {
    findMany: vi.fn(),
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

function search(app: FastifyInstance, q?: string) {
  return app.inject({
    method: 'GET',
    url: q === undefined ? '/api/rooms/search' : `/api/rooms/search?q=${encodeURIComponent(q)}`,
  })
}

const dbRoom = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'room-1', name: 'Still Life Study', paper: 'rough', infinite: false,
  canvasWidth: 800, canvasHeight: 600, passwordHash: null, ownerId: 'user-1',
  createdAt: new Date('2026-01-01'), thumbnail: null, owner: { name: 'Ilya' },
  ...overrides,
})

beforeEach(() => {
  mockPrisma.room.findMany.mockReset()
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
