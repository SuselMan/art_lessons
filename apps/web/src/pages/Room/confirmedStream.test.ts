import { describe, expect, it, vi } from 'vitest'

import type { LayerAddOperation, Operation, OperationUndoOperation, StrokeOperation } from '@grafetto/shared'

import { CATCH_UP_ENTER_QUEUE, CATCH_UP_LEAVE_QUEUE } from './catchUp'
import { createConfirmedStreamHandler, type ConfirmedStreamEngine } from './confirmedStream'
import { createPendingPreviews } from './pendingPreviews'

vi.mock('../../lib/reportInvariant', () => ({ reportInvariant: vi.fn() }))

/** (#493) The confirmed stream, one arrival at a time. Each branch of the
 *  handler is a rule about how an arrival lands — painted now, revealed,
 *  skipped as already painted, deferred, or distrusted — and every one of
 *  them used to be reachable only through a live server. */

function stroke(id: string, patch: Partial<StrokeOperation> = {}): StrokeOperation {
  return {
    id, type: 'stroke', userId: 'peer', timestamp: 0, layerId: 'layer-1',
    tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
    ...patch,
  }
}

function undo(id: string, targetOpId: string): OperationUndoOperation {
  return { id, type: 'operation_undo', userId: 'peer', timestamp: 0, targetOpId }
}

function layerAdd(id: string): LayerAddOperation {
  return { id, type: 'layer_add', userId: 'peer', timestamp: 0, layerId: `L-${id}`, name: 'Layer' }
}

function setup() {
  const engine: ConfirmedStreamEngine = {
    previewOperation: vi.fn(),
    dropPendingPreview: vi.fn(() => null),
  }
  const deps = {
    engineRef: { current: engine },
    lastConfirmedSeqRef: { current: 0 },
    latestKnownSeqRef: { current: 0 },
    appliedOpIdsRef: { current: new Set<string>() },
    pendingPreviewsRef: { current: createPendingPreviews() },
    catchingUpRef: { current: false },
    streamedStrokeIdsRef: { current: new Set<string>() },
    deferredOpsQueueRef: { current: [] as Operation[] },
    previewScheduleRef: { current: { noteOperation: vi.fn() } },
    noteLayerSeq: vi.fn(),
    markLayerActive: vi.fn(),
    applyRemoteOp: vi.fn(),
    syncFromLog: vi.fn(),
    checkSnapshotBoundary: vi.fn(),
    requestFullResync: vi.fn(),
  }
  return { engine, deps, confirm: createConfirmedStreamHandler(deps) }
}

describe('the watermark', () => {
  it('advances with every arrival and tells the grid the picture is stale', () => {
    const { deps, confirm } = setup()
    confirm({ seq: 1, operation: layerAdd('a') })
    confirm({ seq: 2, operation: layerAdd('b') })
    expect(deps.lastConfirmedSeqRef.current).toBe(2)
    expect(deps.latestKnownSeqRef.current).toBe(2)
    expect(deps.previewScheduleRef.current.noteOperation).toHaveBeenCalledTimes(2)
  })

  // A gap is impossible on an unbroken connection, so it means one broke
  // unnoticed: distrust the stream rather than patch the hole.
  it('resyncs on a gap and applies nothing from past it', () => {
    const { deps, confirm } = setup()
    confirm({ seq: 1, operation: layerAdd('a') })
    confirm({ seq: 3, operation: layerAdd('c') })
    expect(deps.requestFullResync).toHaveBeenCalledOnce()
    expect(deps.applyRemoteOp).toHaveBeenCalledTimes(1)
    expect(deps.lastConfirmedSeqRef.current).toBe(1)
  })
})

