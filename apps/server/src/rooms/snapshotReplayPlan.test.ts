import { describe, expect, it } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { planSnapshotReplay } from './snapshotReplayPlan.js'

const stroke = (id: string, seq: number, layerId = 'L'): Operation => ({
  id, seq, layerId, type: 'stroke', userId: 'A', timestamp: seq, tool: 'pencil',
  preset: 'HB', color: [0, 0, 0], dabs: [],
})
const change = (id: string, seq: number, targetOpId: string, type: 'operation_undo' | 'operation_redo' | 'operation_revoke' = 'operation_undo'): Operation => ({ id, seq, targetOpId, type, userId: 'A', timestamp: seq })
const snapshot = (seq: number, layerId = 'L') => ({ layerId, seq, hash: 'hash-' + seq })

describe('snapshot history dependency selection', () => {
  it('keeps normal room snapshots and does not request unrelated history', () => {
    const p = planSnapshotReplay([snapshot(5), snapshot(4, 'other')], [stroke('s', 3)])
    expect(p.coverage).toEqual(new Map([['L', 5], ['other', 4]]))
    expect(p.historyLayers.size).toBe(0)
  })
  it('rejects actual undo5 snapshot after redo6 of stroke3, without changing other layer', () => {
    const p = planSnapshotReplay([snapshot(5), snapshot(10, 'other')], [stroke('s', 3), change('u', 5, 's'), change('r', 6, 's', 'operation_redo')])
    expect(p.snapshots).toEqual([snapshot(10, 'other')])
    expect(p.historyLayers).toEqual(new Set(['L']))
  })
  it('includes the boundary mutation in snapshot state and uses it until a later change', () => {
    expect(planSnapshotReplay([snapshot(5)], [stroke('s', 3), change('u', 5, 's')]).coverage.get('L')).toBe(5)
  })
  it('selects a retained snapshot before target instead of discarding all acceleration', () => {
    const p = planSnapshotReplay([snapshot(5), snapshot(2)], [stroke('s', 3), change('u', 6, 's')])
    expect(p.coverage.get('L')).toBe(2)
    expect(p.historyLayers.size).toBe(0)
  })
  it('rejects equality target watermark and takes earliest target for multiple changes', () => {
    const p = planSnapshotReplay([snapshot(5), snapshot(2)], [stroke('s', 5), stroke('early', 2), change('u', 6, 's'), change('r', 7, 'early', 'operation_revoke')])
    expect(p.coverage.has('L')).toBe(false)
  })
  it('conservatively invalidates undo/redo net-done and recursive meta targets', () => {
    const p = planSnapshotReplay([snapshot(5)], [stroke('s', 3), change('u', 6, 's'), change('r', 7, 'u', 'operation_redo')])
    expect(p.historyLayers.has('L')).toBe(true)
  })
  it('fails closed when a cold-load target has not been resolved', () => {
    expect(planSnapshotReplay([snapshot(5)], [change('u', 6, 'missing')]).unresolvedTargets).toEqual(new Set(['missing']))
  })
  it('loads duplicate source and nested merge sources when result must replay', () => {
    const merge: Operation = { id: 'm', seq: 4, timestamp: 4, userId: 'A', type: 'layer_merge', layerId: 'M', name: 'M', sources: [{ id: 'S', opacity: 1 }], parentId: null, index: 0 }
    const copy: Operation = { id: 'd', seq: 5, timestamp: 5, userId: 'A', type: 'layer_duplicate', layerId: 'D', sourceId: 'M', name: 'D', sourceOpacity: 1, sourceVisible: true, parentId: null, index: 0 }
    const p = planSnapshotReplay([snapshot(6, 'D'), snapshot(4, 'M'), snapshot(3, 'S')], [merge, copy, change('u', 7, 'd')])
    expect(p.historyLayers).toEqual(new Set(['M', 'S', 'D']))
    expect(p.snapshots).toEqual([])
  })
})
