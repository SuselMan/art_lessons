import { describe, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'

import type { PencilEngineAPI } from '../../../engine'
import { noteBanned } from '../../../lib/api/banned'
import { createPendingPreviews } from './pendingPreviews'
import { connectRoomSocket, type RoomSocket, type RoomSocketDeps } from './roomSocket'

vi.mock('../../../lib/api/banned', () => ({ BANNED_ERROR_CODE: 'banned', noteBanned: vi.fn() }))

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
