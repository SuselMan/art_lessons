import type { FastifyInstance } from 'fastify'
import { CLIENT_UPDATE_REQUIRED, DRAWING_PROTOCOL_HEADER, supportsPrimaryTextureProtocol } from '@grafetto/shared'

/** Captured once at startup, before any V3 writer can exist. HTTP restoration
 * and snapshot upload are independent of socket seating and need the same gate.
 * Bitmap thumbnails/catalog/auth remain accessible to older clients. */
export function registerDrawingProtocolGate(app: FastifyInstance, required: boolean): void {
  if (!required) return
  app.addHook('onRequest', async (request, reply) => {
    // Fastify decodes static path segments before routing. Match the actual
    // registered route, so encoded aliases cannot bypass compatibility.
    const path = request.routeOptions.url
    if (request.method === 'OPTIONS' || !path || !/^\/api\/rooms\/[^/]+\/(?:snapshots(?:\/[^?]*)?|operations)\/?$/.test(path)) return
    // Immutable layer responses must not seed a cache shared with old readers.
    const vary = reply.getHeader('Vary')
    reply.header('Vary', vary ? `${Array.isArray(vary) ? vary.join(', ') : vary}, ${DRAWING_PROTOCOL_HEADER}` : DRAWING_PROTOCOL_HEADER)
    if (!supportsPrimaryTextureProtocol(request.headers[DRAWING_PROTOCOL_HEADER])) {
      return reply.code(426).send({ error: CLIENT_UPDATE_REQUIRED })
    }
  })
}
