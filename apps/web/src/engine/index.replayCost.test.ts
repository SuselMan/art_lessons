// What a join costs (#381, #385).
//
// Both fixes here are about *replaying a room's history*, which is the one
// path where the engine does in one synchronous batch what it normally does
// one user action at a time. Two things that are perfectly reasonable per
// action turn pathological when a thousand of them run back to back:
//
//   #381 — every `operation_undo` rebuilds its layer, and a rebuild is a full
//          replay of that layer from its checkpoint. In a real 729-operation
//          room that was 2541 ms of the join's 3418 ms, against 875 ms for
//          painting all 146 889 dabs once.
//   #385 — every marker gesture allocated three buffers the size of the tile
//          it paints into, and a bounded room's tile is the whole canvas. A
//          real 2001-operation A2 room churned 166 × 34.8 MB textures through
//          the driver and then failed to allocate, leaving the room blank.
//
// Neither is visible in a test that applies five operations, so these assert
// the *shape* of the work — how many rebuilds, how many textures — rather
// than a duration, which would be a flaky proxy for it. The "does the result
// still match" half is already covered by index.suspendDisplay.test.ts, which
// compares final pixels against the same ops applied unsuspended.
import { describe, expect, it, vi } from 'vitest'

import type { StrokeOperation } from '@grafetto/shared'

import { PencilEngine } from './index'
import {
  createTestEngine, dab, fillStroke, makeLayerAdd, makeStroke, paperReady,
} from './testing/engineTestUtils'

interface RebuildSpyTarget { _rebuildLayer: (layerId: string) => void }

function undoOf(userId: string, target: StrokeOperation) {
  return { id: `undo-${target.id}`, type: 'operation_undo' as const, userId, timestamp: Date.now(), targetOpId: target.id }
}

function markerStroke(userId: string, layerId: string, cx: number, strokeId: string): StrokeOperation {
  return makeStroke(
    userId, layerId,
    [dab(cx, 4, { size: 4, pressure: 1, opacity: 1 }), dab(cx + 1, 5, { size: 4, pressure: 1, opacity: 1 })],
    { tool: 'marker', preset: 'chisel:medium', strokeId },
  )
}

describe('#381 a batch rebuilds each layer once, not once per undo', () => {
  it('defers every rebuild in a suspendDisplay batch to a single one per layer at resume', async () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'A'), 'remote')

    const strokes = Array.from({ length: 6 }, (_, i) => fillStroke('user-a', 'A', 3 + i, 4, 2))
    const spy = vi.spyOn(engine as unknown as RebuildSpyTarget, '_rebuildLayer')

    engine.suspendDisplay()
    for (const s of strokes) engine.appendOperation(s, 'remote')
    // Six undos: unbatched this is six full replays of the layer, each one
    // longer than the last and every one of them thrown away by the next.
    for (const s of strokes) engine.appendOperation(undoOf('user-a', s), 'remote')
    expect(spy, 'no rebuild may run while the batch is still open').not.toHaveBeenCalled()

    engine.resumeDisplay()
    expect(spy.mock.calls.map(c => c[0])).toEqual(['A'])
    engine.destroy()
  })

  it('still rebuilds immediately when no batch is open, so an interactive undo is unchanged', async () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'A'), 'remote')
    const stroke = fillStroke('user-a', 'A', 4, 4, 2)
    engine.appendOperation(stroke, 'remote')

    const spy = vi.spyOn(engine as unknown as RebuildSpyTarget, '_rebuildLayer')
    engine.appendOperation(undoOf('user-a', stroke), 'remote')

    expect(spy.mock.calls.map(c => c[0])).toEqual(['A'])
    engine.destroy()
  })

  it('rebuilds every layer the batch touched, not just the last one', async () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'A'), 'remote')
    engine.appendOperation(makeLayerAdd('user-a', 'B'), 'remote')
    const strokeA = fillStroke('user-a', 'A', 4, 4, 2)
    const strokeB = fillStroke('user-a', 'B', 9, 9, 2)

    const spy = vi.spyOn(engine as unknown as RebuildSpyTarget, '_rebuildLayer')
    engine.suspendDisplay()
    engine.appendOperation(strokeA, 'remote')
    engine.appendOperation(strokeB, 'remote')
    engine.appendOperation(undoOf('user-a', strokeA), 'remote')
    engine.appendOperation(undoOf('user-a', strokeB), 'remote')
    engine.resumeDisplay()

    // Coalescing must not become forgetting: a layer whose undo was deferred
    // and never flushed would keep pixels the log says are gone.
    expect(spy.mock.calls.map(c => c[0]).sort()).toEqual(['A', 'B'])
    engine.destroy()
  })

  it('takes no checkpoint of a layer whose rebuild is still pending', async () => {
    // A checkpoint's own contract is that the buffer equals replay state of
    // the layer's done ops. Mid-batch it does not — that is what deferring
    // means — so baking one here would store a half-applied buffer under a
    // complete op list, and a later undo restoring it would show content that
    // never existed.
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'A'), 'remote')
    // Two strokes, one undone: _takeCheckpoint bails on a layer with no done
    // pixel ops at all, so undoing the only stroke would make this pass for
    // the wrong reason.
    const kept = fillStroke('user-a', 'A', 4, 4, 2)
    const stroke = fillStroke('user-a', 'A', 9, 9, 2)

    const internals = engine as unknown as { _takeCheckpoint: (id: string) => void; _checkpoints: unknown[] }
    engine.suspendDisplay()
    engine.appendOperation(kept, 'remote')
    engine.appendOperation(stroke, 'remote')
    engine.appendOperation(undoOf('user-a', stroke), 'remote')
    const before = internals._checkpoints.length
    internals._takeCheckpoint('A')
    expect(internals._checkpoints.length, 'checkpointed a layer with a rebuild pending').toBe(before)

    engine.resumeDisplay()
    internals._takeCheckpoint('A')
    expect(internals._checkpoints.length, 'refused to checkpoint after the flush too').toBeGreaterThan(before)
    engine.destroy()
  })
})

