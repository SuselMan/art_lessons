import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerRoomFolderRoutes } from './roomFolderRoutes.js'

// Route-level tests — Prisma is mocked, matching thumbnailRoutes.test.ts's
// pattern (bare Fastify() instance, a preHandler stub fills request.userId).
const mockPrisma = vi.hoisted(() => ({
  roomFolder: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  roomParticipant: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

function buildApp(userId = 'user-1'): FastifyInstance {
  const app = Fastify()
  app.addHook('preHandler', async (request) => {
    request.userId = userId
  })
  registerRoomFolderRoutes(app)
  return app
}

beforeEach(() => {
  mockPrisma.roomFolder.findMany.mockReset()
  mockPrisma.roomFolder.findUnique.mockReset()
  mockPrisma.roomFolder.create.mockReset()
  mockPrisma.roomFolder.update.mockReset()
  mockPrisma.roomFolder.delete.mockReset()
  mockPrisma.roomFolder.count.mockReset()
  mockPrisma.roomParticipant.findMany.mockReset()
  mockPrisma.roomParticipant.count.mockReset()
})

describe('GET /api/rooms', () => {
  it('returns only the direct children of the requested folder level', async () => {
    const app = buildApp()
    mockPrisma.roomFolder.findMany.mockResolvedValueOnce([
      { id: 'sub-1', userId: 'user-1', name: 'Sub', parentFolderId: 'folder-1', createdAt: new Date() },
    ])
    mockPrisma.roomParticipant.findMany.mockResolvedValueOnce([
      {
        folderId: 'folder-1',
        room: {
          id: 'room-1', name: 'Room 1', paper: 'smooth', infinite: false,
          canvasWidth: 100, canvasHeight: 100, passwordHash: null, ownerId: 'user-1',
          createdAt: new Date(), thumbnail: null, owner: { name: 'Alice' },
        },
      },
    ])

    const res = await app.inject({ method: 'GET', url: '/api/rooms?folderId=folder-1' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.folders).toHaveLength(1)
    expect(body.folders[0].id).toBe('sub-1')
    expect(body.rooms).toHaveLength(1)
    expect(body.rooms[0].id).toBe('room-1')
    expect(body.rooms[0].folderId).toBe('folder-1')

    // Only this level's children were queried — not the whole tree.
    expect(mockPrisma.roomFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', parentFolderId: 'folder-1' } }),
    )
    expect(mockPrisma.roomParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', folderId: 'folder-1' } }),
    )
  })

  it('treats an omitted folderId as the root level', async () => {
    const app = buildApp()
    mockPrisma.roomFolder.findMany.mockResolvedValueOnce([])
    mockPrisma.roomParticipant.findMany.mockResolvedValueOnce([])

    await app.inject({ method: 'GET', url: '/api/rooms' })

    expect(mockPrisma.roomFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', parentFolderId: null } }),
    )
    expect(mockPrisma.roomParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', folderId: null } }),
    )
  })
})

describe('PATCH /api/rooms/folders/:id (reparent)', () => {
  it('rejects moving a folder directly into itself', async () => {
    const app = buildApp()
    mockPrisma.roomFolder.findUnique.mockResolvedValueOnce({
      id: 'folder-1', userId: 'user-1', name: 'A', parentFolderId: null, createdAt: new Date(),
    })

    const res = await app.inject({
      method: 'PATCH', url: '/api/rooms/folders/folder-1',
      payload: { parentFolderId: 'folder-1' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('cycle')
  })

  it('rejects moving a folder into its own descendant', async () => {
    const app = buildApp()
    // folder-1 is being reparented under folder-2, which is folder-1's own child.
    mockPrisma.roomFolder.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) => {
      if (id === 'folder-1') {
        return Promise.resolve({ id: 'folder-1', userId: 'user-1', name: 'A', parentFolderId: null, createdAt: new Date() })
      }
      if (id === 'folder-2') {
        return Promise.resolve({ id: 'folder-2', userId: 'user-1', name: 'B', parentFolderId: 'folder-1', createdAt: new Date() })
      }
      return Promise.resolve(null)
    })

    const res = await app.inject({
      method: 'PATCH', url: '/api/rooms/folders/folder-1',
      payload: { parentFolderId: 'folder-2' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('cycle')
    expect(mockPrisma.roomFolder.update).not.toHaveBeenCalled()
  })

  it('allows a valid reparent', async () => {
    const app = buildApp()
    mockPrisma.roomFolder.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) => {
      if (id === 'folder-1') {
        return Promise.resolve({ id: 'folder-1', userId: 'user-1', name: 'A', parentFolderId: null, createdAt: new Date() })
      }
      if (id === 'folder-2') {
        return Promise.resolve({ id: 'folder-2', userId: 'user-1', name: 'B', parentFolderId: null, createdAt: new Date() })
      }
      return Promise.resolve(null)
    })
    mockPrisma.roomFolder.update.mockResolvedValueOnce({
      id: 'folder-1', userId: 'user-1', name: 'A', parentFolderId: 'folder-2', createdAt: new Date(),
    })

    const res = await app.inject({
      method: 'PATCH', url: '/api/rooms/folders/folder-1',
      payload: { parentFolderId: 'folder-2' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().parentFolderId).toBe('folder-2')
  })
})

describe('DELETE /api/rooms/folders/:id', () => {
  it('rejects deleting a non-empty folder (has a room)', async () => {
    const app = buildApp()
    mockPrisma.roomFolder.findUnique.mockResolvedValueOnce({
      id: 'folder-1', userId: 'user-1', name: 'A', parentFolderId: null, createdAt: new Date(),
    })
    mockPrisma.roomParticipant.count.mockResolvedValueOnce(1)
    mockPrisma.roomFolder.count.mockResolvedValueOnce(0)

    const res = await app.inject({ method: 'DELETE', url: '/api/rooms/folders/folder-1' })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('not_empty')
    expect(mockPrisma.roomFolder.delete).not.toHaveBeenCalled()
  })

  it('rejects deleting a folder that still has a subfolder', async () => {
    const app = buildApp()
    mockPrisma.roomFolder.findUnique.mockResolvedValueOnce({
      id: 'folder-1', userId: 'user-1', name: 'A', parentFolderId: null, createdAt: new Date(),
    })
    mockPrisma.roomParticipant.count.mockResolvedValueOnce(0)
    mockPrisma.roomFolder.count.mockResolvedValueOnce(1)

    const res = await app.inject({ method: 'DELETE', url: '/api/rooms/folders/folder-1' })
    expect(res.statusCode).toBe(409)
    expect(mockPrisma.roomFolder.delete).not.toHaveBeenCalled()
  })

  it('deletes an empty folder', async () => {
    const app = buildApp()
    mockPrisma.roomFolder.findUnique.mockResolvedValueOnce({
      id: 'folder-1', userId: 'user-1', name: 'A', parentFolderId: null, createdAt: new Date(),
    })
    mockPrisma.roomParticipant.count.mockResolvedValueOnce(0)
    mockPrisma.roomFolder.count.mockResolvedValueOnce(0)
    mockPrisma.roomFolder.delete.mockResolvedValueOnce({})

    const res = await app.inject({ method: 'DELETE', url: '/api/rooms/folders/folder-1' })
    expect(res.statusCode).toBe(200)
    expect(mockPrisma.roomFolder.delete).toHaveBeenCalledWith({ where: { id: 'folder-1' } })
  })

  it('404s deleting another user\'s folder', async () => {
    const app = buildApp('user-2')
    mockPrisma.roomFolder.findUnique.mockResolvedValueOnce({
      id: 'folder-1', userId: 'user-1', name: 'A', parentFolderId: null, createdAt: new Date(),
    })

    const res = await app.inject({ method: 'DELETE', url: '/api/rooms/folders/folder-1' })
    expect(res.statusCode).toBe(404)
  })
})
