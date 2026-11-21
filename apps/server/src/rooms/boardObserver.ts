import type { Socket, DefaultEventsMap } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import type { ClientToServerEvents, ServerToClientEvents } from '@grafetto/shared'
import type { SocketData } from './socketData.js'
import { getLessonStateFor } from './classroom.js'
import { getParticipant, getRoomGate, getRoomSnapshot, retainRoomForJoin } from './rooms.js'
import { ensureRoomLoaded, retainRoomLoadIntent } from './roomLoader.js'
import { prepareSnapshotReplay } from './snapshotReplayLoader.js'

type ObserverSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>

/** A second transport may watch a shared board, but never seats or moves the
 * participant. Immutable for the transport lifetime; all writes are refused. */
export function registerBoardObserver(socket: ObserverSocket, log: FastifyBaseLogger,
  admit: (roomId: string, log: FastifyBaseLogger) => boolean, lessonChannel: (id: string) => string): void {
  const lessonId: unknown = socket.handshake.auth.observeLessonId
  if (lessonId === undefined) return
  socket.data.observer = true
  socket.use(([event, ...args], next) => {
    if (event === 'observe_board' || event === 'clock_sync') { next(); return }
    const ack: unknown = args.at(-1)
    if (typeof ack === 'function') ack({ ok: false, error: 'board_not_visible', reason: 'not_owner' })
  })
  let generation = 0
  let release: (() => void) | undefined
  let watched: string | undefined
  const permitted = (roomId: string): boolean => typeof lessonId === 'string'
    && !!getParticipant(lessonId, socket.data.userId!)
    && !!getLessonStateFor(lessonId, socket.data.userId!)?.boards.some(b => b.id === roomId && !b.ownerId)
  socket.on('observe_board', async ({ roomId, lastKnownSeq }, ack) => {
    const current = ++generation
    if (!permitted(roomId)) { ack({ ok: false, error: 'board_not_visible' }); return }
    const lease = retainRoomForJoin(roomId)
    const intent = retainRoomLoadIntent(roomId)
    let retained = false
    try {
      if (!admit(roomId, log)) { ack({ ok: false, error: 'server_busy' }); return }
      await ensureRoomLoaded(roomId, lease)
      const replay = await prepareSnapshotReplay(roomId)
      if (!socket.connected || generation !== current || intent.isCancelled() || !permitted(roomId)
        || getRoomGate(roomId)?.lessonId !== lessonId) {
        ack({ ok: false, error: 'board_not_visible' }); return
      }
      if (watched && watched !== roomId) void socket.leave(watched)
      release?.()
      release = lease.release
      retained = true
      watched = roomId
      socket.data.lessonId = lessonId as string
      // No await between subscription and snapshot: no live operation gap.
      void socket.join(lessonChannel(lessonId as string))
      void socket.join(roomId)
      socket.emit('room_state', getRoomSnapshot(roomId, lastKnownSeq, socket.data.userId!, replay)!)
      ack({ ok: true, userId: socket.data.userId! })
    } catch (err) {
      log.error({ err, roomId }, 'board observer admission failed')
      ack({ ok: false, error: 'server_busy' })
    } finally {
      intent.release()
      if (!retained) lease.release()
    }
  })
  socket.on('disconnect', () => { ++generation; release?.(); release = undefined })
}
