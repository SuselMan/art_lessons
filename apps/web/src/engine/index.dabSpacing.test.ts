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
import { footprintSpacingStrength } from './src/dabSpacing'
import { pencilTiltDensity, pencilTiltness } from './src/pencilTilt'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke } from './testing/engineTestUtils'

const BRUSH_PX = 60
const PATH = [10, 30, 50, 70, 90, 110, 130, 150].map(x => ({ x, y: 40 }))

async function strokeWith(
  tool: ToolType, preset: string, { pressure = 0.5, tiltX = 0, sizePx = BRUSH_PX } = {},
): Promise<Dab[]> {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width: 200, height: 200 })
  await paperReady(engine)
  engine.appendOperation(makeLayerAdd('user-a', 'L1'))
  engine.setActiveLayer('L1')
  engine.setCompositeOrder([{ id: 'L1', opacity: 1 }])
  engine.setTool(tool)
  engine.setPencil(preset)
  engine.setSize(sizePx)
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
  it('closes the gap on the grades whose edge is hard enough to show one', async () => {
    // 2H and harder run the rule at full strength — see
    // FOOTPRINT_SPACING_HARD_HARDNESS. 0.3 rather than the rule's own 0.22
    // because the stroke's first gap and the arc-length table's own sampling
    // both land slightly off the exact step.
    for (const grade of ['6H', '4H', '2H'] as const) {
      expect(footprintSpacingStrength(PENCIL_PRESETS[grade].hardness)).toBe(1)
      const dabs = await strokeWith('pencil', grade)
      expect(dabs.length).toBeGreaterThan(5)
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

  it('leaves a soft grade exactly where it was — same step at every pressure', async () => {
    // #483, and the whole point of gating on hardness. HB and softer never had
    // visible scalloping (7% ripple, which is the paper's own grain), so every
    // dab the pre-#478 rule placed must still land in the same spot. Re-spacing
    // them changed the pitch of the stroke's own structure and read as a
    // flatter, harder mark — the regression this keeps out.
    for (const grade of ['HB', '2B', '6B'] as const) {
      expect(footprintSpacingStrength(PENCIL_PRESETS[grade].hardness)).toBe(0)
      for (const pressure of [0.15, 0.5, 1]) {
        const dabs = await strokeWith('pencil', grade, { pressure })
        const gaps = dabs.slice(1, -1).map((d, i) => d.x - dabs[i].x)
        // The pre-#478 rule in one line: a flat fraction of the nominal brush
        // size, the same for every dab whatever its own mark measures. To 4
        // places rather than exactly: positions come back through the packed
        // dab codec, which stores them as float32.
        for (const g of gaps) expect(g).toBeCloseTo(BRUSH_PX * 0.22, 4)
      }
    }
  })

  it('holds the mark\'s scalloped edge under a pixel however large the brush', async () => {
    // #485 — the bound that actually closed #478's own bug report, and the one
    // every measurement here missed for a day. A step fixed as a fraction of
    // the dab is scale-free; what a hand sees is not. At 0.22 of its own
    // diameter a 6H dab still leaves a 3.9px scalloped edge at brush 160 and a
    // 14.5px one at brush 600 — and 14px of scallop on a hard edge is a
    // visible row of ellipses, which is what kept being reported after #478
    // shipped.
    for (const px of [60, 160, 600]) {
      const dabs = await strokeWith('pencil', '6H', { pressure: 1, tiltX: 45, sizePx: px })
      expect(dabs.length).toBeGreaterThan(4)
      const d = dabs[dabs.length >> 1]
      const r = d.size * 0.5 * PENCIL_PRESETS['6H'].sizeMultiplier
      for (const g of dabs.slice(1, -1).map((q, i) => Math.hypot(q.x - dabs[i].x, q.y - dabs[i].y))) {
        // The sagitta this bound is derived from — see scallopSpacingLimit.
        expect((d.aspectRatio * g * g) / (8 * r)).toBeLessThan(1.05)
      }
    }
  })

  it('fades the rule in across the middle of the ladder rather than stepping', async () => {
    // H sits between the two thresholds, so it gets part of the tightening —
    // a cliff there would put a visible seam between two adjacent grades.
    const strengths = (['F', 'H', '2H'] as const).map(g => footprintSpacingStrength(PENCIL_PRESETS[g].hardness))
    expect(strengths[0]).toBe(0)
    expect(strengths[1]).toBeGreaterThan(0)
    expect(strengths[1]).toBeLessThan(1)
    expect(strengths[2]).toBe(1)
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
    // 4% rather than exact: the compensation is per dab and exact, but the sum
    // over a fixed path carries the head and tail partials, and those are a
    // bigger fraction of a short stroke once #485's scallop cap has multiplied
    // the dab count. Nothing here would survive a missing compensation, which
    // is a factor of three.
    expect(Math.abs(totalDeposit(leaned) / totalDeposit(upright) / lightening - 1)).toBeLessThan(0.04)
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
