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
  lastMarkerDabUniform, markerPassDraw, markerReplayChunk, markerReplayChunkCount,
  markerReplayChunkFor, paperReady,
  simulateStroke, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd,
} from './testing/engineTestUtils'
import type { PeerLivePacket } from './index'

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

  it('runs the same terms while drawing as it does at pen-up (#468 v4)', async () => {
    // v2 and v3 deferred the spread and the tideline to pen-up, because both
    // read a neighbourhood the moving brush front has not finished writing. It
    // was correct and it looked wrong: the artist drew one shape and watched it
    // become another the instant the stylus lifted.
    //
    // v4 runs the whole model on every batch and pads the rect each batch
    // recomposites instead, so the previous batch's guesses get fixed up as the
    // brush moves on (see _paintRibbonStroke's compositeBounds). What this pins
    // is that no term is switched off mid-stroke any more.
    const engine = setupLayer()
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    simulateStrokeStart(engine, 16, 32)
    simulateStrokeMove(engine, 28, 32)
    simulateStrokeMove(engine, 40, 32)
    expect(lastMarkerDabUniform(engine, 'u_wetEdge')).toBeGreaterThan(0)
    expect(lastMarkerDabUniform(engine, 'u_spreadPx')).toBeGreaterThan(0)
  })

  it('still composites once more at pen-up, over the whole mark', async () => {
    const engine = setupLayer()
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    simulateStrokeStart(engine, 16, 32)
    simulateStrokeMove(engine, 28, 32)
    simulateStrokeMove(engine, 40, 32)
    simulateStrokeEnd(engine, 40, 32)
    // The settle pass remains, and still matters: it is what fixes up the
    // margin around wherever the brush happened to stop. What changed in v4 is
    // that it no longer *introduces* terms, so the mark barely moves.
    expect(lastMarkerDabUniform(engine, 'u_wetEdge')).toBeGreaterThan(0)
  })

  it('never switches the wet edge on for a tool that has none', async () => {
    // Keyed off the profile, not the tool name — this is what guarantees the
    // marker and the brush pen pay nothing for watercolor's machinery, and that
    // neither picks up a rim it should not have.
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

describe('ink deposit normalization (#468 v3, ADR 011 §3.8)', () => {
  // The ink pass is dispatched with the deposit riding u_opacity, so the last
  // such draw's recorded value *is* the last dab's deposit. That is the one
  // handle MockGL gives onto this, and it is enough: everything being asserted
  // here is arithmetic the engine does on the CPU before any rasterization.

  function lastInkDeposit(engine: PencilEngine): number {
    const draw = markerPassDraw(engine, 7)
    if (!draw) throw new Error('no ink pass was dispatched')
    return draw.opacity
  }

  function sweep(n: number, size: number, tool: 'watercolor' | 'marker') {
    // Same spacing and same width throughout, so the only thing that can differ
    // between a short and a long sweep is how much water is left.
    const dabs = []
    for (let i = 0; i < n; i++) dabs.push(dab(6 + i * 3, 32, { size }))
    return makeStroke('user-a', 'L', dabs, {
      tool, preset: tool === 'marker' ? 'bullet:24' : 'normal',
    })
  }

  it('runs the paint down over a long stroke and barely over a short one', () => {
    const short = setupLayer(512, 128)
    short.appendOperation(sweep(12, 24, 'watercolor'))
    const shortDeposit = lastInkDeposit(short)

    const long = setupLayer(512, 128)
    long.appendOperation(sweep(150, 24, 'watercolor'))
    const longDeposit = lastInkDeposit(long)

    expect(longDeposit).toBeLessThan(shortDeposit)
    // Same segment length and same radius in both, so the ratio is purely the
    // *pigment* curve. Deliberately the slow one: v4 splits the two loads, and
    // paint outlasting water by better than two to one is what produces a dry
    // but still strongly coloured tail rather than a stroke that merely fades
    // (ADR 011 §4). A ratio down near the water curve's would mean the split
    // had been undone.
    // Deliberately a narrow band, and it got narrower in v9: the paint's floor
    // was raised so that one long band could not lose a fifth of its tone from
    // end to end, because bands are laid in alternating directions and that
    // falloff came out as a zigzag across a flat wash. What must survive is the
    // *direction* — paint thins along a stroke — and the fact that it thins far
    // less than water does. A ratio down near the water curve's would mean the
    // split between the two loads had been undone.
    expect(longDeposit / shortDeposit).toBeLessThan(0.97)
    expect(longDeposit / shortDeposit).toBeGreaterThan(0.75)
  })

  function singleDab(size: number, tool: 'watercolor' | 'marker') {
    // One dab and no travel, so the segment length is the nominal
    // fraction-of-its-own-radius _markerSegmentLength hands a lone tap. That
    // makes (segment / radius) a constant, which is what isolates the
    // normalization from everything else that varies along a stroke.
    return makeStroke('user-a', 'L', [dab(40, 32, { size })], {
      tool, preset: tool === 'marker' ? 'bullet:24' : 'normal',
    })
  }

  it('deposits the same amount whatever the brush size', () => {
    // The whole point of normalizing. Before it, deposit scaled with radius, so
    // a wide wash saturated the 8-bit inkLoad buffer on its very first dab —
    // which pinned the composite's saturation curve at 1 and made `density`
    // dead code everywhere. Now the quantity is per unit *area*: a thin brush
    // and a broad one lay the same pigment density and differ only in how much
    // paper they cover.
    const thin = setupLayer(512, 128)
    thin.appendOperation(singleDab(10, 'watercolor'))
    const wide = setupLayer(512, 128)
    wide.appendOperation(singleDab(120, 'watercolor'))
    expect(lastInkDeposit(thin)).toBeCloseTo(lastInkDeposit(wide), 6)
  })

  it('shows what that fixed: the marker still scales with its brush', () => {
    // The same pair on the legacy formula, kept as the contrast. This is not a
    // complaint about the marker — its composite was calibrated against exactly
    // this scale and must keep it — but it is what a 12x size range does to an
    // unnormalized deposit, and why watercolor could not use one.
    const thin = setupLayer(512, 128)
    thin.appendOperation(singleDab(10, 'marker'))
    const wide = setupLayer(512, 128)
    wide.appendOperation(singleDab(120, 'marker'))
    expect(lastInkDeposit(wide) / lastInkDeposit(thin)).toBeCloseTo(12, 0)
  })

  it('leaves the marker on its original scale', () => {
    // Load-bearing, not tidiness: marker strokes are in production rooms and
    // ADR 004's saturation constants were calibrated against the old formula.
    // Normalizing the marker would silently re-render every marker mark ever
    // drawn, which the Operation Log makes permanent.
    const engine = setupLayer(512, 128)
    const op = sweep(20, 24, 'marker')
    engine.appendOperation(op)
    const dabs = op.dabs ?? []
    const last = dabs[dabs.length - 1]
    // The legacy formula exactly: opacity x segment length x a half dose.
    expect(lastInkDeposit(engine)).toBeCloseTo(last.opacity * 3 * 0.5, 6)
  })

  it('keeps one depletion clock across the chunks of one gesture', () => {
    // A seam in the depletion is a visible band across the mark, so the clock
    // lives on the gesture's scratch rather than being restarted per operation.
    const engine = setupLayer(512, 128)
    const strokeId = 'g'
    const first = []
    for (let i = 0; i < 80; i++) first.push(dab(6 + i * 3, 32, { size: 24 }))
    engine.appendOperation(makeStroke('user-a', 'L', first, { tool: 'watercolor', strokeId }))
    const afterFirst = lastInkDeposit(engine)

    const second = []
    for (let i = 0; i < 80; i++) second.push(dab(6 + (80 + i) * 3, 32, { size: 24 }))
    engine.appendOperation(makeStroke('user-a', 'L', second, { tool: 'watercolor', strokeId }))
    // The second chunk continues running the brush down; if the clock had reset
    // its last dab would deposit exactly what the first chunk's did. Strict
    // inequality rather than a margin: since v9 raised the paint's floor the
    // difference over one chunk is genuinely small, and pinning a margin here
    // would be pinning today's curve rather than the behaviour.
    expect(lastInkDeposit(engine)).toBeLessThan(afterFirst)
  })
})

describe('washes (#468 v7, ADR 011 §7)', () => {
  // A wash is several strokes of the same paint laid before the last dried, and
  // they must share one accumulation — one silhouette, one deposit, one frozen
  // pre-wash content. That is what makes a flat wash paintable at all: bands
  // laid inside a wash merge, so there is no boundary between them to draw and
  // only the outer perimeter gets a tideline.
  //
  // The grouping itself is decided live (it wants wall-clock timing) and
  // *recorded* on the operation, exactly as strokeId is. These tests pin the
  // replay half of that contract — that the recorded id is what groups, and
  // that nothing here re-derives it.

  function wcStrokeIn(washId: string | undefined, x0: number, y: number) {
    return makeStroke('user-a', 'L', wcStroke(x0, y, x0 + 24, y), {
      tool: 'watercolor', preset: 'normal:55:60:PB29',
      ...(washId ? { washId } : {}),
    })
  }

  it('shares one accumulation across the strokes of a wash', () => {
    const engine = setupLayer(256, 128)
    engine.appendOperation(wcStrokeIn('w1', 8, 40))
    const first = markerReplayChunk(engine)
    engine.appendOperation(wcStrokeIn('w1', 8, 60))
    const second = markerReplayChunk(engine)
    expect(first?.scratch).toBeDefined()
    expect(second?.scratch).toBe(first?.scratch)
  })

  it('starts a fresh one for a different wash', () => {
    // Which is what makes glazing still glazing: a pass laid after the last one
    // dried multiplies over it, because it gets its own frozen `original`.
    const engine = setupLayer(256, 128)
    engine.appendOperation(wcStrokeIn('w1', 8, 40))
    const first = markerReplayChunk(engine)
    engine.appendOperation(wcStrokeIn('w2', 8, 60))
    expect(markerReplayChunk(engine)?.scratch).not.toBe(first?.scratch)
  })

  it('still groups a bare stroke by its gesture, as before washes existed', () => {
    // The Operation Log is permanent: watercolor strokes recorded before v7
    // carry no washId and must keep replaying exactly as they did.
    const engine = setupLayer(256, 128)
    const a = makeStroke('user-a', 'L', wcStroke(8, 40, 32, 40), { tool: 'watercolor', strokeId: 'g1' })
    const b = makeStroke('user-a', 'L', wcStroke(32, 40, 56, 40), { tool: 'watercolor', strokeId: 'g1' })
    engine.appendOperation(a)
    const first = markerReplayChunk(engine)
    engine.appendOperation(b)
    expect(markerReplayChunk(engine)?.scratch).toBe(first?.scratch)
  })

  it('replays a wash identically however its strokes are ordered in the log', () => {
    // The grouping is the recorded id and nothing else — no timing, no
    // proximity, nothing measured at replay time. Two engines fed the same
    // operations must land on the same pixels.
    const a = setupLayer(256, 128)
    const b = setupLayer(256, 128)
    const ops = [wcStrokeIn('w1', 8, 40), wcStrokeIn('w1', 8, 58), wcStrokeIn('w1', 8, 76)]
    for (const op of ops) a.appendOperation(op)
    for (const op of ops) b.appendOperation({ ...op })
    expectPixelsEqual(readLayerPixels(a, 'L'), readLayerPixels(b, 'L'))
  })

  it('undoes a wash one stroke at a time', () => {
    // Sharing an accumulation must not make the strokes inseparable in the log:
    // each is still its own operation, and undo still removes exactly one.
    const engine = setupLayer(256, 128)
    const before = readLayerPixels(engine, 'L')
    engine.appendOperation(wcStrokeIn('w1', 8, 40))
    engine.appendOperation(wcStrokeIn('w1', 8, 60))
    engine.undo()
    engine.undo()
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })
})


// A wash spans several operations, which is the one thing in this engine that
// a stroke's own record does not fully describe. Every path that paints a
// stroke therefore has to be handed the grouping, and until #468's follow-up
// only two of the three were: the live stream carried none, so a peer watching
// someone paint into wet paint grouped by gesture and drew a second glaze
// instead of one wash. Measured in a browser at 84.6% of the mark differing,
// up to 64/255 per channel — none of which MockGL can see, hence the shape of
// these tests: they check that the grouping *reaches* each path, not what the
// composite then does with it.
describe('a wash reaches every path that paints (#468)', () => {
  function wetEngine(onLive?: (p: PeerLivePacket) => void) {
    const { engine } = createTestEngine(
      { userId: 'user-a', ...(onLive ? { onLiveStrokeDabs: onLive } : {}) }, { width: 64, height: 64 },
    )
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil('normal:92:42:PB29')
    engine.setSize(24)
    return engine
  }

  it('stamps the wash on the live packets, not only on the operation', async () => {
    const packets: PeerLivePacket[] = []
    const engine = wetEngine(p => packets.push(p))
    await paperReady(engine)
    simulateStroke(engine, [{ x: 16, y: 32 }, { x: 32, y: 32 }, { x: 48, y: 32 }])

    expect(packets.length).toBeGreaterThan(0)
    const washId = lastStroke(engine).washId
    expect(washId).toBeTruthy()
    // Same id on both wires: a peer must be able to reach the author's grouping
    // from whichever of the two reaches it first.
    for (const p of packets) expect(p.washId).toBe(washId)
  })

  it('leaves the packet unstamped for a tool with no washes', async () => {
    const packets: PeerLivePacket[] = []
    const engine = wetEngine(p => packets.push(p))
    engine.setTool('marker')
    engine.setPencil('bullet:12')
    await paperReady(engine)
    simulateStroke(engine, [{ x: 16, y: 32 }, { x: 32, y: 32 }, { x: 48, y: 32 }])

    expect(packets.length).toBeGreaterThan(0)
    for (const p of packets) expect(p.washId).toBeUndefined()
  })

  it('keeps a wash open across someone else stroke landing between its own', () => {
    const engine = setupLayer()
    const wash = 'wash-1'
    engine.appendOperation(makeStroke('user-a', 'L', [dab(16, 32, { size: 24 }), dab(24, 32, { size: 24 })], {
      tool: 'watercolor', preset: 'normal:92:42:PB29', strokeId: 'g1', washId: wash,
    }), 'remote')
    const first = markerReplayChunkFor(engine, wash)

    // Somebody else, on the same layer, between the two strokes of the wash.
    // With one slot this evicted the wash outright and the rest of it landed as
    // a separate glaze — 100% of the mark differing from the author's.
    engine.appendOperation(makeStroke('user-b', 'L', [dab(16, 8, { size: 12 }), dab(24, 8, { size: 12 })], {
      tool: 'marker', preset: 'bullet:12', strokeId: 'g-other',
    }), 'remote')

    engine.appendOperation(makeStroke('user-a', 'L', [dab(32, 32, { size: 24 }), dab(40, 32, { size: 24 })], {
      tool: 'watercolor', preset: 'normal:92:42:PB29', strokeId: 'g2', washId: wash,
    }), 'remote')

    expect(first?.scratch).toBeTruthy()
    expect(markerReplayChunkFor(engine, wash)?.scratch).toBe(first?.scratch)
  })

  it('drops the oldest wash rather than growing without bound', () => {
    const engine = setupLayer()
    for (let i = 0; i < 8; i++) {
      engine.appendOperation(makeStroke('user-a', 'L', [dab(8 + i, 32, { size: 12 }), dab(16 + i, 32, { size: 12 })], {
        tool: 'watercolor', preset: 'normal:92:42:PB29', strokeId: `g${i}`, washId: `w${i}`,
      }), 'remote')
    }
    // Bounded, and the survivors are the recent ones: an evicted wash goes back
    // to being a seam, which is what every ribbon tool did before washes.
    expect(markerReplayChunkCount(engine)).toBeLessThanOrEqual(4)
    expect(markerReplayChunkFor(engine, 'w7')).toBeTruthy()
    expect(markerReplayChunkFor(engine, 'w0')).toBeNull()
  })

  // A checkpoint bakes the layer's pixels. The strokes of a wash share an
  // accumulation whose frozen base is the canvas as it was *before* the wash
  // began, so baking half of one and later restoring to it hands the rest of
  // the wash a base that already contains its own beginning. On the local path
  // that was fixed when washes landed; the remote path kept taking them.
  //
  // What is asserted is the *decision*, not the checkpoint: taking one is
  // deferred to idle time (see _maybeCheckpoint), so nothing lands within a
  // synchronous test and counting them would pass whatever the guard did.
  function countCheckpointCalls(engine: PencilEngine): () => number {
    const eng = engine as unknown as { _maybeCheckpoint: (id: string) => void }
    const real = eng._maybeCheckpoint.bind(eng)
    let n = 0
    eng._maybeCheckpoint = (id: string) => { n++; real(id) }
    return () => n
  }

  function remoteStrokes(engine: PencilEngine, n: number, washId?: string): void {
    for (let i = 0; i < n; i++) {
      engine.appendOperation(makeStroke('user-b', 'L', [dab(8, 32, { size: 24 }), dab(16, 32, { size: 24 })], {
        tool: washId ? 'watercolor' : 'marker',
        preset: washId ? 'normal:92:42:PB29' : 'bullet:12',
        strokeId: `g${i}`, ...(washId ? { washId } : {}),
      }), 'remote')
    }
  }

  it('never asks for a checkpoint half way through a remote wash', () => {
    const engine = setupLayer()
    const calls = countCheckpointCalls(engine)
    remoteStrokes(engine, 25, 'wash-1')
    expect(calls()).toBe(0)
  })

  it('still asks for one on remote strokes that belong to no wash', () => {
    const engine = setupLayer()
    const calls = countCheckpointCalls(engine)
    remoteStrokes(engine, 25)
    expect(calls()).toBe(25)
  })
})
