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
async function lastDabAt(tool: ToolType, tiltX: number, tiltY: number, path = PATH_A) {
  const engine = await setupLayer()
  engine.setTool(tool)
  simulateStroke(engine, path, { pressure: 0.7, tiltX, tiltY })
  return strokeDabs(lastStroke(engine)).at(-1)!
}

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
    const upright = await lastDabAt('eraser', 0, 0)
    const leaned = await lastDabAt('eraser', PENCIL_TILT.fullDeg, 0, PATH_B)
    expect(leaned.opacity).toBeCloseTo(upright.opacity, 5)
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
