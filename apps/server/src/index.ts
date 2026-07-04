import Fastify from 'fastify'
import { Server, type DefaultEventsMap } from 'socket.io'

import type { ClientToServerEvents, ServerToClientEvents } from '@art-lessons/shared'
import { registerRoomHandlers, type SocketData } from './socketHandlers.js'

const app = Fastify({ logger: true })

app.get('/health', async () => ({ ok: true }))

// Permissive CORS: LAN-only dev setup, no auth yet (teacher/student devices
// on the same network). Revisit once rooms require authenticated origins.
const io = new Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>(app.server, {
  cors: { origin: '*' },
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
