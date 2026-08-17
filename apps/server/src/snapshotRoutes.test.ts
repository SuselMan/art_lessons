import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerSnapshotRoutes } from './snapshotRoutes.js'

// Route-level test, storage mocked — same shape as forkRoutes.test.ts. The
// subject here is the HTTP surface itself (#427): what is cacheable, what a
// revalidation costs, and what a non-participant can reach. Those are
// properties of the routes, not of rooms.ts, and roomSnapshots.test.ts covers
// the storage side separately.
const mockRooms = vi.hoisted(() => ({
  getParticipant: vi.fn(),
  getSnapshotIndex: vi.fn(),
  getLayerSnapshot: vi.fn(),
  getOperationsBefore: vi.fn(),
  saveSnapshot: vi.fn(),
}))
vi.mock('./rooms.js', () => mockRooms)

const HASH = 'sha256-of-decompressed-pixels'
const BLOB = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xde, 0xad, 0xbe, 0xef])

function buildApp(): FastifyInstance {
  const app = Fastify()
  app.addHook('preHandler', async request => { request.userId = 'student' })
  registerSnapshotRoutes(app)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRooms.getParticipant.mockReturnValue({ userId: 'student' })
})

describe('GET /api/rooms/:roomId/snapshots/index', () => {
  it('answers with the per-layer plan and no pixels', async () => {
    mockRooms.getSnapshotIndex.mockResolvedValue({
      seq: 300,
      layerState: { rootOrder: ['layer-1'] },
      layers: [{ layerId: 'layer-1', seq: 300, hash: HASH }],
    })

    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/index' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      seq: 300,
      layerState: { rootOrder: ['layer-1'] },
      layers: [{ layerId: 'layer-1', seq: 300, hash: HASH }],
    })
    expect(JSON.stringify(res.json())).not.toContain('data')
  })

  // Which seq is newest is exactly what changes as a lesson goes on — caching
  // this is what would make a client restore yesterday's canvas.
  it('is never cached', async () => {
    mockRooms.getSnapshotIndex.mockResolvedValue({ seq: 100, layerState: {}, layers: [] })

    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/index' })

    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('answers 204 for a room nobody has baked yet', async () => {
    mockRooms.getSnapshotIndex.mockResolvedValue(null)
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/index' })
    expect(res.statusCode).toBe(204)
  })

  it('refuses a caller who is not a live participant', async () => {
    mockRooms.getParticipant.mockReturnValue(undefined)
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/index' })
    expect(res.statusCode).toBe(403)
    expect(mockRooms.getSnapshotIndex).not.toHaveBeenCalled()
  })
})

describe('GET /api/rooms/:roomId/snapshots/:layerId/:seq', () => {
  it('sends the stored gzip bytes verbatim, without declaring the encoding', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200' })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/octet-stream')
    // Declaring gzip would make fetch() inflate it, handing the client ~33MB
    // where 5MB arrived — see the route's own comment.
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(Buffer.from(res.rawPayload).equals(BLOB)).toBe(true)
    expect(mockRooms.getLayerSnapshot).toHaveBeenCalledWith('room-1', 'layer-1', 200)
  })

  // The bytes for one (room, layer, seq) can never change — a duplicate upload
  // at a stored seq is discarded rather than allowed to overwrite. `private`
  // because participation is checked per request.
  it('is cacheable forever and privately', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200' })

    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable')
    expect(res.headers.etag).toBe(`"${HASH}"`)
  })

  it('answers a matching revalidation with 304 and no body', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({
      method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200',
      headers: { 'if-none-match': `"${HASH}"` },
    })

    expect(res.statusCode).toBe(304)
    expect(res.rawPayload.length).toBe(0)
  })

  it('serves the body when the revalidated tag does not match', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({
      method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200',
      headers: { 'if-none-match': '"some-older-hash"' },
    })

    expect(res.statusCode).toBe(200)
  })

  // Browsers send several tags at once once a URL has had more than one
  // representation cached — matching any of them is still a hit.
  it('accepts a matching tag inside a multi-tag If-None-Match', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({
      method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200',
      headers: { 'if-none-match': `"other", "${HASH}"` },
    })

    expect(res.statusCode).toBe(304)
  })

  it('answers 404 for a triple that is not stored', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue(null)
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/999' })
    expect(res.statusCode).toBe(404)
  })

  it('rejects a non-numeric seq before touching storage', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/latest' })
    expect(res.statusCode).toBe(400)
    expect(mockRooms.getLayerSnapshot).not.toHaveBeenCalled()
  })

  // The pixels of a password-protected room must not be reachable by guessing
  // its id over plain HTTP — the socket-level password check is upstream of
  // this, and `getParticipant` is what carries its result here.
  it('refuses a caller who is not a live participant', async () => {
    mockRooms.getParticipant.mockReturnValue(undefined)
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200' })
    expect(res.statusCode).toBe(403)
    expect(mockRooms.getLayerSnapshot).not.toHaveBeenCalled()
  })
})

describe('POST /api/rooms/:roomId/snapshots', () => {
  // `object`, not `unknown`: inject's payload parameter is typed, and handing
  // it an unknown makes TypeScript fall through to the callback overload,
  // whose return type has no statusCode on it.
  function post(body: object) {
    return buildApp().inject({ method: 'POST', url: '/api/rooms/room-1/snapshots', payload: body })
  }

  it('stores an accepted upload and reports what landed', async () => {
    mockRooms.saveSnapshot.mockResolvedValue({ ok: true, created: ['layer-1'], duplicated: [], mismatched: [] })

    const res = await post({ seq: 100, layerState: { items: {} }, layers: {} })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, stored: 1, duplicate: 0 })
  })

  // (#462) The rejection has to reach the client as a plain refusal — the
  // upload is best-effort and nothing retries it — and, more importantly, has
  // to leave a record naming the layers it would have erased. Without that,
  // the next occurrence is a counter rather than a diagnosis.
  it('refuses a stale layer state and names the layers it would have erased', async () => {
    mockRooms.saveSnapshot.mockResolvedValue({
      ok: false, error: 'stale_layer_state', missing: ['f1c-CNdM', 'UpIH_MCL'],
    })
    const app = buildApp()
    const warn = vi.spyOn(app.log, 'warn')

    const res = await app.inject({
      method: 'POST', url: '/api/rooms/room-1/snapshots',
      payload: { seq: 22400, layerState: { items: { 'layer-1': {} } }, layers: {} },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'stale_layer_state' })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'room-1', seq: 22400, missing: ['f1c-CNdM', 'UpIH_MCL'] }),
      expect.stringContaining('#462'),
    )
  })

  it('answers 404 rather than 400 for a room the server does not hold', async () => {
    mockRooms.saveSnapshot.mockResolvedValue({ ok: false, error: 'unknown_room' })

    const res = await post({ seq: 100, layerState: {}, layers: {} })

    expect(res.statusCode).toBe(404)
  })

  it('refuses a caller who is not a live participant', async () => {
    mockRooms.getParticipant.mockReturnValue(undefined)

    const res = await post({ seq: 100, layerState: {}, layers: {} })

    expect(res.statusCode).toBe(403)
    expect(mockRooms.saveSnapshot).not.toHaveBeenCalled()
  })
})
