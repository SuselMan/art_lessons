import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import { Server, type DefaultEventsMap } from 'socket.io'

import type { ClientToServerEvents, ServerToClientEvents } from '@art-lessons/shared'
import { registerRoomHandlers, type SocketData } from './socketHandlers.js'
import { identityHook } from './identity.js'
import { registerAuthRoutes } from './authRoutes.js'
import { registerRoomRoutes } from './roomRoutes.js'
import { registerSnapshotRoutes } from './snapshotRoutes.js'
import { registerThumbnailRoutes } from './thumbnailRoutes.js'

const app = Fastify({ logger: true })

// `origin: true` (reflect the request's own Origin) + `credentials: true` is
// required for the identity cookie (#41) to ride along cross-origin — LAN dev
// setup has the Vite dev server and this API on different ports of the same
// host, which is cross-origin (though same-site, since Same-Site is
// domain-based, not port-based — that's what lets `sameSite: 'lax'` still
// work here). `origin: '*'` is incompatible with credentialed requests per
// the CORS spec, so this replaces the old permissive wildcard.
// `methods` must be listed explicitly — @fastify/cors's own default preflight
// response only allows GET,HEAD,POST, which silently blocks every DELETE
// (room deletion, #116) client-side before it ever reaches this process: the
// browser honors the preflight's Access-Control-Allow-Methods and never even
// sends the real request, so it never shows up in this server's own request
// log either — the one clue that it's a CORS rejection, not a server error.
await app.register(cors, {
  origin: true, credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
})
await app.register(cookie)

// Resolves req.userId (identity.ts) for every HTTP route from here on —
// registered globally so /api/auth/*, /api/rooms/*, /api/me etc. all get it
// for free. Routes registered above this line would NOT have req.userId.
app.addHook('preHandler', identityHook)

app.get('/health', async () => ({ ok: true }))
registerAuthRoutes(app)
registerRoomRoutes(app)
registerSnapshotRoutes(app)
registerThumbnailRoutes(app)

// Engine.IO's own default maxHttpBufferSize is 1e6 (~1MB) and applies to a
// single packet in *either* direction — not just what the server accepts
// from a client, but what it can successfully emit to one too. A room with
// enough history (or one long stroke — see engine/index.ts's
// STROKE_DAB_CHUNK_LIMIT) can need to send room_state's tailOperations well
// past that in one shot; without this, the packet is silently dropped and
// the join just hangs (found via a live "room never finishes loading"
// report — nginx's client_max_body_size, raised separately in
// deploy/nginx.conf, is the same class of ceiling on the incoming side).
const MAX_HTTP_BUFFER_SIZE_BYTES = 20 * 1024 * 1024

const io = new Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>(app.server, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE_BYTES,
})

// Room state (#32), operation relay + log (#34/#35), room_state snapshot
// (#36), teacher/student roles (#39), and operation_revoke authorization
// (#73) all live in socketHandlers.ts / rooms.ts — see those for details.
registerRoomHandlers(io, app.log)

const start = async () => {
  try {
    await app.listen({ port: 4000, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
