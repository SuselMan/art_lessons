import { describe, expect, it } from 'vitest'

import type { ImageImportOperation, LayerOpacityOperation, LayerTransformOperation, StrokeOperation } from '@art-lessons/shared'

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
    color: overrides.color ?? [0.14, 0.14, 0.17],
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

  it('layerPixelOps includes image_import (#88) alongside stroke', () => {
    const log = new OperationLog()
    const imported: ImageImportOperation = {
      id: 'img-1', type: 'image_import', userId: 'user-a', timestamp: 0,
      layerId: 'layer-1', image: 'data:image/png;base64,', width: 10, height: 10,
    }
    log.append(imported)
    log.append(stroke({ id: 'a', layerId: 'layer-1' }))

    expect(log.layerPixelOps('layer-1').map(o => o.id)).toEqual(['img-1', 'a'])
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

  // ─── #150: incremental pixelOpDoneCount stays in lockstep with layerPixelOps ──

  describe('pixelOpDoneCount', () => {
    it('is 0 for a layer with nothing done yet', () => {
      const log = new OperationLog()
      expect(log.pixelOpDoneCount('layer-1')).toBe(0)
    })

    it('increments on append, per targeted layer, and matches layerPixelOps().length', () => {
      const log = new OperationLog()
      log.append(stroke({ id: 'a', layerId: 'layer-1' }))
      log.append(stroke({ id: 'b', layerId: 'layer-2' }))
      log.append(stroke({ id: 'c', layerId: 'layer-1' }))

      expect(log.pixelOpDoneCount('layer-1')).toBe(2)
      expect(log.pixelOpDoneCount('layer-2')).toBe(1)
      expect(log.layerPixelOps('layer-1')).toHaveLength(log.pixelOpDoneCount('layer-1'))
      expect(log.layerPixelOps('layer-2')).toHaveLength(log.pixelOpDoneCount('layer-2'))
    })

    it('ignores non-pixel operations (e.g. layer_opacity)', () => {
      const log = new OperationLog()
      log.append(opacity({ id: 'a', layerId: 'layer-1' }))
      expect(log.pixelOpDoneCount('layer-1')).toBe(0)
    })

    it('decrements on applyUndo and increments back on applyRedo', () => {
      const log = new OperationLog()
      log.append(stroke({ id: 'a', userId: 'user-a', layerId: 'layer-1' }))
      log.append(stroke({ id: 'b', userId: 'user-a', layerId: 'layer-1' }))
      expect(log.pixelOpDoneCount('layer-1')).toBe(2)

      log.applyUndo('b', 'user-a')
      expect(log.pixelOpDoneCount('layer-1')).toBe(1)
      expect(log.layerPixelOps('layer-1')).toHaveLength(1)

      log.applyRedo('b', 'user-a')
      expect(log.pixelOpDoneCount('layer-1')).toBe(2)
      expect(log.layerPixelOps('layer-1')).toHaveLength(2)
    })

    it('a rejected (wrong-author) applyUndo/applyRedo does not change the count', () => {
      const log = new OperationLog()
      log.append(stroke({ id: 'a', userId: 'user-a', layerId: 'layer-1' }))
      expect(log.applyUndo('a', 'user-b')).toBeNull()
      expect(log.pixelOpDoneCount('layer-1')).toBe(1)
    })

    it('revoking a done entry decrements the count; revoking an already-undone one does not', () => {
      const log = new OperationLog()
      log.append(stroke({ id: 'a', userId: 'user-a', layerId: 'layer-1' }))
      log.append(stroke({ id: 'b', userId: 'user-a', layerId: 'layer-1' }))
      log.applyUndo('b', 'user-a') // 'b' now undone, already not counted
      expect(log.pixelOpDoneCount('layer-1')).toBe(1)

      log.revoke('b') // undone -> gone: no count change
      expect(log.pixelOpDoneCount('layer-1')).toBe(1)

      log.revoke('a') // done -> gone: -1
      expect(log.pixelOpDoneCount('layer-1')).toBe(0)
      expect(log.layerPixelOps('layer-1')).toHaveLength(0)
    })

    it('a layer_transform targeting several layers bumps every one of them', () => {
      const log = new OperationLog()
      const transform: LayerTransformOperation = {
        id: 't1', type: 'layer_transform', userId: 'user-a', timestamp: 0,
        transforms: [
          { layerId: 'layer-1', matrix: [1, 0, 0, 1, 0, 0] },
          { layerId: 'layer-2', matrix: [1, 0, 0, 1, 0, 0] },
        ],
      }
      log.append(transform)
      expect(log.pixelOpDoneCount('layer-1')).toBe(1)
      expect(log.pixelOpDoneCount('layer-2')).toBe(1)

      log.applyUndo('t1', 'user-a')
      expect(log.pixelOpDoneCount('layer-1')).toBe(0)
      expect(log.pixelOpDoneCount('layer-2')).toBe(0)
    })

    it('the author\'s undone-entries-become-gone rule (on a fresh append) never changes the count — those entries were already uncounted', () => {
      const log = new OperationLog()
      log.append(stroke({ id: 'a', userId: 'user-a', layerId: 'layer-1' }))
      log.applyUndo('a', 'user-a')
      expect(log.pixelOpDoneCount('layer-1')).toBe(0)

      log.append(stroke({ id: 'b', userId: 'user-a', layerId: 'layer-1' })) // flips 'a' undone -> gone
      expect(log.pixelOpDoneCount('layer-1')).toBe(1) // just 'b'
      expect(log.layerPixelOps('layer-1').map(o => o.id)).toEqual(['b'])
    })
  })

  // #169 background backfill: historical entries always arrive chronologically
  // before whatever's already in the log (the live tail, applied right after
  // a network-snapshot restore) — see engine/index.ts's
  // absorbHistoricalOperations, the one real caller (builds `entries` via a
  // scratch OperationLog fed through the normal append/applyUndo/applyRedo/
  // revoke path first, so states arrive already resolved).
  describe('prependHistorical', () => {
    it('places historical entries before the existing (live) ones, renumbering local seq to match', () => {
      const log = new OperationLog()
      log.append(stroke({ id: 'tail' })) // the live tail, present first (as it really would be)

      log.prependHistorical([{ op: stroke({ id: 'historical' }), state: 'done' }])

      const done = log.doneOperations()
      expect(done.map(o => o.id)).toEqual(['historical', 'tail'])
      expect(done[0].seq).toBe(0)
      expect(done[1].seq).toBe(1)
    })

    it('does not run append()\'s "mark my undone entries gone" side effect', () => {
      const log = new OperationLog()
      log.append(stroke({ id: 'a', userId: 'user-a' }))
      log.applyUndo('a', 'user-a') // 'a' is now undone, redoable

      // A historical prepend from the SAME user must not invalidate 'a''s
      // redo — unlike a genuinely new live append() would (see the
      // "undone-entries-become-gone" test above) — inserting old history
      // isn't "user-a just did something new."
      log.prependHistorical([{ op: stroke({ id: 'old', userId: 'user-a' }), state: 'done' }])

      expect(log.redoTarget('user-a')?.id).toBe('a')
    })

    it('preserves undone/gone states exactly as given, without re-deriving them', () => {
      const log = new OperationLog()
      log.prependHistorical([
        { op: stroke({ id: 'h1' }), state: 'done' },
        { op: stroke({ id: 'h2' }), state: 'undone' },
        { op: stroke({ id: 'h3' }), state: 'gone' },
      ])

      expect(log.doneOperations().map(o => o.id)).toEqual(['h1'])
      expect(log.redoTarget('user-a')?.id).toBe('h2')
    })

    it('bumps pixelOpDoneCount for historical entries that are done, skips undone/gone ones', () => {
      const log = new OperationLog()
      log.prependHistorical([
        { op: stroke({ id: 'h1', layerId: 'layer-1' }), state: 'done' },
        { op: stroke({ id: 'h2', layerId: 'layer-1' }), state: 'undone' },
      ])

      expect(log.pixelOpDoneCount('layer-1')).toBe(1)
    })

    it('a later prepend (an earlier backfill page) lands before an already-prepended one', () => {
      // Backfill walks backward from the snapshot point toward the room's
      // start — each new page is chronologically OLDER than every page
      // absorbed so far, so it must always land at the very front.
      const log = new OperationLog()
      log.append(stroke({ id: 'tail' }))
      log.prependHistorical([{ op: stroke({ id: 'page-2' }), state: 'done' }]) // seq [500,1000)
      log.prependHistorical([{ op: stroke({ id: 'page-1' }), state: 'done' }]) // seq [0,500)

      expect(log.doneOperations().map(o => o.id)).toEqual(['page-1', 'page-2', 'tail'])
    })

    it('an undo appended live afterward can target a historically-prepended operation', () => {
      const log = new OperationLog()
      log.prependHistorical([{ op: stroke({ id: 'old', userId: 'user-a' }), state: 'done' }])

      expect(log.undoTarget('user-a')?.id).toBe('old')
    })
  })
})
