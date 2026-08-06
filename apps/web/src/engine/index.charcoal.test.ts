// Engine-level integration tests for the charcoal tool (#304, ADR 005): drives
// the real pointer pipeline (_onStart/_onMove/_onEnd) rather than appending
// pre-built dabs, so these exercise the paths a live stroke actually uses —
// DabSystem's per-tool shaping (CHARCOAL_DAB_SHAPING), _resolvePreset's
// charcoal branch, _bakeDabOpacity, and the u_inkMode/u_charcoal* uniform
// wiring — the same way index.liner.test.ts does for the fineliner.
//
// What is NOT verifiable here: MockGL never compiles or runs DAB_FRAG's GLSL
// (see mockGL.ts's own docstring — its rasterizer always applies the plain
// graphite "over" formula regardless of u_inkMode), so the charcoal branch's
// actual *math* — the contrast-expanded tooth, the dropout gate, the dust ring
// — is out of scope at this level and needs a real WebGL context (browser QA).
// Same documented scope cut liner's and marker's own test files rely on. These
// tests cover: the right code path is selected, the per-type presets reach the
// shader, the geometry profile really is a different curve from graphite's, and
// replay is deterministic.
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'


import type { StrokeOperation } from '@grafetto/shared'

import type { PencilEngine } from './index'
import { CHARCOAL_PRESETS } from './src/charcoalPresets'
import { GRAPHITE_GRAIN_DEFAULT } from './src/pencilPresets'
import { CHARCOAL_FEEL } from './src/charcoalFeel'
import {
  createTestEngine, makeLayerAdd, lastPaperDabUniform, paperReady, simulateStroke,
  simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd,
  readLayerPixels, expectPixelsEqual,
} from './testing/engineTestUtils'

async function setupLayer() {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width: 160, height: 160 })
  await paperReady(engine)
  engine.appendOperation(makeLayerAdd('user-a', 'L1'))
  engine.setActiveLayer('L1')
  engine.setCompositeOrder([{ id: 'L1', opacity: 1 }])
  return engine
}

function lastStroke(engine: PencilEngine): StrokeOperation {
  const ops = engine.getOperations()
  const op = ops[ops.length - 1]
  if (op.type !== 'stroke') throw new Error(`expected a stroke op, got ${op.type}`)
  return op
}

// Six points 25px apart — comfortably beyond DabSystem's own spacing, so every
// stroke produces several dabs (same basis as index.liner.test.ts's paths).
const PATH_A = [10, 35, 60, 85, 110, 135].map(x => ({ x, y: 20 }))
const PATH_B = [10, 35, 60, 85, 110, 135].map(x => ({ x, y: 60 }))
const PATH_C = [10, 35, 60, 85, 110, 135].map(x => ({ x, y: 100 }))

