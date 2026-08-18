// Unit tests for watercolor's pure functions (#468, ADR 011 §5).
//
// Everything here is plain arithmetic on numbers — no GL, so unlike the
// engine-level file these assertions mean exactly what they say. What is
// deliberately *not* tested here is anything about how a wash looks: the
// wet edge, granulation and the glaze composite all live in DAB_FRAG's
// u_inkMode=9 branch, which MockGL never rasterizes (see mockGL.ts and
// index.watercolor.test.ts's own header). Those need a real browser.
import { describe, expect, it } from 'vitest'

import type { Dab } from '@grafetto/shared'

import {
  WATERCOLOR_PRESET, watercolorWidth, watercolorResponseFromPreset,
  shapingForWatercolorPreset, applyWatercolorHeadTaper, applyWatercolorEndTaper,
  DEFAULT_WATERCOLOR_RESPONSE, watercolorWaterLoad, watercolorWaterStep,
  watercolorPigmentLoad, watercolorWaterEffects, watercolorPigmentEffects,
  watercolorPresetString, watercolorMixFromPreset, WATERCOLOR_MIX_BY_PRESET,
  WATERCOLOR_MIX_DEFAULT, applyWatercolorPooling, watercolorPigmentFromPreset,
} from './watercolorPresets'
import { watercolorPigmentByCode, WATERCOLOR_PIGMENTS, DEFAULT_WATERCOLOR_PIGMENT } from './watercolorPigments'
import { brushPenWidth } from './brushPenPresets'
import { ribbonProfileFor } from './ribbonProfile'

