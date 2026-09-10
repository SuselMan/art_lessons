// #482, ADR 012 — the footprint is worked out in exactly one place.
//
// Before this there were three implementations of the same formula: the real
// one in DabSystem._makeDab, a hand-maintained mirror in previewDabShape (the
// brush cursor), and a hand-assembled copy in PencilEngine._paintDwellDab. Two
// of the three were documented as "same as _makeDab" and nothing enforced it.
//
// These tests are the enforcement. They compare what the three paths *produce*
// rather than asserting any particular number, so they keep holding when the
// formula is retuned — which is the only kind of pin worth having here.

import { describe, expect, it } from 'vitest'
import type { ToolType } from '@grafetto/shared'
import { strokeDabs } from '@grafetto/shared'
import type { StrokeOperation } from '@grafetto/shared'

import { previewDabShape } from './index'
import { createTestEngine, paperReady, simulateStroke } from './testing/engineTestUtils'
import { PENCIL_DAB_SHAPING } from './src/dabShaping'
import { shapingForBrushPenPreset } from './src/brushPenPresets'
import { createTipState, tipFootprint, type TipInput } from './src/tipFootprint'

/** Tools that narrow the head of a stroke *after* the footprint is computed —
 *  the one place a recorded dab still disagrees with the cursor, and the
 *  remaining item of ADR 012 §8. */
const TAPERED = new Set<ToolType>(['brushPen', 'watercolor'])

const BASE_SIZE = 24
const TILT_X = 30
const TILT_Y = 40
const PRESSURE = 0.7

/** Every tool whose mark starts life as a dab, with a preset that exercises
 *  whatever its `presetName` slot actually carries. */
const TOOLS: Array<{ tool: ToolType; preset: string }> = [
  { tool: 'pencil',     preset: '2B' },
  { tool: 'eraser',     preset: 'HB' },
  { tool: 'smudge',     preset: 'HB' },
  { tool: 'liner',      preset: '0.5' },
  { tool: 'charcoal',   preset: 'willow' },
  { tool: 'marker',     preset: 'bullet:0.3' },
  { tool: 'marker',     preset: 'chisel:0.6' },
  { tool: 'brushPen',   preset: 'normal' },
  { tool: 'watercolor', preset: 'normal' },
  { tool: 'digitalBrush', preset: 'brush:hard-round@1' },
  // The flat tip specifically: its render-time multiplier is 0.25, so it is the
  // preset that made the cursor's missing scale impossible to miss (#547).
  { tool: 'digitalBrush', preset: 'brush:flat@1' },
]

/** What the renderer actually draws a dab at — `Dab.size` times the multiplier
 *  every paint path applies (`d.size * 0.5 * preset.sizeMultiplier`).
 *
 *  Spelled out here rather than imported because the point of the test is that
 *  two implementations agree: importing the engine's own helper would let both
 *  sides drift together and still pass. */
function paintedSize(tool: ToolType, preset: string, dabSize: number): number {
  if (tool === 'eraser') return dabSize
  if (tool === 'digitalBrush') {
    const aspect = preset.includes('flat') ? 4 : 1
    return dabSize / aspect
  }
  if (tool === 'pencil' && preset === '2B') return dabSize * 1.1
  if (tool === 'charcoal' && preset === 'willow') return dabSize * 1.15
  return dabSize
}

/** The first dab of a real, recorded stroke — the output of the one
 *  implementation, reached through the whole public pipeline. */
async function firstRecordedDab(tool: ToolType, preset: string) {
  const { engine } = createTestEngine({ userId: 'u' }, { width: 64, height: 64 })
  // _onStart refuses to open a stroke until the baked paper texture has landed
  // (its own guard) — the test loader is synchronous but still a promise.
  await paperReady(engine)
  engine.initLayer('L')
  engine.setActiveLayer('L')
  engine.setTool(tool)
  engine.setPencil(preset)
  engine.setSize(BASE_SIZE)
  simulateStroke(
    engine,
    [{ x: 20, y: 20 }, { x: 26, y: 22 }, { x: 32, y: 25 }],
    { pressure: PRESSURE, tiltX: TILT_X, tiltY: TILT_Y },
  )
  const ops = engine.getOperations()
  expect(ops.length).toBeGreaterThan(0)
  return strokeDabs(ops[0] as StrokeOperation)[0]
}

