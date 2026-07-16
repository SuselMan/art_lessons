// Engine-level tests for #149's bakeNetworkSnapshot — the network-upload
// counterpart to _takeCheckpoint's local undo checkpoint (same allResident()
// tile gather, just serialized via snapshotCodec instead of kept in memory)
// — and #169's restoreLayerFromSnapshot/absorbHistoricalOperations, the
// fast-join restore + background backfill counterparts.
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import type { OperationRedoOperation, OperationUndoOperation } from '@art-lessons/shared'

import { createTestEngine, dab, makeLayerAdd, makeStroke, readTilePixels } from './testing/engineTestUtils'
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
