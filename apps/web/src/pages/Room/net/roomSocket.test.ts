import {prepareCanonicalRoomState} from './canonicalRoomState'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerToClientEvents } from '@grafetto/shared'
import type { QueryClient } from '@tanstack/react-query'

import type { PencilEngineAPI } from '../../../engine'
import { prepareBrushPresets,setBrushRoomScope,loadBrushLibrary } from '../../../lib/api/brushLibrary'
import { dismissNotice, notifyError } from '../../../stores/noticeStore'
import { noteBanned } from '../../../lib/api/banned'
import { createPendingPreviews } from './pendingPreviews'
import { connectRoomSocket, type RoomSocket, type RoomSocketDeps } from './roomSocket'

vi.mock('../../../lib/api/banned', () => ({ BANNED_ERROR_CODE: 'banned', noteBanned: vi.fn() }))

vi.mock('../../../lib/api/brushLibrary', () => ({ prepareBrushPresets: vi.fn(() => null), setBrushRoomScope: vi.fn(), loadBrushLibrary: vi.fn(async () => {}) }))
vi.mock('../../../stores/noticeStore', () => ({ notifyError: vi.fn(() => 'brush-notice'), dismissNotice: vi.fn() }))
beforeEach(() => { vi.mocked(prepareBrushPresets).mockReset().mockReturnValue(null) })

/** (#493) The room socket's own lifecycle — what is wired, what a teardown
 *  undoes, how a refused handshake is read. The handlers themselves have their
 *  own tests (joinFlow, roomStateHandler, confirmedStream, peerEvents,
 *  boardEvents, roomControlEvents); this is the table that binds them. */

type Listener = (...args: never[]) => void

