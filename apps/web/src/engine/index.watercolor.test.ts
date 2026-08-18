// Engine-level tests for the watercolor tool (#468, ADR 011).
//
// Watercolor is the third tool on the ribbon rasterizer (#455), sharing the
// marker's and brush pen's geometry and none of their ink models: it draws the
// stroke as one connected swept figure, then composites it through DAB_FRAG's
// u_inkMode=9 branch as a transparent glaze, and finally — once, at pen-up —
// runs the same composite again over the whole stroke's bounds with the
// wet-edge term switched on (_settleRibbonStroke).
//
// WHAT THESE TESTS CANNOT CHECK, and it is most of what makes the tool look
// like watercolor: MockGL never rasterizes DAB_FRAG's GLSL (see mockGL.ts's own
// module docstring, and the identical scope note at the top of
// index.marker.test.ts). Its _rasterDab applies a plain graphite-style "over"
// regardless of u_inkMode. So the wet edge, granulation, the glaze multiply and
// the pigment saturation curve are all invisible here — pixel assertions about
// them would be measuring the mock. They need a real WebGL context, i.e.
// browser QA against ADR 011 §6.
//
// What IS genuinely testable at this level, and is what follows: the right code
// path is invoked, the settle pass runs exactly when it should and not when it
// shouldn't, the wet-edge uniform is off during the stroke and on afterwards,
// chunked replay stitches through one scratch, and a stroke stays a pure
// function of its own dabs — which is the property the whole Operation Log
// rests on (ADR 011 §2).
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import type { StrokeOperation } from '@grafetto/shared'

import type { PencilEngine } from './index'
import {
  createTestEngine, dab, makeLayerAdd, makeStroke,
  readLayerPixels, expectPixelsEqual,
  lastMarkerDabUniform, markerPassDraw, markerReplayChunk, paperReady,
  simulateStroke, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd,
} from './testing/engineTestUtils'

function setupLayer(width = 64, height = 64) {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width, height })
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

function wcStroke(x0 = 16, y0 = 32, x1 = 48, y1 = 32, size = 24) {
  return [dab(x0, y0, { size }), dab((x0 + x1) / 2, (y0 + y1) / 2, { size }), dab(x1, y1, { size })]
}

