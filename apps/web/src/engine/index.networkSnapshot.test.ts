// Engine-level tests for #149's bakeNetworkSnapshot — the network-upload
// counterpart to _takeCheckpoint's local undo checkpoint (same allResident()
// tile gather, just serialized via snapshotCodec instead of kept in memory)
// — and #169's restoreLayerFromSnapshot/absorbHistoricalOperations, the
// fast-join restore + background backfill counterparts.
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import type { OperationRedoOperation, OperationUndoOperation } from '@grafetto/shared'

import {
  checkpointCountFor, createTestEngine, dab, expectPixelsClose, makeLayerAdd, makeStroke, readTilePixels,
} from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/snapshotCodec'

describe('bakeNetworkSnapshot (#149)', () => {
  it('returns null for a layer with no pixel content yet', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
  })

  it('returns null for an unknown layer id', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    expect(engine.bakeNetworkSnapshot('nonexistent')).toBeNull()
  })

  it('encodes exactly the resident tile pixels a stroke actually painted', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))

    const baked = engine.bakeNetworkSnapshot('L')
    expect(baked).not.toBeNull()

    const { tiles } = decodeLayerTiles(baked!, 0)
    expect(tiles).toHaveLength(1)
    expect([...tiles[0].pixels]).toEqual([...readTilePixels(engine, 'L', 0, 0, 8, 8)!])
  })

  it('reflects the layer state at call time, not a stale cache', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
    const first = engine.bakeNetworkSnapshot('L')!

    engine.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
    const second = engine.bakeNetworkSnapshot('L')!

    const firstPixels = decodeLayerTiles(first, 0).tiles[0].pixels
    const secondPixels = decodeLayerTiles(second, 0).tiles[0].pixels
    expect([...secondPixels]).not.toEqual([...firstPixels]) // a second overlapping stroke darkened it further
  })
})

describe('restoreLayerFromSnapshot (#169)', () => {
  it('reproduces the exact pixels a fresh engine painted, without replaying any operations', () => {
    const { engine: source } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    source.appendOperation(makeLayerAdd('user-a', 'L'))
    source.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
    const { tiles } = decodeLayerTiles(source.bakeNetworkSnapshot('L')!, 0)

    // A fresh engine: initLayer only (no operations at all, no dabs painted).
    const { engine: target } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    target.initLayer('L')
    target.restoreLayerFromSnapshot('L', tiles)

    expect([...readTilePixels(target, 'L', 0, 0, 8, 8)!]).toEqual([...readTilePixels(source, 'L', 0, 0, 8, 8)!])
    // Confirms nothing was painted via the normal pixel-op pipeline: the log
    // has no pixel operations for this layer, only the buffer content itself
    // was injected directly.
    expect(target.getOperations().filter(op => 'layerId' in op && op.layerId === 'L')).toEqual([])
  })

  it('is a no-op for a layer that was never initLayer-created', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    expect(() => engine.restoreLayerFromSnapshot('nonexistent', [])).not.toThrow()
  })

  // #287: a real production room lost content this way — restoreLayerFromSnapshot
  // paints pixels directly into the buffer with no corresponding OperationLog
  // entry, so _rebuildLayer (the machinery every undo/redo/revoke replay goes
  // through) had nothing to fall back on except `buf.clear()` the moment any
  // pixel op on that layer changed done/undone state — silently wiping every
  // bit of content this restore had just brought in. Fixed by seeding a pinned
  // local checkpoint alongside the restored pixels (see restoreLayerFromSnapshot's
  // own doc comment).
  it('seeds a pinned local checkpoint so the restored content is not lost to undo/redo/revoke', () => {
    const { engine: source } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    source.appendOperation(makeLayerAdd('user-a', 'L'))
    source.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
    const { tiles } = decodeLayerTiles(source.bakeNetworkSnapshot('L')!, 0)
    const restoredPixels = [...readTilePixels(source, 'L', 0, 0, 8, 8)!]

    // A fresh client joining after that snapshot — same restore path a real
    // fast-join takes, with no pre-snapshot history available locally at all
    // (e.g. the server already pruned it, see rooms.ts's
    // pruneOperationsBeforeSnapshot — background backfill has nothing to
    // recover in that case).
    const { engine: target } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    target.initLayer('L')
    target.restoreLayerFromSnapshot('L', tiles)
    expect(checkpointCountFor(target, 'L')).toBe(1)

    // This client draws its own, totally unrelated stroke on the same layer,
    // then undoes it — the exact "добавил линию, сделал undo" repro.
    target.appendOperation(makeStroke('user-b', 'L', [dab(2, 2, { size: 4, pressure: 1, opacity: 0.5 })]))
    const undone = target.undo()
    expect(undone?.type).toBe('stroke')

    // The snapshot-restored content must survive the undo's _rebuildLayer
    // replay — before the fix this came back all zero (wiped to blank).
    expect([...readTilePixels(target, 'L', 0, 0, 8, 8)!]).toEqual(restoredPixels)
  })

  it('replaces a stale pinned checkpoint rather than keeping both when restored twice (reconnect re-restoring a live engine)', () => {
    const { engine: source } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    source.appendOperation(makeLayerAdd('user-a', 'L'))
    source.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
    const firstTiles = decodeLayerTiles(source.bakeNetworkSnapshot('L')!, 0).tiles
    source.appendOperation(makeStroke('user-a', 'L', [dab(2, 2, { size: 4, pressure: 1, opacity: 0.5 })]))
    const secondTiles = decodeLayerTiles(source.bakeNetworkSnapshot('L')!, 0).tiles
    const finalPixels = [...readTilePixels(source, 'L', 0, 0, 8, 8)!]

    const { engine: target } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    target.initLayer('L')
    target.restoreLayerFromSnapshot('L', firstTiles) // first restore, e.g. initial join
    target.restoreLayerFromSnapshot('L', secondTiles) // a later reconnect re-restoring the newer snapshot
    expect(checkpointCountFor(target, 'L')).toBe(1) // stale one replaced, not accumulated

    target.appendOperation(makeStroke('user-b', 'L', [dab(6, 6, { size: 4, pressure: 1, opacity: 0.5 })]))
    target.undo()

    // Must reflect the *second*, more complete restore — not the first, stale one.
    expect([...readTilePixels(target, 'L', 0, 0, 8, 8)!]).toEqual(finalPixels)
  })
})

