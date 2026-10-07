import { beforeEach, describe, expect, it, vi } from 'vitest'

import { packDabs, type StrokeLiveData, type StrokeOperation } from '@grafetto/shared'

import { resetRoomStore, useRoomStore } from '../../../stores/roomStore'
import { createPendingPreviews } from './pendingPreviews'
import { createPeerEventHandlers, STREAMED_STROKE_MEMORY, type PeerEngine } from './peerEvents'

vi.mock('../../../lib/observability/reportInvariant', () => ({ reportInvariant: vi.fn() }))

/** (#493) Other participants on the socket, called the way the socket calls
 *  them. The engine is four methods here, which is all these handlers ask
 *  of it — enough to say what reaches it and when. */

function stroke(id: string, userId = 'peer'): StrokeOperation {
  return {
    id, type: 'stroke', userId, timestamp: 0, layerId: 'layer-1',
    tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
  }
}

function packet(strokeId: string, userId = 'peer'): StrokeLiveData & { userId: string } {
  return {
    userId, strokeId, layerId: 'layer-1', tool: 'pencil', preset: 'HB', color: [0, 0, 0],
    packetSeq: 0, dabsPacked: packDabs([]),
  }
}

function setup(engine: Partial<PeerEngine> = {}) {
  const fake: PeerEngine = {
    appendPeerLiveDabs: vi.fn(),
    endPeerLiveStroke: vi.fn(() => 0),
    flushPeerPreview: vi.fn(() => []),
    dropPendingPreview: vi.fn(() => null),
    ...engine,
  }
  const deps = {
    engineRef: { current: fake },
    roomContentReadyRef: { current: true },
    streamedStrokeIdsRef: { current: new Set<string>() },
    pendingPreviewsRef: { current: createPendingPreviews() },
    markActive: vi.fn(),
    markLayerActive: vi.fn(),
    forgetDrawingActivity: vi.fn(),
    applyRemoteOp: vi.fn(),
    syncFromLog: vi.fn(),
    checkSnapshotBoundary: vi.fn(),
    requestFullResync: vi.fn(),
  }
  return { fake, deps, on: createPeerEventHandlers(deps) }
}

beforeEach(() => { resetRoomStore() })

describe('peer_stroke_live', () => {
  it('paints the packet, remembers the gesture, and lights the peer and the layer', () => {
    const { fake, deps, on } = setup()
    on.peer_stroke_live(packet('g1'))
    expect(fake.appendPeerLiveDabs).toHaveBeenCalledWith('peer', expect.objectContaining({ strokeId: 'g1', dabs: [] }))
    expect(deps.streamedStrokeIdsRef.current.has('g1')).toBe(true)
    expect(deps.markActive).toHaveBeenCalledWith('peer')
    expect(deps.markLayerActive).toHaveBeenCalledWith('peer', 'layer-1')
  })

  // Painting into a layer the restore is about to overwrite would lose the
  // ink and leave a claim saying it was painted.
  it('ignores live ink until the room has been restored', () => {
    const { fake, deps, on } = setup()
    deps.roomContentReadyRef.current = false
    on.peer_stroke_live(packet('g1'))
    expect(fake.appendPeerLiveDabs).not.toHaveBeenCalled()
    expect(deps.streamedStrokeIdsRef.current.size).toBe(0)
  })

  it('remembers a bounded number of gestures, forgetting the oldest first', () => {
    const { deps, on } = setup()
    for (let i = 0; i <= STREAMED_STROKE_MEMORY; i++) on.peer_stroke_live(packet(`g${i}`))
    const seen = deps.streamedStrokeIdsRef.current
    expect(seen.size).toBe(STREAMED_STROKE_MEMORY)
    expect(seen.has('g0')).toBe(false)
    expect(seen.has(`g${STREAMED_STROKE_MEMORY}`)).toBe(true)
  })
})

describe('peer_stroke_live_end', () => {
  // The operation for the gesture follows pen-up; ink not yet accounted for
  // here is normal, and resyncing over it darkened every long stroke's tail.
  it('ends the gesture and never resyncs, whatever is still unaccounted for', () => {
    const { fake, deps, on } = setup({ endPeerLiveStroke: vi.fn(() => 12) })
    on.peer_stroke_live_end({ userId: 'peer', strokeId: 'g1' })
    expect(fake.endPeerLiveStroke).toHaveBeenCalledWith('peer', 'g1')
    expect(deps.requestFullResync).not.toHaveBeenCalled()
  })
})

describe('peer_left', () => {
  it('takes them off the roster and forgets what they were drawing', () => {
    useRoomStore.getState().applyParticipantAction({
      type: 'room_state',
      participants: [{ userId: 'peer', name: 'P', role: 'member', color: '#000', frozen: false, boardId: 'L' }],
    })
    const { deps, on } = setup()
    on.peer_left('peer')
    expect(useRoomStore.getState().participants).toEqual([])
    expect(deps.forgetDrawingActivity).toHaveBeenCalledWith('peer')
    expect(deps.requestFullResync).not.toHaveBeenCalled()
    expect(deps.syncFromLog).not.toHaveBeenCalled()
  })

  // Unlike pen-up, nobody owes an operation any more: live ink with no
  // operation behind it is on this canvas and in no log.
  it('resyncs when they leave mid-gesture with ink nothing records', () => {
    const { deps, on } = setup({ endPeerLiveStroke: vi.fn(() => 3) })
    on.peer_left('peer')
    expect(deps.requestFullResync).toHaveBeenCalledOnce()
  })

  it('commits a stroke they left mid-reveal, without the animation', () => {
    const op = stroke('s1')
    const { deps, on } = setup({ flushPeerPreview: vi.fn(() => [op]) })
    deps.pendingPreviewsRef.current.add('s1', 7)
    on.peer_left('peer')
    expect(deps.applyRemoteOp).toHaveBeenCalledWith(op)
    expect(deps.pendingPreviewsRef.current.has('s1')).toBe(false)
    expect(deps.syncFromLog).toHaveBeenCalledOnce()
    expect(deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
  })

  // (#537) The log takes the room's order, not the order reveals happen to stop.
  it('commits another peer’s earlier stroke, still revealing, before theirs', () => {
    const mine = stroke('s-left', 'peer')
    const earlier = stroke('s-other', 'other')
    const { deps, on } = setup({
      flushPeerPreview: vi.fn(() => [mine]),
      dropPendingPreview: vi.fn((id: string) => (id === 's-other' ? earlier : null)),
    })
    deps.pendingPreviewsRef.current.add('s-other', 4)
    deps.pendingPreviewsRef.current.add('s-left', 5)
    on.peer_left('peer')
    expect(deps.applyRemoteOp.mock.calls.map(([op]) => op.id)).toEqual(['s-other', 's-left'])
    expect(deps.pendingPreviewsRef.current.size).toBe(0)
  })
})

describe('peer_joined', () => {
  it('adds them to the roster', () => {
    const { on } = setup()
    on.peer_joined({ userId: 'new', name: 'N', role: 'member', color: '#000', frozen: false, boardId: 'L' })
    expect(useRoomStore.getState().participants.map(p => p.userId)).toEqual(['new'])
  })
})

it('forwards explicit cancelled live end without treating a normal end as cancellation', () => {
  const { fake, deps, on } = setup()
  on.peer_stroke_live_end({ userId: 'peer', strokeId: 'tail', cancelled: true })
  expect(fake.endPeerLiveStroke).toHaveBeenCalledWith('peer', 'tail', true)
  expect(deps.requestFullResync).not.toHaveBeenCalled()
})
