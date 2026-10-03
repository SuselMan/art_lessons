import type { RefObject } from 'react'
import type { Socket } from 'socket.io-client'

import type { ClientToServerEvents, Operation, ServerToClientEvents } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../../engine'
import { BANNED_ERROR_CODE, noteBanned } from '../../../lib/api/banned'
import { createBoardEventHandlers } from './boardEvents'
import { createConfirmedStreamHandler, type ConfirmedStreamDeps } from './confirmedStream'
import { createJoinFlow, type JoinFlowDeps } from './joinFlow'
import { createPeerEventHandlers, type PeerEventDeps } from './peerEvents'
import { createRoomControlEventHandlers, type RoomControlEventDeps } from './roomControlEvents'
import { createRoomStateHandler, type RoomStateDeps } from './roomStateHandler'
import { createSocketRevival } from './socketRevival'

export type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** Everything the handlers need, gathered once. Named after the handler deps
 *  they feed, so a field's meaning is documented where it is used; what is
 *  listed here on its own is what this function adds around them. */
export type RoomSocketDeps =
  & Pick<JoinFlowDeps,
    | 'isCreator' | 'creatorDraft' | 'applyIdentity' | 'setRoomContentReady' | 'hasJoinedRef' | 'lastJoinAttemptRef'
    | 'myDisplayNameRef' | 'outboxRef' | 'wantedBoardRef' | 'boardIdRef' | 'socketBoardRef' | 'isOwnerRef' | 'tRef'>
  & Pick<RoomStateDeps<PencilEngineAPI>,
    | 'holdReviewArrivals' | 'replaceUrl' | 'enterBoard' | 'awaitPaper' | 'markJoinRestoreDone' | 'clearRestoreFailure' | 'restoreCatchup'
    | 'firstRoomStateReceivedRef' | 'awaitingSeededBoardStateRef' | 'pendingSnapshotRef' | 'snapshotGateRef'>
  & Omit<ConfirmedStreamDeps, 'engineRef' | 'confirmOwnOperation' | 'requestFullResync'>
  & Pick<PeerEventDeps, 'roomContentReadyRef' | 'markActive' | 'forgetDrawingActivity'>
  & Pick<RoomControlEventDeps, 'queryClient' | 'retryJoinRef' | 'setJoinState'>
  & {
    /** The lesson this socket is for — the URL id at the moment it was built.
     *  `id` itself may change underneath (a board id replaced by its lesson's)
     *  without the socket being rebuilt, so the first join uses this one. */
    sessionId: string
    /** Makes the socket. A parameter so a test can hand in a fake. */
    openSocket: () => RoomSocket
    engineRef: RefObject<PencilEngineAPI | null>
    /** Published: the live socket, for every hook that emits over it. */
    socketRef: RefObject<RoomSocket | null>
    /** Published: a page turn, for the strip, the chip and the follow logic. */
    switchBoardRef: RefObject<((next: string) => void) | null>
    /** (#346) Published: a full resync, for the paper and restore retries. */
    requestFullResyncRef: RefObject<(() => void) | null>
    /** (#537) The broadcast's reading of an own operation's seq. */
    confirmOwnOperation: (op: Operation, seq: number) => void
    /** The socket is connected (true) or has dropped (false). */
    onConnectionChange: (connected: boolean) => void
  }

/** (#84/#37/#38, #493) The room's socket for one lesson: built, kept alive,
 *  and wired to every event this page answers. Returns the teardown.
 *
 *  A plain function run from Room's socket effect rather than a hook, on
 *  purpose: the effect's dependency list is what decides when the socket is
 *  torn down and rebuilt, and keeping that list in Room — where the lint rule
 *  can check it against what is actually passed here — is the whole safety
 *  net for "a page turn must never reconnect". A hook taking these as
 *  arguments would hide that list behind its own.
 *
 *  (#176, ADR 014 §4) One socket per *lesson*: a page turn is a `join_room` on
 *  this same socket, never a new one. Nothing per-board may be captured by
 *  value here — the outbox and the snapshot uploader are reached through refs
 *  for exactly that reason. */
