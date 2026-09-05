// Engine-level tests for #149's bakeNetworkSnapshot — the network-upload
// counterpart to _takeCheckpoint's local undo checkpoint (same allResident()
// tile gather, just serialized via snapshotCodec instead of kept in memory)
// — and #169's restoreLayerFromSnapshot/absorbHistoricalOperations, the
// fast-join restore + background backfill counterparts.
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import type { OperationRedoOperation, OperationUndoOperation } from '@grafetto/shared'

import {
  checkpointBytes, checkpointCountFor, createTestEngine, dab, expectPixelsClose, fillStroke, makeAreaClear,
  makeLayerAdd,
  makeStroke, readLayerPixels, readTilePixels, residentTileCount,
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

// (#469) A bounded room's tile used to be its whole page; it is capped at
// TILE_SIZE now, so every snapshot baked before that change arrives in a shape
// the buffer no longer uses. This is the end-to-end half of
// retileSnapshot.test.ts: that file proves the arithmetic, this one proves the
// engine actually routes a legacy snapshot through it and lands the pixels on
// the right tiles. Without it, an old room opens as garbage and every unit
// test still passes.
describe('restoring a snapshot baked before bounded rooms were subdivided (#469)', () => {
  /** One page-sized tile whose pixels encode their own world position, the way
   *  a pre-#469 bake of a 2048x1024 room would have produced. */
  function legacyPageTile(width: number, height: number) {
    const pixels = new Uint8Array(width * height * 4)
    for (let row = 0; row < height; row++) {
      const worldY = height - 1 - row // the array is GL bottom-up
      for (let x = 0; x < width; x++) {
        const i = (row * width + x) * 4
        pixels[i] = x & 255
        pixels[i + 1] = worldY & 255
        pixels[i + 2] = (x >> 8) & 255
        pixels[i + 3] = 255
      }
    }
    return { originX: 0, originY: 0, width, height, pixels }
  }

  // Deliberately asserts *shape* — which tiles exist, and how big — and never
  // pixel values. MockGL does not reproduce texture contents faithfully, so a
  // value assertion here would be measuring the mock (see the marker tests'
  // own note). The pixel arithmetic is proved where it can be: on the pure
  // function, in retileSnapshot.test.ts.
  it('lands the old page on the grid the buffer now uses', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 2048, height: 1024 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    engine.restoreLayerFromSnapshot('L', [legacyPageTile(2048, 1024)], 300)

    // One 2048-wide page in, two 1024 tiles out. Before the retiling step this
    // resolved to the same two tiles and uploaded the whole page into each.
    for (const tileX of [0, 1]) {
      const got = readTilePixels(engine, 'L', tileX, 0, 1024, 1024)
      expect(got).not.toBeNull()
      expect(got!.length).toBe(1024 * 1024 * 4)
    }
    expect(readTilePixels(engine, 'L', 2, 0, 1024, 1024)).toBeNull()
  })

  it('re-bakes the restored page into the new tile shape, byte for byte', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 2048, height: 1024 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.restoreLayerFromSnapshot('L', [legacyPageTile(2048, 1024)], 300)

    const { tiles } = decodeLayerTiles(engine.bakeNetworkSnapshot('L')!, 0)

    expect(tiles.map(t => `${t.originX},${t.originY}`).sort()).toEqual(['0,0', '1024,0'])
    for (const tile of tiles) {
      expect(tile.width).toBe(1024)
      expect(tile.height).toBe(1024)
      const grid = readTilePixels(engine, 'L', tile.originX / 1024, tile.originY / 1024, 1024, 1024)!
      expect(grid.length).toBe(tile.pixels.length)
      // Compared by index rather than by spreading both into plain arrays:
      // these are 4 MiB each, and two 4-million-element arrays per tile times
      // out the test on what is really a one-pass comparison.
      let mismatch = -1
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== tile.pixels[i]) { mismatch = i; break }
      }
      expect(mismatch).toBe(-1)
    }
  })

  it('creates no tile at all for a page that was stored empty', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 2048, height: 1024 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    // The case that made an old ten-layer room unopenable on a tablet: nine of
    // its layers were all but blank and each still cost a full page.
    engine.restoreLayerFromSnapshot('L', [{
      originX: 0, originY: 0, width: 2048, height: 1024,
      pixels: new Uint8Array(2048 * 1024 * 4),
    }], 300)

    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
  })
})