describe('watercolor tool (#468, ADR 011)', () => {
  it('records the tool tag on the operation', () => {
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor' }))
    expect(lastStroke(engine).tool).toBe('watercolor')
  })

  it('composites through its own ink mode, not the brush pen’s', () => {
    // ADR 011 §3 and the shader's own comment: 9.0 satisfies the brush pen's
    // "u_inkMode > 7.5" check just as readily as 8.0 does, so the branch order
    // in DAB_FRAG is load-bearing. What this test pins is the JS half of that
    // contract — that the composite is dispatched with 9 at all. If the branch
    // is ever reordered in GLSL this stays green and the tool silently renders
    // as a brush pen, which is exactly why ADR 011 §6 asks for browser QA too.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor' }))
    expect(markerPassDraw(engine, 9)).toBeDefined()
    expect(markerPassDraw(engine, 8)).toBeUndefined()
  })

  it('runs the ribbon’s coverage and ink passes, like the marker and unlike the brush pen', () => {
    // A wash has a per-pixel pigment quantity that is separate from its
    // silhouette (RibbonProfile.ink true), because how much paint is sitting
    // somewhere and how much of the pixel the wash covers are different
    // questions. The brush pen switches the ink pass off; this must not.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor' }))
    expect(markerPassDraw(engine, 6)).toBeDefined()
    expect(markerPassDraw(engine, 7)).toBeDefined()
  })

  it('leaves the wet edge off while the stroke is still being drawn', async () => {
    // The tideline is a property of the *finished* silhouette. A batch painted
    // mid-stroke neither knows where the boundary will be nor covers the pixels
    // whose answer changes when the stroke grows past them — so u_wetEdge must
    // be 0 on every live batch composite. See _settleRibbonStroke.
    const engine = setupLayer()
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    simulateStrokeStart(engine, 16, 32)
    simulateStrokeMove(engine, 28, 32)
    simulateStrokeMove(engine, 40, 32)
    expect(lastMarkerDabUniform(engine, 'u_wetEdge')).toBe(0)
  })

  it('switches the wet edge on for the settle pass at pen-up', async () => {
    const engine = setupLayer()
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    simulateStrokeStart(engine, 16, 32)
    simulateStrokeMove(engine, 28, 32)
    simulateStrokeMove(engine, 40, 32)
    simulateStrokeEnd(engine, 40, 32)
    // The settle pass is the last composite of the gesture, so the uniform's
    // surviving value is its own.
    expect(lastMarkerDabUniform(engine, 'u_wetEdge')).toBeGreaterThan(0)
  })

  it('never switches the wet edge on for a tool that has none', async () => {
    // ribbonNeedsSettle keys off the profile, not the tool name — this is what
    // guarantees the marker and the brush pen pay nothing for watercolor's
    // extra pass, and that neither picks up a rim it should not have.
    for (const tool of ['marker', 'brushPen'] as const) {
      const engine = setupLayer()
      await paperReady(engine)
      engine.setActiveLayer('L')
      engine.setTool(tool)
      simulateStroke(engine, [{ x: 16, y: 32 }, { x: 28, y: 32 }, { x: 40, y: 32 }], { pressure: 0.6, speed: 1 })
      expect(lastMarkerDabUniform(engine, 'u_wetEdge')).toBe(0)
    }
  })

  it('settles a replayed stroke too, so the drawer and a peer end up alike', () => {
    // The whole point of deferring the term rather than dropping it: a stroke
    // arriving from the log as one shot must gain the same rim the drawer saw
    // appear at pen-up.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor' }))
    expect(lastMarkerDabUniform(engine, 'u_wetEdge')).toBeGreaterThan(0)
  })

  it('is a pure function of its own dabs', () => {
    // ADR 011 §2, and the property the Operation Log rests on. Nothing about a
    // watercolor stroke may depend on canvas state outside its own operation —
    // no shared wet layer, no drying clock, no carried brush load. Two engines
    // fed the identical operation must agree pixel for pixel.
    const a = setupLayer()
    const b = setupLayer()
    const op = makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor' })
    a.appendOperation(op)
    b.appendOperation({ ...op })
    expectPixelsEqual(readLayerPixels(a, 'L'), readLayerPixels(b, 'L'))
  })

  it('does not depend on what a previous stroke left on the layer', () => {
    // The same property from the other side: a wash laid over an existing one
    // must be reproducible from its own operation plus whatever is already on
    // the layer — which is what the frozen `original` snapshot gives it — and
    // must not carry anything forward in the engine between gestures. Replaying
    // the same pair of operations onto a fresh engine has to land identically.
    const live = setupLayer()
    const first = makeStroke('user-a', 'L', wcStroke(16, 24, 48, 24), { tool: 'watercolor' })
    const second = makeStroke('user-a', 'L', wcStroke(16, 32, 48, 32), { tool: 'watercolor' })
    live.appendOperation(first)
    live.appendOperation(second)

    const replayed = setupLayer()
    replayed.appendOperation({ ...first })
    replayed.appendOperation({ ...second })
    expectPixelsEqual(readLayerPixels(live, 'L'), readLayerPixels(replayed, 'L'))
  })

  it('stitches a chunked gesture through one scratch', () => {
    // Same contract the marker has (#385 / the _replayRibbonChunk comment): the
    // chunks of one gesture must share a scratch, so the second chunk composites
    // against the layer as it was before the *gesture* started, not against what
    // the first chunk just painted. For watercolor the visible failure would be
    // a darker band at every chunk boundary — a glaze over its own output.
    const engine = setupLayer()
    const strokeId = 'gesture-1'
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(8, 32, 28, 32), { tool: 'watercolor', strokeId }))
    const afterFirst = markerReplayChunk(engine)
    expect(afterFirst?.strokeId).toBe(strokeId)

    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(28, 32, 56, 32), { tool: 'watercolor', strokeId }))
    const afterSecond = markerReplayChunk(engine)
    expect(afterSecond?.strokeId).toBe(strokeId)
    expect(afterSecond?.scratch).toBe(afterFirst?.scratch)
  })

  it('starts a fresh scratch for a different gesture', () => {
    // The counterpart of the test above: lifting the stylus is what makes the
    // next pass a *glaze* rather than more of the same wash (ADR 011 §3.2), and
    // that distinction is exactly "a new scratch, so a new frozen original".
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor', strokeId: 'g1' }))
    const first = markerReplayChunk(engine)
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor', strokeId: 'g2' }))
    const second = markerReplayChunk(engine)
    expect(second?.scratch).not.toBe(first?.scratch)
  })

  it('survives an undo of a wash back to bare paper', () => {
    const engine = setupLayer()
    const before = readLayerPixels(engine, 'L')
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor' }))
    engine.undo()
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })

  it('paints something at all', () => {
    // Blunt, and worth keeping: the composite is dispatched over a bounding
    // rect rather than per dab, and a rect that resolves to nothing would leave
    // the layer untouched without any error anywhere.
    const engine = setupLayer()
    const before = readLayerPixels(engine, 'L')
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor' }))
    const after = readLayerPixels(engine, 'L')
    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(Array.from(after!)).not.toEqual(Array.from(before!))
  })

  it('bakes a flat opacity across every dab of a stroke', async () => {
    // Load-bearing downstream, not merely tidy: the u_inkMode=9 composite
    // reconstructs the finished pixel from a coverage buffer and one scalar
    // u_opacity, which a per-dab opacity could not be expressed through at all.
    // Pressure drives width here, never alpha (ADR 011 §5).
    const engine = setupLayer()
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    simulateStroke(engine, [
      { x: 12, y: 32 }, { x: 24, y: 30 }, { x: 36, y: 34 }, { x: 50, y: 32 },
    ], { pressure: 0.3, speed: 1 })
    // strokeDabs, not .dabs — every newly recorded stroke carries dabsPacked
    // instead (#366), and reading the plain field directly would silently see
    // an empty array.
    const dabs = strokeDabs(lastStroke(engine))
    expect(dabs.length).toBeGreaterThan(1)
    const first = dabs[0].opacity
    for (const d of dabs) expect(d.opacity).toBeCloseTo(first, 6)
  })
})