function fakeSocket() {
  const listeners = new Map<string, Listener>()
  const fake = {
    active: true,
    connected: false,
    on: (event: string, listener: Listener) => { listeners.set(event, listener); return fake },
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  // A structural stand-in: the handlers only ever call on/emit/disconnect,
  // and revival reads `active` and calls `connect`.
  return { socket: fake as unknown as RoomSocket, fake, listeners }
}

function setup() {
  const { socket, fake, listeners } = fakeSocket()
  const onConnectionChange = vi.fn()
  const deps: RoomSocketDeps = {
    sessionId: 'L', isCreator: false, creatorDraft: undefined,
    openSocket: () => socket,
    onConnectionChange,
    engineRef: { current: null as PencilEngineAPI | null },
    socketRef: { current: null },
    switchBoardRef: { current: null },
    requestFullResyncRef: { current: null },
    outboxRef: { current: { resendAll: vi.fn(async () => {}), whenIdle: vi.fn(async () => {}) } },
    boardIdRef: { current: 'L' },
    wantedBoardRef: { current: 'B2' },
    socketBoardRef: { current: 'L' },
    isOwnerRef: { current: false },
    roomContentReadyRef: { current: false },
    hasJoinedRef: { current: false },
    lastJoinAttemptRef: { current: null },
    myDisplayNameRef: { current: 'Ann' },
    tRef: { current: (key: string) => key },
    retryJoinRef: { current: () => {} },
    setJoinState: vi.fn(),
    queryClient: {} as QueryClient,
    firstRoomStateReceivedRef: { current: true },
    awaitingSeededBoardStateRef: { current: false },
    pendingSnapshotRef: { current: null },
    snapshotGateRef: { current: { restoreStarted: vi.fn() } },
    previewScheduleRef: { current: null },
    replaceUrl: vi.fn(),
    applyIdentity: vi.fn(),
    setRoomContentReady: vi.fn(),
    enterBoard: vi.fn(),
    awaitPaper: vi.fn(async () => true),
    markJoinRestoreDone: vi.fn(),
    clearRestoreFailure: vi.fn(),
    restoreCatchup: vi.fn(async () => {}),
    appliedOpIdsRef: { current: new Set() },
    lastConfirmedSeqRef: { current: 0 },
    latestKnownSeqRef: { current: 0 },
    pendingPreviewsRef: { current: createPendingPreviews() },
    catchingUpRef: { current: false },
    streamedStrokeIdsRef: { current: new Set() },
    deferredOpsQueueRef: { current: [] },
    confirmOwnOperation: vi.fn(),
    markActive: vi.fn(),
    markLayerActive: vi.fn(),
    forgetDrawingActivity: vi.fn(),
    applyRemoteOp: vi.fn(),
    syncFromLog: vi.fn(),
    checkSnapshotBoundary: vi.fn(),
  }
  return { deps, fake, listeners, onConnectionChange }
}

describe('connectRoomSocket (#493)', () => {
  it('locks the room and stops the socket when imported resources fail', async () => {
    const { deps, listeners, fake, onConnectionChange } = setup()
    const lock = vi.fn()
    deps.engineRef.current = { setLocked: lock } as unknown as PencilEngineAPI
    let reject!: (error: Error) => void
    const load = new Promise<void>((_resolve, no) => { reject = no })
    vi.mocked(prepareBrushPresets).mockReturnValueOnce(load)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const close = connectRoomSocket(deps)
    try {
      const live = listeners.get('peer_stroke_live') as ServerToClientEvents['peer_stroke_live']
      live({ preset: 'imported-a@1' } as Parameters<ServerToClientEvents['peer_stroke_live']>[0])
      reject(new Error('unavailable'))
      await load.catch(() => {})
      expect(onConnectionChange).toHaveBeenLastCalledWith(false)
      expect(lock).toHaveBeenCalledWith(true)
      expect(deps.setRoomContentReady).toHaveBeenCalledWith(false)
      expect(notifyError).toHaveBeenCalledWith('brushLibrary.error', { key: 'brush-library', durationMs: null, action: { label: 'common.retry', onClick: expect.any(Function) } })
      expect(fake.disconnect).toHaveBeenCalledOnce()
      expect(fake.emit).not.toHaveBeenCalled()
    } finally { close(); errorLog.mockRestore() }
  })

  it('retries a failed brush stream explicitly with a fresh gate and ignores discarded or disposed work', async () => {
    const { deps, listeners, fake } = setup()
    const end = vi.fn()
    deps.hasJoinedRef.current = true
    deps.lastJoinAttemptRef.current = { name: 'Ann' }
    deps.engineRef.current = { setLocked: vi.fn(), endPeerLiveStroke: end } as unknown as PencilEngineAPI
    let reject!: (error: Error) => void
    const failed = new Promise<void>((_yes, no) => { reject = no })
    vi.mocked(prepareBrushPresets).mockReturnValueOnce(failed)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const close = connectRoomSocket(deps)
    const receive = listeners.get('peer_stroke_live_end') as ServerToClientEvents['peer_stroke_live_end']
    try {
      receive({ userId: 'peer', strokeId: 'discarded' })
      receive({ userId: 'peer', strokeId: 'queued-old' })
      reject(new DOMException('metadata deadline', 'TimeoutError'))
      await failed.catch(() => {})
      receive({ userId: 'peer', strokeId: 'after-failure' })
      expect(end).not.toHaveBeenCalled()
      expect(fake.connect).not.toHaveBeenCalled() // No automatic retry.
      const retry = vi.mocked(notifyError).mock.calls.at(-1)![1]!.action!.onClick
      retry(); retry()
      expect(fake.connect).toHaveBeenCalledOnce()
      const connected = listeners.get('connect') as () => void
      connected()
      expect(fake.emit).toHaveBeenCalledWith('join_room', expect.objectContaining({ name: 'Ann' }), expect.any(Function))
      expect(errorLog).toHaveBeenCalledWith('Imported brush preparation failed', 'TimeoutError: metadata deadline')
      expect(dismissNotice).toHaveBeenCalledWith('brush-notice')
      receive({ userId: 'peer', strokeId: 'fresh' })
      expect(end).toHaveBeenCalledExactlyOnceWith('peer', 'fresh')
      let resolve!: () => void
      const pending = new Promise<void>(yes => { resolve = yes })
      vi.mocked(prepareBrushPresets).mockReturnValueOnce(pending)
      receive({ userId: 'peer', strokeId: 'late-after-close' })
      close()
      resolve(); await pending
      retry()
      expect(end).toHaveBeenCalledTimes(1)
      expect(fake.connect).toHaveBeenCalledTimes(1)
    } finally { close(); errorLog.mockRestore() }
  })

  it('answers every event the page handles, and not peer_cursor (#152)', () => {
    const { deps, listeners } = setup()
    connectRoomSocket(deps)
    expect([...listeners.keys()].sort()).toEqual([
      'active_board_changed', 'board_created', 'board_deleted', 'board_renamed', 'board_thumbnail_updated',
      'boards_reordered', 'connect', 'connect_error', 'disconnect', 'join_request_created', 'join_request_resolved',
      'kicked', 'lesson_state', 'operation_confirmed', 'palette_updated', 'participant_frozen_changed',
      'participant_hand_changed', 'peer_board_changed', 'peer_joined', 'peer_left', 'peer_stroke_live',
      'peer_stroke_live_end', 'room_closed_changed', 'room_frozen_changed', 'room_state', 'room_tools_changed',
    ])
  })

  it('publishes the socket, a page turn and the resync, and starts a fresh first room_state', () => {
    const { deps } = setup()
    connectRoomSocket(deps)
    expect(deps.socketRef.current).not.toBeNull()
    expect(deps.switchBoardRef.current).toBeTypeOf('function')
    expect(deps.requestFullResyncRef.current).toBeTypeOf('function')
    expect(deps.firstRoomStateReceivedRef.current).toBe(false)
  })

  it('takes all of it back on teardown', () => {
    const { deps, fake } = setup()
    const close = connectRoomSocket(deps)
    close()
    expect(fake.disconnect).toHaveBeenCalled()
    expect(deps.socketRef.current).toBeNull()
    expect(deps.switchBoardRef.current).toBeNull()
    expect(deps.requestFullResyncRef.current).toBeNull()
    expect(deps.socketBoardRef.current).toBeNull()
    expect(deps.wantedBoardRef.current).toBeNull()
  })

  it('reports the connection going up and down', () => {
    const { deps, listeners, onConnectionChange } = setup()
    connectRoomSocket(deps)
    listeners.get('connect')?.()
    expect(onConnectionChange).toHaveBeenLastCalledWith(true)
    const disconnect = listeners.get('disconnect') as ((reason: string) => void) | undefined
    disconnect?.('transport close')
    expect(onConnectionChange).toHaveBeenLastCalledWith(false)
  })

  it('sends the whole app to the ban screen on a banned handshake, and only then (#587)', () => {
    const { deps, listeners } = setup()
    connectRoomSocket(deps)
    const connectError = listeners.get('connect_error') as ((err: Error) => void) | undefined
    connectError?.(new Error('xhr poll error'))
    expect(noteBanned).not.toHaveBeenCalled()
    connectError?.(new Error('banned'))
    expect(noteBanned).toHaveBeenCalledTimes(1)
  })
})
it('rejects a wrong room-state capability before brush scope/load, queues, refs or replay handlers',()=>{
 const {deps,listeners}=setup()
 deps.prepareCanonicalRoomState=state=>prepareCanonicalRoomState(state,{expectedBoardId:'B2',isCurrent:()=>true})
 const close=connectRoomSocket(deps)
 vi.mocked(setBrushRoomScope).mockClear();vi.mocked(loadBrushLibrary).mockClear();vi.mocked(prepareBrushPresets).mockClear()
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'B2',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'L',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'B2',boardEpoch:2},canonicalCapabilities:{version:1,roomId:'foreign',boardEpoch:2,capabilities:[],bindings:[]}}
 try{
  Reflect.apply(listeners.get('room_state')!,null,[state])
  expect(setBrushRoomScope).not.toHaveBeenCalled();expect(loadBrushLibrary).not.toHaveBeenCalled();expect(prepareBrushPresets).not.toHaveBeenCalled()
  expect(deps.socketBoardRef.current).toBe('L');expect(deps.pendingSnapshotRef.current).toBeNull();expect(deps.latestKnownSeqRef.current).toBe(0)
  expect(deps.enterBoard).not.toHaveBeenCalled();expect(deps.restoreCatchup).not.toHaveBeenCalled();expect(deps.setRoomContentReady).toHaveBeenCalledWith(false)
 }finally{close()}
})
