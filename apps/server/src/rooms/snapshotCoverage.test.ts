import { describe, expect, it } from 'vitest'

import type { Operation } from '@grafetto/shared'

import { isCoveredBySnapshot, layerStateIdsOf, residentOperationWhere } from './snapshotCoverage.js'

/** (#612) The coverage rule on its own. The per-type cases (duplicate,
 *  annotations) live in rooms.test.ts; what this file pins is the two halves
 *  of "covered" — pixels per layer, structure by the stored layerState — and
 *  the null-vs-empty distinction the whole safety margin rests on. */

const base = (seq: number) => ({ id: `op${seq}`, userId: 'a', timestamp: 0, seq })
const stroke = (seq: number, layerId = 'layer-1'): Operation => ({
  ...base(seq), type: 'stroke', layerId, tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
})
const add = (seq: number, layerId = 'layer-2'): Operation => ({ ...base(seq), type: 'layer_add', layerId, name: 'L' })
const merge = (seq: number): Operation => ({
  ...base(seq), type: 'layer_merge', layerId: 'layer-1', name: 'M', sources: [{ id: 'layer-2', opacity: 1 }],
  parentId: null, index: 0,
})

describe('pixels', () => {
  it('a stroke is covered up to its own layer’s coverage, and no further', () => {
    const covered = new Map([['layer-1', 10]])
    expect(isCoveredBySnapshot(covered, stroke(10))).toBe(true)
    expect(isCoveredBySnapshot(covered, stroke(11))).toBe(false)
    expect(isCoveredBySnapshot(covered, stroke(1, 'layer-2'))).toBe(false)
  })

  // A layer the stored structure no longer lists needs no pixels — but only
  // below that structure's seq; above it, "not listed" means "created since".
  it('a layer gone from the stored structure needs no pixels, below the structure’s seq only', () => {
    expect(isCoveredBySnapshot(new Map(), stroke(5, 'gone'), 10, new Set(['layer-1']))).toBe(true)
    expect(isCoveredBySnapshot(new Map(), stroke(15, 'gone'), 10, new Set(['layer-1']))).toBe(false)
    // Unreadable structure: nothing is taken as gone.
    expect(isCoveredBySnapshot(new Map(), stroke(5, 'gone'), 10, null)).toBe(false)
  })
})

describe('structure', () => {
  // The 2026-07-31 bug (room ksEMJOMy): structure with no floor at all.
  it('a structural operation is covered by a stored layerState past it, and only that', () => {
    expect(isCoveredBySnapshot(new Map(), add(5), 10, new Set(['layer-2']))).toBe(true)
    // The stored layerState at seq N already includes operation N.
    expect(isCoveredBySnapshot(new Map(), add(10), 10, new Set(['layer-2']))).toBe(true)
    expect(isCoveredBySnapshot(new Map(), add(15), 10, new Set(['layer-2']))).toBe(false)
    expect(isCoveredBySnapshot(new Map([['layer-2', 99]]), add(5))).toBe(false)
  })

  it('a merge needs both halves', () => {
    expect(isCoveredBySnapshot(new Map([['layer-1', 99]]), merge(5), 10, new Set(['layer-1']))).toBe(true)
    expect(isCoveredBySnapshot(new Map([['layer-1', 99]]), merge(5), 1, new Set(['layer-1']))).toBe(false)
    expect(isCoveredBySnapshot(new Map([['layer-1', 1]]), merge(5), 10, new Set(['layer-1']))).toBe(false)
  })
})

// (#536, §17.61) A stored layerState with no pixel snapshot for the layer —
// what a watercolour room gets while every bake is refused mid-wash. The
// stroke is sent; its undo used to be withheld as "structure", so a joining
// client showed the undone stroke.
describe('undo, redo, revoke', () => {
  const undo = (seq: number, target: Operation): Operation =>
    ({ ...base(seq), id: `u${seq}`, type: 'operation_undo', targetOpId: target.id })
  const ids = new Set(['layer-1', 'layer-2'])

  it('is covered exactly when its target would be at the undo’s own seq', () => {
    const target = stroke(3)
    const targetOf = (id: string) => (id === target.id ? target : undefined)
    expect(isCoveredBySnapshot(new Map(), target, 10, ids)).toBe(false)
    expect(isCoveredBySnapshot(new Map(), undo(5, target), 10, ids, 0, targetOf)).toBe(false)
    // Pixels that reached the undo already show the stroke gone.
    expect(isCoveredBySnapshot(new Map([['layer-1', 5]]), undo(5, target), 10, ids, 0, targetOf)).toBe(true)
    // Pixels past the stroke but short of its undo still show it.
    expect(isCoveredBySnapshot(new Map([['layer-1', 4]]), undo(5, target), 10, ids, 0, targetOf)).toBe(false)
  })

  it('of a structural operation stays judged by the stored structure', () => {
    const target = add(3)
    const targetOf = (id: string) => (id === target.id ? target : undefined)
    expect(isCoveredBySnapshot(new Map(), undo(5, target), 10, ids, 0, targetOf)).toBe(true)
    expect(isCoveredBySnapshot(new Map(), undo(15, target), 10, ids, 0, targetOf)).toBe(false)
  })

  it('falls back to the structure when the target is not held', () => {
    expect(isCoveredBySnapshot(new Map(), undo(5, stroke(3)), 10, ids, 0, () => undefined)).toBe(true)
  })
})

describe('layerStateIdsOf', () => {
  // Null, not an empty set: an empty set would withhold every operation.
  it('reads the ids, and answers null — never empty — for what it cannot read', () => {
    expect([...layerStateIdsOf({ items: { a: {}, b: {} } })!]).toEqual(['a', 'b'])
    expect(layerStateIdsOf(null)).toBeNull()
    expect(layerStateIdsOf({ order: [] })).toBeNull()
    expect(layerStateIdsOf('junk')).toBeNull()
  })
})

describe('residentOperationWhere', () => {
  it('loads a room with no coverage in full, and otherwise excludes only coverable rows under it', () => {
    expect(residentOperationWhere('r', new Map())).toEqual({ roomId: 'r' })
    const where = residentOperationWhere('r', new Map([['layer-1', 40]]))
    expect(where.NOT).toMatchObject({ OR: [{ layerId: 'layer-1', seq: { lte: 40 } }] })
    const types = (where.NOT as { type: { in: string[] } }).type.in
    expect(types).toContain('stroke')
    expect(types).not.toContain('layer_add')
  })
})
