// Engine-level tests for the marker tool (#250, ADR 004 section 3): each
// marker dab is a self-contained patch-copy-then-draw against this layer's
// own current content (_paintOneMarkerDab/_drawMarkerDab in index.ts),
// feeding DAB_FRAG's u_inkMode>1.5 branch (shaders.ts), which multiplies
// against whatever's already there (or a flat paper-white constant over
// untouched content) instead of the usual single-pass "over" compositing.
//
// What these tests can and can't check: MockGL (see mockGL.ts's own module
// docstring) deliberately never rasterizes DAB_FRAG's own GLSL — its
// _rasterDab always applies the plain graphite-style "over" formula
// (pressure*opacity*shape) regardless of u_inkMode, the same documented
// scope cut liner's own test file relies on (see index.liner.test.ts's
// "sets u_inkMode" test comment). So the actual multiply-vs-paperWhite math
// — "a marker pass over blank paper tints instead of vanishing," "a second
// pass over a dark pencil line stays dark, not washed out" — is NOT
// verifiable here; it needs a real WebGL context (browser QA). What IS
// genuinely testable at this level: the right code path is invoked (tool
// dispatch, u_inkMode wiring), the per-dab patch-copy-then-draw bookkeeping
// doesn't throw and actually paints something, the same v1 tile-boundary
// limitation smudge already has, and pure-function-of-dabs determinism.
import { describe, expect, it } from 'vitest'

import type { StrokeOperation } from '@art-lessons/shared'

import type { PencilEngine } from './index'
import {
  createTestEngine, dab, fillStroke, makeLayerAdd, makeStroke,
  readLayerPixels, expectPixelsEqual,
  lastPaperDabUniform, lastMarkerDabUniform, simulateStroke, paperReady,
} from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

function alphaAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4 + 3]
}

function setupLayer(width = 64, height = 64, infinite = false) {
  const { engine } = createTestEngine({ userId: 'user-a', infinite }, { width, height })
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  return engine
}

function lastStroke(engine: PencilEngine): StrokeOperation {
  const ops = engine.getOperations()
  const op = ops[ops.length - 1]
  if (op.type !== 'stroke') throw new Error(`expected a stroke op, got ${op.type}`)
  return op
}

describe('marker tool (#250, ADR 004)', () => {
  it('records a marker stroke with the recorded tool tag', () => {
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', [dab(20, 32, { size: 20 }), dab(24, 32, { size: 20 })], { tool: 'marker' }))
    expect(lastStroke(engine).tool).toBe('marker')
  })

  // #250: DAB_FRAG's marker branch (multiply-with-coverage) is gated by
  // u_inkMode>1.5 — verifies the engine actually sets it for marker's own
  // draw. Unlike liner (index.liner.test.ts's identical-in-spirit test),
  // marker's own draw always goes through the non-batched _dabProg (see
  // _paintMarkerDabs' own doc comment on why it can't batch), so this reads
  // through lastMarkerDabUniform (the non-instanced program) rather than
  // lastPaperDabUniform (which prefers the instanced program pencil/liner
  // actually use, and would just observe a stale leftover value here).
  it('sets u_inkMode to 2 for a marker dab', () => {
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', [dab(20, 32, { size: 20 }), dab(24, 32, { size: 20 })], { tool: 'marker' }))
    expect(lastMarkerDabUniform(engine, 'u_inkMode')).toBe(2)
  })

  // A pencil stroke never touches _dabProg's u_inkMode via marker's own
  // path (MockGL always provides the ANGLE_instanced_arrays shim, so a real
  // pencil dab paints through the *instanced* program instead — see
  // lastPaperDabUniform's own comment) — confirms marker's u_inkMode=2.0
  // doesn't leak into a following, unrelated tool's own draw.
  it('does not set u_inkMode on the instanced (pencil/liner) program for a marker stroke', () => {
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', [dab(20, 32, { size: 20 }), dab(24, 32, { size: 20 })], { tool: 'marker' }))
    engine.appendOperation(fillStroke('user-a', 'L', 40, 40, 8))
    expect(lastPaperDabUniform(engine, 'u_inkMode')).toBe(0)
  })

  it('actually deposits something over blank paper (dispatch reaches a real paint, not a silent no-op)', () => {
    const engine = setupLayer()
    expect(alphaAt(readLayerPixels(engine, 'L')!, 64, 32, 32)).toBe(0)

    engine.appendOperation(makeStroke('user-a', 'L', [dab(32, 32, { size: 24, pressure: 1, opacity: 1 })], { tool: 'marker' }))

    expect(alphaAt(readLayerPixels(engine, 'L')!, 64, 32, 32)).toBeGreaterThan(0)
  })

  it('is a pure function of the recorded dabs — replaying the same stroke twice from scratch is bit-identical', () => {
    const engineA = setupLayer()
    const engineB = setupLayer()
    const ops = [
      fillStroke('user-a', 'L', 16, 32, 6),
      makeStroke('user-a', 'L', [16, 24, 32, 40, 48].map(x => dab(x, 32, { size: 16, pressure: 1, opacity: 1 })), { tool: 'marker' }),
    ]
    for (const op of ops) { engineA.appendOperation(op); engineB.appendOperation(op) }

    expectPixelsEqual(readLayerPixels(engineA, 'L'), readLayerPixels(engineB, 'L'))
  })

  it('never throws on an empty layer (nothing underneath to patch-copy from)', () => {
    const engine = setupLayer()
    const dabs = [16, 24, 32, 40].map(x => dab(x, 32, { size: 20 }))
    expect(() => engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'marker' }))).not.toThrow()
  })

  it('skips a dab whose own patch would cross a tile boundary (infinite canvas, v1 limitation — same as smudge)', () => {
    const engine = setupLayer(64, 64, true)
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE - 5, 0, 10))

    const dabs = [TILE_SIZE - 20, TILE_SIZE - 10, TILE_SIZE, TILE_SIZE + 10].map(x => dab(x, 0, { size: 20 }))
    expect(() => engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'marker' }))).not.toThrow()
  })

  it('skips a degenerate zero-radius dab without throwing', () => {
    const engine = setupLayer()
    expect(() => engine.appendOperation(makeStroke('user-a', 'L', [dab(32, 32, { size: 0 })], { tool: 'marker' }))).not.toThrow()
  })

  // #250, ADR 004 section 2: marker reuses liner's own weak speed/tilt flow
  // curve (linerSpeedFlow/linerTiltFlow) rather than pencil's speedFactor —
  // drives the real pointer pipeline (like index.liner.test.ts's own tests)
  // so this exercises _bakeDabOpacity's actual marker branch, not a
  // reimplementation of the formula in the test.
  it('bakes dab opacity from the same weak liner-style speed/tilt flow, not pencil-style tapering to near-zero', async () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 160, height: 160 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    engine.setActiveLayer('L1')

    const path = [10, 35, 60, 85, 110, 135].map(x => ({ x, y: 10 }))
    engine.setTool('marker')
    simulateStroke(engine, path, { pressure: 0.6, speed: 1 })
    const stroke = lastStroke(engine)
    expect(stroke.dabs.length).toBeGreaterThan(0)
    for (const d of stroke.dabs) {
      // preset.opacity(MARKER_PRESET, 0.45) * userOpacity(1) *
      // linerSpeedFlow(1.0 at speed 1, its own reference point) *
      // linerTiltFlow(0, no tilt) = 0.45 — comfortably nonzero regardless
      // of the exact preset constant, and never tapering toward 0 the way
      // a bare pencil-style curve could at low pressure.
      expect(d.opacity).toBeGreaterThan(0.3)
    }
  })
})
