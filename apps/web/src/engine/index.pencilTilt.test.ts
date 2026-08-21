// Engine-level integration tests for graphite's tilt response (#389) and the
// corrected tilt magnitude it is calibrated against (#388). Drives the real
// pointer pipeline rather than appending pre-built dabs, so these exercise what
// a live stroke uses: DabSystem's filtered tilt, PENCIL_DAB_SHAPING, and
// _bakeDabOpacity's graphite branch — same basis as index.charcoal.test.ts.
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import type { StrokeOperation, ToolType } from '@grafetto/shared'

import type { PencilEngine } from './index'
import { PENCIL_TILT } from './src/pencilTilt'
import { TILT_RESPONSES, type TiltResponse } from './src/tiltCurve'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke } from './testing/engineTestUtils'

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

const PATH_A = [10, 35, 60, 85, 110, 135].map(x => ({ x, y: 20 }))
const PATH_B = [10, 35, 60, 85, 110, 135].map(x => ({ x, y: 60 }))

/** Last dab of a stroke drawn at this grip — last, not first, so the tilt
 *  low-pass (#389 gave graphite one) has settled onto the held tilt instead of
 *  still being seeded from the stroke's opening sample. */
async function lastDabAt(
  tool: ToolType, tiltX: number, tiltY: number, path = PATH_A, tiltResponse?: TiltResponse,
) {
  return (await dabsAt(tool, tiltX, tiltY, path, tiltResponse)).at(-1)!
}

/** Every dab of one stroke at this grip. Needed wherever the claim is about
 *  the mark as a whole rather than about one dab — since #478 dab spacing
 *  tracks each dab's own footprint, so "how much this tool lays down" is a
 *  property of the deposit *and* of how densely the dabs sit, and only their
 *  sum over a fixed path still states it. */
async function dabsAt(
  tool: ToolType, tiltX: number, tiltY: number, path = PATH_A, tiltResponse?: TiltResponse,
) {
  const engine = await setupLayer()
  engine.setTool(tool)
  if (tiltResponse) engine.setTiltResponse(tiltResponse)
  simulateStroke(engine, path, { pressure: 0.7, tiltX, tiltY })
  return strokeDabs(lastStroke(engine))
}

const totalDeposit = (dabs: { opacity: number }[]) => dabs.reduce((s, d) => s + d.opacity, 0)

describe('graphite tilt response (#389)', () => {
  it('draws a round dab when the pen is upright', async () => {
    const d = await lastDabAt('pencil', 0, 0)
    expect(d.aspectRatio).toBeCloseTo(1, 2)
  })

  it('elongates substantially at an ordinary working grip — the complaint that opened the issue', async () => {
    // 45 degrees along one axis: the old model gave 1.75 here, near enough to a
    // circle that tilt read as doing nothing.
    const d = await lastDabAt('pencil', 45, 0)
    expect(d.aspectRatio).toBeGreaterThan(3)
  })

  it('reaches its full elongation at a tilt a hand can hold, not only at 90 degrees', async () => {
    const full = await lastDabAt('pencil', PENCIL_TILT.fullDeg, 0)
    expect(full.aspectRatio).toBeCloseTo(PENCIL_TILT.aspectMax, 1)
  })

  it('widens the dab as well as lengthening it', async () => {
    const upright = await lastDabAt('pencil', 0, 0)
    const leaned = await lastDabAt('pencil', PENCIL_TILT.fullDeg, 0, PATH_B)
    // `size` is the dab's short axis; the old model left it untouched by tilt,
    // so a leaned pencil drew a longer mark of exactly the same width.
    expect(leaned.size).toBeGreaterThan(upright.size)
    expect(leaned.size / upright.size).toBeCloseTo(PENCIL_TILT.widthMax, 1)
  })

  it('deposits lighter when leaned over', async () => {
    const upright = await lastDabAt('pencil', 0, 0)
    const leaned = await lastDabAt('pencil', PENCIL_TILT.fullDeg, 0, PATH_B)
    expect(leaned.opacity).toBeLessThan(upright.opacity)
  })

  it('gives eraser and smudge the same geometry as the pencil', async () => {
    const tilt = 45
    const pencil = await lastDabAt('pencil', tilt, 0)
    const eraser = await lastDabAt('eraser', tilt, 0, PATH_B)
    const smudge = await lastDabAt('smudge', tilt, 0, PATH_B)
    for (const d of [eraser, smudge]) {
      expect(d.aspectRatio).toBeCloseTo(pencil.aspectRatio, 5)
      expect(d.size).toBeCloseTo(pencil.size, 5)
    }
  })

  it('does not apply graphite\'s tilt lightening to the eraser', async () => {
    // Erasing less the more you lean is a change to what the eraser does, not a
    // consequence of spreading graphite — see _bakeDabOpacity's own comment.
    //
    // Stated over the whole stroke rather than on one dab, and #478 is what
    // forced that: per-dab opacity now also carries how densely this dab's own
    // footprint got sampled (dabSpacing.ts's dabDepositScale), so a leaned
    // eraser — whose dabs are wider, and therefore further apart — legitimately
    // carries *more* per dab while removing exactly as much graphite per
    // millimetre travelled. The sum over a fixed path is that invariant, and it
    // is also the thing the tool's user would notice; the old per-dab equality
    // was only ever a proxy for it that happened to hold while spacing was
    // constant. A tilt-lightening term would still fail this outright: it would
    // take 35% off every dab of the leaned stroke.
    const upright = await dabsAt('eraser', 0, 0)
    const leaned = await dabsAt('eraser', PENCIL_TILT.fullDeg, 0, PATH_B)
    // Relative, and 2%: the two strokes' dabs don't land on the same points,
    // so the head, the tail and the tilt filter's own ramp-in don't cancel
    // exactly (measured 1.3%). An absolute tolerance would be reading a
    // difference in stroke *length* as a difference in erase strength.
    expect(Math.abs(totalDeposit(leaned) / totalDeposit(upright) - 1)).toBeLessThan(0.02)
  })
})