// (#289 epic, reliable history spec v0.2 §13) The verification oracle: a
// from-scratch replay that never consults the checkpoint machinery, so
// comparing it against bakeNetworkSnapshot's incremental result is a real
// check rather than the incremental path agreeing with itself.
describe('bakeLayerByFullReplay (#289)', () => {
  it('agrees with bakeNetworkSnapshot for an ordinary painted layer', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
    engine.appendOperation(makeStroke('user-a', 'L', [dab(2, 2, { size: 4, pressure: 1, opacity: 0.5 })]))

    const incremental = decodeLayerTiles(engine.bakeNetworkSnapshot('L')!, 0).tiles
    const replayed = decodeLayerTiles(engine.bakeLayerByFullReplay('L')!, 0).tiles

    expect(replayed).toHaveLength(incremental.length)
    // Restoring an 8-bit checkpoint dequantizes back to float, so a
    // replay-through-a-checkpoint result can differ by ~1/255 from a pure
    // from-scratch accumulation — see expectPixelsClose's own doc comment.
    // A real disagreement (the kind this oracle exists to catch) is gross.
    expectPixelsClose(replayed[0].pixels, incremental[0].pixels)
  })

  it('returns null on the same conditions bakeNetworkSnapshot does, so the two stay comparable', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    expect(engine.bakeLayerByFullReplay('nonexistent')).toBeNull()
    expect(engine.bakeNetworkSnapshot('nonexistent')).toBeNull()
    expect(engine.bakeLayerByFullReplay('L')).toBeNull() // exists, but no pixel ops yet
    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
  })

  it('disagrees with the live buffer when it holds pixels no operation accounts for (the #287 shape)', () => {
    // #287's exact hazard: the live buffer carries snapshot-restored content
    // that the operation log has no pixel op for. The incremental bake
    // (reading the live buffer) sees it; a from-scratch replay of the log
    // cannot — and that disagreement is precisely the signal. Before the
    // pinned-checkpoint fix this state was silently destructive; the oracle
    // makes it observable either way.
    const { engine: source } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    source.appendOperation(makeLayerAdd('user-a', 'L'))
    source.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
    const { tiles } = decodeLayerTiles(source.bakeNetworkSnapshot('L')!, 0)

    const { engine: target } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    target.initLayer('L')
    target.restoreLayerFromSnapshot('L', tiles)
    // One own stroke, so both paths have something to bake at all.
    target.appendOperation(makeStroke('user-b', 'L', [dab(1, 1, { size: 3, pressure: 1, opacity: 0.5 })]))

    const incremental = decodeLayerTiles(target.bakeNetworkSnapshot('L')!, 0).tiles[0].pixels
    const replayed = decodeLayerTiles(target.bakeLayerByFullReplay('L')!, 0).tiles[0].pixels

    // The restored content exists only in the live buffer, so the two paths
    // must NOT match — that mismatch is the verification signal.
    expect([...replayed]).not.toEqual([...incremental])
  })
})

