import type { Server, DefaultEventsMap } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import type { ClientToServerEvents, Operation, ServerToClientEvents } from '@grafetto/shared'

import {
  addPaletteColor, createRoom, ensureRoomLoaded, findDuplicateOperation, getOperationRejectReason, getParticipant,
  getRoomSnapshot, joinRoom, leaveRoom, recordOperation, releaseRoomIfUnused, removePaletteColor, setLayerOwnerLocked,
  setParticipantFrozen, setRoomFrozen, updateAliveIds,
} from './rooms.js'
import { checkJoinAccess } from './roomAccess.js'
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

/** (#328) Last resort when a client sends a blank display name. The client
 *  always has something to send (an account name, or a per-device "Guest-XXXX"
 *  — see the web app's `resolveDisplayName`), so this is a guard against a
 *  malformed payload, not a name anyone should normally see. */
const FALLBACK_PARTICIPANT_NAME = 'Guest'

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

    // Registers a brand-new room and seats the caller as its `owner` (#39
    // fix: ownership is now fixed at creation time, not "whoever joins
    // first"). (#328) The payload now carries the creator's own display name,
    // same as `join_room` — it used to not, and the owner was labelled
    // "Teacher" here as a result.
    socket.on('create_room', async ({ room, password, name, lastKnownSeq }, ack) => {
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
      // Same defensive trim/fallback `join_room` gets from the gate's own
      // validation — a socket is not a form, and an empty label would leave a
      // nameless row in every participants list in the room.
      createRoom(room, password, userId, name?.trim() || FALLBACK_PARTICIPANT_NAME, socket.id)
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

      const displayName = name?.trim() || FALLBACK_PARTICIPANT_NAME

      // (#225) Access is decided here and only here — blocks, password,
      // access mode, waiting queue. `joinRoom` below does the seating and
      // trusts this completely, so nothing may seat a participant without
      // having come through it first. The `await` sits before `socket.join`
      // and the snapshot emit, leaving #36's ordering guarantee (those two
      // happen with no yield between them) exactly as it was.
      const access = await checkJoinAccess(roomId, userId, displayName, password)
      if (!access.ok) {
        // (#292) The load above just pulled this room into memory, and a
        // rejected join means nobody is in it — without this it would sit
        // there, fully populated, until the process restarted. No-op if
        // anyone else is actually present.
        releaseRoomIfUnused(roomId)
        log.info({ socketId: socket.id, roomId, userId, error: access.error }, 'join_room refused')
        ack(access)
        return
      }

      const result = joinRoom(roomId, userId, displayName, socket.id)
      if (!result.ok) {
        releaseRoomIfUnused(roomId)
        log.info({ socketId: socket.id, roomId, error: result.error }, 'join_room rejected')
        ack(result)
        return
      }

      // (#292) A socket that joins a second room must leave the first, or
      // the first keeps a participant nobody can ever remove: `disconnect`
      // below reads this single field, so it would only ever leave the last
      // room joined, and the earlier one could never reach zero
      // participants — the sole condition under which a room is evicted.
      const previousRoomId = socket.data.roomId
      if (previousRoomId && previousRoomId !== roomId) {
        if (leaveRoom(previousRoomId, userId, socket.id)) {
          socket.to(previousRoomId).emit('peer_left', userId)
        }
        void socket.leave(previousRoomId)
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

    // Operation relay (#34/#35, reworked by #289 — reliable history spec
    // v0.2): broadcast to *every* socket in the room, including the sender,
    // and append to the room's log, which backs the #36 snapshot.
    //
    // (#289 §7/§11) `operation_confirmed` replaces `peer_operation` as the
    // one and only channel that ever paints into a client's confirmed
    // buffer — sent via `io.to`, not `socket.to`, specifically so the
    // author receives their own operation through the exact same
    // WebSocket-ordered stream as everyone else's, instead of learning
    // their own seq from a separate ack that could race ahead of an
    // earlier peer operation still in flight. The direct `ack` is now pure
    // bookkeeping (`SendResult`) — never a paint trigger.
    //
    // (#254 epic) `getOperationRejectReason` is the single choke point for
    // every owner-only runtime privilege this epic adds on top of the
    // original `operation_revoke`-only check (#73): room-wide freeze
    // (#256), per-participant freeze (#257), and owner-locked layers
    // (#258) — see its own doc comment in rooms.ts. Rejections now get an
    // explicit `SendResult: { ok: false, reason }` instead of the old
    // silent drop (indistinguishable from a lost packet to the sender —
    // an outbox retry loop needs to tell the two apart).
    //
    // (#289 §10) `findDuplicateOperation` dedups by the client-generated
    // `Operation.id` before ever assigning a new seq — a retried send
    // (outbox timeout racing an ack that was merely slow) must resolve to
    // the same seq, not record the stroke a second time.
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
        // (#298) Must ack. Returning silently here is indistinguishable from
        // a dropped packet, so the sender's outbox waited out its timeout and
        // retried — forever, since nothing about this socket was going to
        // change on its own. Observed on a real tablet: 384 operations at
        // 42-49 attempts each, every reconnect blasting all of them at a
        // socket that had not joined yet, ~55 MB of stroke JSON serialized
        // per round. That allocation storm is what the low-memory killer
        // eventually shot the renderer for.
        log.warn({ socketId: socket.id }, 'operation received before join_room, rejecting')
        ack?.({ ok: false, reason: 'not_joined' })
        return
      }

      try {
        const existing = findDuplicateOperation(roomId, op.id)
        if (existing) {
          ack?.({ ok: true, seq: existing.seq!, duplicate: true })
          return
        }

        const reason = getOperationRejectReason(roomId, userId, op)
        if (reason) {
          log.warn(
            { socketId: socket.id, roomId, userId, opId: op.id, opType: op.type, reason },
            'rejected operation (role/freeze/owner-lock check)',
          )
          ack?.({ ok: false, reason })
          return
        }

        // (#254/#258) Keeps the server's owner-lock mirror in sync the
        // instant this op is accepted, so the very next operation on this
        // socket connection already sees it — must run before
        // recordOperation, not after, though the two never race each other
        // either way (single-threaded, no `await` in between).
        if (op.type === 'layer_owner_lock') setLayerOwnerLocked(roomId, op.layerId, op.locked)
        // (#289 epic) Same reasoning, for the aliveIds mirror
        // getOperationRejectReason's target_gone check above just read.
        updateAliveIds(roomId, op)

        const stamped = recordOperation(roomId, op)
        ack?.({ ok: true, seq: stamped.seq! })
        io.to(roomId).emit('operation_confirmed', { seq: stamped.seq!, operation: stamped })
      } catch (err) {
        log.error(
          { socketId: socket.id, roomId, userId, opId: op.id, opType: op.type, err },
          'failed to record/relay operation, dropping it',
        )
      }
    })

    // (#254/#256 epic) Room-wide freeze — owner-only, same role-check shape
    // as operation_revoke had before isOperationAllowed absorbed it above
    // (this event is its own socket message, not an Operation, so it needs
    // its own check). Broadcasts to the *whole* room via `io.to`, not
    // `socket.to` — same reasoning as palette_add_color/palette_remove_color
    // below: the owner who triggered it needs the same confirmation every
    // other participant gets, not to be excluded from it.
    socket.on('set_room_frozen', frozen => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) return
      const participant = getParticipant(roomId, userId)
      if (participant?.role !== 'owner') {
        log.warn({ socketId: socket.id, roomId, userId }, 'rejected set_room_frozen from non-owner participant')
        return
      }
      if (setRoomFrozen(roomId, frozen)) io.to(roomId).emit('room_frozen_changed', { frozen })
    })

    // (#254/#257 epic) Point freeze — same owner-only shape as
    // set_room_frozen above. setParticipantFrozen itself refuses to freeze
    // the room's owner (see rooms.ts), so no separate check is needed here
    // for that case.
    socket.on('set_participant_frozen', ({ userId: targetUserId, frozen }) => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) return
      const participant = getParticipant(roomId, userId)
      if (participant?.role !== 'owner') {
        log.warn(
          { socketId: socket.id, roomId, userId, targetUserId },
          'rejected set_participant_frozen from non-owner participant',
        )
        return
      }
      const updated = setParticipantFrozen(roomId, targetUserId, frozen)
      if (updated) io.to(roomId).emit('participant_frozen_changed', { userId: targetUserId, frozen })
    })

    // Bonus: cursor relay follows the exact same broadcast pattern and adds
    // no real risk, so it's wired alongside the operation relay even though
    // it wasn't one of the five issues.
    socket.on('cursor_move', (data) => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) return
      socket.to(roomId).emit('peer_cursor', { ...data, userId })
    })

    // (#190 epic) Palette changes broadcast to the *whole* room via `io.to`,
    // not `socket.to` like every other event above — unlike an operation or
    // cursor move, the participant who triggered this must also see the
    // resulting palette (it's not something their own client already
    // applied optimistically), so the sender needs the same `palette_updated`
    // every other peer gets, not to be excluded from it.
    socket.on('palette_add_color', ({ color }) => {
      const { roomId } = socket.data
      if (!roomId) return
      const palette = addPaletteColor(roomId, color)
      if (palette) io.to(roomId).emit('palette_updated', { palette })
    })

    socket.on('palette_remove_color', ({ color }) => {
      const { roomId } = socket.data
      if (!roomId) return
      const palette = removePaletteColor(roomId, color)
      if (palette) io.to(roomId).emit('palette_updated', { palette })
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
