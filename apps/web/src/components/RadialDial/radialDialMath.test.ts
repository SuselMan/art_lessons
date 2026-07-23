import { describe, expect, it } from 'vitest'

import { angleToCompassDegrees, roundToStep, shortestDelta, wholeUnitsCrossed, wrapDegrees, wrapValue } from './radialDialMath'

describe('angleToCompassDegrees (#277)', () => {
  const center = { x: 100, y: 100 }

  it('reads 0 for a point directly above center ("up"/12 o\'clock)', () => {
    expect(angleToCompassDegrees(center, { x: 100, y: 0 })).toBeCloseTo(0)
  })

  it('reads 90 for a point directly to the right (3 o\'clock) — clockwise-positive', () => {
    expect(angleToCompassDegrees(center, { x: 200, y: 100 })).toBeCloseTo(90)
  })

  it('reads 180 for a point directly below (6 o\'clock)', () => {
    expect(angleToCompassDegrees(center, { x: 100, y: 200 })).toBeCloseTo(180)
  })

  it('reads 270 for a point directly to the left (9 o\'clock)', () => {
    expect(angleToCompassDegrees(center, { x: 0, y: 100 })).toBeCloseTo(270)
  })

  it('is scale-invariant — only the direction from center matters, not the distance', () => {
    const near = angleToCompassDegrees(center, { x: 110, y: 100 })
    const far = angleToCompassDegrees(center, { x: 500, y: 100 })
    expect(near).toBeCloseTo(far)
  })
})

describe('wrapDegrees / wrapValue', () => {
  it('normalizes into [0, 360)', () => {
    expect(wrapDegrees(360)).toBeCloseTo(0)
    expect(wrapDegrees(-10)).toBeCloseTo(350)
    expect(wrapDegrees(725)).toBeCloseTo(5)
  })

  it('wrapValue generalizes wrapDegrees to an arbitrary domain', () => {
    expect(wrapValue(360, 0, 360)).toBeCloseTo(0)
    expect(wrapValue(-10, 0, 360)).toBeCloseTo(350)
    expect(wrapValue(16, 5, 10)).toBeCloseTo(6) // wraps a 5..15 domain (16 is 1 past the top, lands at the bottom + 1)
  })
})

describe('roundToStep', () => {
  it('snaps to the nearest arc-minute (1/60) step', () => {
    expect(roundToStep(45.017, 1 / 60)).toBeCloseTo(45 + 1 / 60, 5)
    expect(roundToStep(45.001, 1 / 60)).toBeCloseTo(45, 5)
  })
})

describe('shortestDelta', () => {
  it('takes the short way around the 360 seam', () => {
    expect(shortestDelta(359, 1)).toBeCloseTo(2)
    expect(shortestDelta(1, 359)).toBeCloseTo(-2)
  })

  it('is a plain difference when no wraparound is involved', () => {
    expect(shortestDelta(10, 15)).toBeCloseTo(5)
    expect(shortestDelta(200, 100)).toBeCloseTo(-100)
  })
})

describe('wholeUnitsCrossed (#280: drives the per-degree click)', () => {
  it('counts one crossing per whole degree traveled, forward', () => {
    expect(wholeUnitsCrossed(0.6, 2.4, 1)).toBe(2)
  })

  it('counts crossings across the 360/0 seam', () => {
    expect(wholeUnitsCrossed(359.5, 0.5, 1)).toBe(1)
  })

  it('is signed — negative for the reverse direction', () => {
    expect(wholeUnitsCrossed(2.4, 0.6, 1)).toBe(-2)
  })

  it('is zero for movement that stays within the same whole unit', () => {
    expect(wholeUnitsCrossed(1.1, 1.9, 1)).toBe(0)
  })
})
