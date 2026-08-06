import { describe, it, expect } from 'vitest'

import { CHARCOAL_FEEL, charcoalAspect, charcoalTiltT, charcoalWidthFactor } from './charcoalFeel'
import { PENCIL_TILT, pencilTiltAspect, pencilTiltT } from './pencilTilt'
import { tiltCurveInverse, tiltCurveLerp, tiltCurveT } from './tiltCurve'

describe('tiltCurve — the response shared by graphite and charcoal (#389, #403)', () => {
  it('runs 0 -> 1 over 0 -> fullDeg and saturates past it', () => {
    expect(tiltCurveT(0, 60, 2)).toBe(0)
    expect(tiltCurveT(60, 60, 2)).toBe(1)
    expect(tiltCurveT(85, 60, 2)).toBe(1)
    expect(tiltCurveT(-10, 60, 2)).toBe(0)
  })

  it('exponent 1 is linear; above 1 arrives late; below 1 arrives early', () => {
    const half = 30
    expect(tiltCurveT(half, 60, 1)).toBeCloseTo(0.5)
    expect(tiltCurveT(half, 60, 2)).toBeLessThan(0.5)
    expect(tiltCurveT(half, 60, 0.5)).toBeGreaterThan(0.5)
  })

  it('interpolates from 1 in both directions', () => {
    // Graphite widens with tilt, charcoal narrows — same function, atFull on
    // either side of 1.
    expect(tiltCurveLerp(0, 5)).toBe(1)
    expect(tiltCurveLerp(1, 5)).toBe(5)
    expect(tiltCurveLerp(0, 0.5)).toBe(1)
    expect(tiltCurveLerp(1, 0.5)).toBe(0.5)
    expect(tiltCurveLerp(0.5, 0.5)).toBeCloseTo(0.75)
  })

  it('inverse recovers t exactly, for a growing and a shrinking quantity alike', () => {
    for (const atFull of [8, 5, 1.4, 0.5, 0.2]) {
      for (const t of [0, 0.13, 0.5, 0.87, 1]) {
        expect(tiltCurveInverse(tiltCurveLerp(t, atFull), atFull)).toBeCloseTo(t, 9)
      }
    }
  })

  it('inverse clamps rather than overshooting when a dab outlives its config', () => {
    // A dab baked while a slider sat higher must not report more than fully
    // tilted once the slider comes back down.
    expect(tiltCurveInverse(50, 8)).toBe(1)
    expect(tiltCurveInverse(-3, 8)).toBe(0)
    expect(tiltCurveInverse(7, 1)).toBe(0)
  })

  it('degenerate inputs stay finite', () => {
    expect(Number.isFinite(tiltCurveT(30, 0, 2))).toBe(true)
    expect(Number.isFinite(tiltCurveT(30, 60, 0))).toBe(true)
    expect(Number.isFinite(tiltCurveInverse(4, 1))).toBe(true)
  })

  it('both materials really do ride this one curve, not two lookalikes', () => {
    // The point of extracting the module: given the same fullDeg/curve, the two
    // materials must agree on position along the response, differing only in
    // what they map it onto.
    const shared = { fullDeg: 55, curve: 1.7 }
    const p = { ...PENCIL_TILT, ...shared }
    const c = { ...CHARCOAL_FEEL, ...shared }
    for (const deg of [0, 11, 27, 44, 55, 80]) {
      expect(pencilTiltT(deg, p)).toBeCloseTo(charcoalTiltT(deg, c), 12)
    }
  })

  it('the two materials map that shared position in opposite directions on width', () => {
    // Graphite: the side of a cone is a broader contact than its point.
    // Charcoal: a cylinder laid over contacts along a line, narrower than its
    // end face. Same t, opposite sign — this is the difference that matters.
    expect(PENCIL_TILT.widthMax).toBeGreaterThan(1)
    expect(CHARCOAL_FEEL.widthMax).toBeLessThan(1)
    expect(charcoalWidthFactor(CHARCOAL_FEEL.fullDeg)).toBeLessThan(1)
    // ...and charcoal elongates further than graphite at its own full tilt, a
    // stick against a sharpened point.
    expect(charcoalAspect(CHARCOAL_FEEL.fullDeg)).toBeGreaterThan(pencilTiltAspect(PENCIL_TILT.fullDeg))
  })
})
