import type { FastifyInstance } from 'fastify'
import { NATIVE_GALLERY_BRUSHES, galleryBrushRole, isNativeBrushReference, type BrushLibrary } from '@grafetto/shared'
import { apiRoute } from '../http/apiRoute.js'
import { prisma } from '../db/prisma.js'
import { mayReadBoardContent } from '../rooms/boardContentAccess.js'
import { lessonOf } from '../rooms/lessons.js'
import { BrushStorage, empty, merge } from './storage.js'
import { sampleKey, type BrushSamples } from './samples.js'
import { boundedRead } from './storage.js'
import { BrushGallery } from './gallery.js'

export async function brushSelectionRoom(id: string): Promise<string> {
  const board = await prisma.room.findUnique({ where: { id }, select: { id: true, lessonId: true } })
  return board ? lessonOf(board) : id
}
export async function registerBrushGalleryRoutes(app: FastifyInstance, storage: BrushStorage, operator: BrushLibrary, samples: BrushSamples, notify: (id: string) => void): Promise<void> {
  const gallery = new BrushGallery(storage, operator, samples)
  const canEdit = async (id: string, owner: string) => {
    const board = await prisma.room.findUnique({ where: { id }, select: { id: true, lessonId: true } })
    if (!board) return false
    const room = await prisma.room.findUnique({ where: { id: lessonOf(board) }, select: { ownerId: true, closedAt: true } })
    return room?.ownerId === owner && room.closedAt === null
  }
  apiRoute(app, 'GET /api/brush-gallery/previews/:key', async (request, reply) => {
    const room = typeof request.query.roomId === 'string' ? request.query.roomId : undefined
    if (room && !await mayReadBoardContent(room, request.userId)) return reply.code(403).send({ error: 'forbidden' })
    const visible = merge(operator, storage.library('owners', request.userId), room ? merge(storage.library('rooms', room), gallery.selectedLibrary(await brushSelectionRoom(room))) : empty())
    const native = ['pencil', 'liner', 'marker', 'charcoal', 'brushPen', 'eraser', 'smudge'].some(v => sampleKey(v) === request.params.key)
    if (!native && !visible.brushes.some(b => sampleKey(b) === request.params.key)) return reply.code(404).send({ error: 'Preview unavailable' })
    try { return reply.type('image/png').header('Cache-Control', 'private, max-age=31536000, immutable').send(boundedRead(samples.path(request.params.key), 1024 * 1024)) }
    catch { return reply.code(404).send({ error: 'Preview unavailable' }) }
  })
  apiRoute(app, 'POST /api/brush-gallery/resolve', async (request, reply) => {
    const refs = request.body?.references
    if (!Array.isArray(refs) || refs.length > 512 || !refs.every(r => typeof r === 'string' && r.length < 200)) return reply.code(400).send({ error: 'Invalid references' })
    const available = merge(operator, storage.library('owners', request.userId)), selected = empty()
    selected.brushes = available.brushes.filter(b => refs.includes(`brush:${b.descriptor.id}@${b.descriptor.version}`))
    if (selected.brushes.length !== new Set(refs.filter(r => !isNativeBrushReference(r))).size) return reply.code(404).send({ error: 'Brush unavailable' })
    const { brushAssetIds } = await import('@grafetto/shared')
    const used = new Set(selected.brushes.flatMap(b => brushAssetIds(b.descriptor)))
    selected.assets = available.assets.filter(a => used.has(a.id))
    samples.enqueue(selected, true)
    selected.brushes = selected.brushes.map(b => ({ ...b, strokePreview: samples.available(sampleKey(b)) ? `/api/brush-gallery/previews/${sampleKey(b)}` : undefined }))
    selected.nativePreviews = Object.fromEntries(NATIVE_GALLERY_BRUSHES.filter(b => refs.includes(b.reference) && samples.available(sampleKey(b.tool))).map(b => [b.tool, `/api/brush-gallery/previews/${sampleKey(b.tool)}`]))
    return selected
  })
  apiRoute(app, 'GET /api/brush-gallery', async (request, reply) => {
    const q = request.query
    if (q.tab !== undefined && !['library', 'favorites', 'uploads'].includes(String(q.tab)) || q.q !== undefined && (typeof q.q !== 'string' || q.q.length > 200) || q.role !== undefined && !['drawing', 'eraser', 'smudge'].includes(String(q.role)) || q.category !== undefined && (typeof q.category !== 'string' || q.category.length > 100)) return reply.code(400).send({ error: 'Invalid gallery query' })
    const offset = q.offset === undefined ? 0 : Number(q.offset), limit = q.limit === undefined ? 24 : Number(q.limit)
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 48) return reply.code(400).send({ error: 'Invalid page' })
    return reply.header('Cache-Control', 'private, no-store').send(gallery.page(request.userId, { tab: typeof q.tab === 'string' ? q.tab : 'library', q: typeof q.q === 'string' ? q.q : undefined, role: typeof q.role === 'string' ? q.role : undefined, category: typeof q.category === 'string' ? q.category : undefined, offset, limit }))
  })
  apiRoute(app, 'PATCH /api/brush-gallery/favorites', async (request, reply) => {
    const body = request.body
    if (typeof body?.reference !== 'string' || body.reference.length > 200 || typeof body.favorite !== 'boolean') return reply.code(400).send({ error: 'Invalid favorite' })
    try { gallery.setFavorite(request.userId, body.reference, body.favorite) } catch { return reply.code(404).send({ error: 'Brush unavailable' }) }
    return { ok: true as const }
  })
  apiRoute(app, 'DELETE /api/brush-gallery/uploads', async (request, reply) => {
    if (typeof request.body?.reference !== 'string' || request.body.reference.length > 200) return reply.code(400).send({ error: 'Invalid brush' })
    storage.removePersonalBrush(request.userId, request.body.reference)
    return { ok: true as const }
  })
  apiRoute(app, 'GET /api/rooms/:id/brush-selection', async (request, reply) => {
    if (!await mayReadBoardContent(request.params.id, request.userId)) return reply.code(403).send({ error: 'forbidden' })
    return { references: gallery.selection(await brushSelectionRoom(request.params.id)), canEdit: await canEdit(request.params.id, request.userId) }
  })
  apiRoute(app, 'PATCH /api/rooms/:id/brush-selection', async (request, reply) => {
    if (!await mayReadBoardContent(request.params.id, request.userId) || !await canEdit(request.params.id, request.userId)) return reply.code(403).send({ error: 'forbidden' })
    const refs = request.body?.references
    if (!Array.isArray(refs) || refs.length > 512 || !refs.every(r => typeof r === 'string' && r.length < 200 && (isNativeBrushReference(r) || /^brush:imported-[a-f0-9]+@\d+$/.test(r)))) return reply.code(400).send({ error: 'Invalid brush selection' })
    const scope = await brushSelectionRoom(request.params.id)
    const available = merge(operator, storage.library('owners', request.userId), storage.library('rooms', scope), storage.library('sets', scope))
    const hasDrawing = refs.some(ref => NATIVE_GALLERY_BRUSHES.some(b => b.reference === ref && b.role === 'drawing') || available.brushes.some(b => `brush:${b.descriptor.id}@${b.descriptor.version}` === ref && galleryBrushRole(b) === 'drawing'))
    if (!hasDrawing) return reply.code(400).send({ error: 'last_drawing_brush' })
    try { gallery.setSelection(scope, request.userId, refs); notify(scope) } catch { return reply.code(400).send({ error: 'Brush unavailable' }) }
    return { ok: true as const }
  })
}
