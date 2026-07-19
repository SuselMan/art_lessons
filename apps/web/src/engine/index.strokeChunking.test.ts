// A stroke held down long enough (a big fill, a slow scribble over a large
// area) can accumulate thousands of dabs — a production room hit a single
// stroke over 1MB of JSON (~4000 dabs) this way, well past what nginx/
// Socket.IO's default buffer limits (~1MB) reliably carry. Past that
// ceiling the operation silently never reaches the server: it paints fine
// locally, but disappears after a reload since it was never actually
// recorded (found via a live "very long strokes vanish, undo/redo can't
// bring them back" report — of course not, there was nothing to undo into).
//
// STROKE_DAB_CHUNK_LIMIT (engine/index.ts) fixes this by flushing an
// in-progress stroke as its own complete StrokeOperation once it crosses
// the limit, then continuing to paint into a fresh one — invisible to the
// user (the pointer is still down, the mark is still one continuous
// visual stroke), just split into more than one Operation/undo step under
// the hood once it gets this long.
import { describe, expect, it } from 'vitest'

import { createTestEngine, makeLayerAdd, paperReady, readLayerPixels, simulateStroke } from './testing/engineTestUtils'

describe('#(perf) very long strokes are chunked into multiple StrokeOperations', () => {
  it('a long straight drag produces more than one stroke operation, each safely under the chunk limit', async () => {
    const { engine } = createTestEngine({ userId: 'user-a', size: 24 }, { width: 6000, height: 200 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setActiveLayer('L')
    // _onStart refuses to begin a stroke at all until the paper texture has
    // loaded (see engine/index.ts's own _paperTexLoaded comment) — silently
    // a no-op otherwise, which is exactly why this needs awaiting first.
    await paperReady(engine)

    // Spacing along the path is roughly size * 0.22 (~5.3 units/dab at
    // size 24 — see DabSystem's own spacingFactor) — 5000 units of path
    // comfortably clears STROKE_DAB_CHUNK_LIMIT (800) several times over.
    // Many intermediate move samples, not just start+end: a real drag
    // reports pointermove frequently, and DabSystem's curve fitting needs
    // that same gradual sampling to fill the path with dabs the way a real
    // stroke would (an isolated far jump doesn't).
    const points = Array.from({ length: 251 }, (_, i) => ({ x: i * 20, y: 100 }))
    simulateStroke(engine, points)

    const strokeOps = engine.getOperations().filter(op => op.type === 'stroke')
    expect(strokeOps.length).toBeGreaterThan(1)

    let totalDabs = 0
    for (const op of strokeOps) {
      expect(op.type).toBe('stroke')
      if (op.type !== 'stroke') continue
      expect(op.dabs.length).toBeLessThanOrEqual(800)
      totalDabs += op.dabs.length
    }
    // Only the very last chunk is allowed to be short (whatever's left over
    // when the stroke ends) — every other chunk hit the limit exactly.
    for (const op of strokeOps.slice(0, -1)) {
      if (op.type === 'stroke') expect(op.dabs.length).toBe(800)
    }
    expect(totalDabs).toBeGreaterThan(800)
  })

  it('a short stroke well under the chunk limit still produces exactly one operation', async () => {
    const { engine } = createTestEngine({ userId: 'user-a', size: 24 }, { width: 200, height: 200 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setActiveLayer('L')
    await paperReady(engine)

    simulateStroke(engine, [{ x: 10, y: 10 }, { x: 50, y: 50 }])

    const strokeOps = engine.getOperations().filter(op => op.type === 'stroke')
    expect(strokeOps.length).toBe(1)
  })

  it('the painted pixels are identical whether a stroke is recorded as one operation or chunked into several', async () => {
    // Same physical stroke, replayed two ways: once as the engine actually
    // chunks it live (via the real pointer pipeline), once reconstructed as
    // a single appendOperation call from the chunked dabs concatenated back
    // together — chunking must be purely a network/log-shape concern, never
    // a rendering one (_flushStrokeChunk doesn't touch _display() or any
    // paint state, only the Operation dispatch).
    // Small brush (tight ~1 unit/dab spacing, see DabSystem's spacingFactor)
    // over a short path — enough to clear STROKE_DAB_CHUNK_LIMIT (800) a
    // couple of times over without the thousands of units of path (and
    // MockGL rasterization work) the size-24 test above needs.
    const chunked = createTestEngine({ userId: 'user-a', size: 4 }, { width: 1200, height: 50 })
    chunked.engine.appendOperation(makeLayerAdd('user-a', 'L'))
    chunked.engine.setActiveLayer('L')
    await paperReady(chunked.engine)
    const points = Array.from({ length: 101 }, (_, i) => ({ x: i * 18, y: 25 }))
    simulateStroke(chunked.engine, points)
    const chunkedPixels = readLayerPixels(chunked.engine, 'L')!

    const strokeOps = chunked.engine.getOperations().filter(op => op.type === 'stroke')
    expect(strokeOps.length).toBeGreaterThan(1) // sanity: this path did chunk
    const allDabs = strokeOps.flatMap(op => (op.type === 'stroke' ? op.dabs : []))

    const single = createTestEngine({ userId: 'user-a', size: 4 }, { width: 1200, height: 50 })
    single.engine.appendOperation(makeLayerAdd('user-a', 'L'))
    single.engine.appendOperation({
      id: 'reassembled', type: 'stroke', userId: 'user-a', timestamp: 0,
      layerId: 'L', tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], dabs: allDabs,
    })
    const singlePixels = readLayerPixels(single.engine, 'L')!

    expect(chunkedPixels).toEqual(singlePixels)
  })
})
