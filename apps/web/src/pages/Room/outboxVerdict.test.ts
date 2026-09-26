import { describe, expect, it, vi } from 'vitest'

import type { LayerAddOperation, StrokeOperation } from '@grafetto/shared'

import { createOutboxVerdicts } from './outboxVerdict'

/** (#493) What this client does with the outbox's answers. Each rule here
 *  is about a consequence the person can see — a held gizmo preview, a layer
 *  that stops counting as private, work that comes back on a new layer — and
 *  none of them was reachable without a server until they left Room. */

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
    pendingIdsRef: { current: new Set<string>(['L-new']) },
    latestKnownSeqRef: { current: 5 },
    noteLayerSeq: vi.fn(),
    checkSnapshotBoundary: vi.fn(),
    resolveTransformCommit: vi.fn(),
    scheduleLostWorkRecovery: vi.fn(),
    setLostWork: vi.fn(),
  }
  return { deps, ...createOutboxVerdicts(deps) }
}

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('a confirmed operation', () => {
  it('advances the watermark, never backwards', () => {
    const { deps, onSettled } = setup()
    onSettled(stroke('s1'), { ok: true, seq: 9 })
    expect(deps.latestKnownSeqRef.current).toBe(9)
    onSettled(stroke('s2'), { ok: true, seq: 3 })
    expect(deps.latestKnownSeqRef.current).toBe(9)
  })

  it('notes a stroke’s seq on its layer and checks the snapshot boundary', () => {
    const { deps, onSettled } = setup()
    onSettled(stroke('s1'), { ok: true, seq: 9 })
    expect(deps.noteLayerSeq).toHaveBeenCalledWith('layer-1', 9)
    expect(deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
  })

  // Confirmed means a peer may reference it now: no longer this client's
  // private island, so a later delete of it waits for the server.
  it('takes a confirmed new layer out of the local island', () => {
    const { deps, onSettled } = setup()
    onSettled(layerAdd('a1', 'L-new'), { ok: true, seq: 6 })
    expect(deps.pendingIdsRef.current.has('L-new')).toBe(false)
  })
})

describe('a rejected operation', () => {
  it('lets go of a held gizmo preview and leaves the watermark alone', () => {
    const { deps, onSettled } = setup()
    onSettled(stroke('s1'), { ok: false, reason: 'room_frozen' })
    expect(deps.resolveTransformCommit).toHaveBeenCalledWith('s1')
    expect(deps.latestKnownSeqRef.current).toBe(5)
    expect(deps.checkSnapshotBoundary).not.toHaveBeenCalled()
  })

  it('drops a rejected new layer out of the local island too', () => {
    const { deps, onSettled } = setup()
    onSettled(layerAdd('a1', 'L-new'), { ok: false, reason: 'room_frozen' })
    expect(deps.pendingIdsRef.current.has('L-new')).toBe(false)
  })

  // (#312) Drawn onto a layer someone deleted meanwhile: the server hands
  // it back, and it is recovered onto a fresh layer rather than lost.
  it('whose layer is gone is queued for recovery when it carries content', () => {
    const { deps, onSettled } = setup()
    const op = stroke('s1')
    onSettled(op, { ok: false, reason: 'target_gone' })
    expect(deps.scheduleLostWorkRecovery).toHaveBeenCalledWith(op)
    expect(deps.setLostWork).not.toHaveBeenCalled()
  })

  it('whose target is gone and carries nothing to recover is still reported', () => {
    const { deps, onSettled } = setup()
    onSettled(layerAdd('a1', 'L-x'), { ok: false, reason: 'target_gone' })
    expect(deps.scheduleLostWorkRecovery).not.toHaveBeenCalled()
    expect(deps.setLostWork).toHaveBeenCalledWith({ layerNames: [], restoredLayerIds: [] })
  })

  it('for any other reason is neither recovered nor reported as lost work', () => {
    const { deps, onSettled } = setup()
    onSettled(stroke('s1'), { ok: false, reason: 'not_owner' })
    expect(deps.scheduleLostWorkRecovery).not.toHaveBeenCalled()
    expect(deps.setLostWork).not.toHaveBeenCalled()
  })
})

describe('a stalled operation', () => {
  it('lets go of a held gizmo preview; the entry stays queued', () => {
    const { deps, onStalled } = setup()
    onStalled(stroke('s1'))
    expect(deps.resolveTransformCommit).toHaveBeenCalledWith('s1')
  })
})
