import Fastify from 'fastify'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { BrushStorage, empty } from './storage.js'
import { BrushSamples, sampleKey } from './samples.js'
import { registerBrushGalleryRoutes } from './galleryRoutes.js'
import { brushReference } from './contentAddressing.js'
import { mayReadBoardContent } from '../rooms/boardContentAccess.js'
vi.mock('../rooms/boardContentAccess.js', () => ({ mayReadBoardContent: vi.fn(async () => true) }))
vi.mock('../db/prisma.js', () => ({ prisma: { room: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, lessonId: where.id === 'board' ? 'lesson' : null, ownerId: 'alice', closedAt: null })) } } }))
const dirs: string[] = []
afterEach(() => { vi.clearAllMocks(); vi.mocked(mayReadBoardContent).mockResolvedValue(true); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'brush-gallery-http-')); dirs.push(dir)
  const storage = new BrushStorage(dir), personal = empty(), operator = empty()
  personal.brushes.push({ name: 'Private pen', source: 'private.kpp', warnings: [], descriptor: {
    id: 'imported-' + 'a'.repeat(16), version: 1, model: 'stamp', category: 'paint',
    tip: { kind: 'round', hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 }, paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
    sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
  } })
  storage.install('alice', personal, new Map())
  const app = Fastify(), notify = vi.fn(), samples = new BrushSamples(storage, undefined, () => {})
  app.addHook('onRequest', async request => { request.userId = typeof request.headers['x-test-user'] === 'string' ? request.headers['x-test-user'] : 'alice' })
  await registerBrushGalleryRoutes(app, storage, operator, samples, notify)
  return { app, storage, personal, notify, samples }
}
it('isolates uploads and hash-addressed previews even when another user knows their reference', async () => {
  const { app, storage, personal, samples } = await fixture()
  try {
    const brush = personal.brushes[0], ref = brushReference(brush), key = sampleKey(brush)
    writeFileSync(samples.path(key), Buffer.from('test preview'))
    expect((await app.inject('/api/brush-gallery?tab=uploads')).json().items).toHaveLength(1)
    expect((await app.inject({ url: '/api/brush-gallery?tab=uploads', headers: { 'x-test-user': 'bob' } })).json().items).toEqual([])
    expect((await app.inject({ method: 'POST', url: '/api/brush-gallery/resolve', headers: { 'x-test-user': 'bob' }, payload: { references: [ref] } })).statusCode).toBe(404)
    expect((await app.inject({ url: '/api/brush-gallery/previews/' + key, headers: { 'x-test-user': 'bob' } })).statusCode).toBe(404)
    storage.pin('lesson', 'alice', [ref])
    expect((await app.inject({ url: '/api/brush-gallery/previews/' + key + '?roomId=lesson', headers: { 'x-test-user': 'bob' } })).statusCode).toBe(200)
    vi.mocked(mayReadBoardContent).mockResolvedValue(false)
    expect((await app.inject({ url: '/api/brush-gallery/previews/' + key + '?roomId=lesson', headers: { 'x-test-user': 'bob' } })).statusCode).toBe(403)
  } finally { await app.close() }
})
it('uses the lesson selection across boards and denies edits to ordinary participants', async () => {
  const { app, storage, personal, notify } = await fixture(), ref = brushReference(personal.brushes[0])
  try {
    const payload = { references: ['native:pencil', ref] }
    expect((await app.inject({ method: 'PATCH', url: '/api/rooms/board/brush-selection', headers: { 'x-test-user': 'bob' }, payload })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PATCH', url: '/api/rooms/board/brush-selection', payload })).statusCode).toBe(200)
    expect(notify).toHaveBeenCalledWith('lesson')
    expect(storage.library('rooms','lesson').brushes).toEqual([])
    storage.pin('lesson','alice',[ref])
    expect((await app.inject('/api/rooms/lesson/brush-selection')).json().references).toEqual(payload.references)
    expect((await app.inject({ method: 'PATCH', url: '/api/rooms/board/brush-selection', payload: { references: ['native:pencil'] } })).statusCode).toBe(200)
    expect(storage.library('rooms', 'lesson').brushes).toEqual(personal.brushes)
  } finally { await app.close() }
})
it('validates pagination and keeps favorites per user', async () => {
  const { app } = await fixture()
  try {
    for (const query of ['limit=1000', 'offset=-1', 'tab=unknown']) expect((await app.inject('/api/brush-gallery?' + query)).statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url: '/api/brush-gallery/favorites', payload: { reference: 'native:pencil', favorite: true } })).statusCode).toBe(200)
    expect((await app.inject('/api/brush-gallery?tab=favorites')).json().items).toHaveLength(1)
    expect((await app.inject({ url: '/api/brush-gallery?tab=favorites', headers: { 'x-test-user': 'bob' } })).json().items).toHaveLength(0)
  } finally { await app.close() }
})