// (#474) The audit restoreLayerFromSnapshot now leaves behind. It exists
// because production room 2xKybCLI restored two layers, one came back partial
// and one blank, and the call reported success — WebGL signals out-of-memory
// through gl.getError(), which nothing on this path was asking.
describe('takeSnapshotRestoreAudit (#474)', () => {
  const TILE = { originX: 0, originY: 0, width: 8, height: 8, pixels: new Uint8Array(8 * 8 * 4).fill(200) }

  it('records a landed restore with the tiles it can account for', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.initLayer('L')

    engine.restoreLayerFromSnapshot('L', [TILE], 100)

    const audit = engine.takeSnapshotRestoreAudit()
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      layerId: 'L', known: true, tilesIn: 1, tilesUploaded: 1, glError: 0, bytes: TILE.pixels.byteLength,
    })
    expect(audit[0].withContentAfter).toBeGreaterThan(0)
  })

  // The room's snapshot index lists every layer ever baked, deleted ones
  // included; the engine drops those at its first line. Silently is fine —
  // unrecorded is not, because the caller cannot otherwise tell that case from
  // a live layer whose buffer failed to exist.
  it('records a layer it had no buffer for, with the weight it dropped', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })

    engine.restoreLayerFromSnapshot('deleted-long-ago', [TILE], 100)

    expect(engine.takeSnapshotRestoreAudit()[0]).toMatchObject({
      layerId: 'deleted-long-ago', known: false, tilesIn: 1, tilesUploaded: 0,
      bytes: TILE.pixels.byteLength, residentAfter: 0, withContentAfter: 0,
    })
  })

  it('reports the GL error code when the upload does not land', () => {
    const { engine, canvas } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.initLayer('L')
    const gl = canvas.getContext('webgl') as unknown as { getError: () => number }
    const real = gl.getError.bind(gl)
    // Raises GL_OUT_OF_MEMORY exactly once, on the read that follows the drain,
    // then hands the queue back — i.e. an error raised *by this restore*, which
    // is the only kind worth reporting. Deliberately not a stub that answers
    // 0x0505 forever: generatePaperMipmaps drains with `while (getError() !==
    // NO_ERROR)`, and a permanently angry mock hangs it.
    //
    // Counted rather than flagged because the drain's length is observable:
    // answering NO_ERROR on the first call ends it in exactly one read, so the
    // second call is the one whose answer reaches the audit.
    let calls = 0
    gl.getError = () => {
      calls++
      if (calls === 1) return 0
      if (calls === 2) return 0x0505
      return real()
    }

    engine.restoreLayerFromSnapshot('L', [TILE], 100)
    gl.getError = real

    expect(engine.takeSnapshotRestoreAudit()[0].glError).toBe(0x0505)
  })

  it('does not blame a restore for an error raised before it started', () => {
    const { engine, canvas } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.initLayer('L')
    const gl = canvas.getContext('webgl') as unknown as { getError: () => number }
    const real = gl.getError.bind(gl)
    // One stale error pending, then silence — the drain must absorb it.
    let pending = 1
    gl.getError = () => (pending-- > 0 ? 0x0505 : real())

    engine.restoreLayerFromSnapshot('L', [TILE], 100)
    gl.getError = real

    expect(engine.takeSnapshotRestoreAudit()[0].glError).toBe(0)
  })

  it('empties on read, so one restore cannot be judged by another restore records', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.initLayer('L')

    engine.restoreLayerFromSnapshot('L', [TILE], 100)

    expect(engine.takeSnapshotRestoreAudit()).toHaveLength(1)
    expect(engine.takeSnapshotRestoreAudit()).toHaveLength(0)
  })

  it('reports the GPU it is running on, and says so plainly when it cannot', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })

    expect(engine.gpuInfo()).toEqual({ renderer: null, maxTextureSize: 4096, contextLost: false })
  })
})

