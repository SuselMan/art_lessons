import { describe, expect, it } from 'vitest'

import {
  IDENTITY_PRESSURE_CALIBRATION, LOW_CEILING, MIN_CALIBRATION_SAMPLES, MIN_USABLE_RANGE,
  PRESSURE_CURVE_PRESET_POINTS, applyPressureCalibration, calibrationFromMeasurement,
  compilePressureCurve, isIdentityCalibration, isPressureCalibration, matchingCurvePreset,
  measurePressure, normalizeCurvePoints,
  type PressureCalibration,
} from './pressureCalibration'

/** A stroke as the wizard records it: a ramp up as the nib lands, a held
 *  level, a ramp down as it lifts. The ramps are exactly what the trimmed
 *  median exists to ignore. */
function strokeSamples(level: number, count = 40): number[] {
  const ramp = [level * 0.1, level * 0.35, level * 0.7]
  const held = Array.from({ length: count - 2 * ramp.length }, () => level)
  return [...ramp, ...held, ...ramp.slice().reverse()]
}

/** The same shape, but with the wobble a real hand puts into the held part —
 *  which is the whole difference between a median and a floor, and therefore
 *  the only way to test which one a calibration is built from. Deterministic
 *  (an LCG, not Math.random): a flaky pressure test would be worse than none. */
function jitteredStroke(level: number, spread: number, count = 40): number[] {
  const ramp = [level * 0.1, level * 0.35, level * 0.7]
  let seed = 12345
  const held = Array.from({ length: count - 2 * ramp.length }, () => {
    seed = (seed * 9301 + 49297) % 233280
    return level + (seed / 233280 - 0.5) * 2 * spread
  })
  return [...ramp, ...held, ...ramp.slice().reverse()]
}

/** A pen that never reports below `floor` while its tip is touching — the one
 *  case the range stage's bottom half was always needed for. */
function withOffsetFloor(samples: number[], floor: number): number[] {
  return samples.map(v => Math.max(floor, v))
}

describe('applyPressureCalibration', () => {
  it('leaves pressure untouched when uncalibrated', () => {
    for (const raw of [0, 0.13, 0.5, 0.87, 1]) {
      expect(applyPressureCalibration(IDENTITY_PRESSURE_CALIBRATION, raw)).toBeCloseTo(raw, 12)
    }
  })

  it('stretches the measured range across the full 0..1', () => {
    const cal: PressureCalibration = { inMin: 0.08, inMax: 0.44, points: [] }
    expect(applyPressureCalibration(cal, 0.08)).toBeCloseTo(0, 6)
    expect(applyPressureCalibration(cal, 0.26)).toBeCloseTo(0.5, 6)
    expect(applyPressureCalibration(cal, 0.44)).toBeCloseTo(1, 6)
  })

  it('clamps outside the measured range instead of extrapolating', () => {
    const cal: PressureCalibration = { inMin: 0.1, inMax: 0.5, points: [] }
    expect(applyPressureCalibration(cal, 0)).toBe(0)
    expect(applyPressureCalibration(cal, 0.9)).toBe(1)
  })

  it('passes a degenerate range through rather than dividing by it', () => {
    // Should never be stored (measurePressure refuses it), but a hand-edited
    // localStorage must degrade to "uncalibrated", not to an on/off pen.
    const cal: PressureCalibration = { inMin: 0.4, inMax: 0.4 + MIN_USABLE_RANGE / 2, points: [] }
    expect(applyPressureCalibration(cal, 0.42)).toBeCloseTo(0.42, 6)
  })

  it('applies the range before the curve', () => {
    const cal: PressureCalibration = { inMin: 0.2, inMax: 0.6, points: [{ x: 0.5, y: 0.68 }] }
    // Mid-range input lands on the control point itself.
    expect(applyPressureCalibration(cal, 0.4)).toBeCloseTo(0.68, 6)
  })
})