describe('the tilt response is a setting, end to end (#409)', () => {
  const WORKING_GRIP = 40

  it('bakes a different shape into the recorded dab for each response', async () => {
    // The whole feature, at the only level that proves it: setTiltResponse ->
    // shapingForTool -> the aspectRatio that ends up inside the Operation.
    const shapes = await Promise.all(TILT_RESPONSES.map((response, i) =>
      lastDabAt('pencil', WORKING_GRIP, 0, i % 2 ? PATH_B : PATH_A, response)))
    const [restrained, smooth, linear] = shapes.map(d => d.aspectRatio)
    expect(restrained).toBeLessThan(smooth)
    expect(smooth).toBeLessThan(linear)
  })

  it('restrained brings back what the pencil drew before #389 replaced it', async () => {
    // The complaint that opened the issue: at an ordinary working grip the old
    // curve stayed close to round. It should still, or the setting does not
    // give Ilya back the pencil he asked for.
    const d = await lastDabAt('pencil', WORKING_GRIP, 0, PATH_A, 'restrained')
    const t = Math.pow(WORKING_GRIP / 90, 3)
    expect(d.aspectRatio).toBeCloseTo(1 + t * (PENCIL_TILT.aspectMax - 1), 1)
  })

  it('arrives at the material\'s own ceiling under every response, and never past it', async () => {
    // Only the ramp is chosen here; where it arrives stays the material's. A
    // response that quietly capped the pencil short of aspectMax would be a
    // different tool, not a different feel.
    //
    // Checked at the very end of the range rather than at fullDeg, because
    // 'restrained' reaches its ceiling only at 90° by construction — that late
    // arrival is the thing it *is*, pinned exactly in tiltCurve.test.ts. The
    // band here is what survives the tilt low-pass still catching up on the
    // last dab of the stroke.
    for (const response of TILT_RESPONSES) {
      const d = await lastDabAt('pencil', 90, 0, PATH_B, response)
      expect(d.aspectRatio).toBeLessThanOrEqual(PENCIL_TILT.aspectMax + 1e-6)
      expect(d.aspectRatio).toBeGreaterThan(PENCIL_TILT.aspectMax * 0.95)
    }
  })

  it('follows the pencil onto the eraser and the smudge tool', async () => {
    // They share graphite's geometry (PENCIL_DAB_SHAPING), so they must share
    // the response too — otherwise the eraser would answer tilt on a curve the
    // user never picked for it.
    for (const tool of ['eraser', 'smudge'] as const) {
      const restrained = await lastDabAt(tool, WORKING_GRIP, 0, PATH_A, 'restrained')
      const linear = await lastDabAt(tool, WORKING_GRIP, 0, PATH_B, 'linear')
      expect(restrained.aspectRatio).toBeLessThan(linear.aspectRatio)
    }
  })

  it('leaves the liner alone, whose shape never read the tilt curve', async () => {
    const restrained = await lastDabAt('liner', WORKING_GRIP, 0, PATH_A, 'restrained')
    const linear = await lastDabAt('liner', WORKING_GRIP, 0, PATH_B, 'linear')
    expect(restrained.aspectRatio).toBeCloseTo(linear.aspectRatio, 9)
  })

  it('changes nothing about an already-recorded stroke', async () => {
    // Geometry is baked at record time and serialized per dab, which is what
    // keeps this setting off the wire entirely — a peer replays the shape that
    // was drawn, and so does this user's own undo.
    const engine = await setupLayer()
    engine.setTool('pencil')
    engine.setTiltResponse('linear')
    simulateStroke(engine, PATH_A, { pressure: 0.7, tiltX: WORKING_GRIP, tiltY: 0 })
    const drawn = strokeDabs(lastStroke(engine)).at(-1)!.aspectRatio

    engine.setTiltResponse('restrained')
    expect(strokeDabs(lastStroke(engine)).at(-1)!.aspectRatio).toBe(drawn)
  })
})

describe('tilt magnitude is independent of grip azimuth (#388)', () => {
  it('draws the same dab shape for the same lean held at different azimuths', async () => {
    // Both grips are a true 45-degree lean; they differ only in which way the
    // hand is turned. A 45-degree lean at a 45-degree azimuth projects to
    // atan(tan 45 * cos 45) = 35.2644 on each axis — which the old hypot
    // formula read as 49.9, so the same lean drew a visibly different mark
    // depending on how the hand sat.
    const alongAxis = await lastDabAt('pencil', 45, 0)
    const diagonal = await lastDabAt('pencil', 35.264389682754654, 35.264389682754654, PATH_B)
    expect(diagonal.aspectRatio).toBeCloseTo(alongAxis.aspectRatio, 3)
    expect(diagonal.size).toBeCloseTo(alongAxis.size, 3)
  })

  it('keeps the dab within the configured maximum at extreme tilt', async () => {
    // hypot(80, 80) was 113 degrees — an impossible lean, and it pushed the old
    // pencil curve to aspect 13 against a stated ceiling of 7.
    const d = await lastDabAt('pencil', 80, 80)
    expect(d.aspectRatio).toBeLessThanOrEqual(PENCIL_TILT.aspectMax + 1e-6)
  })
})