describe('this client’s own operations', () => {
  it('are not painted twice — only the layer’s seq and the snapshot boundary move', () => {
    const { engine, deps, confirm } = setup()
    deps.appliedOpIdsRef.current.add('mine')
    confirm({ seq: 1, operation: stroke('mine', { userId: 'me' }) })
    expect(deps.applyRemoteOp).not.toHaveBeenCalled()
    expect(engine.previewOperation).not.toHaveBeenCalled()
    expect(deps.noteLayerSeq).toHaveBeenCalledWith('layer-1', 1)
    expect(deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
  })
})

describe('a peer’s stroke', () => {
  it('is revealed, held out of the snapshot until the reveal commits it', () => {
    const { engine, deps, confirm } = setup()
    const op = stroke('s1')
    confirm({ seq: 1, operation: op })
    expect(engine.previewOperation).toHaveBeenCalledWith(op)
    expect(deps.pendingPreviewsRef.current.has('s1')).toBe(true)
    expect(deps.applyRemoteOp).not.toHaveBeenCalled()
    expect(deps.markLayerActive).toHaveBeenCalledWith('peer', 'layer-1')
  })

  it('is applied at once, not animated, when it was already drawn live', () => {
    const { engine, deps, confirm } = setup()
    deps.streamedStrokeIdsRef.current.add('g1')
    const op = stroke('s1', { strokeId: 'g1' })
    confirm({ seq: 1, operation: op })
    expect(deps.applyRemoteOp).toHaveBeenCalledWith(op)
    expect(engine.previewOperation).not.toHaveBeenCalled()
  })

  // A client that cannot keep up stops animating until the backlog is
  // comfortably small again — hysteresis, not a single threshold.
  it('stops animating past the backlog threshold, and resumes only well below it', () => {
    const { engine, deps, confirm } = setup()
    for (let i = 0; i < CATCH_UP_ENTER_QUEUE; i++) deps.pendingPreviewsRef.current.add(`p${i}`, i + 100)

    confirm({ seq: 1, operation: stroke('s1') })
    expect(deps.catchingUpRef.current).toBe(true)
    expect(deps.applyRemoteOp).toHaveBeenCalledTimes(1)
    expect(engine.previewOperation).not.toHaveBeenCalled()

    // Drained to just above the leave mark: still catching up.
    for (let i = CATCH_UP_LEAVE_QUEUE + 1; i < CATCH_UP_ENTER_QUEUE; i++) deps.pendingPreviewsRef.current.remove(`p${i}`)
    confirm({ seq: 2, operation: stroke('s2') })
    expect(deps.catchingUpRef.current).toBe(true)
    expect(engine.previewOperation).not.toHaveBeenCalled()

    deps.pendingPreviewsRef.current.remove(`p${CATCH_UP_LEAVE_QUEUE}`)
    confirm({ seq: 3, operation: stroke('s3') })
    expect(deps.catchingUpRef.current).toBe(false)
    expect(engine.previewOperation).toHaveBeenCalledOnce()
  })
})

describe('undo', () => {
  // Both land in the log synchronously, so nothing is painted — but the
  // stroke has a done-then-undone entry a later redo can restore.
  it('racing a still-revealing stroke commits the stroke first, then the undo', () => {
    const { engine, deps, confirm } = setup()
    const target = stroke('s1')
    deps.pendingPreviewsRef.current.add('s1', 1)
    vi.mocked(engine.dropPendingPreview).mockReturnValue(target)

    const u = undo('u1', 's1')
    confirm({ seq: 2, operation: u })
    expect(engine.dropPendingPreview).toHaveBeenCalledWith('s1')
    expect(vi.mocked(deps.applyRemoteOp).mock.calls.map(([op]) => op.id)).toEqual(['s1', 'u1'])
    expect(deps.pendingPreviewsRef.current.has('s1')).toBe(false)
  })

  it('whose target the backfill has not reached yet is deferred, not applied', () => {
    const { deps, confirm } = setup()
    const u = undo('u1', 'old')
    confirm({ seq: 1, operation: u })
    expect(deps.deferredOpsQueueRef.current).toEqual([u])
    expect(deps.applyRemoteOp).not.toHaveBeenCalled()
  })

  it('of a target already in the log applies straight away', () => {
    const { deps, confirm } = setup()
    deps.appliedOpIdsRef.current.add('old')
    confirm({ seq: 1, operation: undo('u1', 'old') })
    expect(deps.applyRemoteOp).toHaveBeenCalledOnce()
    expect(deps.syncFromLog).toHaveBeenCalledOnce()
  })
})

describe('anything else', () => {
  it('is applied, the layers re-derived, and the snapshot boundary checked', () => {
    const { deps, confirm } = setup()
    confirm({ seq: 1, operation: layerAdd('a') })
    expect(deps.applyRemoteOp).toHaveBeenCalledOnce()
    expect(deps.syncFromLog).toHaveBeenCalledOnce()
    expect(deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
  })
})