// (#467) A tile that holds nothing is 4 MiB of somebody else's memory spent
// saying what an absent tile already says — and residency is not evidence of
// content. `resolveForPaint` makes every tile a stroke's bounding rect touches
// resident whether a dab darkens it or not, and erasing empties a tile without
// releasing it.
//
// Measured on production room cdf314dd-153: **38 of its 107 stored tiles are
// fully transparent, 114 MB of the 349 MB a join materialises.** They also
// ratchet — a client that materialises them re-bakes them for the next joiner.
describe('fully transparent tiles (#467)', () => {
  const blankTile = (size = 8) => ({
    originX: 0, originY: 0, width: size, height: size, pixels: new Uint8Array(size * size * 4),
  })

  it('are not baked, so an erased-away layer stops publishing its emptiness', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 0, 0, 15))
    expect(engine.bakeNetworkSnapshot('L')).not.toBeNull() // the erase below proves nothing otherwise

    engine.appendOperation(makeAreaClear('user-a', 'L', { points: [-30, -30, 30, -30, 30, 30, -30, 30] }))

    // The tile is still resident — clearing does not release it — so this is
    // the filter talking, not the buffer having forgotten the tile.
    expect(residentTileCount(engine, 'L')).toBeGreaterThan(0)
    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
  })

  it('are not uploaded when restoring onto a layer that holds nothing', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.initLayer('L')

    engine.restoreLayerFromSnapshot('L', [blankTile()], 100)

    const audit = engine.takeSnapshotRestoreAudit()
    // Reported as arrived and not uploaded, rather than not reported: #474's
    // whole point is that a restore says what it did, and "dropped it on
    // purpose" is something it did.
    expect(audit[0]).toMatchObject({ layerId: 'L', known: true, tilesIn: 1, tilesUploaded: 0 })
    expect(audit[0].withContentAfter).toBe(0)
  })

  // The other half of the same rule, and the reason it cannot simply skip
  // blank tiles everywhere: restoring onto a buffer that already holds pixels
  // is the one case where an all-transparent tile is *doing* something.
  it('are still uploaded when restoring onto a live buffer, because there they clear it', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))

    engine.restoreLayerFromSnapshot('L', [blankTile()], 100)

    expect(engine.takeSnapshotRestoreAudit()[0]).toMatchObject({ tilesIn: 1, tilesUploaded: 1 })
    expect(readLayerPixels(engine, 'L')!.some((v, i) => i % 4 === 3 && v !== 0)).toBe(false)
  })
})

// (#467) The other half of what a restore costs. The GL textures are the half
// everyone thinks of; the pinned checkpoint beside them is a second full copy
// of the same pixels in CPU memory, held for the life of the room because the
// operations that painted them are below the log window and a rebuild has
// nothing else to start from. It is also exempt from the checkpoint byte
// budget, so on production room cdf314dd-153 it was 235 MB sitting inside a
// 256 MB budget, crowding out the ordinary undo checkpoints that budget is for.
describe('what a restore pins in memory (#467)', () => {
  /** A tile the shape real ink has: a small opaque run in a large empty field. */
  function sparseTile(side: number) {
    const pixels = new Uint8Array(side * side * 4)
    for (let i = 0; i < side; i++) pixels.set([10, 10, 10, 255], (side * 2 + i) * 4)
    return { originX: 0, originY: 0, width: side, height: side, pixels }
  }

  it('holds the snapshot packed, not as a second full copy of the pixels', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.initLayer('L')
    const tile = sparseTile(64)

    engine.restoreLayerFromSnapshot('L', [tile], 100)

    expect(checkpointCountFor(engine, 'L')).toBe(1)
    expect(checkpointBytes(engine)).toBeLessThan(tile.pixels.byteLength / 4)
  })

  // Packing is worth nothing if the pixels do not come back byte for byte: this
  // checkpoint is what an undo rebuilds a restored layer from, and what that
  // rebuild then republishes.
  it('gives those exact pixels back when a rebuild reads them', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.initLayer('L')
    const tile = sparseTile(64)
    engine.restoreLayerFromSnapshot('L', [tile], 100)
    const restored = [...readLayerPixels(engine, 'L')!]

    // A stroke and its undo is the shortest route through _replayInto, which is
    // the only reader of a packed checkpoint.
    engine.appendOperation(makeStroke('user-a', 'L', [dab(30, 30, { size: 8, pressure: 1, opacity: 0.6 })]))
    expect([...readLayerPixels(engine, 'L')!]).not.toEqual(restored)
    engine.undo()

    expect([...readLayerPixels(engine, 'L')!]).toEqual(restored)
  })
})
