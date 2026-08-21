// #478 — a hard pencil on a large brush drew a chain of separate ellipses.
//
// Dab spacing was `baseSize * 0.22` off the *nominal* brush size, while the
// mark a dab leaves is `Dab.size * preset.sizeMultiplier` wide — and for 6H
// that multiplier is 0.5, so the step came out at ~0.58 of the dab's own short
// diameter and consecutive dabs stopped overlapping. Soft grades were fine at
// the same step because their dabs are both bigger and softer-edged.
//
// Two claims to hold, and they pull against each other, which is why they are
// tested together: the mark must have no gaps in it, and it must not get any
// darker in the process (2.65x the dabs at unchanged per-dab opacity would
// have made every hard grade 2.65x heavier). See src/dabSpacing.ts.
//
// Driven through the real pointer pipeline rather than by appending dabs, so
// these run through DabSystem's own spacing and _bakeDabOpacity's real
// branches. Geometry only — nothing here reads pixels, which MockGL could not
// answer anyway (see the project's own note on that).
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import type { Dab, StrokeOperation, ToolType } from '@grafetto/shared'

import { PENCIL_PRESETS, type PencilEngine } from './index'
import { pencilTiltDensity, pencilTiltness } from './src/pencilTilt'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke } from './testing/engineTestUtils'

const BRUSH_PX = 60
const PATH = [10, 30, 50, 70, 90, 110, 130, 150].map(x => ({ x, y: 40 }))

async function strokeWith(
  tool: ToolType, preset: string, { pressure = 0.5, tiltX = 0 } = {},
): Promise<Dab[]> {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width: 200, height: 200 })
  await paperReady(engine)
  engine.appendOperation(makeLayerAdd('user-a', 'L1'))
  engine.setActiveLayer('L1')
  engine.setCompositeOrder([{ id: 'L1', opacity: 1 }])
  engine.setTool(tool)
  engine.setPencil(preset)
  engine.setSize(BRUSH_PX)
  simulateStroke(engine, PATH, { pressure, tiltX, tiltY: 0 })
  return strokeDabs(lastStroke(engine))
}

function lastStroke(engine: PencilEngine): StrokeOperation {
  const ops = engine.getOperations()
  const op = ops[ops.length - 1]
  if (op.type !== 'stroke') throw new Error(`expected a stroke op, got ${op.type}`)
  return op
}

/** Largest gap between consecutive dabs, as a fraction of the short diameter
 *  of the mark at that point. Above ~0.3 the stroke starts reading as separate
 *  stamps rather than a line; at 1.0 the dabs are literally not touching. */
function worstGapPerDiameter(dabs: Dab[], sizeMultiplier: number): number {
  let worst = 0
  for (let i = 1; i < dabs.length; i++) {
    const gap = Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y)
    const diameter = dabs[i].size * sizeMultiplier
    worst = Math.max(worst, gap / diameter)
  }
  return worst
}

const totalDeposit = (dabs: Dab[]) => dabs.reduce((s, d) => s + d.opacity, 0)

describe('graphite dab spacing follows the mark, not the brush size (#478)', () => {
  it('keeps every grade\'s dabs overlapping, hardest included', async () => {
    for (const grade of ['6H', '4H', '2H', 'HB', '2B', '6B'] as const) {
      const dabs = await strokeWith('pencil', grade)
      expect(dabs.length).toBeGreaterThan(5)
      // 0.3 rather than the rule's own 0.22: the stroke's first gap and the
      // arc-length table's sampling both land slightly off the exact step.
      expect(worstGapPerDiameter(dabs, PENCIL_PRESETS[grade].sizeMultiplier)).toBeLessThan(0.3)
    }
  })

  it('is what actually changed: 6H\'s step used to be over half its own diameter', async () => {
    // The pre-#478 rule in one line, evaluated against the geometry the engine
    // now records — so this stays an honest statement of the defect rather
    // than a remembered number, and moves if the presets do.
    const dabs = await strokeWith('pencil', '6H')
    const nominalStep = BRUSH_PX * 0.22
    const diameter = dabs[3].size * PENCIL_PRESETS['6H'].sizeMultiplier
    expect(nominalStep / diameter).toBeGreaterThan(0.5)
  })

  it('a harder grade lays down more dabs, in inverse proportion to its own width', async () => {
    const hard = await strokeWith('pencil', '6H')
    const soft = await strokeWith('pencil', '2B')
    expect(hard.length).toBeGreaterThan(soft.length * 2)
  })

  it('does not darken any grade: tone still scales with preset opacity alone', async () => {
    // The invariant the deposit compensation exists to hold. Over one fixed
    // path at one fixed pressure and tilt, every term in a graphite dab's
    // opacity except the preset's own is identical across grades, so the
    // stroke's total deposit divided by preset.opacity has to come out the
    // same number for all of them — which is only true if the extra dabs a
    // hard grade now emits are each proportionally lighter.
    //
    // Without the compensation 6H would come out ~2.6x this figure: it emits
    // 2.6x the dabs, and nothing else would have changed.
    const perOpacity = [] as number[]
    for (const grade of ['6H', '4H', '2H', 'HB', '2B', '6B'] as const) {
      const dabs = await strokeWith('pencil', grade)
      perOpacity.push(totalDeposit(dabs) / PENCIL_PRESETS[grade].opacity)
    }
    const ref = perOpacity[perOpacity.length - 1]
    for (const v of perOpacity) {
      // 6%: the grades' dabs don't land on the same points, so each stroke's
      // own head and tail partials differ. The failure this guards against is
      // a factor of two, not a few percent.
      expect(Math.abs(v / ref - 1)).toBeLessThan(0.06)
    }
  })

  it('holds the same tone when tilt widens the mark instead of a grade', async () => {
    // Same argument one axis over: leaning the pencil widens the dab
    // (PENCIL_TILT.widthMax), which loosens the step, which has to be paid
    // back per dab. Graphite does deposit lighter when leaned
    // (PENCIL_TILT.lightening) and that term is real, so this compares against
    // it rather than against the upright stroke outright.
    const upright = await strokeWith('pencil', '2H', { tiltX: 0 })
    const leaned = await strokeWith('pencil', '2H', { tiltX: 45 })
    // Read back off the dab's own baked aspect, the same way _bakeDabOpacity
    // derives the term in the first place — so this asserts "the tilt term and
    // nothing else", not a remembered constant.
    const lightening = pencilTiltDensity(pencilTiltness(leaned.at(-1)!.aspectRatio))
    expect(leaned.length).toBeLessThan(upright.length)
    expect(totalDeposit(leaned) / totalDeposit(upright)).toBeCloseTo(lightening, 2)
  })

  it('leaves a ribbon tool\'s spacing alone', async () => {
    // The marker's silhouette is a swept band between samples, not a union of
    // stamps, and its deposit is already normalized by the distance each dab
    // covers — both halves of this change would be answering a question it
    // does not ask. Its step is still the flat nominal one.
    const dabs = await strokeWith('marker', 'bullet:0.5')
    const gaps = dabs.slice(1, -1).map((d, i) => d.x - dabs[i].x)
    for (const g of gaps) expect(g).toBeCloseTo(BRUSH_PX * 0.22, 1)
  })
})
