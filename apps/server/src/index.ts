// (#177) Deliberately the first import in the file, and deliberately also
// loaded through node's `--import` in production (see package.json's start
// script and the Dockerfile). The flag is what gets the SDK up before
// *anything* else in the process, which is what it needs to instrument the
// modules below; this line is what makes `npm run dev` — plain tsx, no flag
// — behave the same for anyone who sets a DSN locally. Both resolve to the
// same module URL, so init still happens exactly once.
import { setupSentryErrorHandler } from './instrument.js'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import { Server, type DefaultEventsMap } from 'socket.io'

import type { ClientToServerEvents, ServerToClientEvents } from '@grafetto/shared'
import { registerRoomHandlers, type SocketData } from './socketHandlers.js'
import { identityHook } from './identity.js'
import { registerHealthRoutes } from './healthRoutes.js'
import { registerRateLimit } from './rateLimit.js'
import { registerAuthRoutes } from './authRoutes.js'
import { registerRoomRoutes } from './roomRoutes.js'
import { registerRoomFolderRoutes } from './roomFolderRoutes.js'
import { registerForkRoutes } from './forkRoutes.js'
import { registerSnapshotRoutes } from './snapshotRoutes.js'
import { registerThumbnailRoutes } from './thumbnailRoutes.js'

// `trustProxy: 1` — trust exactly one hop, the host's nginx, which is the
// sole public entry point (docker-compose.prod.yml binds this process to
// 127.0.0.1). Without it `request.ip` is the docker bridge gateway for every
// visitor alike, which would quietly turn the per-IP auth limits (#237) into
// one shared global counter — the failure mode being that the first person to
// mistype a password locks out everyone else. One hop rather than `true`
// because nginx *appends* to X-Forwarded-For: a client that sends its own
// forged header gets it pushed leftwards, and only the rightmost entry — the
// address nginx actually saw — is trustworthy.
const app = Fastify({ logger: true, trustProxy: 1 })

// (#177) The SDK itself is already up by the time this file is evaluated —
// instrument.ts is loaded through node's `--import` (and, for `npm run dev`,
// as the first import above). This is the part that has to know about `app`,
// and it goes here rather than after the routes below so a route registered
// later can't quietly end up outside it. A no-op without a DSN.
setupSentryErrorHandler(app)

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
// Registers the limiter itself; which routes it covers is declared per route
// (rateLimit.ts). Must come before registerAuthRoutes — that's where the
// failed-login counter is built off `app.createRateLimit`.
await registerRateLimit(app)

// Resolves req.userId (identity.ts) for every HTTP route — /api/auth/*,
// /api/rooms/*, /api/me etc. all get it for free. Registration order is not
// what scopes this: a route declared before this line still gets the hook.
// The only way out is `config: { skipIdentity: true }` on the route itself,
// which is how the health checks avoid minting a guest User per probe (#178).
app.addHook('preHandler', identityHook)

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

// The HTTP routes come after `io` exists, not because Fastify needs it to,
// but because one of them does: closing a room for editing (#222) is a REST
// call whose effect has to reach the people already inside that room.
registerHealthRoutes(app)
registerAuthRoutes(app)
registerRoomRoutes(app, (roomId, closedAt) => io.to(roomId).emit('room_closed_changed', { closedAt }))
registerRoomFolderRoutes(app)
registerForkRoutes(app)
registerSnapshotRoutes(app)
registerThumbnailRoutes(app)

const start = async () => {
  try {
    await app.listen({ port: 4000, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