export function connectRoomSocket(deps: RoomSocketDeps): () => void {
  const {
    sessionId: id, openSocket, socketRef, switchBoardRef, requestFullResyncRef, onConnectionChange,
    firstRoomStateReceivedRef, socketBoardRef, wantedBoardRef, confirmOwnOperation,
  } = deps
  // A new socket is a new first `room_state` — the one that tells a joiner
  // the lesson's config. Reset here rather than only at mount so a
  // navigation into another lesson (takeRoomCopy) learns that lesson's name
  // and paper instead of keeping the previous one's.
  firstRoomStateReceivedRef.current = false

  const socket = openSocket()
  socketRef.current = socket

  // (#504) socket.io переподключается само — кроме двух случаев, в которых
  // оно объявляет, что больше не пытается, и тогда открытая комната висит на
  // «Нет связи» до перезагрузки страницы. См. socketRevival.ts: там и
  // перечень случаев, и почему у страницы комнаты нет законной причины
  // принять такой ответ.
  const revival = createSocketRevival(socket)
  const joinRoom: ClientToServerEvents['join_room'] = (data, ack) => { socket.emit('join_room', data, ack) }

  // (#493) Joining and staying joined — create/rejoin, page turns,
  // following, gap resync — see joinFlow.ts. Handed the two joining emits
  // rather than the socket.
  const {
    joinCredentials, reportJoinFailure, handleConnect, switchBoard, maybeFollow, requestFullResync,
  } = createJoinFlow({
    ...deps, id, joinRoom,
    createRoom: (data, ack) => { socket.emit('create_room', data, ack) },
    isCurrentSocket: () => socket === socketRef.current,
    noteConnected: () => {
      onConnectionChange(true)
      revival.noteConnect()
    },
  })
  switchBoardRef.current = next => { void switchBoard(next) }
  // (#346) Published for the paper retry, which lives outside this function —
  // see requestFullResyncRef's own comment in Room.
  requestFullResyncRef.current = requestFullResync

  // (#493) Where a room_state takes this client, and what it does with the
  // content — see roomStateHandler.ts.
  const handleRoomState = createRoomStateHandler({
    ...deps, id, joinRoom, joinCredentials, reportJoinFailure, requestFullResync, maybeFollow,
  })
  // (#493) Out of line — see confirmedStream.ts.
  const handleOperationConfirmed = createConfirmedStreamHandler({ ...deps, confirmOwnOperation, requestFullResync })

  // (#152) peer_cursor itself is not handled here at all — Room had nothing to
  // do with it beyond forwarding into Room-level state (which is exactly what
  // re-rendered the whole component up to ~30Hz per moving peer). PeerCursors
  // subscribes directly (see its own component) — position updates never reach
  // Room's render tree.

  const handleDisconnect = (reason: string) => {
    onConnectionChange(false)
    revival.noteDisconnect(reason)
  }

  // (#504) Раньше не слушался вовсе, а это половина проблемы: отказ в
  // хендшейке (серверный `io.use()` не смог резолвить личность — например,
  // новый контейнер уже принимает сокеты, а Prisma ещё не отвечает) socket.io
  // считает окончательным и больше не пытается.
  // (#587) Кроме одного отказа, который окончателен по-настоящему: бан.
  // Оживлять такой сокет — значит стучаться в сервер раз в пять секунд до
  // закрытия вкладки; вместо этого всё приложение уходит на экран бана.
  const handleConnectError = (err: Error) => {
    if (err.message === BANNED_ERROR_CODE) {
      noteBanned()
      return
    }
    revival.noteConnectError()
  }

  // (#493) Three domains out of line, as handler factories — see
  // peerEvents.ts, boardEvents.ts and roomControlEvents.ts. The `socket.on`
  // table below still lists every event this page answers.
  const peer = createPeerEventHandlers({ ...deps, requestFullResync })
  const board = createBoardEventHandlers({ ...deps, maybeFollow })
  const control = createRoomControlEventHandlers({ ...deps, sessionId: id, requestFullResync })

  socket.on('lesson_state',               board.lesson_state)
  socket.on('participant_hand_changed',   board.participant_hand_changed)
  socket.on('board_thumbnail_updated',    board.board_thumbnail_updated)
  socket.on('peer_board_changed',         board.peer_board_changed)
  socket.on('active_board_changed',       board.active_board_changed)
  socket.on('board_created',              board.board_created)
  socket.on('board_renamed',              board.board_renamed)
  socket.on('boards_reordered',           board.boards_reordered)
  socket.on('board_deleted',              board.board_deleted)
  socket.on('connect',                    handleConnect)
  socket.on('room_state',                 handleRoomState)
  socket.on('operation_confirmed',        handleOperationConfirmed)
  socket.on('peer_joined',                peer.peer_joined)
  socket.on('peer_left',                  peer.peer_left)
  socket.on('peer_stroke_live',           peer.peer_stroke_live)
  socket.on('peer_stroke_live_end',       peer.peer_stroke_live_end)
  socket.on('palette_updated',            control.palette_updated)
  socket.on('room_frozen_changed',        control.room_frozen_changed)
  socket.on('room_tools_changed',         control.room_tools_changed)
  socket.on('room_closed_changed',        control.room_closed_changed)
  socket.on('participant_frozen_changed', control.participant_frozen_changed)
  socket.on('join_request_created',       control.join_request_created)
  socket.on('join_request_resolved',      control.join_request_resolved)
  socket.on('kicked',                     control.kicked)
  socket.on('disconnect',                 handleDisconnect)
  socket.on('connect_error',              handleConnectError)

  return () => {
    // Раньше `socket.disconnect()`: иначе запланированная попытка заведёт
    // сокет комнаты, которую уже покинули.
    revival.cancel()
    socket.disconnect()
    socketRef.current = null
    requestFullResyncRef.current = null
    switchBoardRef.current = null
    socketBoardRef.current = null
    wantedBoardRef.current = null
  }
}