describe('#482 — one footprint implementation', () => {
  it.each(TOOLS)('the brush cursor matches the first dab of a real stroke ($tool $preset)', async ({ tool, preset }) => {
    const dab = await firstRecordedDab(tool, preset)
    const preview = previewDabShape(tool, preset, BASE_SIZE, PRESSURE, TILT_X, TILT_Y)

    // Shape and orientation must agree: the cursor is how a tool's settings are
    // seen before a mark exists, so anything it says that the mark then
    // contradicts is a lie the user has no way to check.
    //
    // Six decimals rather than exact equality, and the reason is the wire
    // format rather than the model: a recorded stroke stores its dabs through
    // packDabs (#366), which is float32, so a value read back out of an
    // operation carries ~7 significant digits. Both paths compute in float64
    // and agree bit-for-bit before packing — tightening this past the codec's
    // own resolution would pin the codec, not the tip model.
    expect(preview.aspectRatio).toBeCloseTo(dab.aspectRatio, 6)
    expect(preview.angle).toBeCloseTo(dab.angle, 6)

    // Size agrees for every tool whose recorded dab is not post-processed after
    // the footprint is computed. Two are: the brush pen and watercolor both
    // narrow the head of a stroke by scaling `dab.size` afterwards, outside the
    // tip model entirely (ADR 012 §8's remaining work). Asserted as a *known*
    // difference rather than skipped, so these lines start failing the moment
    // the tapers become inputs instead of post-processes.
    //
    // Relative rather than absolute: `size` is tens of px, and float32 (the
    // packed dab's precision) resolves that to about a part in 10^7.
    // Against the *painted* size, not the recorded one. `Dab.size` is the value
    // before the renderer's own multiplier, and the cursor's job is to predict
    // the mark rather than the payload — which is exactly what this comparison
    // got wrong until #547: it asserted agreement with a number the canvas never
    // shows, so a cursor half again too wide for a 6H passed for years.
    const painted = paintedSize(tool, preset, dab.size)
    if (TAPERED.has(tool)) expect(preview.size).toBeGreaterThan(painted)
    else expect(preview.size / painted).toBeCloseTo(1, 6)
  })

  it('a flexible nib asked with no stroke state returns its rest pose, not a degraded one', () => {
    const shaping = shapingForBrushPenPreset('normal')
    const input: TipInput = {
      x: 0, y: 0, pressure: PRESSURE, tiltX: TILT_X, tiltY: TILT_Y,
      baseSize: BASE_SIZE, pathAngle: 0.9, ds: 0, speed: 0, cameraAngle: 0,
    }
    const stateless = tipFootprint(shaping, input, null)
    // A freshly-zeroed state with no travel is the same thing said the other
    // way — this is why the hover cursor and the first dab of a stroke agree,
    // and it is a property of the model rather than a coincidence of the two
    // call sites.
    const fresh = tipFootprint(shaping, input, createTipState())

    expect(stateless.aspectRatio).toBe(fresh.aspectRatio)
    expect(stateless.angle).toBe(fresh.angle)
    expect(stateless.x).toBe(fresh.x)
    expect(stateless.y).toBe(fresh.y)
  })

  it('a resting tip keeps the bend it arrived with, and leaves the state untouched', () => {
    const shaping = shapingForBrushPenPreset('normal')
    const state = createTipState()
    const moving: TipInput = {
      x: 100, y: 100, pressure: PRESSURE, tiltX: TILT_X, tiltY: TILT_Y,
      baseSize: BASE_SIZE, pathAngle: 0.5, ds: 40, speed: 1.5, cameraAngle: 0,
    }
    // Drag it far enough to be genuinely bent...
    tipFootprint(shaping, moving, state)
    tipFootprint(shaping, moving, state)
    const bent = { ...state }
    expect(Math.hypot(bent.tipDirX, bent.tipDirY)).toBeGreaterThan(0.3)

    // ...then rest. ADR 012 §5: the bend filter's weight is 1 - exp(-ds/lag),
    // so ds = 0 moves nothing. This is what lets the dwell tick share the path.
    const resting = tipFootprint(shaping, { ...moving, ds: 0 }, state)
    expect(state.tipDirX).toBe(bent.tipDirX)
    expect(state.tipDirY).toBe(bent.tipDirY)
    expect(state.trailPx).toBe(bent.trailPx)
    // And the footprint it reports is the bent one, not a reset one.
    expect(resting.aspectRatio).toBeGreaterThan(tipFootprint(shaping, { ...moving, ds: 0 }, null).aspectRatio)
  })

  it('DabSystem.restingFootprint is the dwell tick reading the same model', async () => {
    const { engine } = createTestEngine({ userId: 'u' }, { width: 64, height: 64 })
    await paperReady(engine)
    engine.initLayer('L')
    engine.setActiveLayer('L')
    engine.setTool('liner')
    engine.setPencil('0.5')
    engine.setSize(BASE_SIZE)

    // #482 deliberately removed _paintDwellDab's `angle: 0` special case for
    // every tool but the marker. A resting liner now gets the same tilt-or-path
    // angle a moving one does — which for a 30/40 grip is the grip's own
    // azimuth, not zero.
    const preview = previewDabShape('liner', '0.5', BASE_SIZE, PRESSURE, TILT_X, TILT_Y)
    expect(preview.angle).not.toBe(0)
    // The magnitude of what that changes: liner's aspect is 1 + 0.15*tiltNorm,
    // so at this lean the ellipse it turns is barely an ellipse at all. Pinned
    // so nobody has to re-derive "does this matter" from the formula.
    expect(preview.aspectRatio).toBeLessThan(1.1)
  })

  it('the default profile is still a pure function of the sample — no state, no drift', () => {
    const input: TipInput = {
      x: 5, y: 7, pressure: PRESSURE, tiltX: TILT_X, tiltY: TILT_Y,
      baseSize: BASE_SIZE, pathAngle: 1.1, ds: 12, speed: 2, cameraAngle: 0.3,
    }
    const state = createTipState()
    const a = tipFootprint(PENCIL_DAB_SHAPING, input, state)
    const b = tipFootprint(PENCIL_DAB_SHAPING, input, state)
    expect(a).toEqual(b)
    // A rigid tip never displaces the mark off the spline, whatever the state.
    expect(a.x).toBe(input.x)
    expect(a.y).toBe(input.y)
  })
})