describe('compilePressureCurve', () => {
  const grid = Array.from({ length: 101 }, (_, i) => i / 100)

  it('is the identity with no control points', () => {
    const curve = compilePressureCurve([])
    for (const t of grid) expect(curve(t)).toBeCloseTo(t, 12)
  })

  it('keeps the endpoints pinned', () => {
    const curve = compilePressureCurve([{ x: 0.3, y: 0.8 }])
    expect(curve(0)).toBeCloseTo(0, 6)
    expect(curve(1)).toBeCloseTo(1, 6)
  })

  it('never overshoots, so harder never means lighter', () => {
    // A knot pulled hard toward one corner is where an ordinary cubic bulges
    // past 0 or 1 and reverses direction — the failure this curve is chosen
    // to be incapable of.
    for (const points of [
      [{ x: 0.1, y: 0.9 }],
      [{ x: 0.9, y: 0.1 }],
      [{ x: 0.2, y: 0.05 }, { x: 0.8, y: 0.95 }],
      [{ x: 0.25, y: 0.7 }, { x: 0.5, y: 0.72 }, { x: 0.75, y: 0.98 }],
    ]) {
      const curve = compilePressureCurve(points)
      let previous = curve(0)
      for (const t of grid) {
        const y = curve(t)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(1)
        expect(y).toBeGreaterThanOrEqual(previous - 1e-9)
        previous = y
      }
    }
  })

  it('passes through every control point it is given', () => {
    const points = [{ x: 0.25, y: 0.55 }, { x: 0.75, y: 0.8 }]
    const curve = compilePressureCurve(points)
    for (const p of points) expect(curve(p.x)).toBeCloseTo(p.y, 6)
  })

  it('makes "softer" deposit more mid-range and "firmer" less', () => {
    const softer = compilePressureCurve(PRESSURE_CURVE_PRESET_POINTS.softer)
    const firmer = compilePressureCurve(PRESSURE_CURVE_PRESET_POINTS.firmer)
    expect(softer(0.5)).toBeGreaterThan(0.5)
    expect(firmer(0.5)).toBeLessThan(0.5)
  })
})

describe('normalizeCurvePoints', () => {
  it('sorts, clamps and adds the implicit endpoints', () => {
    const knots = normalizeCurvePoints([{ x: 0.7, y: 1.4 }, { x: 0.3, y: -0.2 }])
    expect(knots).toEqual([
      { x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.7, y: 1 }, { x: 1, y: 1 },
    ])
  })

  it('drops points that sit on top of an endpoint or each other', () => {
    const knots = normalizeCurvePoints([{ x: 0.001, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.505, y: 0.9 }])
    expect(knots).toEqual([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }])
  })

  it('keeps at most MAX_CURVE_POINTS interior knots', () => {
    const knots = normalizeCurvePoints([
      { x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.8, y: 0.8 },
    ])
    expect(knots).toHaveLength(5)
  })
})

describe('measurePressure', () => {
  it('measures the level held, not the landing and lift-off ramps', () => {
    const m = measurePressure(strokeSamples(0.09), strokeSamples(0.42))
    expect(m.light).toBeCloseTo(0.09, 6)
    expect(m.heavy).toBeCloseTo(0.42, 6)
    expect(m.verdict).toBe('ok')
  })

  it('flags a pen that never reaches the top of the range', () => {
    const weak = measurePressure(strokeSamples(0.06), strokeSamples(0.4))
    expect(weak.lowCeiling).toBe(true)
    expect(weak.verdict).toBe('ok')

    const full = measurePressure(strokeSamples(0.1), strokeSamples(0.95))
    expect(full.observedMax).toBeGreaterThan(LOW_CEILING)
    expect(full.lowCeiling).toBe(false)
  })

  it('refuses a stylus that reports one constant pressure', () => {
    // What a browser sends for a stylus with no pressure sensor at all.
    const m = measurePressure(strokeSamples(0.5), strokeSamples(0.5))
    expect(m.verdict).toBe('noRange')
  })

  it('names a swapped pair of strokes rather than calling the pen broken', () => {
    const m = measurePressure(strokeSamples(0.45), strokeSamples(0.08))
    expect(m.verdict).toBe('reversed')
  })

  it('refuses a stroke too short to have a level', () => {
    const short = Array.from({ length: MIN_CALIBRATION_SAMPLES - 1 }, () => 0.1)
    const m = measurePressure(short, strokeSamples(0.5))
    expect(m.verdict).toBe('tooFewSamples')
    expect(Number.isFinite(m.light)).toBe(true)
  })
})

