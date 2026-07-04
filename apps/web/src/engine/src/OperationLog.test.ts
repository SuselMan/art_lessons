import { describe, expect, it } from 'vitest'

import type { LayerOpacityOperation, StrokeOperation } from '@art-lessons/shared'

import { OperationLog } from './OperationLog'

function stroke(overrides: Partial<StrokeOperation> = {}): StrokeOperation {
  return {
    id: overrides.id ?? 'op-1',
    type: 'stroke',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerId: overrides.layerId ?? 'layer-1',
    tool: overrides.tool ?? 'pencil',
    preset: overrides.preset ?? 'HB',
    dabs: overrides.dabs ?? [],
    ...overrides,
  }
}

function opacity(overrides: Partial<LayerOpacityOperation> = {}): LayerOpacityOperation {
  return {
    id: overrides.id ?? 'op-opacity',
    type: 'layer_opacity',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerId: overrides.layerId ?? 'layer-1',
    opacity: overrides.opacity ?? 0.5,
    ...overrides,
  }
}

describe('OperationLog', () => {
  it('appends operations as done, in seq order', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a' }))
    log.append(stroke({ id: 'b' }))

    const done = log.doneOperations()
    expect(done.map(o => o.id)).toEqual(['a', 'b'])
    expect(done[0].seq).toBe(0)
    expect(done[1].seq).toBe(1)
  })

  it('coalesces consecutive layer_opacity ops from the same user/layer into one entry', () => {
    const log = new OperationLog()
    log.append(opacity({ id: 'a', opacity: 0.2 }))
    log.append(opacity({ id: 'b', opacity: 0.4 }))
    log.append(opacity({ id: 'c', opacity: 0.6 }))

    expect(log.entries).toHaveLength(1)
    expect(log.doneOperations()[0]).toMatchObject({ id: 'c', opacity: 0.6 })
  })

  it('does not coalesce opacity ops from different users or layers', () => {
    const log = new OperationLog()
    log.append(opacity({ id: 'a', userId: 'user-a' }))
    log.append(opacity({ id: 'b', userId: 'user-b' }))
    expect(log.entries).toHaveLength(2)
  })

  it('undo marks the user\'s latest done op as undone and returns it', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    log.append(stroke({ id: 'b', userId: 'user-b' }))

    const undone = log.undo('user-a')
    expect(undone?.id).toBe('a')
    expect(log.doneOperations().map(o => o.id)).toEqual(['b'])
  })

  it('undo only affects the given user\'s operations', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    expect(log.undo('user-b')).toBeNull()
    expect(log.doneOperations().map(o => o.id)).toEqual(['a'])
  })

  it('redo restores the lowest-seq undone op for that user', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    log.append(stroke({ id: 'b', userId: 'user-a' }))
    log.undo('user-a') // undoes b (highest seq done)
    log.undo('user-a') // undoes a

    const redone = log.redo('user-a')
    expect(redone?.id).toBe('a')
    expect(log.doneOperations().map(o => o.id)).toEqual(['a'])
  })

  it('a new action makes the user\'s undone entries gone, blocking redo past it', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    log.undo('user-a')
    log.append(stroke({ id: 'b', userId: 'user-a' }))

    expect(log.redo('user-a')).toBeNull()
    expect(log.doneOperations().map(o => o.id)).toEqual(['b'])
  })

  it('revoke marks the target gone regardless of author, and is not redoable', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'student' }))
    const revoked = log.revoke('a')

    expect(revoked?.id).toBe('a')
    expect(log.doneOperations()).toHaveLength(0)
    expect(log.redo('student')).toBeNull()
    expect(log.undo('student')).toBeNull()
  })

  it('layerPixelOps filters by layer and state, respecting beforeSeq', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', layerId: 'layer-1' }))
    log.append(stroke({ id: 'b', layerId: 'layer-2' }))
    log.append(stroke({ id: 'c', layerId: 'layer-1' }))

    const all = log.layerPixelOps('layer-1')
    expect(all.map(o => o.id)).toEqual(['a', 'c'])

    const beforeC = log.layerPixelOps('layer-1', all[1].seq)
    expect(beforeC.map(o => o.id)).toEqual(['a'])
  })

  // ─── #103: broadcastable undo/redo primitives ────────────────────────────

  it('undoTarget/redoTarget are read-only: they never mutate state', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))

    const target = log.undoTarget('user-a')
    expect(target?.id).toBe('a')
    expect(log.doneOperations().map(o => o.id)).toEqual(['a']) // still done — peek didn't flip it

    log.applyUndo('a', 'user-a')
    const redoTarget = log.redoTarget('user-a')
    expect(redoTarget?.id).toBe('a')
    expect(log.doneOperations()).toHaveLength(0) // still undone — peek didn't flip it back
  })

  it('applyUndo/applyRedo flip one specific entry by id, guarded by the target\'s own author', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))

    expect(log.applyUndo('a', 'user-b')).toBeNull() // wrong author: no-op
    expect(log.doneOperations().map(o => o.id)).toEqual(['a'])

    expect(log.applyUndo('a', 'user-a')?.id).toBe('a')
    expect(log.doneOperations()).toHaveLength(0)

    expect(log.applyRedo('a', 'user-b')).toBeNull() // wrong author: no-op
    expect(log.applyRedo('a', 'user-a')?.id).toBe('a')
    expect(log.doneOperations().map(o => o.id)).toEqual(['a'])
  })

  it('undoTarget excludes meta-ops (operation_revoke/undo/redo) — a second undo must reach real content', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    log.append(stroke({ id: 'b', userId: 'user-a' }))

    // Simulates PencilEngine#undo(): find the target, then log the
    // broadcastable wrapper op (an operation_undo authored by the same
    // user) via append() + applyUndo(), exactly like appendOperation() does.
    const first = log.undoTarget('user-a')
    expect(first?.id).toBe('b')
    log.append({ id: 'u1', type: 'operation_undo', userId: 'user-a', timestamp: 0, targetOpId: 'b' })
    log.applyUndo('b', 'user-a')

    // Without the meta-op exclusion, this would find 'u1' (done, same user)
    // instead of reaching back to 'a'.
    const second = log.undoTarget('user-a')
    expect(second?.id).toBe('a')
  })

  it('appending an operation_redo does not wipe the rest of that user\'s redo stack (regression, #103)', () => {
    // Before the fix, OperationLog.append()'s "author's undone entries
    // become gone" rule fired for operation_redo/operation_undo/
    // operation_revoke too (they're appended ops like any other) — so the
    // very act of logging the first redo's broadcastable wrapper op nuked
    // every other still-undone entry for that user, including ones later in
    // the same multi-step redo.
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    log.append(stroke({ id: 'b', userId: 'user-a' }))
    log.applyUndo('a', 'user-a')
    log.applyUndo('b', 'user-a')
    expect(log.doneOperations()).toHaveLength(0)

    // Redo 'a' first (lowest seq), broadcasting the wrapper the same way
    // appendOperation() does. The wrapper (r1) itself stays `done` forever
    // (nothing ever flips a meta-op's own state) — the actual assertion is
    // that 'b' is still redoable afterward, not silently marked gone.
    log.append({ id: 'r1', type: 'operation_redo', userId: 'user-a', timestamp: 0, targetOpId: 'a' })
    log.applyRedo('a', 'user-a')
    // doneOperations() is in seq (append) order, not state-change order — r1
    // was appended after 'b', so it sorts after 'b' even though 'b' is still
    // undone. The real assertion is redoTarget: 'b' must still be reachable.
    expect(log.doneOperations().map(o => o.id)).toEqual(['a', 'r1'])
    expect(log.redoTarget('user-a')?.id).toBe('b') // <- would be null if the bug regressed

    log.append({ id: 'r2', type: 'operation_redo', userId: 'user-a', timestamp: 0, targetOpId: 'b' })
    log.applyRedo('b', 'user-a')
    expect(log.doneOperations().map(o => o.id)).toEqual(['a', 'b', 'r1', 'r2'])
  })
})
