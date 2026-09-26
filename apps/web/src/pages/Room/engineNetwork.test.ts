import { beforeEach, describe, expect, it, vi } from 'vitest'

import { unpackDabs, type LayerAddOperation, type StrokeOperation } from '@grafetto/shared'

import { resetRoomStore, useRoomStore } from '../../stores/roomStore'
import { createEngineNetworkCallbacks } from './engineNetwork'
import { createPendingPreviews } from './pendingPreviews'

/** (#493) The engine's side of the network, called the way the engine calls
 *  it: this person's own operations going out, a peer's reveal being
 *  committed, and the live stroke channel. */

function stroke(id: string): StrokeOperation {
  return {
    id, type: 'stroke', userId: 'me', timestamp: 0, layerId: 'layer-1',
    tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
  }
}

function layerAdd(id: string, layerId: string): LayerAddOperation {
  return { id, type: 'layer_add', userId: 'me', timestamp: 0, layerId, name: 'Layer' }
}

function setup() {
  const deps = {
    appliedOpIdsRef: { current: new Set<string>() },
    pendingIdsRef: { current: new Set<string>() },
    outbox: { enqueue: vi.fn(async () => {}) },
    markActive: vi.fn(),
    pendingPreviewsRef: { current: createPendingPreviews() },
    applyRemoteOp: vi.fn(),
    syncFromLog: vi.fn(),
    checkSnapshotBoundary: vi.fn(),
    editingBlockedRef: { current: false },
    sendLive: vi.fn(),
    sendLiveEnd: vi.fn(),
  }
  return { deps, on: createEngineNetworkCallbacks(deps) }
}

beforeEach(() => {
  resetRoomStore()
  useRoomStore.getState().setUserId('me')
})

describe('an operation of this person’s', () => {
  // Marked applied before it is even sent, so its own confirmation arriving
  // later does not paint it twice.
  it('is marked applied, queued in the outbox, and lights this person as drawing', () => {
    const { deps, on } = setup()
    const op = stroke('s1')
    on.onLocalOperation(op)
    expect(deps.appliedOpIdsRef.current.has('s1')).toBe(true)
    expect(deps.outbox.enqueue).toHaveBeenCalledWith(op)
    expect(deps.markActive).toHaveBeenCalledWith('me')
  })

  it('puts a new layer on the local island until the server answers', () => {
    const { deps, on } = setup()
    on.onLocalOperation(layerAdd('a1', 'L-new'))
    expect(deps.pendingIdsRef.current.has('L-new')).toBe(true)
    expect(deps.markActive).not.toHaveBeenCalled()
  })
})

describe('a peer’s reveal that has finished', () => {
  it('is committed for real and leaves the pending set', () => {
    const { deps, on } = setup()
    deps.pendingPreviewsRef.current.add('s1', 4)
    const op = stroke('s1')
    on.onPreviewApplied(op)
    expect(deps.pendingPreviewsRef.current.has('s1')).toBe(false)
    expect(deps.applyRemoteOp).toHaveBeenCalledWith(op)
    expect(deps.syncFromLog).toHaveBeenCalledOnce()
    expect(deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
  })
})

describe('the live stroke channel', () => {
  const packet = {
    strokeId: 'g1', layerId: 'layer-1', tool: 'pencil' as const, preset: 'HB', color: [0, 0, 0] as [number, number, number],
    packetSeq: 0, dabs: [],
  }

  it('sends the packet packed, and the end of the gesture', () => {
    const { deps, on } = setup()
    on.onLiveStrokeDabs(packet)
    on.onLiveStrokeEnd('g1')
    const sent = vi.mocked(deps.sendLive).mock.calls[0][0]
    expect(sent).toMatchObject({ strokeId: 'g1', layerId: 'layer-1', packetSeq: 0 })
    expect(unpackDabs(sent.dabsPacked)).toEqual([])
    expect(sent).not.toHaveProperty('washId')
    expect(deps.sendLiveEnd).toHaveBeenCalledWith({ strokeId: 'g1' })
  })

  it('carries a watercolour wash id when there is one', () => {
    const { deps, on } = setup()
    on.onLiveStrokeDabs({ ...packet, washId: 'w1' })
    expect(vi.mocked(deps.sendLive).mock.calls[0][0].washId).toBe('w1')
  })

  // Streaming ink the server will refuse is drawing into the void.
  it('sends nothing while editing is blocked', () => {
    const { deps, on } = setup()
    deps.editingBlockedRef.current = true
    on.onLiveStrokeDabs(packet)
    on.onLiveStrokeEnd('g1')
    expect(deps.sendLive).not.toHaveBeenCalled()
    expect(deps.sendLiveEnd).not.toHaveBeenCalled()
  })
})
