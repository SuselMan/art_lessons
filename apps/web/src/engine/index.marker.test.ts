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

import type { StrokeOperation } from '@grafetto/shared'

import type { PencilEngine } from './index'
import {
  createTestEngine, dab, fillStroke, makeLayerAdd, makeStroke,
  readLayerPixels, expectPixelsEqual,
  lastPaperDabUniform, lastMarkerDabUniform, markerPassDraw, simulateStroke, paperReady,
  readTilePixels,
} from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

function alphaAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4 + 3]
}

function setupLayer(width = 64, height = 64, infinite = false, markerRasterizer?: 'ribbon' | 'stamps') {
  const { engine } = createTestEngine({ userId: 'user-a', infinite, markerRasterizer }, { width, height })
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

  // #330: the composite pass recomputes the finished pixel from the frozen
  // `original` + accumulated coverage/inkLoad, so it must *overwrite* the tile,
  // not blend into its own previous output — blending compounded alpha once per
  // dab and left a hard step along every dab's rim (visible as separate stamped
  // shapes on a wide stroke). The two splat passes feeding it still blend:
  // coverage saturates like an ordinary "over" deposit, inkLoad sums additively.
  // MockGL can't check the resulting pixels (it never rasterizes DAB_FRAG's own
  // GLSL — see this file's header), but which blend each pass is issued with is
  // exactly the part that regressed, and that it can hold onto.
  it('draws the composite pass with blending off and the two splat passes with it on', () => {
    const engine = setupLayer(64, 64, false, 'stamps')
    engine.appendOperation(makeStroke('user-a', 'L', [dab(20, 32, { size: 20 }), dab(24, 32, { size: 20 })], { tool: 'marker' }))

    expect(markerPassDraw(engine, 2)?.blendEnabled).toBe(false) // composite — overwrite
    expect(markerPassDraw(engine, 3)?.blendEnabled).toBe(true)  // coverage splat
    expect(markerPassDraw(engine, 4)?.blendEnabled).toBe(true)  // inkLoad splat
  })

  // #330: MARKER_COVERAGE_GAIN buys back the edge crispness the removed alpha
  // compounding used to fake, and it must stay confined to the coverage splat —
  // the same number reaching inkLoad would darken the dye at the same time,
  // which is the coupling the separate gain exists to avoid. Asserted as the
  // ratio between the two passes' u_opacity rather than an absolute value, so
  // this doesn't re-hardcode a preset constant that's still tuned by eye.
  it('applies the coverage gain to the coverage splat only, not to the composite', () => {
    const engine = setupLayer(64, 64, false, 'stamps')
    engine.appendOperation(makeStroke('user-a', 'L', [dab(20, 32, { size: 20 }), dab(24, 32, { size: 20 })], { tool: 'marker' }))

    const coverage = markerPassDraw(engine, 3)!.opacity
    const composite = markerPassDraw(engine, 2)!.opacity
    expect(composite).toBeGreaterThan(0)
    expect(coverage / composite).toBeCloseTo(1.4, 5)
  })

  // #330 stage 2. What MockGL can and can't see here is the same split this
  // file's header describes: it never rasterizes DAB_FRAG's GLSL, and it
  // doesn't rasterize the ribbon program at all, so the *shape* of the result
  // is out of reach — markerRibbon.test.ts covers that geometry directly, as
  // pure functions. What is checkable here is that the marker now goes down the
  // ribbon path by default and that the passes are issued the way the design
  // requires.
  it('uses geometric nib coverage by default, not the old soft coverage splat', () => {
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', [dab(20, 32, { size: 20 }), dab(24, 32, { size: 20 })], { tool: 'marker' }))

    expect(markerPassDraw(engine, 6)?.blendEnabled).toBe(true) // nib stamp, geometric
    expect(markerPassDraw(engine, 3)).toBeUndefined()          // soft coverage splat never runs
    expect(markerPassDraw(engine, 4)).toBeUndefined()          // nor the soft ink splat
    expect(markerPassDraw(engine, 7)?.count).toBe(2)           // geometric ink, still per dab
  })

  // The composite is a full recomputation from (original, coverage, inkLoad),
  // and coverage now reaches *between* the dabs, so a per-dab quad would miss
  // what the bands wrote. One pass over the batch's dirty rect is both correct
  // and cheaper — this pins the "once per batch" half of that.
  it('composites once per batch rather than once per dab', () => {
    const engine = setupLayer()
    const dabs = [20, 24, 28, 32, 36].map(x => dab(x, 32, { size: 20 }))
    engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'marker' }))

    expect(markerPassDraw(engine, 6)?.count).toBe(dabs.length)
    expect(markerPassDraw(engine, 2)?.count).toBe(1)
  })

  it('still honours the stamp rasterizer when it is asked for explicitly', () => {
    const engine = setupLayer(64, 64, false, 'stamps')
    engine.appendOperation(makeStroke('user-a', 'L', [dab(20, 32, { size: 20 }), dab(24, 32, { size: 20 })], { tool: 'marker' }))

    expect(markerPassDraw(engine, 3)?.count).toBe(2) // soft coverage splat, per dab
    expect(markerPassDraw(engine, 6)).toBeUndefined()
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

  // Regression: a chisel dab's quad is stretched to aspectRatio x radius
  // along the nib axis (DAB_VERT), so a 5:1 nib reaches 5x further than
  // `radius` there. _paintOneMarkerDab used to resolve tiles from a plain
  // ±radius box (and _dabWorldRadius padded by 1/aspectRatio, the wrong
  // direction entirely), so every dab whose center sat more than `radius`
  // but less than `aspectRatio * radius` from a tile boundary only ever
  // resolved its own tile — the rest of the nib mark was clipped away by
  // that tile's viewport and the stroke broke off along the tile edge.
  it('paints the whole chisel nib across a tile boundary, not just the part in the dab center’s own tile', () => {
    const engine = setupLayer(64, 64, true)
    // radius 30, aspect 5, angle 0 -> footprint spans x in [754, 1054],
    // i.e. 30px past the x=TILE_SIZE boundary, from a center 120px short of it.
    const nib = dab(TILE_SIZE - 120, 500, { size: 60, aspectRatio: 5, angle: 0 })
    engine.appendOperation(makeStroke('user-a', 'L', [nib], { tool: 'marker', preset: 'chisel:60' }))

    // Brightest pixel in a whole tile-local column: this test is about how far
    // the nib reaches *along x*, and asking that question per column keeps it
    // independent of which row the dab's own centre lands on. It used to sample
    // one hardcoded row instead, which quietly sat ~26px off that centre — a
    // miss the dab shape hid until #330, because the old (buggy) elongated dab
    // had constant alpha along its whole length, so any row inside it read the
    // same. With a correctly elliptical dab an off-centre row tapers out early
    // and the assertion failed for a reason that had nothing to do with tiles.
    const columnMax = (px: Uint8Array, localX: number) => {
      let max = 0
      for (let row = 0; row < TILE_SIZE; row++) max = Math.max(max, px[(row * TILE_SIZE + localX) * 4 + 3])
      return max
    }

    const home = readTilePixels(engine, 'L', 0, 0)
    expect(home).not.toBeNull()
    expect(columnMax(home!, TILE_SIZE - 120)).toBeGreaterThan(0) // dab center
    expect(columnMax(home!, TILE_SIZE - 2)).toBeGreaterThan(0)   // right at the seam

    const across = readTilePixels(engine, 'L', 1, 0)
    expect(across).not.toBeNull()
    expect(columnMax(across!, 2)).toBeGreaterThan(0)             // just past it
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
