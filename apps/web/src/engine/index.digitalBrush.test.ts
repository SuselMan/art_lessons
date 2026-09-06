// Engine-level tests for the digital brush (#547, ADR 013).
//
// WHAT THESE TESTS CANNOT CHECK, stated up front for the same reason
// index.marker.test.ts and index.watercolor.test.ts state it: MockGL never
// rasterizes DAB_FRAG's GLSL, so nothing here can see the stamp's soft profile,
// the difference between a hardness of 0.12 and one of 0.94, or the flow/opacity
// split as *pixels*. Its _rasterDab applies a plain graphite-style "over"
// whatever u_inkMode says. Pixel assertions about the mark would be measuring
// the mock.
//
// What is genuinely testable, and is what follows: the right passes are
// dispatched with the right modes and the right per-dab values, the band pass is
// off, the step between stamps comes from the brush rather than the engine, and
// a stroke stays a pure function of its own operation — which is the property
// the whole Operation Log rests on (ADR 002).
//
// The visual half is browser QA against ADR 013, and the one assertion that
// matters most there is the flow/opacity one: draw a self-crossing stroke at 30%
// opacity and the crossing must not be darker than the rest of it.
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import type { StrokeOperation } from '@grafetto/shared'

import type { PencilEngine } from './index'
import { digitalBrushFlow, digitalBrushFromPreset, digitalBrushPreset } from './src/digitalBrushPresets'
import {
  createTestEngine, dab, makeLayerAdd, makeStroke,
  readLayerPixels, expectPixelsEqual,
  markerPassDraw, paperReady, simulateStroke,
} from './testing/engineTestUtils'

function setupLayer(width = 64, height = 64) {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width, height })
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  return engine
}

const TOKEN = digitalBrushPreset('medium-round', 1)

function brushStroke(size = 20) {
  return [
    dab(16, 32, { size, pressure: 0.5 }),
    dab(32, 32, { size, pressure: 0.5 }),
    dab(48, 32, { size, pressure: 0.5 }),
  ]
}

function lastStroke(engine: PencilEngine): StrokeOperation {
  const ops = engine.getOperations()
  const op = ops[ops.length - 1]
  if (op.type !== 'stroke') throw new Error(`expected a stroke op, got ${op.type}`)
  return op
}