function dabAt(x: number, y: number, size = 30): Dab {
  return { x, y, pressure: 0.5, tiltX: 0, tiltY: 0, size, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
}

describe('watercolor preset (#468, ADR 011 §5)', () => {
  it('is transparent, not covering — the whole material in one number', () => {
    // The brush pen sits at 0.97 because ink covers. If this ever creeps up
    // near that, the tool has stopped being watercolor and the wet-edge and
    // glaze terms downstream stop being visible at all.
    //
    // The window is wider since v4: this is the *ceiling* a fully-resolved pass
    // reaches, and pigment now moves the saturation curve underneath it rather
    // than pinning it at the top, so the value a mark actually lands on is well
    // below this number.
    //
    // Wider again since v11, which lengthened the saturation curve so a wash
    // sits below its end instead of pinned at it, and raised this to put the
    // tone back where it was. The pass a mark lands on is now about 0.83 of
    // this, so the effective ceiling moved not at all.
    expect(WATERCOLOR_PRESET.opacity).toBeLessThan(0.85)
    expect(WATERCOLOR_PRESET.opacity).toBeGreaterThan(0.3)
  })
})

describe('watercolor pressure → width', () => {
  it('never goes below its own width floor, however light the touch', () => {
    // A loaded round brush keeps a belly in contact with the paper; it cannot
    // be coaxed to a hairline the way a stiff nib can.
    expect(watercolorWidth(0, 'normal')).toBeCloseTo(0.32, 5)
    expect(watercolorWidth(0, 'soft')).toBeCloseTo(0.32, 5)
    expect(watercolorWidth(0, 'firm')).toBeCloseTo(0.32, 5)
  })

  it('reaches full nominal width at full pressure', () => {
    for (const r of ['soft', 'normal', 'firm'] as const) {
      expect(watercolorWidth(1, r)).toBeCloseTo(1, 5)
    }
  })

  it('is monotone in pressure', () => {
    for (const r of ['soft', 'normal', 'firm'] as const) {
      let prev = -Infinity
      for (let i = 0; i <= 40; i++) {
        const w = watercolorWidth(i / 40, r)
        expect(w).toBeGreaterThanOrEqual(prev)
        prev = w
      }
    }
  })

  it('starts wider than the brush pen at every pressure below full', () => {
    // The two share a curve and differ only in floor (0.32 against 0.15), which
    // is the one thing that makes a brush a brush rather than a nib. If a
    // refactor ever collapses the two, this is what catches it.
    for (let i = 0; i < 40; i++) {
      const p = i / 40
      expect(watercolorWidth(p, 'normal')).toBeGreaterThan(brushPenWidth(p, 'normal'))
    }
  })

  it('opens up earlier on soft than on firm through the middle of the range', () => {
    expect(watercolorWidth(0.35, 'soft')).toBeGreaterThan(watercolorWidth(0.35, 'firm'))
  })
})

describe('watercolor preset slot carries the pressure response', () => {
  it('round-trips a valid response', () => {
    expect(watercolorResponseFromPreset('firm')).toBe('firm')
    expect(watercolorResponseFromPreset('soft')).toBe('soft')
  })

  it('falls back to the default for a missing or unrecognized token', () => {
    // Same defensive default markerNibFromPreset takes: an operation recorded
    // by an older or misbehaving client must still replay, not throw.
    expect(watercolorResponseFromPreset(undefined)).toBe(DEFAULT_WATERCOLOR_RESPONSE)
    expect(watercolorResponseFromPreset('2B')).toBe(DEFAULT_WATERCOLOR_RESPONSE)
    expect(watercolorResponseFromPreset('')).toBe(DEFAULT_WATERCOLOR_RESPONSE)
  })
})

describe('watercolor dab shaping', () => {
  it('smooths pressure harder than the brush pen does', () => {
    // A wet brush is heavy and its own load damps tremor before the paper sees
    // it. 0.35 is the brush pen's value; anything at or below it here means the
    // profile was copied rather than considered.
    expect(shapingForWatercolorPreset('normal').pressureSmoothing).toBeGreaterThan(0.35)
  })

  it('broadens with tilt but never enough to compete with pressure', () => {
    const { aspect, size } = shapingForWatercolorPreset('normal')
    expect(aspect(0)).toBeCloseTo(1, 5)
    const fullTilt = aspect(1)
    expect(fullTilt).toBeGreaterThan(1)
    // The whole tilt range must move the footprint less than pressure does, or
    // the tool turns into a charcoal stick. Pressure spans 0.32 → 1.0, i.e. a
    // factor of ~3.1; tilt must stay well under that. (size takes tiltNorm as
    // its second argument since #305; this profile ignores it.)
    expect(fullTilt).toBeLessThan(size(1, 0) / size(0, 0))
  })
})

describe('watercolor tapers', () => {
  it('lands rather than arrives at a point', () => {
    // The brush pen's head starts at 0.35 of full width. A loaded brush puts
    // its belly down more or less at once, so this must be far shallower.
    const dabs = [dabAt(0, 0), dabAt(1, 0), dabAt(2, 0)]
    applyWatercolorHeadTaper(dabs, undefined, 0)
    expect(dabs[0].size / 30).toBeGreaterThan(0.6)
  })

  it('does not restart the head taper at a batch boundary', () => {
    // A stroke arrives in batches whose boundaries are an artefact of pointer
    // event timing. `arcLenBefore` is what keeps the taper from re-narrowing
    // the stroke every time the browser happens to deliver a new event.
    const first = [dabAt(0, 0), dabAt(3, 0)]
    const arc = applyWatercolorHeadTaper(first, undefined, 0)
    expect(arc).toBeCloseTo(3, 5)

    const second = [dabAt(20, 0), dabAt(40, 0)]
    applyWatercolorHeadTaper(second, first[first.length - 1], arc)
    // Both are well past the taper length, so neither may be touched.
    expect(second[0].size).toBeCloseTo(30, 5)
    expect(second[1].size).toBeCloseTo(30, 5)
  })

  it('leaves a stroke that ends slowly almost untouched', () => {
    const dabs = [dabAt(0, 0), dabAt(2, 0), dabAt(4, 0)]
    applyWatercolorEndTaper(dabs, 0)
    expect(dabs[dabs.length - 1].size / 30).toBeGreaterThan(0.85)
  })

  it('narrows a fast flick more than a slow lift, but never to a point', () => {
    const slow = [dabAt(0, 0), dabAt(6, 0), dabAt(12, 0)]
    const fast = [dabAt(0, 0), dabAt(6, 0), dabAt(12, 0)]
    applyWatercolorEndTaper(slow, 0.2)
    applyWatercolorEndTaper(fast, 4)
    const slowTip = slow[slow.length - 1].size
    const fastTip = fast[fast.length - 1].size
    expect(fastTip).toBeLessThan(slowTip)
    // ADR 011 §5: a wet brush drags a damp streak, it does not end in a
    // calligraphic point the way the brush pen's 0.75 depth does.
    expect(fastTip / 30).toBeGreaterThan(0.5)
  })

  it('is a no-op on an empty batch', () => {
    expect(() => applyWatercolorEndTaper([], 2)).not.toThrow()
    expect(applyWatercolorHeadTaper([], undefined, 7)).toBe(7)
  })
})

describe('water load (#468 v3, ADR 011 §3.8)', () => {
  it('starts full', () => {
    expect(watercolorWaterLoad(0)).toBeCloseTo(1, 6)
  })

  it('only ever decreases', () => {
    let prev = Infinity
    for (let u = 0; u <= 120; u += 1) {
      const w = watercolorWaterLoad(u)
      expect(w).toBeLessThanOrEqual(prev)
      prev = w
    }
  })

  it('bottoms out rather than reaching zero', () => {
    // A brush dragged a long way is drier, not empty — it keeps laying a thin
    // broken wash until it is lifted. A zero here would make long strokes
    // simply stop painting, which is a bug, not dry brush.
    expect(watercolorWaterLoad(1e4)).toBeGreaterThan(0.2)
    expect(watercolorWaterLoad(1e4)).toBeLessThan(0.45)
  })

  it('leaves an ordinary stroke almost undepleted and a long sweep plainly dry', () => {
    // Deliberately loose — this pins the *shape*, not today's exact numbers.
    // A short mark that has already lost a third of its water reads as a
    // failing brush rather than as watercolor; a 40-radius sweep that keeps
    // nearly everything defeats the whole term.
    expect(watercolorWaterLoad(8)).toBeGreaterThan(0.70)
    expect(watercolorWaterLoad(40)).toBeLessThan(0.55)
  })

  it('measures travel in brush radii, not pixels', () => {
    // The point of the whole normalization: a 12px brush and a 120px brush must
    // deplete over proportionally different distances from the same constants.
    expect(watercolorWaterStep(10, 20)).toBeCloseTo(watercolorWaterStep(20, 40), 9)
    expect(watercolorWaterStep(45, 45)).toBeCloseTo(1, 9)
  })

  it('does not divide by zero for a degenerate radius', () => {
    expect(Number.isFinite(watercolorWaterStep(5, 0))).toBe(true)
  })
})

describe('water and pigment as two quantities (#468 v4, ADR 011 §4)', () => {
  it('runs water down faster than pigment', () => {
    // The whole reason for two curves rather than one. Water soaks away and
    // evaporates; pigment stays on the hairs. That gap is what walks a single
    // long stroke from a wet saturated start to a dry but still strongly
    // coloured end — which is a behaviour, not an effect, and is very far from
    // what a marker does.
    for (const u of [5, 10, 20, 40, 80]) {
      expect(watercolorWaterLoad(u)).toBeLessThan(watercolorPigmentLoad(u))
    }
  })

  it('leaves a long stroke drier than it is pale', () => {
    // Concretely: by 40 radii the brush should have lost most of its water and
    // only a little of its paint. If these ever converge, the tool is back to
    // one quantity and the dry-brush tail stops existing.
    const water = watercolorWaterLoad(40)
    const pigment = watercolorPigmentLoad(40)
    expect(pigment - water).toBeGreaterThan(0.2)
  })

  it('lets water govern geometry and pigment govern paint, never the reverse', () => {
    // The one rule that keeps this from collapsing back into an opacity brush.
    const dry = watercolorWaterEffects(0.1)
    const wet = watercolorWaterEffects(0.95)
    expect(wet.spreadOfRadius).toBeGreaterThan(dry.spreadOfRadius * 2)
    expect(wet.edgeSoft).toBeGreaterThan(dry.edgeSoft * 2)
    // §8 — and a dry mark's boundary must stay close to where the brush put it,
    // which is what makes a hard edge a technique rather than a lottery.
    expect(dry.edgeWander).toBeLessThan(0.15)
    expect(wet.edgeWander).toBeGreaterThan(dry.edgeWander * 3)
    expect(wet.cloud).toBeGreaterThan(dry.cloud)
    // Dry brush is *only* reachable at low water, and must switch off entirely
    // once the brush is properly loaded.
    expect(dry.dryContact).toBeGreaterThan(0.5)
    expect(wet.dryContact).toBe(0)
    // A dry mark's tideline gate sits high (rare); a wet one's sits low (common).
    expect(dry.tideLo).toBeGreaterThan(wet.tideLo)

    const pale = watercolorPigmentEffects(0.1)
    const deep = watercolorPigmentEffects(0.95)
    // Deposit is deliberately *not* pigment's number since v9: it stays high so
    // an ordinary pass saturates and a flat wash's tone stops caring how the
    // deposit wobbles. Pigment reaches the pixel through `strength` alone —
    // one quantity, one route, which is the rule v4 established and v9 restored
    // after the deposit had quietly picked the dependency back up.
    expect(deep.depositPerRadius).toBe(pale.depositPerRadius)
    expect(deep.strength).toBeGreaterThan(pale.strength * 3)
    expect(deep.granulation).toBeGreaterThan(pale.granulation)
    expect(deep.wetEdge).toBeGreaterThan(pale.wetEdge)
    // Never zero: a stroke the user asked for has to leave something.
    expect(watercolorPigmentEffects(0).strength).toBeGreaterThan(0)
  })

  it('gives the three named mixes genuinely different characters', () => {
    const { dry, damp, wet } = WATERCOLOR_MIX_BY_PRESET
    // Dry brush is the corner one slider could never reach: little water *and*
    // much pigment at the same time.
    expect(dry.water).toBeLessThan(0.3)
    expect(dry.pigment).toBeGreaterThan(0.8)
    // Wet is the opposite corner, not simply "more of the same".
    expect(wet.water).toBeGreaterThan(0.85)
    expect(wet.pigment).toBeLessThan(dry.pigment)
    expect(damp.water).toBeGreaterThan(dry.water)
    expect(damp.water).toBeLessThan(wet.water)
  })
})

describe('the mix rides the preset string (#468 v4)', () => {
  it('round-trips through the operation slot', () => {
    const s = watercolorPresetString('firm', { water: 0.34, pigment: 0.78 })
    expect(watercolorResponseFromPreset(s)).toBe('firm')
    const back = watercolorMixFromPreset(s)
    expect(back.water).toBeCloseTo(0.34, 2)
    expect(back.pigment).toBeCloseTo(0.78, 2)
  })

  it('still reads a stroke recorded before the mix existed', () => {
    // The Operation Log is permanent: every watercolor stroke drawn under v1-v3
    // carries a bare response token and must keep replaying.
    expect(watercolorResponseFromPreset('normal')).toBe('normal')
    expect(watercolorMixFromPreset('normal')).toEqual(WATERCOLOR_MIX_DEFAULT)
    expect(watercolorMixFromPreset(undefined)).toEqual(WATERCOLOR_MIX_DEFAULT)
  })

  it('falls back rather than throwing on a malformed string', () => {
    expect(watercolorMixFromPreset('normal:abc:12')).toEqual(WATERCOLOR_MIX_DEFAULT)
    expect(watercolorMixFromPreset(':::')).toEqual(WATERCOLOR_MIX_DEFAULT)
  })

  it('clamps out-of-range levels instead of trusting them', () => {
    const wild = watercolorMixFromPreset('normal:400:-70')
    expect(wild.water).toBe(1)
    expect(wild.pigment).toBe(0)
  })
})

describe('pooling at the end of a wet stroke (#468 v4, ADR 011 §4.3)', () => {
  const tail = (): Dab[] => [dabAt(0, 0), dabAt(10, 0), dabAt(20, 0)]

  it('leaves a puddle when a wet brush is lifted slowly', () => {
    const dabs = tail()
    applyWatercolorPooling(dabs, 0, 0.95)
    expect(dabs.length).toBeGreaterThan(3)
    // The repeats sit exactly where the brush stopped — a puddle is more paint
    // in one place, not a wider mark.
    const last = dabs[dabs.length - 1]
    expect(last.x).toBe(20)
    expect(last.y).toBe(0)
  })

  it('leaves none on a quick flick, however wet', () => {
    const dabs = tail()
    applyWatercolorPooling(dabs, 4, 0.95)
    expect(dabs).toHaveLength(3)
  })

  it('leaves none from a dry brush, however slowly it is lifted', () => {
    const dabs = tail()
    applyWatercolorPooling(dabs, 0, 0.15)
    expect(dabs).toHaveLength(3)
  })

  it('is a no-op on an empty batch', () => {
    expect(() => applyWatercolorPooling([], 0, 1)).not.toThrow()
  })
})

describe('pigments (#468 v5, ADR 011 §5)', () => {
  it('gives paints genuinely different character, not different colour', () => {
    // The claim the whole table exists for. Ultramarine is bought *for* its
    // granulation; a phthalo green of the same strength lays down smooth.
    const ultramarine = watercolorPigmentByCode('PB29')
    const phthalo = watercolorPigmentByCode('PG7')
    expect(ultramarine.granulation).toBeGreaterThan(phthalo.granulation * 3)
    // And staining runs the other way, which is why it reduces the tideline
    // rather than adding to it: a paint bound to the fibre cannot migrate.
    expect(phthalo.staining).toBeGreaterThan(ultramarine.staining)
  })

  it('keeps every paint at the transparent end', () => {
    // These are watercolours, not gouache. If one ever creeps up near 1 it will
    // start covering what is under it outright, and the tool stops being a
    // glazing medium.
    for (const p of WATERCOLOR_PIGMENTS) {
      expect(p.opacity).toBeLessThanOrEqual(0.25)
      expect(p.opacity).toBeGreaterThan(0)
    }
  })

  it('spreads opacity widely enough to be worth a composite branch', () => {
    // The two-component composite only earns its keep if paints actually differ
    // here. An order of magnitude between the most and least covering is what
    // makes one overlap read as a multiply and another as an over.
    const values = WATERCOLOR_PIGMENTS.map(p => p.opacity)
    expect(Math.max(...values) / Math.min(...values)).toBeGreaterThan(8)
  })

  it('rides the preset string and falls back for anything it does not know', () => {
    const s = watercolorPresetString('normal', WATERCOLOR_MIX_DEFAULT, 'PB28')
    expect(watercolorPigmentFromPreset(s)).toBe('PB28')
    // Every watercolor stroke recorded before v5 has no fourth field, and the
    // Operation Log is permanent — so this path is reached by real strokes.
    expect(watercolorPigmentFromPreset('normal:55:60')).toBe(DEFAULT_WATERCOLOR_PIGMENT)
    expect(watercolorPigmentFromPreset('normal')).toBe(DEFAULT_WATERCOLOR_PIGMENT)
    expect(watercolorPigmentFromPreset('normal:55:60:NOPE')).toBe(DEFAULT_WATERCOLOR_PIGMENT)
  })

  it('never returns undefined for an unknown code', () => {
    expect(watercolorPigmentByCode('nonsense').granulation).toBeGreaterThan(0)
    expect(watercolorPigmentByCode(undefined).code).toBe(DEFAULT_WATERCOLOR_PIGMENT)
  })

  it('uses real Colour Index codes, which is what makes them stable ids', () => {
    for (const p of WATERCOLOR_PIGMENTS) {
      expect(p.code).toMatch(/^P[A-Za-z]+\d+(:\d+)?$/)
      expect(p.name.length).toBeGreaterThan(3)
    }
  })
})

describe('pigment transport (#468 v11, ADR 011 §11)', () => {
  // What the shader does with these is not testable here — MockGL never
  // rasterizes DAB_FRAG, and §11's whole result is a redistribution inside the
  // composite (see this file's own header). What *is* testable is the gate: a
  // wash that is not very wet must not pay for the term, and must not get it.
  it('is off for anything short of a very wet mix', () => {
    for (const water of [0, 0.3, 0.55, 0.7, 0.78]) {
      const p = ribbonProfileFor('watercolor', watercolorPresetString('normal', { water, pigment: 0.6 }))
      expect(p.migrate).toBe(0)
    }
  })

  it('is on above it, and only there', () => {
    const damp = ribbonProfileFor('watercolor', watercolorPresetString('normal', { water: 0.6, pigment: 0.6 }))
    const wet = ribbonProfileFor('watercolor', watercolorPresetString('normal', { water: 0.95, pigment: 0.6 }))
    expect(damp.migrate).toBe(0)
    expect(wet.migrate).toBeGreaterThan(0)
  })

  // The reach and the gate travel with the profile so a peer replaying the
  // stroke redistributes the pigment exactly as the author's machine did.
  it('carries a gate the shader can read, in the same units as the mix', () => {
    const p = ribbonProfileFor('watercolor', watercolorPresetString('normal', { water: 0.95, pigment: 0.6 }))
    expect(p.migrateLo).toBeGreaterThan(0.5)
    expect(p.migrateLo).toBeLessThan(p.migrateHi)
    expect(p.migrateHi).toBeLessThanOrEqual(1)
    expect(p.migrateOfRadius).toBeGreaterThan(0)
  })

  // A staining paint has bound to the fibre by the time the water starts
  // moving, so there is nothing loose left for it to carry. That is the
  // physical reason the wet edge is weaker for one, and here it is the same
  // number acting on the mechanism itself rather than on an imitation of it.
  it('a staining paint travels less than a lifting one', () => {
    const staining = [...WATERCOLOR_PIGMENTS].sort((a, b) => b.staining - a.staining)[0]
    const lifting = [...WATERCOLOR_PIGMENTS].sort((a, b) => a.staining - b.staining)[0]
    const mix = { water: 0.95, pigment: 0.6 }
    const a = ribbonProfileFor('watercolor', watercolorPresetString('normal', mix, staining.code))
    const b = ribbonProfileFor('watercolor', watercolorPresetString('normal', mix, lifting.code))
    expect(a.migrate).toBeLessThan(b.migrate)
  })

  // Every other tool goes through the same program, and a nonzero gain there
  // would cost sixty texture reads per fragment for a branch that must not run
  // at all — see RibbonProfile.migrate.
  it('no other ribbon tool migrates anything', () => {
    for (const tool of ['marker', 'brushPen'] as const) {
      expect(ribbonProfileFor(tool, undefined).migrate).toBe(0)
    }
  })
})
