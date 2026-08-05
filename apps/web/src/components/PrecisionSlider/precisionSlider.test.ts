import { describe, expect, it } from 'vitest'

import {
  advancePosition, distanceOutside, precisionFactor, roundToStep,
  FULL_SPEED_OFFSET_PX, MAX_PRECISION_OFFSET_PX, MAX_PRECISION_FACTOR,
} from './precisionSlider'

describe('precisionFactor', () => {
  it('is 1:1 anywhere inside the full-speed band', () => {
    expect(precisionFactor(0)).toBe(1)
    expect(precisionFactor(FULL_SPEED_OFFSET_PX)).toBe(1)
    expect(precisionFactor(FULL_SPEED_OFFSET_PX - 0.001)).toBe(1)
  })

  it('reaches the maximum at the far threshold and stays there', () => {
    expect(precisionFactor(MAX_PRECISION_OFFSET_PX)).toBeCloseTo(MAX_PRECISION_FACTOR, 10)
    expect(precisionFactor(MAX_PRECISION_OFFSET_PX * 5)).toBeCloseTo(MAX_PRECISION_FACTOR, 10)
  })

  it('ignores which side of the track the pointer was pulled to', () => {
    expect(precisionFactor(-120)).toBe(precisionFactor(120))
  })

  it('rises monotonically between the thresholds', () => {
    let prev = 0
    for (let d = FULL_SPEED_OFFSET_PX; d <= MAX_PRECISION_OFFSET_PX; d += 5) {
      const f = precisionFactor(d)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })

  it('leaves the full-speed band without a corner (smoothstep, not a ramp)', () => {
    // A linear ramp would jump straight to the ramp's full slope at the
    // threshold; the eased one starts at ~zero slope, so the first pixels past
    // the band barely change anything.
    const justPast = precisionFactor(FULL_SPEED_OFFSET_PX + 2) - 1
    const midBand = precisionFactor((FULL_SPEED_OFFSET_PX + MAX_PRECISION_OFFSET_PX) / 2) - 1
    expect(justPast).toBeLessThan(midBand / 20)
  })
})

describe('distanceOutside', () => {
  it('is zero anywhere within the track, including its edges', () => {
    expect(distanceOutside(100, 100, 128)).toBe(0)
    expect(distanceOutside(114, 100, 128)).toBe(0)
    expect(distanceOutside(128, 100, 128)).toBe(0)
  })

  it('measures from the nearer edge, not the centre line', () => {
    expect(distanceOutside(90, 100, 128)).toBe(10)
    expect(distanceOutside(148, 100, 128)).toBe(20)
  })
})

describe('advancePosition', () => {
  const LENGTH = 200

  it('maps the full track length onto the full range at 1:1', () => {
    expect(advancePosition(0, LENGTH, 0, LENGTH)).toBe(1)
    expect(advancePosition(0.5, LENGTH / 4, 0, LENGTH)).toBeCloseTo(0.75, 10)
  })

  it('divides movement by the factor once the pointer is pulled aside', () => {
    const far = advancePosition(0, LENGTH, MAX_PRECISION_OFFSET_PX, LENGTH)
    expect(far).toBeCloseTo(1 / MAX_PRECISION_FACTOR, 10)
  })

  it('does not move at all on a purely perpendicular pull', () => {
    // The regression #390 exists to prevent: entering or leaving the precise
    // zone must not rescale what the drag has already accumulated.
    let p = 0.5
    for (const offset of [0, 20, 60, 120, 200, 400, 120, 0]) {
      p = advancePosition(p, 0, offset, LENGTH)
    }
    expect(p).toBe(0.5)
  })

  it('returns to where it started when the same distance is retraced at the same offset', () => {
    const out = advancePosition(0.4, 37, 150, LENGTH)
    expect(advancePosition(out, -37, 150, LENGTH)).toBeCloseTo(0.4, 10)
  })

  it('clamps per move, so coming back from an overshoot responds immediately', () => {
    const past = advancePosition(0.9, LENGTH * 3, 0, LENGTH)
    expect(past).toBe(1)
    expect(advancePosition(past, -LENGTH / 4, 0, LENGTH)).toBeCloseTo(0.75, 10)
  })

  it('ignores a zero-length track rather than dividing by it', () => {
    expect(advancePosition(0.3, 50, 0, 0)).toBe(0.3)
  })

  it('accumulates the same total whether a move arrives as one event or many', () => {
    // Sensitivity depends on position alone, so event coalescing (and frame
    // rate with it) can no longer change the outcome the way the old
    // speed-driven factor did.
    const once = advancePosition(0, 120, 100, LENGTH)
    let stepped = 0
    for (let i = 0; i < 120; i++) stepped = advancePosition(stepped, 1, 100, LENGTH)
    expect(stepped).toBeCloseTo(once, 10)
  })
})

describe('roundToStep', () => {
  it('snaps to the nearest step', () => {
    expect(roundToStep(28.4, 1, 1, 400)).toBe(28)
    expect(roundToStep(0.634, 0.01, 0, 1)).toBeCloseTo(0.63, 10)
  })

  it('never leaves the range', () => {
    expect(roundToStep(1.004, 0.01, 0, 1)).toBe(1)
    expect(roundToStep(-3, 1, 1, 400)).toBe(1)
  })
})