describe('#385 marker scratch buffers are pooled, not reallocated per gesture', () => {
  it('does not allocate three more textures for every replayed marker gesture', async () => {
    const { engine, canvas } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'A'), 'remote')

    const gl = canvas.getContext('webgl') as unknown as { createTexture: () => object }
    let created = 0
    const orig = gl.createTexture.bind(gl)
    gl.createTexture = () => { created++; return orig() }

    // Ten distinct gestures — distinct strokeIds, so each one ends the
    // previous gesture's scratch, which is exactly the churn that made a real
    // room unopenable.
    engine.suspendDisplay()
    for (let i = 0; i < 10; i++) engine.appendOperation(markerStroke('user-a', 'A', 2 + i, `gesture-${i}`), 'remote')
    engine.resumeDisplay()

    // Three per gesture would be 30. The pool holds a bounded free list, so
    // after the first gesture warms it the rest reuse — the assertion is
    // deliberately loose about the exact number (other engine paths allocate
    // here too) and strict about it not scaling with the gesture count.
    expect(created, `allocated ${created} textures across 10 marker gestures`).toBeLessThan(15)
    engine.destroy()
  })

  it('hands a reused buffer back fully overwritten, so one gesture cannot bleed into the next', async () => {
    // The pool's whole risk: `original` is a copy of the layer at gesture
    // start and the other two accumulate this gesture only. A reused buffer
    // that kept its old contents would paint the previous stroke's coverage
    // into this one.
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'A'), 'remote')

    const run = (label: string) => {
      engine.appendOperation(markerStroke('user-a', 'A', 4, `${label}-1`), 'remote')
      engine.appendOperation(markerStroke('user-a', 'A', 4, `${label}-2`), 'remote')
    }
    run('first')
    const afterTwo = new Uint8Array(readLayer(engine))
    engine.appendOperation({ id: 'clear-1', type: 'layer_clear', userId: 'user-a', timestamp: Date.now(), layerId: 'A' }, 'remote')
    run('second')

    // Same two gestures, same layer state going in — the pooled buffers must
    // make the result identical, not merely non-empty.
    expect(Array.from(readLayer(engine))).toEqual(Array.from(afterTwo))
    engine.destroy()
  })
})

function readLayer(engine: PencilEngine): Uint8Array {
  const buf = (engine as unknown as { _layers: Map<string, { allResident: () => { buffer: { readPixels: () => Uint8Array } }[] }> })._layers.get('A')
  const resident = buf!.allResident()
  return resident[0].buffer.readPixels()
}
