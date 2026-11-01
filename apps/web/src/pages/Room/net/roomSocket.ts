import type {CanonicalRecordedPreparationOutcome} from '../canonicalRoomController'
import {prepareCanonicalRecordedImageResources} from './canonicalRecordedDelivery'
import {preflightRoomStateDelivery,type CanonicalRoomStatePreparer,type CanonicalRoomStateRead,type RoomStateDelivery} from './canonicalRoomState'
import type { RefObject } from 'react'
import type { Socket } from 'socket.io-client'

import type { ClientToServerEvents, Operation, ServerToClientEvents } from '@grafetto/shared'

import type { PencilEngineAPI,CanonicalRecordedInput } from '../../../engine'
import { BANNED_ERROR_CODE, noteBanned } from '../../../lib/api/banned'
import { prepareBrushPresets, setBrushRoomScope, loadBrushLibrary } from '../../../lib/api/brushLibrary'
import { dismissNotice, notifyError } from '../../../stores/noticeStore'
import { createBoardEventHandlers } from './boardEvents'
import { createConfirmedStreamHandler, type ConfirmedStreamDeps,type PreparedConfirmedDelivery,type CanonicalHistoryMetadata } from './confirmedStream'
import { createJoinFlow, type JoinFlowDeps } from './joinFlow'
import { createPeerEventHandlers, type PeerEventDeps } from './peerEvents'
import { createRoomControlEventHandlers, type RoomControlEventDeps } from './roomControlEvents'
import { createRoomStateHandler, type RoomStateDeps } from './roomStateHandler'
import { createSocketRevival } from './socketRevival'
import { createOrderedBrushGate } from './orderedBrushGate'

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
    | 'replaceCanonicalRoom' | 'firstRoomStateReceivedRef' | 'awaitingSeededBoardStateRef' | 'pendingSnapshotRef' | 'snapshotGateRef'>
  & Omit<ConfirmedStreamDeps, 'engineRef' | 'confirmOwnOperation' | 'requestFullResync' | 'dispatchPrepared' | 'onCanonicalHistoryConfirmed'>
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
    /** Explicit preparer; omission keeps canonical room admission OFF. */
    prepareCanonicalRoomState?:CanonicalRoomStatePreparer
    prepareCanonicalRecordedInput?:(input:CanonicalRecordedInput,engine:PencilEngineAPI)=>Promise<CanonicalRecordedPreparationOutcome>
    onCanonicalHistoryConfirmed?:(operation:Readonly<CanonicalHistoryMetadata>,read:CanonicalRoomStateRead,engine:PencilEngineAPI)=>void
    /** Association check only: never mint a read from the current engine. */
    isCanonicalEngineCurrent?:(engine:PencilEngineAPI,read:CanonicalRoomStateRead)=>boolean
    joinRoomRef?:RefObject<ClientToServerEvents['join_room']|null>
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
  setBrushRoomScope(id)

  const socket = openSocket()
  socketRef.current = socket
  let readGeneration=0
  const invalidateRead=()=>{readGeneration++}
  const requestedBoard=()=>wantedBoardRef.current??socketBoardRef.current??id

  // (#504) socket.io переподключается само — кроме двух случаев, в которых
  // оно объявляет, что больше не пытается, и тогда открытая комната висит на
  // «Нет связи» до перезагрузки страницы. См. socketRevival.ts: там и
  // перечень случаев, и почему у страницы комнаты нет законной причины
  // принять такой ответ.
  const revival = createSocketRevival(socket)
  const joinRoom: ClientToServerEvents['join_room'] = (data, ack) => { invalidateRead();if(deps.prepareCanonicalRoomState)wantedBoardRef.current=data.roomId;socket.emit('join_room', data, ack) }
  if(deps.joinRoomRef)deps.joinRoomRef.current=joinRoom

  // (#493) Joining and staying joined — create/rejoin, page turns,
  // following, gap resync — see joinFlow.ts. Handed the two joining emits
  // rather than the socket.
  const {
    joinCredentials, reportJoinFailure, handleConnect, switchBoard, maybeFollow, requestFullResync:resync,
  } = createJoinFlow({
    ...deps, id, joinRoom,
    createRoom: (data, ack) => { invalidateRead();if(deps.prepareCanonicalRoomState)wantedBoardRef.current=data.room.id;socket.emit('create_room', data, ack) },
    isCurrentSocket: () => socket === socketRef.current,
    noteConnected: () => {
      onConnectionChange(true)
      revival.noteConnect()
    },
  })
  const requestFullResync=()=>{invalidateRead();resync()}
  switchBoardRef.current = next => { invalidateRead();void switchBoard(next) }
  // (#346) Published for the paper retry, which lives outside this function —
  // see requestFullResyncRef's own comment in Room.
  requestFullResyncRef.current = requestFullResync

  // (#493) Where a room_state takes this client, and what it does with the
  // content — see roomStateHandler.ts.
  const handleRoomState = createRoomStateHandler({
    ...deps, id, joinRoom, joinCredentials, reportJoinFailure, requestFullResync, maybeFollow,
  })
  // (#493) Out of line — see confirmedStream.ts.
  let confirmedScope:CanonicalRoomStateRead['scope']|undefined
  let confirmedRead:CanonicalRoomStateRead|undefined
  const dispatchPrepared:ConfirmedStreamDeps['dispatchPrepared']=deps.prepareCanonicalRecordedInput?(input,applyFinal)=>{
    const generation=readGeneration,scope=confirmedScope,read=confirmedRead,handler=handleOperationConfirmed,engine=deps.engineRef.current
    const current=()=>generation===readGeneration&&handleOperationConfirmed===handler&&!!scope&&scope.isCurrent()&&deps.engineRef.current===engine&&(!deps.isCanonicalEngineCurrent||!!engine&&!!read&&deps.isCanonicalEngineCurrent(engine,read))
    brushes.dispatch([],applyFinal,current,async()=>{
      input.delivery.assertCurrent(input)
      if(!current())return
      if(!engine)throw Error('Canonical preparation engine unavailable')
      const outcome=await deps.prepareCanonicalRecordedInput!(input,engine)
      if(!current())return
      input.delivery.assertCurrent(input)
      if(outcome!=='ready')throw Error('Current canonical preparation cannot become obsolete')
    })
  }:undefined
  const createConfirmed=(read?:CanonicalRoomStateRead)=>createConfirmedStreamHandler({...deps,dispatchPrepared,canonicalReadScope:read?.scope,confirmOwnOperation,requestFullResync,
    onCanonicalHistoryConfirmed:read&&deps.onCanonicalHistoryConfirmed?operation=>{
      if(confirmedRead!==read||!read.scope.isCurrent())return
      const engine=deps.engineRef.current
      if(!engine||deps.isCanonicalEngineCurrent&&!deps.isCanonicalEngineCurrent(engine,read))throw Error('Canonical history engine unavailable')
      deps.onCanonicalHistoryConfirmed!(operation,read,engine)
    }:undefined})
  let handleOperationConfirmed = createConfirmed()

  // (#152) peer_cursor itself is not handled here at all — Room had nothing to
  // do with it beyond forwarding into Room-level state (which is exactly what
  // re-rendered the whole component up to ~30Hz per moving peer). PeerCursors
  // subscribes directly (see its own component) — position updates never reach
  // Room's render tree.

  const handleDisconnect = (reason: string) => {
    invalidateRead()
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
    invalidateRead()
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

  let disposed = false
  let brushFailed = false
  let brushNotice: string | undefined
  const retryBrushes = () => {
    invalidateRead()
    if (disposed || !brushFailed) return
    brushFailed = false
    // Failed gates deliberately discard their stream. Reconnect requests a
    // fresh room_state; never resume a partially admitted old event queue.
    brushes = createBrushGate()
    if (brushNotice) dismissNotice(brushNotice)
    brushNotice = undefined
    socket.connect()
  }
  const createBrushGate = () => createOrderedBrushGate(prepareBrushPresets, error => {
    console.error('Imported brush preparation failed', error instanceof Error ? `${error.name}: ${error.message}` : error)
    brushFailed = true
    revival.cancel()
    onConnectionChange(false)
    deps.engineRef.current?.setLocked(true)
    deps.setRoomContentReady(false)
    brushNotice = notifyError(deps.tRef.current('brushLibrary.error'), {
      key: 'brush-library', durationMs: null,
      action: { label: deps.tRef.current('common.retry'), onClick: retryBrushes },
    })
    socket.disconnect()
  })
  let brushes = createBrushGate()
  const ordered = <Args extends unknown[]>(
    apply: (...args: Args) => void | Promise<void>,
    presets: (...args: Args) => (string | undefined)[] = () => [],
    isCurrent?: (...args: Args) => boolean,
    resources?: (...args: Args) => Promise<void>|null,
  ) => (...args: Args): void => {
    const current = isCurrent ? () => isCurrent(...args) : undefined
    if (current && !current()) return
    brushes.dispatch(current ? () => presets(...args) : presets(...args), () => apply(...args), current, resources?()=>resources(...args):undefined)
  }
  const presetFor = (operation: Operation): string | undefined => 'preset' in operation ? operation.preset : undefined

  socket.on('lesson_state',               ordered(board.lesson_state))
  socket.on('participant_hand_changed',   ordered(board.participant_hand_changed))
  socket.on('board_thumbnail_updated',    ordered(board.board_thumbnail_updated))
  socket.on('peer_board_changed',         ordered(board.peer_board_changed))
  socket.on('active_board_changed',       ordered(board.active_board_changed))
  socket.on('board_created',              ordered(board.board_created))
  socket.on('board_renamed',              ordered(board.board_renamed))
  socket.on('boards_reordered',           ordered(board.boards_reordered))
  socket.on('board_deleted',              ordered(board.board_deleted))
  socket.on('connect',                    handleConnect)
  const dispatchRoomState=ordered((state:RoomStateDelivery)=>{
    if(state.canonicalRead&&!state.canonicalRead.scope.isCurrent())return
    return handleRoomState(state)
  },state=>{
    setBrushRoomScope(state.room.id)
    void loadBrushLibrary().catch(error=>console.warn('Room brush metadata unavailable',error))
    return state.tailOperations.map(presetFor)
  }, state => !state.canonicalRead || state.canonicalRead.scope.isCurrent(),state=>state.canonicalRead?prepareCanonicalRecordedImageResources(state.canonicalRead.preparedAtoms,state.canonicalRead.scope):null)
  socket.on('room_state',state=>{
    try{
      const before=readGeneration,target=requestedBoard(),after=before+1
      let published=false
      const isCurrent=()=>socket===socketRef.current&&socket.connected&&requestedBoard()===target&&readGeneration===(published?after:before)
      const accepted=preflightRoomStateDelivery(state,deps.prepareCanonicalRoomState,{isCurrent,expectedBoardId:target})
      if(!isCurrent()||accepted.canonicalRead&&accepted.canonicalRead.scope.roomId!==target)throw Error('Stale canonical connection target')
      // Close the EXISTING replay gate before React/brush preparation can yield.
      // The baseline restore replaces its ticket but retains that same queue.
      if(accepted.canonicalRead?.fullHistoryBase){
        if(!deps.holdReviewArrivals)throw Error('Canonical bootstrap replay gate unavailable')
        deps.holdReviewArrivals()
        if(!isCurrent())throw Error('Canonical bootstrap gate replaced its origin')
      }
      // No await or arbitrary callback between publication and dispatch.
      readGeneration=after;published=true
      confirmedRead=accepted.canonicalRead;confirmedScope=confirmedRead?.scope
      handleOperationConfirmed=createConfirmed(confirmedRead)
      dispatchRoomState(accepted)
    }
    catch{deps.setRoomContentReady(false);reportJoinFailure('unsupported_raster_version','room_state canonical contract')}
  })
  socket.on('operation_confirmed',message=>{
    const handler=handleOperationConfirmed,generation=readGeneration,scope=confirmedScope,read=confirmedRead,engine=deps.engineRef.current
    const source=message.operation.type==='canonical_stroke'||message.operation.type==='canonical_stroke_close',history=!!scope&&(message.operation.type==='operation_undo'||message.operation.type==='operation_redo')
    // A NEW scope may still see the OLD mounted engine. Such a delivery belongs
    // in the existing replay gate until that scope's actual baseline mounts.
    const bound=!deps.isCanonicalEngineCurrent||!!engine&&!!read&&deps.isCanonicalEngineCurrent(engine,read)
    const arrivalEngine=(deps.prepareCanonicalRecordedInput||deps.onCanonicalHistoryConfirmed)&&(source||history)&&bound?engine:undefined
    let prepared:PreparedConfirmedDelivery|undefined
    // Pin only canonical deliveries across CAS/resource awaits. Legacy arrivals
    // retain their existing same-read behavior across engine replacement.
    // Bootstrap with no engine is held by replayGate until actual construction;
    // dispatchPrepared captures that mounted owner when the token is released.
    const isCurrent=()=>!deps.prepareCanonicalRoomState||generation===readGeneration&&(!scope||scope.isCurrent())&&(!arrivalEngine||deps.engineRef.current===arrivalEngine)
    ordered(()=>{
      if(!isCurrent())return
      if(prepared)handler(prepared.payload)
    },()=>{
      prepared=handler.prepare(message)
      return prepared?[presetFor(prepared.payload.operation)]:[]
    },isCurrent,()=>{
      if(!prepared?.recorded)return null
      if(!scope)throw Error('Missing original canonical resource scope')
      return prepareCanonicalRecordedImageResources([prepared.recorded],scope)
    })()
  })
  socket.on('peer_joined',                ordered(peer.peer_joined))
  socket.on('peer_left',                  ordered(peer.peer_left))
  socket.on('peer_stroke_live',           ordered(peer.peer_stroke_live, data => [data.preset]))
  socket.on('peer_stroke_live_end',       ordered(peer.peer_stroke_live_end))
  socket.on('palette_updated',            ordered(control.palette_updated))
  socket.on('room_frozen_changed',        ordered(control.room_frozen_changed))
  socket.on('room_tools_changed',         ordered(control.room_tools_changed))
  socket.on('room_closed_changed',        ordered(control.room_closed_changed))
  socket.on('participant_frozen_changed', ordered(control.participant_frozen_changed))
  socket.on('join_request_created',       ordered(control.join_request_created))
  socket.on('join_request_resolved',      ordered(control.join_request_resolved))
  const handleKicked=ordered(control.kicked)
  socket.on('kicked',message=>{invalidateRead();handleKicked(message)})
  socket.on('disconnect',                 handleDisconnect)
  socket.on('connect_error',              handleConnectError)

  return () => {
    invalidateRead()
    disposed = true
    if (brushNotice) dismissNotice(brushNotice)
    brushes.cancel()
    setBrushRoomScope(undefined)
    // Раньше `socket.disconnect()`: иначе запланированная попытка заведёт
    // сокет комнаты, которую уже покинули.
    revival.cancel()
    socket.disconnect()
    socketRef.current = null
    requestFullResyncRef.current = null
    switchBoardRef.current = null
    if(deps.joinRoomRef?.current===joinRoom)deps.joinRoomRef.current=null
    socketBoardRef.current = null
    wantedBoardRef.current = null
  }
}
