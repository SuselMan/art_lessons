import type { FastifyInstance } from 'fastify'
import type { ApiOk } from '@grafetto/shared'

import { apiRoute } from '../http/apiRoute.js'
import { prisma } from '../db/prisma.js'
import { hasBoardImageAccess } from './thumbnailRoutes.js'

const MAX_IMAGE_BYTES = 32 * 1024 * 1024
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/** A full paper export for quick review, separate from the small periodically
 *  replaced thumbnail. It never seeds engine layers or snapshot state. */
export function registerReviewRoutes(app: FastifyInstance): void {
  apiRoute(app, 'POST /api/rooms/:roomId/review', { bodyLimit: Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4096 }, async (request, reply) => {
    const { roomId } = request.params
    if (!await hasBoardImageAccess(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })
    const { data, bounds } = request.body
    if (typeof data !== 'string' || data.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3)
      || !bounds || typeof bounds !== 'object'
      || !('x' in bounds) || !('y' in bounds) || !('width' in bounds) || !('height' in bounds)
      || typeof bounds.x !== 'number' || !Number.isFinite(bounds.x)
      || typeof bounds.y !== 'number' || !Number.isFinite(bounds.y)
      || typeof bounds.width !== 'number' || !Number.isInteger(bounds.width) || bounds.width < 1 || bounds.width > 8192
      || typeof bounds.height !== 'number' || !Number.isInteger(bounds.height) || bounds.height < 1 || bounds.height > 8192) {
      return reply.code(400).send({ error: 'bad_request' })
    }
    const buffer = Buffer.from(data, 'base64')
    if (buffer.length < 33 || buffer.length > MAX_IMAGE_BYTES || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)
      || buffer.toString('ascii', 12, 16) !== 'IHDR'
      || buffer.readUInt32BE(16) !== bounds.width || buffer.readUInt32BE(20) !== bounds.height) {
      return reply.code(400).send({ error: 'invalid_png' })
    }
    const fields = { data: new Uint8Array(buffer), x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    await prisma.roomReviewImage.upsert({ where: { roomId }, create: { roomId, ...fields }, update: fields })
    return { ok: true } satisfies ApiOk
  })

  apiRoute(app, 'GET /api/rooms/:roomId/review', async (request, reply) => {
    const { roomId } = request.params
    if (!await hasBoardImageAccess(roomId, request.userId)) return reply.code(403).send({ error: 'forbidden' })
    const image = await prisma.roomReviewImage.findUnique({ where: { roomId } })
    if (!image) return reply.code(404).send({ error: 'not_found' })
    // Pixels and coordinates from the same row/read. A new share may replace
    // the image, so fetching metadata and pixels separately could mix versions.
    reply.header('Content-Type', 'image/png').header('Cache-Control', 'no-store')
      .header('X-Review-X', image.x).header('X-Review-Y', image.y)
      .header('X-Review-Width', image.width).header('X-Review-Height', image.height)
    return reply.send(image.data)
  })
}
