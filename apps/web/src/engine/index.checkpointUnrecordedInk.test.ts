// (#479) An undo checkpoint must never describe fewer operations than its
// pixels contain.
//
// `_takeCheckpoint`'s contract is that the buffer it photographs equals a
// replay of the layer's done pixel operations. `_maybeCheckpoint` defers the
// bake to idle time (#121, so a full readPixels doesn't stall the GPU at
// pen-up), and that defer is what breaks the contract: by the time the idle
// callback runs, the layer can hold ink no operation describes yet. Two ways
// in, and they are the only two — every other route to a layer's pixels goes
// through an operation:
//
//   * the gesture still under this user's pen (its StrokeOperation is recorded
//     at pen-up), and
//   * a peer's dabs streamed straight onto the layer ahead of the operation
//     that will claim them (#429).
//
// A checkpoint baked in either window is a superset of what its opIds claim,
// so every later rebuild — undo, redo, revoke — restores those pixels *and*
// replays the operation on top, laying the same dabs twice. Nothing looks
// broken: the marks are in the right places, just darker, and with a broad
// brush at low opacity that reads as tone. It compounds (the next checkpoint
// photographs the already-doubled buffer), and since idle timing and stream
// arrival differ per client, two people in one room drift apart while each
// stays internally consistent — which is how it reached a live lesson before
// anything here caught it. Room Igy2jy_i's stored snapshots held four to six
// times the graphite its own operation log replays.
//
// The tests read pixels rather than checkpoint bookkeeping wherever they can:
// the bug's whole signature is "same operations, more ink", so ink is what has
// to be asserted.
import { describe, expect, it } from 'vitest'

import type { Dab, Operation, StrokeOperation } from '@grafetto/shared'

import {
  checkpointCountFor, createTestEngine, dab, expectPixelsClose, makeLayerAdd, makeStroke,
  paperReady, readLayerPixels, simulateStrokeMove, simulateStrokeStart, takeCheckpointNow,
} from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/snapshotCodec'

const CANVAS = { width: 32, height: 32 }
const COLOR: [number, number, number] = [0.14, 0.14, 0.17]

/** Broad and faint, the shape this bug hides in: a doubled dab at opacity 1
 *  saturates and looks identical, while at 0.15 it is a plain tone shift. */
function faintDabs(cx: number, cy: number): Dab[] {
  return [0, 1, 2].map(i => dab(cx + i * 2, cy, { size: 12, pressure: 0.6, opacity: 0.15, t: i * 8 }))
}

function undoOf(op: Operation): Operation {
  return { id: `undo-${op.id}`, type: 'operation_undo', userId: op.userId, timestamp: 0, targetOpId: op.id }
}

function redoOf(op: Operation): Operation {
  return { id: `redo-${op.id}`, type: 'operation_redo', userId: op.userId, timestamp: 0, targetOpId: op.id }
}

/** Undo-then-redo of `op`: the cheapest real thing that drives a layer rebuild
 *  through the public API, and one of the exact moves that exposed this in the
 *  lesson (153 undos over ninety minutes). */
function undoRedo(engine: ReturnType<typeof createTestEngine>['engine'], op: Operation): void {
  engine.appendOperation(undoOf(op), 'remote')
  engine.appendOperation(redoOf(op), 'remote')
}

