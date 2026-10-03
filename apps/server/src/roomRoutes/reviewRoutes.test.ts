import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerReviewRoutes } from './reviewRoutes.js'

const db = vi.hoisted(() => ({ room: { findUnique: vi.fn() }, roomBlock: { findUnique: vi.fn() }, roomReviewImage: { upsert: vi.fn(), findUnique: vi.fn() } }))
vi.mock('../db/prisma.js', () => ({ prisma: db }))
vi.mock('../rooms/rooms.js', () => ({ getParticipant: () => undefined }))

const bounds = { x: -120, y: 50, width: 20, height: 30 }
function png() {
  const data = Buffer.alloc(33)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data)
  data.write('IHDR', 12)
  data.writeUInt32BE(bounds.width, 16)
  data.writeUInt32BE(bounds.height, 20)
  return data
}
function app() {
  const app = Fastify()
  app.addHook('preHandler', async req => { req.userId = 'viewer' })
  registerReviewRoutes(app)
  return app
}
beforeEach(() => {
  vi.clearAllMocks()
  db.room.findUnique.mockResolvedValue({ ownerId: 'viewer', lessonId: null, boardOwnerId: null, participants: [], lesson: null })
  db.roomBlock.findUnique.mockResolvedValue(null)
  db.roomReviewImage.upsert.mockResolvedValue({})
  db.roomReviewImage.findUnique.mockResolvedValue({ roomId: 'room', data: png(), ...bounds, updatedAt: new Date() })
})

describe('review exports', () => {
  it('stores the image and its rect as one board asset', async () => {
    const server = app()
    const res = await server.inject({ method: 'POST', url: '/api/rooms/room/review', payload: { data: png().toString('base64'), bounds } })
    expect(res.statusCode).toBe(200)
    expect(db.roomReviewImage.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ roomId: 'room', ...bounds }) }))
    await server.close()
  })
  it('returns pixels and coordinates from the same read, without caching a replaced image', async () => {
    const server = app()
    const res = await server.inject({ method: 'GET', url: '/api/rooms/room/review' })
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload).toEqual(png())
    expect(res.headers['x-review-x']).toBe('-120')
    expect(res.headers['x-review-width']).toBe('20')
    expect(res.headers['cache-control']).toBe('no-store')
    await server.close()
  })
  it.each(['GET', 'POST'] as const)('refuses %s for an outsider, before reading or writing the image', async method => {
    db.room.findUnique.mockResolvedValue({ ownerId: 'other', lessonId: null, boardOwnerId: null, participants: [], lesson: null })
    const server = app()
    const res = await server.inject({ method, url: '/api/rooms/room/review', ...(method === 'POST' ? { payload: { data: png().toString('base64'), bounds } } : {}) })
    expect(res.statusCode).toBe(403)
    expect(db.roomReviewImage.findUnique).not.toHaveBeenCalled()
    expect(db.roomReviewImage.upsert).not.toHaveBeenCalled()
    await server.close()
  })
  it('refuses a blocked persisted participant', async () => {
    db.room.findUnique.mockResolvedValue({ ownerId: 'other', lessonId: null, boardOwnerId: null, participants: [{ userId: 'viewer' }], lesson: null })
    db.roomBlock.findUnique.mockResolvedValue({ id: 'block' })
    const server = app()
    expect((await server.inject({ method: 'GET', url: '/api/rooms/room/review' })).statusCode).toBe(403)
    await server.close()
  })
  it('returns 404 without an export, so legacy preview links can load normally', async () => {
    db.roomReviewImage.findUnique.mockResolvedValue(null)
    const server = app()
    expect((await server.inject({ method: 'GET', url: '/api/rooms/room/review' })).statusCode).toBe(404)
    await server.close()
  })
  it.each([{ ...bounds, width: 21 }, { ...bounds, x: null }, { ...bounds, height: 10000 }])('rejects invalid or mismatched coordinates: %j', async badBounds => {
    const server = app()
    const res = await server.inject({ method: 'POST', url: '/api/rooms/room/review', payload: { data: png().toString('base64'), bounds: badBounds } })
    expect(res.statusCode).toBe(400)
    expect(db.roomReviewImage.upsert).not.toHaveBeenCalled()
    await server.close()
  })
})
