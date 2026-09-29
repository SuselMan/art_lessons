import { describe, expect, it } from 'vitest'

import { expScale, linearScale } from './sliderScale'

describe('linearScale', () => {
  it('places the ends and the middle where they read', () => {
    expect(linearScale.toPosition(0, 0, 1)).toBe(0)
    expect(linearScale.toPosition(1, 0, 1)).toBe(1)
    expect(linearScale.toPosition(180, 0, 360)).toBe(0.5)
  })

  it('round-trips', () => {
    for (const v of [0, 0.13, 0.5, 0.99, 1]) {
      expect(linearScale.fromPosition(linearScale.toPosition(v, 0, 1), 0, 1)).toBeCloseTo(v, 10)
    }
  })

  it('collapses a degenerate range instead of dividing by zero', () => {
    expect(linearScale.toPosition(5, 5, 5)).toBe(0)
  })
})

describe('expScale', () => {
  it('pins both ends exactly', () => {
    expect(expScale.toPosition(1, 1, 400)).toBe(0)
    expect(expScale.toPosition(400, 1, 400)).toBeCloseTo(1, 10)
    expect(expScale.fromPosition(0, 1, 400)).toBe(1)
    expect(expScale.fromPosition(1, 1, 400)).toBeCloseTo(400, 10)
  })

  it('puts the geometric mean at the halfway point', () => {
    expect(expScale.fromPosition(0.5, 1, 400)).toBeCloseTo(20, 10)
  })

  it('gives the small end of a px range real track to live on', () => {
    // The reason for the whole scale: 1..20px is what people draw lines with,
    // and linearly it owned under 5% of the track.
    expect(linearScale.toPosition(20, 1, 400)).toBeLessThan(0.06)
    expect(expScale.toPosition(20, 1, 400)).toBeCloseTo(0.5, 10)
  })

  it('spends equal track on equal ratios', () => {
    const decade = expScale.toPosition(10, 1, 1000) - expScale.toPosition(1, 1, 1000)
    expect(expScale.toPosition(100, 1, 1000) - expScale.toPosition(10, 1, 1000)).toBeCloseTo(decade, 10)
  })

  it('round-trips across the range', () => {
    for (const v of [1, 4, 18, 50, 137, 400]) {
      expect(expScale.fromPosition(expScale.toPosition(v, 1, 400), 1, 400)).toBeCloseTo(v, 8)
    }
  })

  it('falls back to linear on a domain a logarithm cannot take', () => {
    // Never NaN/Infinity: a field that picks this scale wrongly degrades to
    // the old behavior rather than rendering a dead control.
    expect(expScale.toPosition(0.5, 0, 1)).toBe(linearScale.toPosition(0.5, 0, 1))
    expect(expScale.fromPosition(0.5, 0, 1)).toBe(linearScale.fromPosition(0.5, 0, 1))
    expect(expScale.toPosition(-5, -10, 10)).toBe(linearScale.toPosition(-5, -10, 10))
    expect(expScale.fromPosition(0.5, 5, 5)).toBe(linearScale.fromPosition(0.5, 5, 5))
  })
})
