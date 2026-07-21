import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerThumbnailRoutes } from './thumbnailRoutes.js'

// Route-level tests, not rooms.ts's own in-memory participant tracking — so
// unlike rooms.test.ts/roomSnapshots.test.ts, both Prisma *and* getParticipant
// are mocked here. A bare Fastify() instance (no cookie plugin, no real
// identityHook) is enough since these routes only ever read request.userId,
// never set it themselves — a plain preHandler stub fills that in per test.
const mockPrisma = vi.hoisted(() => ({
  roomThumbnail: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
  room: {
    findUnique: vi.fn(),
  },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

/** GET's access check (hasPersistedRoomAccess) shapes its query result as
 *  `{ ownerId, participants: [...] }` — see thumbnailRoutes.ts. */
function mockRoomAccess(app: { ownerId: string; participantIds: string[] } | null) {
  mockPrisma.room.findUnique.mockResolvedValueOnce(
    app && { ownerId: app.ownerId, participants: app.participantIds.map(userId => ({ userId })) },
  )
}

const mockGetParticipant = vi.hoisted(() => vi.fn())
vi.mock('./rooms.js', () => ({ getParticipant: mockGetParticipant }))

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Builds just enough of a PNG (signature + IHDR chunk header) for
 *  thumbnailRoutes.ts's manual sniff to accept or reject — not a real,
 *  fully-decodable PNG, since the route never looks past byte 24. */
function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24)
  PNG_SIGNATURE.copy(buf, 0)
  buf.writeUInt32BE(13, 8) // IHDR chunk data length (unchecked by the route, but a real value)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

function buildApp(userId = 'user-1'): FastifyInstance {
  const app = Fastify()
  app.addHook('preHandler', async (request) => {
    request.userId = userId
  })
  registerThumbnailRoutes(app)
  return app
}

function postThumbnail(app: FastifyInstance, roomId: string, buffer: Buffer) {
  return app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/thumbnail`,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ data: buffer.toString('base64') }),
  })
}

beforeEach(() => {
  mockPrisma.roomThumbnail.upsert.mockReset()
  mockPrisma.roomThumbnail.findUnique.mockReset()
  mockPrisma.room.findUnique.mockReset()
  mockGetParticipant.mockReset()
})

afterEach(async () => {
  vi.restoreAllMocks()
})

describe('POST /api/rooms/:roomId/thumbnail', () => {
  it('upserts a valid PNG upload', async () => {
    mockGetParticipant.mockReturnValue({ userId: 'user-1', name: 'A', role: 'teacher', color: '#fff' })
    mockPrisma.roomThumbnail.upsert.mockResolvedValueOnce({})
    const app = buildApp()

    const res = await postThumbnail(app, 'room-1', pngHeader(200, 100))

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    expect(mockPrisma.roomThumbnail.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: 'room-1' } }),
    )
  })

  it('rejects a non-participant with 403 without touching Postgres', async () => {
    mockGetParticipant.mockReturnValue(undefined)
    const app = buildApp()

    const res = await postThumbnail(app, 'room-1', pngHeader(200, 100))

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.roomThumbnail.upsert).not.toHaveBeenCalled()
  })

  it('rejects an oversized (>800px) image with 400 without touching Postgres', async () => {
    mockGetParticipant.mockReturnValue({ userId: 'user-1', name: 'A', role: 'teacher', color: '#fff' })
    const app = buildApp()

    const res = await postThumbnail(app, 'room-1', pngHeader(801, 100))

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'invalid_png' })
    expect(mockPrisma.roomThumbnail.upsert).not.toHaveBeenCalled()
  })

  it('rejects a corrupt/truncated buffer with 400', async () => {
    mockGetParticipant.mockReturnValue({ userId: 'user-1', name: 'A', role: 'teacher', color: '#fff' })
    const app = buildApp()

    const res = await postThumbnail(app, 'room-1', Buffer.from('not a png'))

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'invalid_png' })
    expect(mockPrisma.roomThumbnail.upsert).not.toHaveBeenCalled()
  })

  it('rejects a buffer with the wrong signature with 400', async () => {
    mockGetParticipant.mockReturnValue({ userId: 'user-1', name: 'A', role: 'teacher', color: '#fff' })
    const app = buildApp()
    const badSignature = pngHeader(200, 100)
    badSignature[0] = 0x00 // corrupt the PNG magic byte

    const res = await postThumbnail(app, 'room-1', badSignature)

    expect(res.statusCode).toBe(400)
    expect(mockPrisma.roomThumbnail.upsert).not.toHaveBeenCalled()
  })
})

describe('GET /api/rooms/:roomId/thumbnail', () => {
  // #209 follow-up (caught in live QA): GET is fetched from MyLessons'
  // RoomCard, precisely when the caller is *not* live-connected to the room
  // — so unlike POST, its guard is hasPersistedRoomAccess (owner or a
  // persisted RoomParticipant row), not the in-memory getParticipant.

  it('streams back the stored bytes with an image/png content-type (owner)', async () => {
    mockRoomAccess({ ownerId: 'user-1', participantIds: [] })
    const data = pngHeader(200, 100)
    const updatedAt = new Date('2026-07-21T00:00:00.000Z')
    mockPrisma.roomThumbnail.findUnique.mockResolvedValueOnce({ data, updatedAt })
    const app = buildApp()

    const res = await app.inject({ method: 'GET', url: '/api/rooms/room-1/thumbnail' })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers.etag).toBe(`"${updatedAt.getTime()}"`)
    expect(Buffer.compare(res.rawPayload, data)).toBe(0)
  })

  it('streams back the stored bytes for a persisted (not live-connected) participant', async () => {
    mockRoomAccess({ ownerId: 'someone-else', participantIds: ['user-1'] })
    const data = pngHeader(200, 100)
    const updatedAt = new Date('2026-07-21T00:00:00.000Z')
    mockPrisma.roomThumbnail.findUnique.mockResolvedValueOnce({ data, updatedAt })
    const app = buildApp()

    const res = await app.inject({ method: 'GET', url: '/api/rooms/room-1/thumbnail' })

    expect(res.statusCode).toBe(200)
    // The live-only registry must never be consulted for GET (that was the bug).
    expect(mockGetParticipant).not.toHaveBeenCalled()
  })

  it('returns 404 when the room has no thumbnail yet', async () => {
    mockRoomAccess({ ownerId: 'user-1', participantIds: [] })
    mockPrisma.roomThumbnail.findUnique.mockResolvedValueOnce(null)
    const app = buildApp()

    const res = await app.inject({ method: 'GET', url: '/api/rooms/room-1/thumbnail' })

    expect(res.statusCode).toBe(404)
  })

  it('rejects a caller who is neither owner nor a persisted participant, without touching the thumbnail table', async () => {
    mockRoomAccess({ ownerId: 'someone-else', participantIds: [] })
    const app = buildApp()

    const res = await app.inject({ method: 'GET', url: '/api/rooms/room-1/thumbnail' })

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.roomThumbnail.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a request for an unknown room with 403', async () => {
    mockRoomAccess(null)
    const app = buildApp()

    const res = await app.inject({ method: 'GET', url: '/api/rooms/room-1/thumbnail' })

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.roomThumbnail.findUnique).not.toHaveBeenCalled()
  })

  it('returns 304 when If-None-Match matches the current ETag', async () => {
    mockRoomAccess({ ownerId: 'user-1', participantIds: [] })
    const data = pngHeader(200, 100)
    const updatedAt = new Date('2026-07-21T00:00:00.000Z')
    mockPrisma.roomThumbnail.findUnique.mockResolvedValueOnce({ data, updatedAt })
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/api/rooms/room-1/thumbnail',
      headers: { 'if-none-match': `"${updatedAt.getTime()}"` },
    })

    expect(res.statusCode).toBe(304)
  })
})