describe('absorbHistoricalOperations (#169)', () => {
  it('merges historical ops before the live tail, in correct order, without painting', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.initLayer('L') // as if seeded by a restored snapshot's layerState, not layer_add
    const tailStroke = makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })])
    engine.appendOperation(tailStroke) // the live tail, applied first (as it really would be)

    const beforePixels = [...readTilePixels(engine, 'L', 0, 0, 8, 8)!]
    const historicalAdd = makeLayerAdd('user-a', 'L')
    const historicalStroke = makeStroke('user-a', 'L', [dab(2, 2, { size: 6, pressure: 1, opacity: 0.5 })])
    engine.absorbHistoricalOperations([historicalAdd, historicalStroke])

    // Order: historical first, then the live tail — not append (insertion) order.
    const ids = engine.getOperations().map(op => op.id)
    expect(ids).toEqual([historicalAdd.id, historicalStroke.id, tailStroke.id])
    // Never painted: the buffer is untouched by the historical stroke.
    expect([...readTilePixels(engine, 'L', 0, 0, 8, 8)!]).toEqual(beforePixels)
  })

  it('correctly resolves an operation_undo within the historical batch itself', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.initLayer('L')

    const stroke = makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })])
    const undo: OperationUndoOperation = {
      id: nanoid(10), type: 'operation_undo', userId: 'user-a', timestamp: 1, targetOpId: stroke.id,
    }
    engine.absorbHistoricalOperations([stroke, undo])

    // doneOperations() excludes the undone stroke but keeps the undo action
    // itself (a meta-op, always 'done') — same semantics as a live undo.
    const ids = engine.getOperations().map(op => op.id)
    expect(ids).toEqual([undo.id])
  })

  it('an operation_redo within the same historical batch restores the undone entry', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.initLayer('L')

    const stroke = makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })])
    const undo: OperationUndoOperation = {
      id: nanoid(10), type: 'operation_undo', userId: 'user-a', timestamp: 1, targetOpId: stroke.id,
    }
    const redo: OperationRedoOperation = {
      id: nanoid(10), type: 'operation_redo', userId: 'user-a', timestamp: 2, targetOpId: stroke.id,
    }
    engine.absorbHistoricalOperations([stroke, undo, redo])

    const ids = engine.getOperations().map(op => op.id)
    expect(ids).toEqual([stroke.id, undo.id, redo.id])
  })

  it('a subsequent live undo can target an operation absorbed as history', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.initLayer('L')
    const historicalStroke = makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })])
    engine.absorbHistoricalOperations([historicalStroke])

    // No live tail op from this user exists — undo() must reach all the way
    // back into the historical prefix to find its target, exactly what a
    // real "undo something from before I joined" scenario needs (#169's
    // whole reason for existing).
    const undone = engine.undo()
    expect(undone?.id).toBe(historicalStroke.id)
  })
})

describe('getOperationsSinceRestore (#169)', () => {
  it('equals getOperations() when nothing has been absorbed as history yet', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))

    expect(engine.getOperationsSinceRestore().map(op => op.id)).toEqual(engine.getOperations().map(op => op.id))
  })

  it('excludes historical entries but keeps the live tail, across several backfill pages', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.initLayer('L')
    const tailAdd = makeLayerAdd('user-a', 'M') // applied first, as a real tail op would be
    engine.appendOperation(tailAdd)

    const page1 = [makeStroke('user-a', 'L', [dab(2, 2, { size: 4, pressure: 1, opacity: 0.5 })])]
    engine.absorbHistoricalOperations(page1)
    const page2 = [makeLayerAdd('user-a', 'L')] // an older page, backfill walking further back
    engine.absorbHistoricalOperations(page2)

    expect(engine.getOperationsSinceRestore().map(op => op.id)).toEqual([tailAdd.id])
    // getOperations() (used by undo/redo), by contrast, sees everything.
    expect(engine.getOperations().map(op => op.id)).toEqual([page2[0].id, page1[0].id, tailAdd.id])
  })
})