describe('charcoal tool (#304, ADR 005)', () => {
  it('records the tool and the selected charcoal type as the stroke preset', async () => {
    const engine = await setupLayer()
    engine.setTool('charcoal')
    engine.setPencil('compressed')
    simulateStroke(engine, PATH_A, { pressure: 0.7 })

    const stroke = lastStroke(engine)
    expect(stroke.tool).toBe('charcoal')
    // ADR 005 §1: the three types ride StrokeOperation.preset, the field
    // pencil grades already use — no new Operation field.
    expect(stroke.preset).toBe('compressed')
  })

  // The charcoal branch is gated by u_inkMode > 4.5, and it must be checked
  // *before* the marker bands ("> 3.5" etc.), which 5.0 would also satisfy.
  // MockGL never runs the GLSL, so this proves the uniform wiring only.
  it('sets u_inkMode=5 for charcoal and clears it for pencil', async () => {
    const engine = await setupLayer()

    engine.setTool('charcoal')
    simulateStroke(engine, PATH_A, { pressure: 0.6 })
    expect(lastPaperDabUniform(engine, 'u_inkMode')).toBe(5)

    engine.setTool('pencil')
    simulateStroke(engine, PATH_B, { pressure: 0.6 })
    expect(lastPaperDabUniform(engine, 'u_inkMode')).toBe(0)
  })

  it('feeds the selected type\'s own tooth/crumble/dust through to the shader', async () => {
    const engine = await setupLayer()
    engine.setTool('charcoal')

    engine.setPencil('vine')
    simulateStroke(engine, PATH_A, { pressure: 0.6 })
    expect(lastPaperDabUniform(engine, 'u_charcoalTooth')).toBeCloseTo(CHARCOAL_PRESETS.vine.tooth)
    expect(lastPaperDabUniform(engine, 'u_charcoalCrumble')).toBeCloseTo(CHARCOAL_PRESETS.vine.crumble)
    expect(lastPaperDabUniform(engine, 'u_charcoalDust')).toBeCloseTo(CHARCOAL_PRESETS.vine.dust)

    engine.setPencil('compressed')
    simulateStroke(engine, PATH_B, { pressure: 0.6 })
    expect(lastPaperDabUniform(engine, 'u_charcoalTooth')).toBeCloseTo(CHARCOAL_PRESETS.compressed.tooth)
    expect(lastPaperDabUniform(engine, 'u_charcoalCrumble')).toBeCloseTo(CHARCOAL_PRESETS.compressed.crumble)
    expect(lastPaperDabUniform(engine, 'u_charcoalDust')).toBeCloseTo(CHARCOAL_PRESETS.compressed.dust)
  })

  // The three uniforms are only meaningful inside the charcoal branch, but a
  // stale nonzero value left behind by a previous charcoal stroke would be a
  // live landmine the day any other branch starts reading one of them.
  it('leaves the charcoal uniforms at zero for a non-charcoal stroke', async () => {
    const engine = await setupLayer()

    engine.setTool('charcoal')
    simulateStroke(engine, PATH_A, { pressure: 0.6 })
    expect(lastPaperDabUniform(engine, 'u_charcoalTooth')).toBeGreaterThan(0)

    engine.setTool('pencil')
    simulateStroke(engine, PATH_B, { pressure: 0.6 })
    expect(lastPaperDabUniform(engine, 'u_charcoalTooth')).toBe(0)
    expect(lastPaperDabUniform(engine, 'u_charcoalCrumble')).toBe(0)
    expect(lastPaperDabUniform(engine, 'u_charcoalDust')).toBe(0)
  })

  // ADR 005 §3: covering power is what makes 2-3 strokes reach near-black.
  // Baked per-dab opacity is only *half* of that (the other half is the
  // expanded tooth, which lives in the shader and isn't observable here), and
  // the comparison is against 2B rather than 6B on purpose — 6B's own opacity
  // is pinned to pencilPresets.ts's BOUNDS clamp rather than calibrated, see
  // charcoalPresets.test.ts's own note and ADR 005 §3.
  it('bakes a higher per-dab opacity than the darkest calibrated pencil grade', async () => {
    const engine = await setupLayer()

    engine.setTool('charcoal')
    engine.setPencil('compressed')
    simulateStroke(engine, PATH_A, { pressure: 1, speed: 1 })
    const charcoalOpacity = strokeDabs(lastStroke(engine))[0].opacity

    engine.setTool('pencil')
    engine.setPencil('2B')
    simulateStroke(engine, PATH_B, { pressure: 1, speed: 1 })
    const graphiteOpacity = strokeDabs(lastStroke(engine))[0].opacity

    expect(charcoalOpacity).toBeGreaterThan(graphiteOpacity)
  })

  // ADR 005 §2: a blunt stick, not a sharpened cone — a higher width floor and
  // a smaller pressure swing than graphite's own 0.3 + 0.7*pressure.
  it('varies dab width far less with pressure than a pencil does', async () => {
    const engine = await setupLayer()

    engine.setTool('charcoal')
    simulateStroke(engine, PATH_A, { pressure: 0 })
    const charcoalLow = strokeDabs(lastStroke(engine))[0].size
    simulateStroke(engine, PATH_B, { pressure: 1 })
    const charcoalHigh = strokeDabs(lastStroke(engine))[0].size

    expect(charcoalLow).toBeGreaterThan(0)
    // 0.45 -> 1.05, a ~2.3x swing.
    expect(charcoalHigh / charcoalLow).toBeLessThan(2.6)

    engine.setTool('pencil')
    simulateStroke(engine, PATH_A.map(p => ({ ...p, y: p.y + 120 })), { pressure: 0 })
    const pencilLow = strokeDabs(lastStroke(engine))[0].size
    simulateStroke(engine, PATH_B.map(p => ({ ...p, y: p.y + 60 })), { pressure: 1 })
    const pencilHigh = strokeDabs(lastStroke(engine))[0].size

    // Graphite's own curve swings over 3x — confirms these are genuinely
    // different curves, not two samples that happen to land close together.
    expect(pencilHigh / pencilLow).toBeGreaterThan(3)
    expect(charcoalHigh / charcoalLow).toBeLessThan(pencilHigh / pencilLow)
  })

  // ADR 005 §2 / #305: the ladder presents a broad face at *moderate* tilt,
  // where a pencil still reads as nearly round.
  it('broadens with tilt earlier than a pencil does', async () => {
    const engine = await setupLayer()
    const midTilt = { pressure: 0.7, tiltX: 30, tiltY: 30 }

    engine.setTool('charcoal')
    simulateStroke(engine, PATH_A, midTilt)
    const charcoalAspect = strokeDabs(lastStroke(engine))[0].aspectRatio

    engine.setTool('pencil')
    simulateStroke(engine, PATH_B, midTilt)
    const pencilAspect = strokeDabs(lastStroke(engine))[0].aspectRatio

    expect(charcoalAspect).toBeGreaterThan(pencilAspect)
    expect(charcoalAspect).toBeGreaterThan(1)
  })

  // #305 — the three regimes, end to end through the real pointer pipeline.
  // tiltX/tiltY here are PointerEvent's two projected tilt angles in degrees;
  // the response is driven by the true angle from vertical derived from them
  // (tiltMath.ts), which equals tiltX exactly whenever tiltY is 0 — as it is
  // for all three grips below, so these stay readable as plain lean angles.
  describe('tilt response (#305, curve since #403)', () => {
    const upright = { pressure: 0.7, tiltX: 0, tiltY: 0 }
    const edgeGrip = { pressure: 0.7, tiltX: 40, tiltY: 0 }
    const laidOver = { pressure: 0.7, tiltX: 70, tiltY: 0 }

    async function aspectFor(tilt: { pressure: number; tiltX: number; tiltY: number }, path = PATH_A) {
      const engine = await setupLayer()
      engine.setTool('charcoal')
      simulateStroke(engine, path, tilt)
      return strokeDabs(lastStroke(engine)).at(-1)!
    }

    it('goes round -> edge -> broad as the stylus is laid over', async () => {
      const round = await aspectFor(upright)
      const edge = await aspectFor(edgeGrip)
      const broad = await aspectFor(laidOver)

      expect(round.aspectRatio).toBeCloseTo(1, 2)
      expect(edge.aspectRatio).toBeGreaterThan(round.aspectRatio)
      expect(broad.aspectRatio).toBeGreaterThan(edge.aspectRatio)
      expect(broad.aspectRatio).toBeCloseTo(CHARCOAL_FEEL.aspectMax, 1)
    })

    it('makes the edge narrower than the end face, not merely longer', async () => {
      const round = await aspectFor(upright)
      const edge = await aspectFor(edgeGrip)
      // Same pressure, so any size difference is the response's width factor.
      expect(edge.size).toBeLessThan(round.size)
    })

    it('deposits lighter on the broad side than upright', async () => {
      const round = await aspectFor(upright)
      const broad = await aspectFor(laidOver)
      expect(broad.opacity).toBeLessThan(round.opacity)
    })

    it('leaves every other tool\'s geometry untouched', async () => {
      // The size() signature grew a tilt argument and DabSystem gained a
      // filter; neither may alter pencil/liner/marker, whose profiles opt out.
      const engine = await setupLayer()
      engine.setTool('pencil')
      simulateStroke(engine, PATH_A, edgeGrip)
      const a = strokeDabs(lastStroke(engine)).map(d => [d.size, d.aspectRatio, d.tiltX, d.tiltY])

      const engine2 = await setupLayer()
      engine2.setTool('pencil')
      simulateStroke(engine2, PATH_A, edgeGrip)
      expect(engine2 && strokeDabs(lastStroke(engine2)).map(d => [d.size, d.aspectRatio, d.tiltX, d.tiltY])).toEqual(a)
      // Unfiltered: a pencil dab's stored tilt is exactly what came in.
      expect(strokeDabs(lastStroke(engine2)).every(d => d.tiltX === edgeGrip.tiltX && d.tiltY === edgeGrip.tiltY)).toBe(true)
    })
  })

  // #305: the tilt low-pass is stateful, which is exactly the kind of thing
  // that silently breaks replay if it ever runs at paint time instead of at
  // record time. These two pin the boundary down.
  describe('tilt filtering (#305)', () => {
    it('smooths a tilt jump instead of snapping the shape to it', async () => {
      const engine = await setupLayer()
      engine.setTool('charcoal')
      // Start upright, then jump to a hard lean partway through the stroke.
      simulateStrokeStart(engine, 10, 20, { pressure: 0.7, tiltX: 0, tiltY: 0 })
      for (const x of [35, 60, 85, 110]) {
        simulateStrokeMove(engine, x, 20, { pressure: 0.7, tiltX: 70, tiltY: 0 })
      }
      simulateStrokeEnd(engine, 135, 20, { pressure: 0.7, tiltX: 70, tiltY: 0 })

      const tilts = strokeDabs(lastStroke(engine)).map(d => d.tiltX)
      expect(tilts[0]).toBeCloseTo(0, 5)
      // It has to actually be moving toward the new tilt...
      expect(tilts.at(-1)!).toBeGreaterThan(tilts[0])
      // ...but must not have snapped straight there on the first sample after
      // the jump, which is the flutter this filter exists to remove.
      expect(Math.max(...tilts)).toBeLessThan(70)
      // Monotonic approach — a one-pole filter never overshoots.
      for (let i = 1; i < tilts.length; i++) expect(tilts[i]).toBeGreaterThanOrEqual(tilts[i - 1] - 1e-9)
    })

    it('replays a filtered charcoal stroke to identical pixels', async () => {
      const engine = await setupLayer()
      engine.setTool('charcoal')
      simulateStrokeStart(engine, 10, 60, { pressure: 0.8, tiltX: 5, tiltY: 5 })
      for (const x of [40, 70, 100]) simulateStrokeMove(engine, x, 60, { pressure: 0.8, tiltX: 65, tiltY: 20 })
      simulateStrokeEnd(engine, 130, 60, { pressure: 0.8, tiltX: 65, tiltY: 20 })
      const first = readLayerPixels(engine, 'L1')

      // Replaying the recorded op must not re-run the filter — the shape is
      // already baked into each Dab. A fresh engine whose filter state starts
      // empty proves it: if anything downstream re-derived geometry from tilt,
      // these would diverge.
      const op = lastStroke(engine)
      const replay = await setupLayer()
      replay.appendOperation(op)
      expectPixelsEqual(readLayerPixels(replay, 'L1'), first)
    })
  })

  // ADR 005 §5.1: charcoal's mark texture comes from the same computeGrain
  // variant set graphite uses, but each material keeps its own default, and the
  // dev selector overrides both. These assert _resolveGrainMode's two arms —
  // the exact behaviour that lets the selector audition variants on charcoal
  // without disturbing graphite when it's off.
  describe('grain variant (§5.1)', () => {
    it('uses the preset\'s own grain default when no dev override is set', async () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 160, height: 160 })
      await paperReady(engine)
      engine.appendOperation(makeLayerAdd('user-a', 'L1'))
      engine.setActiveLayer('L1')

      engine.setTool('charcoal')
      engine.setPencil('willow')
      simulateStroke(engine, PATH_A, { pressure: 0.6 })
      expect(lastPaperDabUniform(engine, 'u_grainMode')).toBe(CHARCOAL_PRESETS.willow.grain)
    })

    it('uses graphite\'s own default for a pencil stroke, not charcoal\'s', async () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 160, height: 160 })
      await paperReady(engine)
      engine.appendOperation(makeLayerAdd('user-a', 'L1'))
      engine.setActiveLayer('L1')

      engine.setTool('pencil')
      simulateStroke(engine, PATH_B, { pressure: 0.6 })
      expect(lastPaperDabUniform(engine, 'u_grainMode')).toBe(GRAPHITE_GRAIN_DEFAULT)
      // The two must actually differ, or this whole per-material split is
      // testing nothing — graphite is "Solid" (10), charcoal "Streaky" (3).
      expect(GRAPHITE_GRAIN_DEFAULT).not.toBe(CHARCOAL_PRESETS.willow.grain)
    })

    // The grain modes are constructor-only (dev flags read from localStorage at
    // mount), so each override arm needs its own engine.
    it('applies the charcoal override to charcoal only, leaving graphite on its default', async () => {
      const { engine } = createTestEngine({ userId: 'user-a', charcoalGrainMode: 4 }, { width: 160, height: 160 })
      await paperReady(engine)
      engine.appendOperation(makeLayerAdd('user-a', 'L1'))
      engine.setActiveLayer('L1')

      engine.setTool('charcoal')
      engine.setPencil('willow')
      simulateStroke(engine, PATH_A, { pressure: 0.6 })
      expect(lastPaperDabUniform(engine, 'u_grainMode')).toBe(4)

      // The whole point of splitting the two selectors: auditioning a variant
      // on charcoal must not disturb the pencil.
      engine.setTool('pencil')
      simulateStroke(engine, PATH_B, { pressure: 0.6 })
      expect(lastPaperDabUniform(engine, 'u_grainMode')).toBe(GRAPHITE_GRAIN_DEFAULT)
    })

    it('applies the graphite override to graphite only, leaving charcoal on its default', async () => {
      const { engine } = createTestEngine({ userId: 'user-a', grainMode: 7 }, { width: 160, height: 160 })
      await paperReady(engine)
      engine.appendOperation(makeLayerAdd('user-a', 'L1'))
      engine.setActiveLayer('L1')

      engine.setTool('pencil')
      simulateStroke(engine, PATH_B, { pressure: 0.6 })
      expect(lastPaperDabUniform(engine, 'u_grainMode')).toBe(7)

      engine.setTool('charcoal')
      engine.setPencil('willow')
      simulateStroke(engine, PATH_A, { pressure: 0.6 })
      expect(lastPaperDabUniform(engine, 'u_grainMode')).toBe(CHARCOAL_PRESETS.willow.grain)
    })

    // Neither default is 0 anymore, so "override to 0" has to be expressible —
    // otherwise the fine-dither variant becomes unauditionable on both tools.
    it('accepts an explicit override of 0, distinct from "use the default"', async () => {
      const { engine } = createTestEngine({ userId: 'user-a', charcoalGrainMode: 0 }, { width: 160, height: 160 })
      await paperReady(engine)
      engine.appendOperation(makeLayerAdd('user-a', 'L1'))
      engine.setActiveLayer('L1')

      engine.setTool('charcoal')
      engine.setPencil('willow')
      simulateStroke(engine, PATH_A, { pressure: 0.6 })
      expect(lastPaperDabUniform(engine, 'u_grainMode')).toBe(0)
    })
  })

  // A charcoal type this build doesn't know (a future client's stroke) must
  // still render as charcoal — same u_inkMode, willow's own parameters — rather
  // than silently falling through to the HB-pencil fallback.
  it('renders an unrecognized charcoal type as willow, still as charcoal', async () => {
    const engine = await setupLayer()
    engine.setTool('charcoal')
    engine.setPencil('some-future-type')
    simulateStroke(engine, PATH_A, { pressure: 0.6 })

    expect(lastPaperDabUniform(engine, 'u_inkMode')).toBe(5)
    expect(lastPaperDabUniform(engine, 'u_charcoalTooth')).toBeCloseTo(CHARCOAL_PRESETS.willow.tooth)
  })

  // Replay must be a pure function of the recorded dabs — the property the
  // whole Operation Log design rests on (ADR 002), and the one a per-stroke
  // random source would break. Charcoal's own breakup is keyed off the baked
  // paper texture and fragment position, never off a per-replay seed.
  it('replays a charcoal stroke to identical pixels', async () => {
    const engine = await setupLayer()
    engine.setTool('charcoal')
    engine.setPencil('willow')
    simulateStroke(engine, PATH_C, { pressure: 0.8 })
    const first = readLayerPixels(engine, 'L1')

    const op = lastStroke(engine)
    const replayEngine = await setupLayer()
    replayEngine.appendOperation(op)
    const replayed = readLayerPixels(replayEngine, 'L1')

    expectPixelsEqual(replayed, first)
  })
})
