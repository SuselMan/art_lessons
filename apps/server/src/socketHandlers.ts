import type { Server, DefaultEventsMap } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import type { ClientToServerEvents, Operation, ServerToClientEvents } from '@art-lessons/shared'

import { createRoom, ensureRoomLoaded, getParticipant, getRoomSnapshot, joinRoom, leaveRoom, recordOperation } from './rooms.js'
import { resolveSocketIdentity } from './identity.js'

/** Per-connection state. `userId` is resolved once, in the `io.use()`
 *  middleware below, from the same identity cookie (#41) that HTTP routes
 *  use — never re-derived per event, and never trusted from a client-
 *  supplied Operation's own `userId` field for authorization (role checks
 *  below always go through `getParticipant`, keyed by this). */
export interface SocketData {
  roomId?: string
  userId?: string
}

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>

export function registerRoomHandlers(io: AppServer, log: FastifyBaseLogger): void {
  // Runs once per connection, before 'connection' fires, so every handler
  // below can assume socket.data.userId is already set. Reads the same
  // cookie identityHook/authRoutes use (see resolveSocketIdentity's doc
  // comment for the one edge case: a socket connecting before the client's
  // warm-up `GET /api/me` ever ran).
  io.use((socket, next) => {
    resolveSocketIdentity(socket.handshake.headers.cookie)
      .then(userId => { socket.data.userId = userId; next() })
      .catch(next)
  })

  io.on('connection', (socket) => {
    log.info({ socketId: socket.id, userId: socket.data.userId }, 'socket connected')

    // Registers a brand-new room and seats the caller as its `teacher` (#39
    // fix: ownership is now fixed at creation time, not "whoever joins
    // first"). `create_room`'s wire payload carries no participant name
    // (unlike `join_room`) — that's how the shared contract was defined, so
    // the owner gets a fixed label until account names exist.
    socket.on('create_room', async ({ room, password, lastKnownSeq }, ack) => {
      const userId = socket.data.userId!
      // Same reload-safety as join_room below: the creator's own tab can
      // legitimately emit create_room again for a room that already exists
      // (browsers keep history.state across a reload — see createRoom's doc
      // comment on rooms.ts), so this needs the same cold-load-from-Postgres
      // chance to recognize that before createRoom decides whether it's
      // actually new.
      await ensureRoomLoaded(room.id)
      // No one else is in the room yet, so there's no peer_joined broadcast
      // to make — unlike join_room below, the returned participant is unused.
      createRoom(room, password, userId, 'Teacher', socket.id)
      socket.data.roomId = room.id

      // Same ordering guarantee as join_room below (#36): join the Socket.IO
      // room and emit the snapshot synchronously, before yielding back to the
      // event loop, so nothing else can interleave between them.
      socket.join(room.id)
      const snapshot = getRoomSnapshot(room.id, lastKnownSeq)
      if (snapshot) socket.emit('room_state', snapshot)

      log.info({ socketId: socket.id, roomId: room.id, userId }, 'socket created room')
      ack({ ok: true, userId })
    })

    socket.on('join_room', async ({ roomId, name, password, lastKnownSeq }, ack) => {
      const userId = socket.data.userId!
      // Repopulates the in-memory room from Postgres (#74) if this is the
      // first time this process has touched it this session — a cold server
      // start, or the room went idle and was evicted (see leaveRoom). A
      // no-op, synchronously fast, when the room's already live.
      await ensureRoomLoaded(roomId)

      const result = joinRoom(roomId, userId, name, password, socket.id)
      if (!result.ok) {
        log.info({ socketId: socket.id, roomId, error: result.error }, 'join_room rejected')
        ack(result)
        return
      }

      socket.data.roomId = roomId

      // Join the Socket.IO room and emit the snapshot synchronously, in that
      // order, before yielding back to the event loop (#36). Socket.io/Node
      // run all of this on one thread with no `await` in between, so no
      // 'operation' from another socket can be relayed to the room between
      // `socket.join` and `socket.emit('room_state', ...)` — this socket is
      // already a member by the time any such relay could happen, and the
      // snapshot read happens before that relay's write, so nothing is
      // double-delivered or lost.
      socket.join(roomId)
      const snapshot = getRoomSnapshot(roomId, lastKnownSeq)
      if (snapshot) socket.emit('room_state', snapshot)
      socket.to(roomId).emit('peer_joined', result.participant)

      log.info({ socketId: socket.id, roomId, userId, role: result.participant.role }, 'socket joined room')
      ack({ ok: true, userId })
    })

    // Operation relay (#34/#35): broadcast to every other socket in the room
    // and append to the room's log, which backs the #36 snapshot. The one
    // privileged case is `operation_revoke` (#73), which only a `teacher`
    // may submit — students are silently dropped (no ack/error contract
    // exists in the shared types for this yet, so this just logs and stops).
    //
    // #164: wrapped in try/catch as a defensive backstop — an uncaught
    // exception inside a socket.io event handler isn't caught by the
    // framework, it propagates straight to the Node process and crashes
    // it, taking down every room and every connected user for one bad
    // packet on one socket. recordOperation throwing for a roomId that
    // isn't (or is no longer) in the in-memory Map was the concrete case
    // that happened in production (root cause fixed separately in
    // leaveRoom/currentSocketForParticipant — see rooms.ts — but this stays
    // as a backstop against *any* unexpected throw here, not just that one).
    socket.on('operation', (op: Operation, ack) => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) {
        log.warn({ socketId: socket.id }, 'operation received before join_room, ignoring')
        return
      }

      try {
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
        // Tells the author their own operation's authoritative seq (#149) —
        // socket.to() below deliberately never echoes it back to them, so
        // without this ack they'd have no way to learn it (see the doc
        // comment on ClientToServerEvents.operation in packages/shared).
        ack?.(stamped)
        socket.to(roomId).emit('peer_operation', stamped)
      } catch (err) {
        log.error(
          { socketId: socket.id, roomId, userId, opId: op.id, opType: op.type, err },
          'failed to record/relay operation, dropping it',
        )
      }
    })

    // Bonus: cursor relay follows the exact same broadcast pattern and adds
    // no real risk, so it's wired alongside the operation relay even though
    // it wasn't one of the five issues.
    socket.on('cursor_move', (data) => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) return
      socket.to(roomId).emit('peer_cursor', { ...data, userId })
    })

    socket.on('disconnect', (reason) => {
      const { roomId, userId } = socket.data
      if (roomId && userId) {
        // #164: leaveRoom returns false for a stale/superseded socket (a
        // newer socket for this same room+userId already took over — see
        // its own doc comment) — must not broadcast peer_left in that case,
        // the user is still very much present via that newer socket.
        const actuallyLeft = leaveRoom(roomId, userId, socket.id)
        if (actuallyLeft) socket.to(roomId).emit('peer_left', userId)
      }
      log.info({ socketId: socket.id, reason }, 'socket disconnected')
    })
  })
}