describe("a checkpoint taken while a peer's stroke is still streaming (#429)", () => {
  it('is refused rather than baked with fewer operations than its pixels hold', () => {
    const { engine } = createTestEngine({ userId: 'me' }, CANVAS)
    engine.appendOperation(makeLayerAdd('me', 'L'))
    engine.appendOperation(makeStroke('peer', 'L', faintDabs(6, 8)), 'remote')

    const dabs = faintDabs(6, 16)
    engine.appendPeerLiveDabs('peer', {
      strokeId: 'g2', layerId: 'L', tool: 'pencil', preset: 'HB', color: COLOR, packetSeq: 0, dabs,
    })

    // The idle callback lands here — pen still down at the other end.
    takeCheckpointNow(engine, 'L')

    expect(checkpointCountFor(engine, 'L')).toBe(0)
  })

  it('does not leave the stroke painted twice once an undo rebuilds the layer', () => {
    const { engine } = createTestEngine({ userId: 'me' }, CANVAS)
    engine.appendOperation(makeLayerAdd('me', 'L'))
    const first = makeStroke('peer', 'L', faintDabs(6, 8))
    engine.appendOperation(first, 'remote')

    const dabs = faintDabs(6, 16)
    const streamed: StrokeOperation = makeStroke('peer', 'L', dabs, { strokeId: 'g2' })
    engine.appendPeerLiveDabs('peer', {
      strokeId: 'g2', layerId: 'L', tool: 'pencil', preset: 'HB', color: COLOR, packetSeq: 0, dabs,
    })
    takeCheckpointNow(engine, 'L')
    engine.endPeerLiveStroke('peer', 'g2')
    // The operation arrives and correctly skips what the stream already
    // painted (#429's claim bookkeeping) — the layer is right at this point.
    engine.appendOperation(streamed, 'remote')

    const settled = readLayerPixels(engine, 'L')!.slice()
    undoRedo(engine, first)

    // Was: the checkpoint's pixels already held `streamed`, its opIds did not,
    // so the rebuild replayed `streamed` on top of itself.
    expectPixelsClose(readLayerPixels(engine, 'L'), settled)
  })
})

describe('a checkpoint taken while this user is still drawing', () => {
  it('is refused, since the recorded operation does not exist until pen-up', async () => {
    const { engine } = createTestEngine({ userId: 'me' }, CANVAS)
    // The pointer path refuses to start a stroke until the real paper texture
    // is in (engine's _paperTexLoaded gate), and a stroke that never starts
    // would make this test pass for the wrong reason.
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('me', 'L'))
    engine.setActiveLayer('L')
    engine.appendOperation(makeStroke('peer', 'L', faintDabs(6, 8)), 'remote')

    engine.setSize(12)
    engine.setOpacity(0.15)
    simulateStrokeStart(engine, 6, 16)
    simulateStrokeMove(engine, 12, 16)

    takeCheckpointNow(engine, 'L')

    expect(checkpointCountFor(engine, 'L')).toBe(0)
  })
})

describe("the pinned checkpoint a snapshot restore seeds (#287), once backfill has landed", () => {
  it('does not repaint the pre-snapshot history the restored pixels already contain', () => {
    // A room that really drew three strokes, snapshotted after the second.
    const source = createTestEngine({ userId: 'author' }, CANVAS)
    source.engine.appendOperation(makeLayerAdd('author', 'A', 'Layer', { seq: 1 }))
    const s1 = makeStroke('author', 'A', faintDabs(6, 8), { seq: 2 })
    const s2 = makeStroke('author', 'A', faintDabs(6, 14), { seq: 3 })
    const s3 = makeStroke('author', 'A', faintDabs(6, 20), { seq: 4 })
    source.engine.appendOperation(s1, 'remote')
    source.engine.appendOperation(s2, 'remote')
    const baked = source.engine.bakeNetworkSnapshot('A')!
    const snapshot = decodeLayerTiles(baked, 0).tiles
    expect(snapshot.length).toBeGreaterThan(0)

    // A joining client: restored pixels through seq 3, the tail on top, then
    // background backfill hands it the history those pixels already contain.
    const { engine } = createTestEngine({ userId: 'joiner' }, CANVAS)
    engine.initLayer('A')
    engine.restoreLayerFromSnapshot('A', snapshot, 3)
    engine.appendOperation(s3, 'remote')
    const settled = readLayerPixels(engine, 'A')!.slice()

    engine.absorbHistoricalOperations([s1, s2])
    undoRedo(engine, s3)

    // Was: the pinned checkpoint claims `opIds: []` forever, so the rebuild
    // restored the snapshot and then replayed s1 and s2 over it.
    expectPixelsClose(readLayerPixels(engine, 'A'), settled)
  })
})
