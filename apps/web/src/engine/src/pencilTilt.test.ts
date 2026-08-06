import { describe, it, expect } from 'vitest'

import {
  PENCIL_TILT, PENCIL_TILT_SLIDERS, pencilTiltAspect, pencilTiltDensity,
  pencilTiltT, pencilTiltWidthFactor, pencilTiltness, type PencilTiltConfig,
} from './pencilTilt'

const cfg = (patch: Partial<PencilTiltConfig> = {}): PencilTiltConfig => ({ ...PENCIL_TILT, ...patch })

// The model #389 replaces, for the comparisons below.
const legacyAspect = (tiltDeg: number): number => 1 + Math.pow(tiltDeg / 90, 3) * 6

describe('pencil tilt curve (#389)', () => {
  it('is round when the pen is upright', () => {
    expect(pencilTiltAspect(0)).toBeCloseTo(1)
    expect(pencilTiltWidthFactor(0)).toBeCloseTo(1)
    expect(pencilTiltDensity(pencilTiltness(pencilTiltAspect(0)))).toBeCloseTo(1)
  })

  it('reaches its full response at a tilt a hand can actually hold', () => {
    const c = cfg()
    expect(c.fullDeg).toBeLessThanOrEqual(70)
    expect(pencilTiltAspect(c.fullDeg, c)).toBeCloseTo(c.aspectMax)
    expect(pencilTiltWidthFactor(c.fullDeg, c)).toBeCloseTo(c.widthMax)
  })

  it('saturates past full tilt instead of running away', () => {
    const c = cfg()
    for (const deg of [c.fullDeg, c.fullDeg + 10, 89, 90]) {
      expect(pencilTiltAspect(deg, c)).toBeCloseTo(c.aspectMax)
      expect(pencilTiltWidthFactor(deg, c)).toBeCloseTo(c.widthMax)
    }
  })

  it('responds far more inside the working range than the model it replaces', () => {
    // The complaint that opened the issue: an ordinary 45° grip drew something
    // very nearly circular.
    expect(legacyAspect(45)).toBeLessThan(2)
    expect(pencilTiltAspect(45)).toBeGreaterThan(3)
    expect(pencilTiltAspect(30)).toBeGreaterThan(legacyAspect(30))
    expect(pencilTiltAspect(60)).toBeGreaterThan(legacyAspect(60))
  })

  it('is smooth and monotonic — no plateaus, which is the point of not being a ladder', () => {
    let prevAspect = 0
    let prevWidth = 0
    for (let deg = 0; deg <= PENCIL_TILT.fullDeg; deg += 1) {
      const a = pencilTiltAspect(deg)
      const w = pencilTiltWidthFactor(deg)
      expect(a).toBeGreaterThan(prevAspect)
      expect(w).toBeGreaterThan(prevWidth)
      prevAspect = a
      prevWidth = w
    }
  })

  it('stays nearly round near vertical, which is what the exponent buys', () => {
    // At a tenth of full tilt a quadratic has opened up ~1% of its range; a
    // linear response would already be at 10%.
    const c = cfg({ curve: 2 })
    expect(pencilTiltT(c.fullDeg * 0.1, c)).toBeCloseTo(0.01, 6)
    expect(pencilTiltT(c.fullDeg * 0.1, cfg({ curve: 1 }))).toBeCloseTo(0.1, 6)
  })

  it('curve exponent 1 gives a straight line', () => {
    const c = cfg({ curve: 1 })
    expect(pencilTiltT(c.fullDeg * 0.5, c)).toBeCloseTo(0.5)
    expect(pencilTiltAspect(c.fullDeg * 0.5, c)).toBeCloseTo(1 + (c.aspectMax - 1) * 0.5)
  })

  it('makes a leaned pencil wider, not just longer — the term the old model lacked', () => {
    expect(PENCIL_TILT.widthMax).toBeGreaterThan(1)
    expect(pencilTiltWidthFactor(PENCIL_TILT.fullDeg)).toBeGreaterThan(pencilTiltWidthFactor(0))
  })

  it('deposits lighter as the contact patch spreads', () => {
    const upright = pencilTiltDensity(pencilTiltness(pencilTiltAspect(0)))
    const leaned = pencilTiltDensity(pencilTiltness(pencilTiltAspect(PENCIL_TILT.fullDeg)))
    expect(leaned).toBeLessThan(upright)
    expect(leaned).toBeCloseTo(1 - PENCIL_TILT.lightening)
  })

  it('pencilTiltness inverts pencilTiltAspect exactly, at whatever config was baked', () => {
    // This is the property that keeps opacity baking consistent with the
    // geometry when a slider has moved in between.
    const baked = cfg({ aspectMax: 4, curve: 2, fullDeg: 55 })
    for (const deg of [0, 12, 27, 40, 55, 80]) {
      const aspect = pencilTiltAspect(deg, baked)
      expect(pencilTiltness(aspect, baked)).toBeCloseTo(pencilTiltT(deg, baked), 6)
    }
  })

  it('degenerate configs do not produce NaN', () => {
    expect(pencilTiltness(3, cfg({ aspectMax: 1 }))).toBe(0)
    expect(Number.isFinite(pencilTiltT(30, cfg({ fullDeg: 0 })))).toBe(true)
    expect(pencilTiltness(-5)).toBe(0)
    expect(pencilTiltness(1e6)).toBe(1)
  })

  it('lightening 0 restores the untilted deposit exactly', () => {
    const c = cfg({ lightening: 0 })
    expect(pencilTiltDensity(1, c)).toBe(1)
  })

  it('every config field has a slider — the numbers are meant to be felt, not argued', () => {
    const keys = Object.keys(PENCIL_TILT) as (keyof PencilTiltConfig)[]
    const slid = PENCIL_TILT_SLIDERS.map(s => s.key)
    for (const k of keys) expect(slid).toContain(k)
    for (const s of PENCIL_TILT_SLIDERS) {
      expect(s.max).toBeGreaterThan(s.min)
      expect(PENCIL_TILT[s.key]).toBeGreaterThanOrEqual(s.min)
      expect(PENCIL_TILT[s.key]).toBeLessThanOrEqual(s.max)
    }
  })
})
