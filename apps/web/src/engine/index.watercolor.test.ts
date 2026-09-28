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
import { describe, expect, it, vi } from 'vitest'

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

/** (§17.58) Lands the queue of peers' watercolour operations now. */
function land(engine: PencilEngine): void {
  (engine as unknown as { _flushOpQueue(): void })._flushOpQueue()
}

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
    expect(lastMarkerDabUniform(engine, 'u_spreadPx')).toBeGreaterThan(0)
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
    expect(lastMarkerDabUniform(engine, 'u_spreadPx')).toBeGreaterThan(0)
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
      expect(lastMarkerDabUniform(engine, 'u_spreadPx')).toBe(0)
    }
  })

  it('settles a replayed stroke too, so the drawer and a peer end up alike', () => {
    // The whole point of deferring the term rather than dropping it: a stroke
    // arriving from the log as one shot must gain the same rim the drawer saw
    // appear at pen-up.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor' }))
    expect(lastMarkerDabUniform(engine, 'u_spreadPx')).toBeGreaterThan(0)
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
    // (#536) The band moved, and downward, which reverses v9. v9 raised the
    // paint's floor so one long band could not lose a fifth of its tone end to
    // end — bands are laid in alternating directions and that falloff came out
    // as a zigzag across a flat wash. What v9 could not know is that the
    // remaining sixteen per cent was invisible anyway: the deposit sat above
    // the composite's saturation ceiling, so the curve it was protecting
    // painted no pixels either way. With the density curve fixed the depletion
    // is worth having, and a real brush loses its paint over a long sweep — so
    // half by 150 dabs is the behaviour, not a regression.
    //
    // The flat-wash zigzag is a live risk again and is a thing to *measure*,
    // not to assume away: a painter recharges between bands and the load resets
    // per stroke, so what is on trial is how much one band may lose.
    expect(longDeposit / shortDeposit).toBeLessThan(0.55)
    expect(longDeposit / shortDeposit).toBeGreaterThan(0.15)
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

  it('stamps the wash on every chunk of a long gesture, not only on the last', async () => {
    // (#536) A gesture past STROKE_DAB_CHUNK_LIMIT is recorded as several
    // operations. Live they all share one scratch; replay groups by washId ??
    // strokeId, so a chunk without the washId lands in a different scratch
    // from the chunk that has it — the halo clip, the diffusion and the
    // composite scalars then differ between the author and everyone else.
    // Read off Ilya's own log: a scribble of 1835 dabs came out as
    // (no wash, no wash, wash).
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 256, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil('normal:92:42:PB29')
    engine.setSize(24)
    await paperReady(engine)
    simulateStrokeStart(engine, 8, 32)
    for (let i = 0; i < 40; i++) simulateStrokeMove(engine, 8 + (i % 2 === 0 ? 240 : 0), 20 + (i % 7) * 3)
    simulateStrokeEnd(engine, 8, 32)
    const chunks = engine.getOperations().filter((op): op is StrokeOperation => op.type === 'stroke')
    expect(chunks.length).toBeGreaterThan(1)
    const washId = chunks[chunks.length - 1].washId
    expect(washId).toBeTruthy()
    for (const c of chunks) expect(c.washId).toBe(washId)
  })

  // (#536, ADR 011 §17.12) The reveal: presentation that eases the screen onto
  // a settled wash instead of cutting to it. Its whole contract is that it is
  // NOT content — the layer holds the dry target from the first frame, a
  // replay never has one, and it lets go on its own.
  function reveals(engine: PencilEngine): Map<unknown, { startedAt: number }> {
    return (engine as unknown as { _washReveals: Map<unknown, { startedAt: number }> })._washReveals
  }

  it('keeps what the screen showed when the author lifts the pen, and only then', async () => {
    const engine = wetEngine()
    await paperReady(engine)
    simulateStroke(engine, [{ x: 16, y: 32 }, { x: 32, y: 32 }, { x: 48, y: 32 }])
    // One per layer tile the settle touched — the test layer is tiled finely.
    expect(reveals(engine).size).toBeGreaterThan(0)
    // A replay settles silently: the picture it builds *is* the dry target.
    const other = wetEngine()
    await paperReady(other)
    other.appendOperation(lastStroke(engine))
    expect(reveals(other).size).toBe(0)
  })

  it('lets go of the kept picture after WC_REVEAL_MS on its own', async () => {
    const engine = wetEngine()
    await paperReady(engine)
    simulateStroke(engine, [{ x: 16, y: 32 }, { x: 32, y: 32 }, { x: 48, y: 32 }])
    const [reveal] = [...reveals(engine).values()]
    expect(reveal).toBeDefined()
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(reveal.startedAt + 1600)
    try {
      ;(engine as unknown as { _display(): void })._display()
      expect(reveals(engine).size).toBe(0)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('never changes what the layer holds', async () => {
    // The one invariant the whole scheme rests on: a reveal is a way of
    // *showing* the settle, so the pixels a later stroke composites onto —
    // and a peer replays — must be the settled ones whether or not the
    // screen has finished easing onto them.
    const a = wetEngine()
    const b = wetEngine()
    await paperReady(a)
    await paperReady(b)
    simulateStroke(a, [{ x: 16, y: 32 }, { x: 32, y: 32 }, { x: 48, y: 32 }])
    b.appendOperation(lastStroke(a))
    expect(reveals(a).size).toBeGreaterThan(0)
    expect(reveals(b).size).toBe(0)
    // (§17.22) …once the author's settle, spread over the next frames, has
    // landed. The replay's landed inside appendOperation.
    await vi.waitFor(() => expect(settleOf(a)).toBeNull())
    expectPixelsEqual(readLayerPixels(a, 'L'), readLayerPixels(b, 'L'))
  })

  function settleOf(engine: PencilEngine): unknown {
    return (engine as unknown as { _settle: unknown })._settle
  }

  it('spreads the author’s settle over frames, and lands it before the next pen-down (§17.22)', async () => {
    // The diffusion is a dozen full-field passes; in one go it is a hitch at
    // every pen-up on a tablet. For the author it runs a few steps per
    // animation frame under the reveal. Anything that would paint into the
    // wash meanwhile lands it first, so no paint laid in between is lost to
    // the settle's copy-back.
    const engine = wetEngine()
    await paperReady(engine)
    simulateStroke(engine, [{ x: 16, y: 32 }, { x: 32, y: 32 }, { x: 48, y: 32 }])
    expect(settleOf(engine)).toBeTruthy()
    // (§17.47) Also when the stroke joins the same wash: letting the settle
    // land under the joining stroke's film (§17.46) broke live/replay parity.
    simulateStrokeStart(engine, 40, 32)
    expect(settleOf(engine)).toBeNull()
    simulateStrokeMove(engine, 56, 32)
    simulateStrokeEnd(engine, 56, 32)
    expect(settleOf(engine)).toBeTruthy()
    await vi.waitFor(() => expect(settleOf(engine)).toBeNull())
    // Both strokes are in the wash's log, nothing was dropped on the way.
    expect(engine.getOperations().filter(o => o.type === 'stroke').length).toBe(2)
    // A replay never spreads: it is building the dry target, unwatched.
    const other = wetEngine()
    await paperReady(other)
    other.appendOperation(lastStroke(engine))
    expect(settleOf(other)).toBeNull()
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
    // Eight participants: one author's later wash retires their earlier one
    // outright (§17.57), so the LRU is only ever about different authors.
    for (let i = 0; i < 8; i++) {
      engine.appendOperation(makeStroke(`user-${i}`, 'L', [dab(8 + i, 32, { size: 12 }), dab(16 + i, 32, { size: 12 })], {
        tool: 'watercolor', preset: 'normal:92:42:PB29', strokeId: `g${i}`, washId: `w${i}`,
      }), 'remote')
    }
    land(engine) // (§17.58) lands the queued ones
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

// #536 — the water-then-paint chain, end to end at the data level.
//
// MockGL rasterizes none of this, so these do not check what the mark looks
// like. They check the one thing that has to be true before looking is even
// meaningful: that a stroke laid into a puddle *saw* the puddle and wrote down
// what it saw. Three rounds of "the wetness does not seem to do anything" were
// answered by reasoning about the shader while the chain feeding it went
// unverified, which is the wrong order.
describe('water first, then paint (#536)', () => {
  const WATER = 'normal:92:0:PB29:round'
  const PAINT = 'normal:55:80:PB29:round'
  const DRY = 'normal:12:80:PB29:round'

  function paintWith(engine: PencilEngine, preset: string, y: number) {
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(preset)
    engine.setSize(24)
    simulateStroke(engine, [{ x: 8, y }, { x: 28, y }, { x: 56, y }])
    return lastStroke(engine)
  }

  function longLine(engine: PencilEngine, preset: string) {
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(preset)
    engine.setSize(12)
    const pts = []
    for (let x = 8; x <= 620; x += 4) pts.push({ x, y: 32 })
    simulateStroke(engine, pts)
    const now = performance.now()
    const field = engine['_paperWet']
    return { head: field.sample('L', 24, 32, now), tail: field.sample('L', 600, 32, now) }
  }

  it('wets the sheet where the brush still had water, not where it had run dry (§17.21)', async () => {
    // One long loaded stroke, many radii of it. The head leaves a puddle;
    // the tail, with the brush's water long gone (watercolorWaterLoad), leaves
    // the sheet as dry as it found it — the same cut the wash's coverage .b
    // record makes, so the sheen and the diffusion agree on where the puddle
    // is. Before this the field took the nominal mix for every dab.
    const engine = setupLayer(640, 64)
    await paperReady(engine)
    const { head, tail } = longLine(engine, 'normal:100:80:PB29:round')
    expect(head).toBeGreaterThan(0.6)
    expect(tail).toBeLessThan(0.05)
  })

  it('never runs a clean-water brush dry — wetting for wet-in-wet is one gesture (§17.21)', async () => {
    const engine = setupLayer(640, 64)
    await paperReady(engine)
    const { head, tail } = longLine(engine, WATER)
    expect(head).toBeGreaterThan(0.6)
    expect(tail).toBeGreaterThan(0.6)
  })

  it('records nothing on dry paper — most strokes carry no field at all', async () => {
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    const op = paintWith(engine, PAINT, 48)
    expect(op.wet).toBeUndefined()
  })

  it('sees the water a previous stroke left, and writes down what it saw', async () => {
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    // Clean water: zero pigment, so it leaves no colour — only wetness.
    paintWith(engine, WATER, 48)
    // …and paint straight over the same line.
    const painted = paintWith(engine, PAINT, 48)
    expect(painted.wet).toBeDefined()
    // Not a token amount: the brush came down in the middle of what it laid.
    const digits = (painted.wet ?? '').split('')
    const wettest = Math.max(...digits.map(d => parseInt(d, 16)))
    expect(wettest).toBeGreaterThan(6)
  })

  it('does not see water laid somewhere else on the sheet', async () => {
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    paintWith(engine, WATER, 8)
    const painted = paintWith(engine, PAINT, 80)
    expect(painted.wet).toBeUndefined()
  })

  it('keeps the water out of its own profile — a stroke must not read itself back', async () => {
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    // A single wet stroke wets the paper as it goes. If the sampling ran after
    // the deposit, its own later dabs would report a puddle that only exists
    // because of them, and every mark would believe it was painted wet.
    const op = paintWith(engine, WATER, 48)
    expect(op.wet).toBeUndefined()
  })

  it('lets clean water join a still-wet wash it was not set down on', async () => {
    // Read off Ilya's own log: a pigment spiral, then a flood of clean water
    // begun beside it and swept across. The water opened a second wash, so the
    // spiral's pigment sat in a closed accumulation the new water could never
    // move — which is what "пигмент в луже плохо размазывается" was. Water is
    // about the paint already there; it joins the wash while that paper is
    // wet, wherever the brush comes down.
    const engine = setupLayer(160, 96)
    await paperReady(engine)
    const pigment = paintWith(engine, PAINT, 48)          // x 8..56
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(WATER)
    engine.setSize(24)
    // Set down well clear of the mark, then swept over it.
    simulateStroke(engine, [{ x: 130, y: 48 }, { x: 90, y: 48 }, { x: 40, y: 48 }])
    const water = lastStroke(engine)
    expect(water.washId).toBeDefined()
    expect(water.washId).toBe(pigment.washId)
  })

  it('does not let a pigment stroke join a wash it was set down away from', async () => {
    // The landing rule stands for paint: a mark begun on dry paper away from
    // the wash is a new mark, however wet the wash still is.
    const engine = setupLayer(160, 96)
    await paperReady(engine)
    const first = paintWith(engine, WATER, 48)
    // Past the plain recency window (WASH_RECENT_MS), which joins any stroke
    // that follows within about a second regardless of where it lands — that
    // is the flat-wash case and is not what this test is about. The wash's
    // paper is still wet at two seconds; only the landing point says no.
    const t0 = performance.now()
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => t0 + 2000)
    try {
      engine.setActiveLayer('L')
      engine.setTool('watercolor')
      engine.setPencil(PAINT)
      engine.setSize(24)
      simulateStroke(engine, [{ x: 140, y: 48 }, { x: 150, y: 48 }, { x: 155, y: 48 }])
    } finally {
      clock.mockRestore()
    }
    expect(lastStroke(engine).washId).not.toBe(first.washId)
  })

  it('does not dry the puddle out from under a stroke that never leaves it', async () => {
    // Read out of Ilya's own operation log: a dot scribbled inside standing
    // water recorded e,a,7,6,5,4,3,2,2,1,1,0,0… — the paper drained to nothing
    // under a stroke that lay in the puddle from start to finish, because the
    // drain ran once per pointer batch and the scribble crossed the same cells
    // on every batch. Everything that decides how far paint runs is gated on
    // that digit, so no spread ever showed. The profile of such a stroke has
    // to stay wet the whole way.
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(WATER)
    engine.setSize(48)
    simulateStroke(engine, [{ x: 30, y: 48 }, { x: 48, y: 48 }, { x: 66, y: 48 }])
    engine.setPencil(PAINT)
    engine.setSize(16)
    // A scribble: forty points wandering inside the puddle, delivered as many
    // small batches so the drain gets every chance to compound.
    const points: Array<{ x: number; y: number }> = []
    for (let i = 0; i < 40; i++) points.push({ x: 48 + 6 * Math.cos(i * 1.7), y: 48 + 6 * Math.sin(i * 2.3) })
    simulateStrokeStart(engine, points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) simulateStrokeMove(engine, points[i].x, points[i].y)
    simulateStrokeEnd(engine, points[points.length - 1].x, points[points.length - 1].y)
    const digits = (lastStroke(engine).wet ?? '').split('').map(d => parseInt(d, 16))
    expect(digits.length).toBeGreaterThan(20)
    const tail = digits.slice(Math.floor(digits.length / 2))
    // Still plainly wet in the second half of the stroke…
    expect(Math.min(...tail)).toBeGreaterThanOrEqual(6)
    // …and not merely wet at the very start.
    expect(digits[digits.length - 1]).toBeGreaterThanOrEqual(6)
  })

  it('drinks from the puddle it crosses, so the next stroke finds it drier', async () => {
    // The paper's half of the exchange (watercolorPaperDrained), and the only
    // half observable from outside the engine: what one stroke took away shows
    // up as what the *next* one records seeing. The brush's own half — staying
    // wet past the edge of the puddle — is a pure function and is tested as
    // one, in watercolorPresets.test.ts.
    const wettest = (op: StrokeOperation): number =>
      Math.max(...(op.wet ?? '0').split('').map(d => parseInt(d, 16)))

    const undisturbed = setupLayer(96, 96)
    await paperReady(undisturbed)
    paintWith(undisturbed, WATER, 48)
    const before = wettest(paintWith(undisturbed, PAINT, 48))

    const drunkFrom = setupLayer(96, 96)
    await paperReady(drunkFrom)
    paintWith(drunkFrom, WATER, 48)
    // A dry brush dragged straight down the puddle: it carries water off with
    // it and lays almost none of its own back.
    paintWith(drunkFrom, DRY, 48)
    const after = wettest(paintWith(drunkFrom, PAINT, 48))

    expect(after).toBeLessThan(before)
    // Drier, not wiped: a wash does not come off the paper because someone
    // dragged a brush over it.
    expect(after).toBeGreaterThan(0)
  })
})

describe('water laid by someone else wets this paper too (#536)', () => {
  const WATER = 'normal:92:0:PB29:round'
  const PAINT = 'normal:55:80:PB29:round'

  function peerWater(engine: PencilEngine, y: number, at = Date.now()): StrokeOperation {
    // A real wall-clock timestamp, unlike makeStroke's counter: the field ages
    // the water by how long ago its author laid it, which is what makes the
    // same call correct whether it arrives live, late, or on replay.
    const op = makeStroke('user-b', 'L', [
      dab(8, y, { size: 24 }), dab(32, y, { size: 24 }), dab(56, y, { size: 24 }),
    ], { tool: 'watercolor', preset: WATER, color: [0.1, 0.2, 0.6], timestamp: at })
    engine.appendOperation(op)
    return op
  }

  it('lets a stroke paint into water someone else laid', async () => {
    // The scenario the whole field exists for and the one it could not do:
    // teacher wets the paper, student paints into it. Before this the peer's
    // water was on the student's screen as pixels and absent from their paper.
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    peerWater(engine, 48)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(PAINT)
    engine.setSize(24)
    simulateStroke(engine, [{ x: 8, y: 48 }, { x: 28, y: 48 }, { x: 56, y: 48 }])
    const painted = lastStroke(engine)
    expect(painted.wet).toBeDefined()
    expect(Math.max(...(painted.wet ?? '0').split('').map(d => parseInt(d, 16)))).toBeGreaterThan(6)
  })

  it('dries everything at the button: the next stroke lands dry, in a new wash (§17.47)', async () => {
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    peerWater(engine, 48)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(PAINT)
    engine.setSize(24)
    simulateStroke(engine, [{ x: 8, y: 48 }, { x: 28, y: 48 }, { x: 56, y: 48 }])
    const first = lastStroke(engine)
    // (§17.48) Pressed by SOMEONE ELSE - the teacher - and arriving as an
    // operation: this client's paper dries with theirs.
    engine.appendOperation({ id: 'dry-1', type: 'paper_dry', userId: 'user-b', timestamp: Date.now() }, 'remote')
    // Right away, well inside the join window and on the same water.
    simulateStroke(engine, [{ x: 8, y: 48 }, { x: 28, y: 48 }, { x: 56, y: 48 }])
    const second = lastStroke(engine)
    expect(second.washId).toBeDefined()
    expect(second.washId).not.toBe(first.washId)
    // The recorded wetness is what a replay reads: all dry.
    expect((second.wet ?? '0').split('').every(d => d === '0')).toBe(true)
  })

  it('a paper_dry arriving mid-stroke keeps the stroke, and closes its wash at pen-up (§17.48)', async () => {
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    peerWater(engine, 48)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(PAINT)
    engine.setSize(24)
    simulateStrokeStart(engine, 8, 48)
    simulateStrokeMove(engine, 28, 48)
    engine.appendOperation({ id: 'dry-2', type: 'paper_dry', userId: 'user-b', timestamp: Date.now() }, 'remote')
    simulateStrokeMove(engine, 56, 48)
    simulateStrokeEnd(engine, 56, 48)
    const first = lastStroke(engine)
    // Landed wet, and the rest of it met the dried paper.
    expect(parseInt((first.wet ?? '0')[0], 16)).toBeGreaterThan(0)
    expect((first.wet ?? '').endsWith('0')).toBe(true)
    simulateStroke(engine, [{ x: 8, y: 48 }, { x: 28, y: 48 }])
    expect(lastStroke(engine).washId).not.toBe(first.washId)
  })

  it('undo reaches past a paper_dry to the stroke before it (§17.48)', async () => {
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(PAINT)
    engine.setSize(24)
    simulateStroke(engine, [{ x: 8, y: 48 }, { x: 28, y: 48 }, { x: 56, y: 48 }])
    const stroke = lastStroke(engine)
    engine.appendOperation({ id: 'dry-3', type: 'paper_dry', userId: 'user-a', timestamp: Date.now() })
    expect(engine.undo()?.id).toBe(stroke.id)
  })

  it('lands the settle in flight when the tool changes, instead of dropping it (§17.47)', async () => {
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(PAINT)
    engine.setSize(24)
    simulateStroke(engine, [{ x: 8, y: 48 }, { x: 28, y: 48 }, { x: 56, y: 48 }])
    const s = (engine as unknown as { _settle: { ops: unknown[]; next: number } | null })._settle
    expect(s).toBeTruthy()
    engine.setTool('pencil')
    // Ran to its end rather than being abandoned with steps left.
    expect(s!.next).toBe(s!.ops.length)
  })

  it('ignores water old enough to have dried before this client ever saw it', async () => {
    // Rejoining a room replays its whole history. A stroke from an hour ago
    // must not put a fresh puddle on the paper — the field is a live one, and
    // an operation carries when it happened.
    const engine = setupLayer(96, 96)
    await paperReady(engine)
    peerWater(engine, 48, Date.now() - 10 * 60 * 1000)
    engine.setActiveLayer('L')
    engine.setTool('watercolor')
    engine.setPencil(PAINT)
    engine.setSize(24)
    simulateStroke(engine, [{ x: 8, y: 48 }, { x: 28, y: 48 }, { x: 56, y: 48 }])
    expect(lastStroke(engine).wet).toBeUndefined()
  })

  it('does not double-count a stroke that arrives twice', async () => {
    // Live packet then operation, or a rebuild after undo: wetness is a state
    // of the paper, so applying the same stroke again lands on the same field
    // rather than on a wetter one.
    const once = setupLayer(96, 96)
    await paperReady(once)
    peerWater(once, 48)

    const twice = setupLayer(96, 96)
    await paperReady(twice)
    const op = peerWater(twice, 48)
    twice.appendOperation({ ...op, id: `${op.id}-again` })

    const wettestOf = (engine: PencilEngine): number => {
      engine.setActiveLayer('L')
      engine.setTool('watercolor')
      engine.setPencil(PAINT)
      engine.setSize(24)
      simulateStroke(engine, [{ x: 8, y: 48 }, { x: 28, y: 48 }, { x: 56, y: 48 }])
      const digits = (lastStroke(engine).wet ?? '0').split('').map(d => parseInt(d, 16))
      return Math.max(...digits)
    }
    // Not wetter, rather than bit-identical, and the difference is the wall
    // clock: this field decays on one, so the two engines are read a few
    // milliseconds apart and under load that is enough to move a digit. What
    // the test is actually about is that applying a stroke twice does not add
    // water — so assert exactly that, within the one step quantisation allows.
    const single = wettestOf(once)
    const doubled = wettestOf(twice)
    expect(doubled).toBeLessThanOrEqual(single + 1)
    expect(doubled).toBeGreaterThan(6)
  })
})

describe('a history batch that undoes its own stroke (#536 §17.49)', () => {
  const undoOf = (id: string, target: string) =>
    ({ id, type: 'operation_undo' as const, userId: 'user-a', timestamp: 0, targetOpId: target })

  it('logs the stroke without painting it, and needs no rebuild to take it out', () => {
    const engine = setupLayer()
    const a = makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor', strokeId: 'g1' })
    const b = makeStroke('user-a', 'L', wcStroke(16, 40, 48, 40), { tool: 'watercolor', strokeId: 'g2' })
    const rebuild = vi.spyOn(engine as unknown as { _rebuildLayer: (id: string) => void }, '_rebuildLayer')
    engine.suspendDisplay() // a history batch, as the room runs one
    engine.setUnpaintedInBatch(new Set([b.id]))
    engine.appendOperation(a, 'remote')
    engine.appendOperation(b, 'remote')
    engine.appendOperation(undoOf('u1', b.id), 'remote')
    engine.setUnpaintedInBatch(null)
    engine.resumeDisplay()
    expect(rebuild).not.toHaveBeenCalled()
    expect(engine.getOperations().filter(o => o.type === 'stroke').map(o => o.id)).toEqual([a.id])
  })

  it('still rebuilds for a stroke painted before the batch (a reconnect\'s repeat)', () => {
    const engine = setupLayer()
    const b = makeStroke('user-a', 'L', wcStroke(), { tool: 'watercolor', strokeId: 'g2' })
    engine.appendOperation(b, 'remote')
    const rebuild = vi.spyOn(engine as unknown as { _rebuildLayer: (id: string) => void }, '_rebuildLayer')
    // The batch names it, but the page never hands it over again (deduped).
    engine.setUnpaintedInBatch(new Set([b.id]))
    engine.appendOperation(undoOf('u1', b.id), 'remote')
    engine.setUnpaintedInBatch(null)
    expect(rebuild).toHaveBeenCalled()
  })
})

describe('the settle field is sized by this settle alone (#536 §17.49)', () => {
  it('does not hand a small settle the big field an earlier one left', () => {
    const engine = setupLayer()
    const e = engine as unknown as { _diffuseFieldFor: (w: number, h: number) => { w: number; h: number } }
    expect(e._diffuseFieldFor(1500, 1500).w).toBe(1536)
    const small = e._diffuseFieldFor(300, 200)
    expect([small.w, small.h]).toEqual([512, 256])
  })
})

describe("a peer's live watercolour (#536 §17.51)", () => {
  it('is not painted from the live stream; its operation paints and settles it once, like a reload', () => {
    const engine = setupLayer()
    const d = [dab(16, 32, { size: 24 }), dab(24, 32, { size: 24 }), dab(32, 32, { size: 24 })]
    const packet: PeerLivePacket = {
      strokeId: 's1', layerId: 'L', tool: 'watercolor', preset: 'normal:100:70:PB29:round',
      color: [0.2, 0.3, 0.6], packetSeq: 0, dabs: d, washId: 'w1',
    }
    engine.appendPeerLiveDabs('user-b', packet)
    // Nothing painted, so no wash opened for it and nothing to claim later.
    expect(markerReplayChunkFor(engine, 'w1')).toBeNull()
    const op = makeStroke('user-b', 'L', d, { tool: 'watercolor', preset: packet.preset, strokeId: 's1', washId: 'w1' })
    engine.appendOperation(op, 'remote')
    // The operation paints through the replay path: the wash exists now.
    expect(markerReplayChunkFor(engine, 'w1')).not.toBeNull()
  })
})

describe("a peer's watercolour operation arriving live (#536 §17.52)", () => {
  it('settles over frames, and the next operation lands it first', () => {
    const engine = setupLayer()
    const e = engine as unknown as { _settle: { scratch: unknown; next: number; ops: unknown[] } | null }
    const d1 = [dab(16, 32, { size: 24 }), dab(24, 32, { size: 24 }), dab(32, 32, { size: 24 })]
    engine.appendOperation(makeStroke('user-b', 'L', d1, { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 's1', washId: 'w1' }), 'remote')
    const inFlight = e._settle
    expect(inFlight).toBeTruthy()
    expect(inFlight!.next).toBeLessThan(inFlight!.ops.length)
    const d2 = [dab(16, 48, { size: 24 }), dab(32, 48, { size: 24 })]
    const second = makeStroke('user-c', 'L', d2, { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 's2', washId: 'w2' })
    engine.appendOperation(second, 'remote')
    // (§17.58) The second waits its turn rather than forcing the first to land.
    expect(inFlight!.next).toBeLessThan(inFlight!.ops.length)
    // Counted as done, not landed for it (the room reads this every operation).
    expect(engine.getOperations().some(o => o.id === second.id)).toBe(true)
    expect(inFlight!.next).toBeLessThan(inFlight!.ops.length)
    land(engine)
    // Landing the queue ran the first to its end before the second painted.
    expect(inFlight!.next).toBe(inFlight!.ops.length)
  })

  it('stays synchronous inside a history batch', () => {
    const engine = setupLayer()
    const e = engine as unknown as { _settle: unknown }
    engine.suspendDisplay()
    engine.appendOperation(makeStroke('user-b', 'L', [dab(16, 32, { size: 24 }), dab(32, 32, { size: 24 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 's1', washId: 'w1' }), 'remote')
    expect(e._settle).toBeNull()
    engine.resumeDisplay()
  })
})

describe('an undo in a watercolour layer rebuilds it over slices (#536 §17.53)', () => {
  it('keeps the old buffer on screen, bakes nothing from it, and swaps in the replay when caught up', () => {
    vi.useFakeTimers()
    try {
      const engine = setupLayer()
      const e = engine as unknown as { _layers: Map<string, unknown>; _rebuildJobs: Map<string, unknown> }
      const a = makeStroke('user-a', 'L', [dab(16, 32, { size: 24 }), dab(32, 32, { size: 24 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'g1', washId: 'w1' })
      const b = makeStroke('user-a', 'L', [dab(16, 48, { size: 24 }), dab(32, 48, { size: 24 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'g2', washId: 'w2' })
      engine.appendOperation(a, 'remote')
      engine.appendOperation(b, 'remote')
      const before = e._layers.get('L')
      engine.appendOperation({ id: 'u1', type: 'operation_undo', userId: 'user-a', timestamp: 0, targetOpId: b.id }, 'remote')
      land(engine) // (§17.58) behind b in the queue
      // Nothing replayed synchronously: the old buffer is still the layer.
      expect(e._rebuildJobs.has('L')).toBe(true)
      expect(e._layers.get('L')).toBe(before)
      expect(engine.bakeNetworkSnapshot('L')).toBeNull()
      vi.runAllTimers()
      expect(e._rebuildJobs.has('L')).toBe(false)
      expect(e._layers.get('L')).not.toBe(before)
      expect(engine.getOperations().filter(o => o.type === 'stroke').map(o => o.id)).toEqual([a.id])
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts when the log moves under it (a redo mid-rebuild)', () => {
    vi.useFakeTimers()
    try {
      const engine = setupLayer()
      const e = engine as unknown as { _rebuildJobs: Map<string, { applied: string[] }> }
      const a = makeStroke('user-a', 'L', [dab(16, 32, { size: 24 }), dab(32, 32, { size: 24 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'g1', washId: 'w1' })
      const b = makeStroke('user-a', 'L', [dab(16, 48, { size: 24 }), dab(32, 48, { size: 24 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'g2', washId: 'w2' })
      engine.appendOperation(a, 'remote')
      engine.appendOperation(b, 'remote')
      engine.appendOperation({ id: 'u1', type: 'operation_undo', userId: 'user-a', timestamp: 0, targetOpId: b.id }, 'remote')
      engine.appendOperation({ id: 'r1', type: 'operation_redo', userId: 'user-a', timestamp: 0, targetOpId: b.id }, 'remote')
      vi.runAllTimers()
      expect(e._rebuildJobs.size).toBe(0)
      expect(engine.getOperations().filter(o => o.type === 'stroke').map(o => o.id)).toEqual([a.id, b.id])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a checkpoint between two washes (#536 §17.55)', () => {
  it('copies the layer just before a new wash paints, and a rebuild starts there', () => {
    vi.useFakeTimers()
    try {
      const engine = setupLayer()
      const e = engine as unknown as { _checkpoints: { best: (l: string, ops: unknown[]) => { start: number } | null }; _log: { layerPixelOps: (l: string) => unknown[] } }
      const t0 = Date.now()
      const w1 = [0, 1, 2].map(i => makeStroke('user-a', 'L', [dab(16 + i * 8, 32, { size: 20 }), dab(20 + i * 8, 32, { size: 20 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'a' + i, washId: 'W1', timestamp: t0 + i }))
      for (const op of w1) engine.appendOperation(op, 'remote')
      vi.runAllTimers()
      expect(e._checkpoints.best('L', e._log.layerPixelOps('L'))).toBeNull()
      const w2 = makeStroke('user-a', 'L', [dab(16, 48, { size: 20 }), dab(32, 48, { size: 20 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'b0', washId: 'W2', timestamp: t0 + 10 })
      engine.appendOperation(w2, 'remote')
      vi.runAllTimers()
      expect(e._checkpoints.best('L', e._log.layerPixelOps('L'))?.start).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes none while another participant’s wash may still be joined', () => {
    vi.useFakeTimers()
    try {
      const engine = setupLayer()
      const e = engine as unknown as { _checkpoints: { all: () => unknown[] } }
      const t0 = Date.now()
      const ops = [
        makeStroke('user-b', 'L', [dab(40, 16, { size: 20 }), dab(48, 16, { size: 20 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'x', washId: 'WB', timestamp: t0 }),
        ...[0, 1, 2].map(i => makeStroke('user-a', 'L', [dab(16 + i * 8, 32, { size: 20 }), dab(20 + i * 8, 32, { size: 20 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'a' + i, washId: 'W1', timestamp: t0 + 1 + i })),
        makeStroke('user-a', 'L', [dab(16, 48, { size: 20 }), dab(32, 48, { size: 20 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'b0', washId: 'W2', timestamp: t0 + 10 }),
      ]
      for (const op of ops) engine.appendOperation(op, 'remote')
      vi.runAllTimers()
      expect(e._checkpoints.all()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a checkpoint inside two open washes (#536 §17.56)', () => {
  const t0 = 1_700_000_000_000
  const pair = () => Array.from({ length: 10 }, (_, i) => {
    const user = i % 2 ? 'user-b' : 'user-a'
    const y = i % 2 ? 44 : 20
    return makeStroke(user, 'L', [dab(12 + i * 4, y, { size: 18 }), dab(20 + i * 4, y, { size: 18 })], {
      id: 'op' + i, tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 's' + i,
      washId: i % 2 ? 'WB' : 'WA', timestamp: t0 + i * 500,
    })
  })

  it('is taken while both washes are open, and an undo rebuilt from it matches a replay of the log', () => {
    vi.useFakeTimers()
    vi.setSystemTime(t0 + 6000)
    try {
      const engine = setupLayer()
      const e = engine as unknown as { _checkpoints: { all: () => Array<{ washIds?: readonly string[]; opIds: string[] }>; best: (l: string, ops: unknown[]) => { start: number } | null }; _log: { layerPixelOps: (l: string) => unknown[] } }
      const ops = pair()
      for (const op of ops) { engine.appendOperation(op, 'remote'); vi.runAllTimers() }
      const carrying = e._checkpoints.all().filter(c => c.washIds?.length)
      expect(carrying.length).toBe(1)
      expect([...carrying[0].washIds!].sort()).toEqual(['WA', 'WB'])
      engine.appendOperation({ id: 'u1', type: 'operation_undo', userId: 'user-b', timestamp: t0 + 7000, targetOpId: 'op9' }, 'remote')
      expect(e._checkpoints.best('L', e._log.layerPixelOps('L'))?.start).toBe(carrying[0].opIds.length)
      vi.runAllTimers()
      const after = readLayerPixels(engine, 'L')

      const fresh = setupLayer()
      for (const op of ops.slice(0, 9)) { fresh.appendOperation(op, 'remote'); vi.runAllTimers() }
      expect(after).toEqual(readLayerPixels(fresh, 'L'))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a participant’s earlier washes leave the replay cache (#536 §17.57)', () => {
  it('retires a wash once its author strokes elsewhere, and keeps other authors’', () => {
    const engine = setupLayer()
    const e = engine as unknown as { _replayRibbonChunks: Map<string, unknown> }
    const wc = (user: string, washId: string, y: number) => makeStroke(user, 'L', [dab(16, y, { size: 16 }), dab(40, y, { size: 16 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: washId + y, washId })
    engine.appendOperation(wc('user-b', 'B1', 16), 'remote')
    engine.appendOperation(wc('user-c', 'C1', 32), 'remote')
    land(engine) // (§17.58) lands the queued ones
    expect([...e._replayRibbonChunks.keys()].sort()).toEqual(['B1', 'C1'])
    engine.appendOperation(wc('user-b', 'B2', 48), 'remote')
    land(engine)
    expect([...e._replayRibbonChunks.keys()].sort()).toEqual(['B2', 'C1'])
    engine.appendOperation(makeStroke('user-c', 'L', [dab(16, 56), dab(40, 56)], { tool: 'pencil' }), 'remote')
    land(engine)
    expect([...e._replayRibbonChunks.keys()]).toEqual(['B2'])
  })
})

describe('a snapshot never holds half a wash (#536 §17.59)', () => {
  it('refuses to bake a layer while a wash on it may be continued, and bakes once the paper is dried', () => {
    const engine = setupLayer()
    const t = Date.now()
    engine.appendOperation(makeStroke('user-b', 'L', [dab(16, 32, { size: 20 }), dab(40, 32, { size: 20 })], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 's1', washId: 'W1', timestamp: t }), 'remote')
    land(engine)
    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
    engine.appendOperation({ id: 'dry1', type: 'paper_dry', userId: 'user-c', timestamp: t + 10 }, 'remote')
    expect(engine.bakeNetworkSnapshot('L')).not.toBeNull()
  })
})
