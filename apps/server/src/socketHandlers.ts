import type { Server, DefaultEventsMap } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import type { ClientToServerEvents, Operation, ServerToClientEvents } from '@art-lessons/shared'

import { createRoom, getParticipant, getRoomSnapshot, joinRoom, leaveRoom, recordOperation } from './rooms.js'

/** Per-connection state. There's no auth yet (#41), so the server assigns
 *  `userId` from the Socket.IO connection id at join time and treats it as
 *  the source of truth for role checks — never the `userId` embedded in a
 *  client-supplied Operation, which is not to be trusted for authorization. */
export interface SocketData {
  roomId?: string
  userId?: string
}

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>

export function registerRoomHandlers(io: AppServer, log: FastifyBaseLogger): void {
  io.on('connection', (socket) => {
    log.info({ socketId: socket.id }, 'socket connected')

    // Registers a brand-new room and seats the caller as its `teacher` (#39
    // fix: ownership is now fixed at creation time, not "whoever joins
    // first"). `create_room`'s wire payload carries no participant name
    // (unlike `join_room`) — that's how the shared contract was defined, so
    // the owner gets a fixed label until #41 (real auth/identity) lands.
    socket.on('create_room', ({ room, password }, ack) => {
      const userId = socket.id
      // No one else is in the room yet, so there's no peer_joined broadcast
      // to make — unlike join_room below, the returned participant is unused.
      createRoom(room, password, userId, 'Teacher')
      socket.data.roomId = room.id
      socket.data.userId = userId

      // Same ordering guarantee as join_room below (#36): join the Socket.IO
      // room and emit the snapshot synchronously, before yielding back to the
      // event loop, so nothing else can interleave between them.
      socket.join(room.id)
      const snapshot = getRoomSnapshot(room.id)
      if (snapshot) socket.emit('room_state', snapshot)

      log.info({ socketId: socket.id, roomId: room.id, userId }, 'socket created room')
      ack({ ok: true })
    })

    socket.on('join_room', ({ roomId, name, password }, ack) => {
      const userId = socket.id
      const result = joinRoom(roomId, userId, name, password)
      if (!result.ok) {
        log.info({ socketId: socket.id, roomId, error: result.error }, 'join_room rejected')
        ack(result)
        return
      }

      socket.data.roomId = roomId
      socket.data.userId = userId

      // Join the Socket.IO room and emit the snapshot synchronously, in that
      // order, before yielding back to the event loop (#36). Socket.io/Node
      // run all of this on one thread with no `await` in between, so no
      // 'operation' from another socket can be relayed to the room between
      // `socket.join` and `socket.emit('room_state', ...)` — this socket is
      // already a member by the time any such relay could happen, and the
      // snapshot read happens before that relay's write, so nothing is
      // double-delivered or lost.
      socket.join(roomId)
      const snapshot = getRoomSnapshot(roomId)
      if (snapshot) socket.emit('room_state', snapshot)
      socket.to(roomId).emit('peer_joined', result.participant)

      log.info({ socketId: socket.id, roomId, userId, role: result.participant.role }, 'socket joined room')
      ack({ ok: true })
    })

    // Operation relay (#34/#35): broadcast to every other socket in the room
    // and append to the room's log, which backs the #36 snapshot. The one
    // privileged case is `operation_revoke` (#73), which only a `teacher`
    // may submit — students are silently dropped (no ack/error contract
    // exists in the shared types for this yet, so this just logs and stops).
    socket.on('operation', (op: Operation) => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) {
        log.warn({ socketId: socket.id }, 'operation received before join_room, ignoring')
        return
      }

      if (op.type === 'operation_revoke') {
        const participant = getParticipant(roomId, userId)
        if (participant?.role !== 'teacher') {
          log.warn(
            { socketId: socket.id, roomId, userId, opId: op.id },
            'rejected operation_revoke from non-teacher participant',
          )
          return
        }
      }

      const stamped = recordOperation(roomId, op)
      socket.to(roomId).emit('peer_operation', stamped)
    })

    // Bonus: cursor relay follows the exact same broadcast pattern and adds
    // no real risk, so it's wired alongside the operation relay even though
    // it wasn't one of the five issues.
    socket.on('cursor_move', ({ x, y }) => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) return
      socket.to(roomId).emit('peer_cursor', { userId, x, y })
    })

    socket.on('disconnect', (reason) => {
      const { roomId, userId } = socket.data
      if (roomId && userId) {
        leaveRoom(roomId, userId)
        socket.to(roomId).emit('peer_left', userId)
      }
      log.info({ socketId: socket.id, reason }, 'socket disconnected')
    })
  })
}
