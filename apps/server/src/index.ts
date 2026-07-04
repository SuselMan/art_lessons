import Fastify from 'fastify'
import { Server } from 'socket.io'

import type { ClientToServerEvents, ServerToClientEvents } from '@art-lessons/shared'

const app = Fastify({ logger: true })

app.get('/health', async () => ({ ok: true }))

// Permissive CORS: LAN-only dev setup, no auth yet (teacher/student devices
// on the same network). Revisit once rooms require authenticated origins.
const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: '*' },
})

io.on('connection', (socket) => {
  app.log.info({ socketId: socket.id }, 'socket connected')

  // Basic room join for now: just put the socket in the Socket.IO room named
  // after roomId. No in-memory room/participant tracking yet (#32), no
  // room_state snapshot yet (#36), no operation relay yet (#34/#35).
  socket.on('join_room', ({ roomId, name }, ack?: () => void) => {
    socket.join(roomId)
    app.log.info({ socketId: socket.id, roomId, name }, 'socket joined room')
    ack?.()
  })

  socket.on('disconnect', (reason) => {
    app.log.info({ socketId: socket.id, reason }, 'socket disconnected')
  })
})

const start = async () => {
  try {
    await app.listen({ port: 4000, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