describe('digital brush (#547, ADR 013)', () => {
  it('records the tool tag and a versioned brush token', () => {
    // ADR 013 §7: the version is half the token precisely so that retuning a
    // brush later cannot repaint the strokes already drawn with it.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', brushStroke(), {
      tool: 'digitalBrush', preset: TOKEN,
    }))
    expect(lastStroke(engine).tool).toBe('digitalBrush')
    expect(lastStroke(engine).preset).toMatch(/^brush:[a-z-]+@\d+$/)
  })

  it('stamps through its own coverage mode, not the ribbon’s rigid nib', () => {
    // Mode 6 is the marker's hard disc with a fixed one-pixel ramp. Falling
    // back to it would silently draw every brush in the set as the same
    // hard-edged one, which is the whole tool gone with no error anywhere.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', brushStroke(), {
      tool: 'digitalBrush', preset: TOKEN,
    }))
    expect(markerPassDraw(engine, 10)).toBeDefined()
    expect(markerPassDraw(engine, 6)).toBeUndefined()
  })

  it('runs no ink pass — flow lives in the coverage buffer, not a pigment texture', () => {
    // RibbonProfile.ink false. The marker needs a per-pixel dye quantity because
    // its composite multiplies; this one covers, so the silhouette says
    // everything and the ink pass would be two draws per tile writing a value
    // nothing reads.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', brushStroke(), {
      tool: 'digitalBrush', preset: TOKEN,
    }))
    expect(markerPassDraw(engine, 7)).toBeUndefined()
  })

  it('composites through the brush pen’s source-over branch', () => {
    // ADR 013 §3 — reused whole rather than copied: alpha = coverage * opacity
    // over the frozen pre-stroke content is already exactly flow-against-opacity.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', brushStroke(), {
      tool: 'digitalBrush', preset: TOKEN,
    }))
    expect(markerPassDraw(engine, 8)).toBeDefined()
    expect(markerPassDraw(engine, 9)).toBeUndefined()
  })

  it('hands each stamp its own flow, not the stroke’s opacity', () => {
    // The single most load-bearing wire in the tool. If Dab.opacity reached the
    // stamp instead, flow and opacity would collapse into one number and every
    // self-crossing would come out darker than the rest of the stroke — the
    // signature flaw of a hand-rolled digital brush.
    const engine = setupLayer()
    const brush = digitalBrushFromPreset('soft-round')
    const pressure = 0.5
    engine.appendOperation(makeStroke('user-a', 'L', [
      dab(16, 32, { size: 20, pressure, opacity: 1 }),
      dab(32, 32, { size: 20, pressure, opacity: 1 }),
    ], { tool: 'digitalBrush', preset: digitalBrushPreset(brush.id, brush.version) }))
    const stamp = markerPassDraw(engine, 10)
    expect(stamp).toBeDefined()
    expect(stamp!.opacity).toBeCloseTo(digitalBrushFlow(brush, pressure), 5)
    // And that number is genuinely not the dab's own opacity, or this test
    // would pass with the wire crossed.
    expect(digitalBrushFlow(brush, pressure)).toBeLessThan(1)
  })

  it('takes its step between stamps from the brush, not from the engine default', async () => {
    // ADR 013 §4: with the band pass off, spacing is the only thing keeping the
    // mark continuous, so a brush that could not set its own step would draw as
    // a row of discs.
    const engine = setupLayer()
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('digitalBrush')

    const countFor = (id: string): number => {
      const brush = digitalBrushFromPreset(id)
      engine.setPencil(digitalBrushPreset(brush.id, brush.version))
      engine.setSize(24)
      simulateStroke(engine, [{ x: 8, y: 32 }, { x: 32, y: 32 }, { x: 56, y: 32 }])
      const op = lastStroke(engine)
      // strokeDabs, not op.dabs: every newly recorded stroke packs its dabs
      // (#366), so reading the plain field would count zero for both brushes
      // and the assertion would pass by accident.
      return strokeDabs(op).length
    }
    // soft-round steps at 0.06 of the footprint, ink-round at 0.09 — the same
    // gesture must therefore not produce the same number of stamps.
    expect(countFor('soft-round')).not.toBe(countFor('ink-round'))
  })

  it('spaces a light touch off the mark it actually leaves', async () => {
    // The size curve runs to 0.08 of the slider at a feather touch, so a light
    // stroke draws a mark a twelfth of the nominal width. Spaced off the
    // nominal size alone it would be a row of separate discs — #478's defect at
    // its most extreme, which is why the tool is in isFootprintSpacedTool.
    const engine = setupLayer()
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('digitalBrush')
    engine.setPencil(TOKEN)
    engine.setSize(40)

    const dabsAt = (pressure: number): number => {
      simulateStroke(engine, [{ x: 8, y: 32 }, { x: 32, y: 32 }, { x: 56, y: 32 }], { pressure })
      return strokeDabs(lastStroke(engine)).length
    }
    // A light stroke leaves a much smaller mark, so it needs *more* stamps over
    // the same distance, never fewer.
    expect(dabsAt(0.1)).toBeGreaterThan(dabsAt(1))
  })

  it('records one opacity for the whole stroke, whatever the pressure does', async () => {
    // The invariant the whole composite rests on: DAB_FRAG's u_inkMode=8 branch
    // reconstructs each finished pixel from a coverage buffer and *one* scalar,
    // so every dab of a gesture has to carry the same opacity — the branch says
    // so in as many words ("a tool whose opacity varied per dab could not be
    // composited from a coverage buffer this way at all").
    //
    // Honest limit of this test, recorded because it matters: it does **not**
    // fail against the code before isDepositScaledTool existed, even though that
    // code routed this tool through dabDepositScale — a correction whose value
    // varies with pressure. Whatever the reason (the correction may come out at
    // 1 for the presets and sizes exercised here), the consequence is that this
    // guards the invariant going forward rather than proving it was the cause of
    // anything. Do not read a green here as "the artefact is fixed" — see the
    // note in ADR 013 §10.
    const engine = setupLayer()
    await paperReady(engine)
    engine.setActiveLayer('L')
    engine.setTool('digitalBrush')
    engine.setPencil(TOKEN)
    engine.setSize(48)

    // A stroke whose pressure swings across the whole usable range, which is
    // exactly the case the deposit correction reacted to.
    const eng = engine as unknown as {
      _onStart: (p: object) => void; _onMove: (p: object) => void; _onEnd: (p: object) => void
    }
    const sample = (x: number, pressure: number) => ({
      x, y: 32, pressure, tiltX: 0, tiltY: 0, buttons: 1,
      pointerType: 'pen', pointerId: 1, timeStamp: x * 8,
    })
    // A long monotone ramp rather than an alternation: the pressure filter is a
    // low-pass over distance travelled (pressureSmoothingPx), so a fast wobble
    // is smoothed away before it can reach the dab geometry — and a test built
    // on one measures the filter instead of the thing under test.
    eng._onStart(sample(4, 0.08))
    for (let i = 1; i <= 28; i++) eng._onMove(sample(4 + i * 2, 0.08 + i * 0.032))
    eng._onEnd(sample(60, 1))

    const dabs = strokeDabs(lastStroke(engine))
    expect(dabs.length).toBeGreaterThan(4)
    // The pressures really did vary — otherwise this test passes by drawing a
    // flat stroke and proving nothing.
    const pressures = dabs.map(d => d.pressure)
    expect(Math.max(...pressures) - Math.min(...pressures)).toBeGreaterThan(0.3)
    // …and the opacity did not.
    const opacities = [...new Set(dabs.map(d => d.opacity.toFixed(6)))]
    expect(opacities, 'one opacity for the whole stroke').toHaveLength(1)
  })

  it('is a pure function of its operation', async () => {
    // The property every other guarantee here rests on (ADR 002): undo, replay,
    // rejoin and every peer's copy of the room all reduce to painting the same
    // dabs twice and getting the same pixels.
    const engine = setupLayer()
    await paperReady(engine)
    const op = makeStroke('user-a', 'L', brushStroke(), { tool: 'digitalBrush', preset: TOKEN })

    engine.appendOperation(op)
    const first = readLayerPixels(engine, 'L')

    const engine2 = setupLayer()
    await paperReady(engine2)
    engine2.appendOperation(op)
    expectPixelsEqual(readLayerPixels(engine2, 'L'), first)
  })

  it('honours the recorded pressure→density setting, not the live one', () => {
    // The wiring the pure tests next door cannot see: the token is parsed inside
    // ribbonProfileFor, and what reaches the stamp is a closure built from it.
    // If that ever read the live setting instead, a peer would replay the mark
    // with their own switch position — the same class of bug the versioned token
    // exists to prevent (ADR 013 §7).
    const flowAt = (preset: string, pressure: number): number => {
      const engine = setupLayer()
      engine.appendOperation(makeStroke('user-a', 'L', [
        dab(16, 32, { size: 20, pressure }),
        dab(32, 32, { size: 20, pressure }),
      ], { tool: 'digitalBrush', preset }))
      const stamp = markerPassDraw(engine, 10)
      if (!stamp) throw new Error('no stamp draw')
      return stamp.opacity
    }

    // On (the plain token): pressing harder lays more down.
    expect(flowAt('brush:soft-round@1', 0.15))
      .toBeLessThan(flowAt('brush:soft-round@1', 0.95))
    // Off: the same amount whatever the pressure.
    expect(flowAt('brush:soft-round@1:flat', 0.15))
      .toBeCloseTo(flowAt('brush:soft-round@1:flat', 0.95), 6)
    // And "off" is the firm-press amount, not a quieter one — otherwise the
    // toggle would read as a volume knob.
    expect(flowAt('brush:soft-round@1:flat', 0.15))
      .toBeCloseTo(flowAt('brush:soft-round@1', 1), 6)
  })

  it('replays a stroke recorded with an unknown brush rather than dropping it', () => {
    // The log is permanent and older clients meet newer ones. Refusing to draw
    // is not among the options; falling back to the default brush is.
    const engine = setupLayer()
    engine.appendOperation(makeStroke('user-a', 'L', brushStroke(), {
      tool: 'digitalBrush', preset: 'brush:invented-later@3',
    }))
    expect(markerPassDraw(engine, 10)).toBeDefined()
    expect(markerPassDraw(engine, 8)).toBeDefined()
  })
})
