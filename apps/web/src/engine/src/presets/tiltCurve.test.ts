import { describe, it, expect } from 'vitest'

import {
  CHARCOAL_FEEL, charcoalAspect, charcoalBroadness, charcoalTiltT, charcoalWidthFactor,
} from './charcoalFeel'
import {
  PENCIL_TILT, pencilTiltAspect, pencilTiltT, pencilTiltWidthFactor, pencilTiltness,
} from './pencilTilt'
import {
  DEFAULT_TILT_RESPONSE, TILT_RESPONSES, isTiltResponse, tiltCurveInverse, tiltCurveLerp,
  tiltCurveT, tiltResponseT, type TiltResponse,
} from './tiltCurve'

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

describe('tilt responses — the shape as a user setting (#409)', () => {
  const cfg = { fullDeg: 60, curve: 2 }
  const t = (response: TiltResponse, deg: number) => tiltResponseT(deg, response, cfg.fullDeg, cfg.curve)

  it('restrained reproduces graphite\'s pre-#389 shape: cubed, against an unreachable 90°', () => {
    // The formula that shipped for the engine's whole life up to #389 was
    // `aspect = 1 + (θ/90)³ · 6`. Its *shape* is (θ/90)³ and that is what this
    // response restores — the ×6 was aspectMax, which stays the material's.
    for (const deg of [0, 17, 30, 45, 60, 75, 90]) {
      expect(t('restrained', deg)).toBeCloseTo(Math.pow(deg / 90, 3), 12)
    }
  })

  it('smooth is the material\'s own numbers, untouched', () => {
    for (const deg of [0, 23, 41, 60, 88]) {
      expect(t('smooth', deg)).toBeCloseTo(tiltCurveT(deg, cfg.fullDeg, cfg.curve), 12)
    }
  })

  it('linear keeps the material\'s reachable full tilt and drops the exponent', () => {
    expect(t('linear', 30)).toBeCloseTo(0.5, 12)
    expect(t('linear', 60)).toBe(1)
    expect(t('linear', 75)).toBe(1)
  })

  it('is what Ilya described feeling: restrained answers least at every working grip', () => {
    // The whole complaint (#409) is about the 30-60° band a hand actually
    // works in, so pin the ordering there rather than at the endpoints where
    // every curve agrees.
    // Strictly below fullDeg — at 60° smooth and linear have both arrived at 1
    // and are equal by construction, which says nothing about their shape.
    for (const deg of [20, 30, 40, 50, 55]) {
      expect(t('restrained', deg)).toBeLessThan(t('smooth', deg))
      expect(t('smooth', deg)).toBeLessThan(t('linear', deg))
    }
    // And the reason it feels held back rather than merely slower: at a firm
    // 60° lean it is still under a third of the way along, because its ceiling
    // sits at an angle no stylus on a tablet reaches.
    expect(t('restrained', 60)).toBeCloseTo(8 / 27, 6)
    expect(t('smooth', 60)).toBe(1)
  })

  it('every response is monotone and pinned at both ends', () => {
    for (const response of TILT_RESPONSES) {
      expect(t(response, 0)).toBe(0)
      expect(t(response, 90)).toBe(1)
      let prev = -1
      for (let deg = 0; deg <= 90; deg++) {
        const v = t(response, deg)
        expect(v).toBeGreaterThanOrEqual(prev)
        prev = v
      }
    }
  })

  it('leaves the inverse exact, which is why nothing downstream had to change', () => {
    // Opacity baking and DAB_FRAG recover a recorded dab's tiltness from its
    // own baked aspectRatio (pencilTiltness/charcoalBroadness). A response only
    // moves fullDeg and the exponent — both inside t — so that recovery has to
    // keep working under all three, for a pencil and for a charcoal stick.
    for (const response of TILT_RESPONSES) {
      for (const deg of [0, 19, 37, 58, 90]) {
        expect(pencilTiltness(pencilTiltAspect(deg, PENCIL_TILT, response), PENCIL_TILT))
          .toBeCloseTo(pencilTiltT(deg, PENCIL_TILT, response), 9)
        expect(charcoalBroadness(charcoalAspect(deg, CHARCOAL_FEEL, response), CHARCOAL_FEEL))
          .toBeCloseTo(charcoalTiltT(deg, CHARCOAL_FEEL, response), 9)
      }
    }
  })

  it('applies the same three shapes to each material\'s own amounts', () => {
    // "Same set of curves everywhere" (Ilya, 07.08) is about the ramp, not the
    // destination: whichever response is picked, both materials still arrive at
    // their own aspectMax, and charcoal still narrows where graphite widens.
    for (const response of TILT_RESPONSES) {
      expect(pencilTiltAspect(90, PENCIL_TILT, response)).toBeCloseTo(PENCIL_TILT.aspectMax, 6)
      expect(charcoalAspect(90, CHARCOAL_FEEL, response)).toBeCloseTo(CHARCOAL_FEEL.aspectMax, 6)
      expect(charcoalWidthFactor(90, CHARCOAL_FEEL, response)).toBeLessThan(1)
      expect(pencilTiltWidthFactor(90, PENCIL_TILT, response)).toBeGreaterThan(1)
    }
  })

  it('validates a stored value instead of trusting it', () => {
    // What comes back out of localStorage is a string, and a build that once
    // wrote a response we later renamed must not reach the engine.
    for (const response of TILT_RESPONSES) expect(isTiltResponse(response)).toBe(true)
    expect(isTiltResponse('ladder')).toBe(false)
    expect(isTiltResponse('')).toBe(false)
    expect(TILT_RESPONSES).toContain(DEFAULT_TILT_RESPONSE)
  })
})