describe('calibrationFromMeasurement', () => {
  it('maps the firm level to the top and the pen’s own floor to the bottom', () => {
    const m = measurePressure(strokeSamples(0.07), strokeSamples(0.38))
    const cal = calibrationFromMeasurement(m)
    expect(applyPressureCalibration(cal, m.observedMin)).toBeCloseTo(0, 6)
    expect(applyPressureCalibration(cal, 0.38)).toBeCloseTo(1, 6)
    expect(isIdentityCalibration(cal)).toBe(false)
  })

  it('leaves the demonstrated light press making a mark, not nothing', () => {
    // The light stroke says "this is the lightest I go", not "erase everything
    // below me" — so the level it was drawn at must still come out above zero.
    const m = measurePressure(strokeSamples(0.07), strokeSamples(0.38))
    const cal = calibrationFromMeasurement(m)
    expect(applyPressureCalibration(cal, 0.07)).toBeGreaterThan(0)
  })

  it('does not clamp ordinary drawing to zero on a pen with a compressed range', () => {
    // The real report this exists for (rooms `j4LVaN6I` -> `1IFZTMJc`): a
    // One by Wacom whose whole usable output is ~0.05..0.55, with ordinary
    // drawing sitting at 0.29..0.44. Calibrating against the *median* of the
    // light stroke put inMin right in the middle of that band, and a quarter
    // of the next lesson's strokes came out at zero pressure end to end.
    const light = jitteredStroke(0.30, 0.04)
    const firm = jitteredStroke(0.50, 0.04)
    const m = measurePressure(light, firm)
    expect(m.verdict).toBe('ok')

    const cal = calibrationFromMeasurement(m)
    // Her whole working band must survive, bottom included.
    for (const raw of [0.29, 0.33, 0.36, 0.40, 0.44]) {
      expect(applyPressureCalibration(cal, raw)).toBeGreaterThan(0)
    }
    // And it must land high enough to be a line rather than a hairline: the
    // pencil's width law is 0.3 + 0.7*p, so a mid-band press should be past
    // half the response, not scraping the floor.
    expect(applyPressureCalibration(cal, 0.36)).toBeGreaterThan(0.5)
  })

  it('still removes a genuine offset floor', () => {
    // A pen that never reports below 0.12 while touching: that offset is dead
    // range, and taking it off is the one job this stage was always needed for.
    const m = measurePressure(
      withOffsetFloor(strokeSamples(0.2), 0.12),
      withOffsetFloor(strokeSamples(0.6), 0.12),
    )
    const cal = calibrationFromMeasurement(m)
    expect(cal.inMin).toBeCloseTo(0.12, 6)
    expect(applyPressureCalibration(cal, 0.12)).toBeCloseTo(0, 6)
  })

  it('keeps a curve that was already tuned', () => {
    const m = measurePressure(strokeSamples(0.1), strokeSamples(0.5))
    const cal = calibrationFromMeasurement(m, PRESSURE_CURVE_PRESET_POINTS.softer)
    expect(cal.points).toEqual(PRESSURE_CURVE_PRESET_POINTS.softer)
  })
})

describe('matchingCurvePreset', () => {
  it('recognizes an untouched preset and nothing else', () => {
    expect(matchingCurvePreset([])).toBe('linear')
    expect(matchingCurvePreset(PRESSURE_CURVE_PRESET_POINTS.firmer)).toBe('firmer')
    expect(matchingCurvePreset([{ x: 0.5, y: 0.4 }])).toBeNull()
  })
})

describe('isPressureCalibration', () => {
  it('accepts what the app writes', () => {
    expect(isPressureCalibration(IDENTITY_PRESSURE_CALIBRATION)).toBe(true)
    expect(isPressureCalibration({ inMin: 0.1, inMax: 0.5, points: [{ x: 0.5, y: 0.7 }] })).toBe(true)
  })

  it('rejects anything that would poison the input path', () => {
    for (const bad of [
      null,
      'nope',
      { inMin: 0, inMax: 1 },
      { inMin: Number.NaN, inMax: 1, points: [] },
      { inMin: -0.2, inMax: 1, points: [] },
      { inMin: 0.6, inMax: 0.6, points: [] },
      { inMin: 0.7, inMax: 0.3, points: [] },
      { inMin: 0, inMax: 1, points: [{ x: 0.5 }] },
      { inMin: 0, inMax: 1, points: [{ x: 0.2, y: 2 }] },
      { inMin: 0, inMax: 1, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }] },
    ]) {
      expect(isPressureCalibration(bad)).toBe(false)
    }
  })
})
