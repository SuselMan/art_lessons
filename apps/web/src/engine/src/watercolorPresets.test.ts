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
  DEFAULT_WATERCOLOR_RESPONSE,
} from './watercolorPresets'
import { brushPenWidth } from './brushPenPresets'

function dabAt(x: number, y: number, size = 30): Dab {
  return { x, y, pressure: 0.5, tiltX: 0, tiltY: 0, size, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
}

describe('watercolor preset (#468, ADR 011 §5)', () => {
  it('is transparent, not covering — the whole material in one number', () => {
    // The brush pen sits at 0.97 because ink covers. If this ever creeps up
    // near that, the tool has stopped being watercolor and the wet-edge and
    // glaze terms downstream stop being visible at all.
    expect(WATERCOLOR_PRESET.opacity).toBeLessThan(0.6)
    expect(WATERCOLOR_PRESET.opacity).toBeGreaterThan(0.2)
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
