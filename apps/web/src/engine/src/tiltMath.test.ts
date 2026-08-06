import { describe, it, expect } from 'vitest'

import { tiltMagnitudeDeg, tiltNormFrom } from './tiltMath'

// The reference the engine used before #388, kept here as the thing these
// tests demonstrate a difference *from* — not as an expectation.
function legacyHypot(tiltX: number, tiltY: number): number {
  return Math.sqrt(tiltX * tiltX + tiltY * tiltY)
}

/** True angle from vertical for a stylus leaning `theta` degrees in azimuth
 *  `phi`, expressed as the pair of projected angles a PointerEvent reports.
 *  This is the forward direction of tiltMath's own derivation, so a round trip
 *  through it is a real check rather than a restatement. */
function projectedTilts(theta: number, phi: number): { tiltX: number; tiltY: number } {
  const t = Math.tan(theta * Math.PI / 180)
  const toDeg = 180 / Math.PI
  return {
    tiltX: Math.atan(t * Math.cos(phi * Math.PI / 180)) * toDeg,
    tiltY: Math.atan(t * Math.sin(phi * Math.PI / 180)) * toDeg,
  }
}

describe('tiltMagnitudeDeg (#388)', () => {
  it('recovers the true angle from vertical for every azimuth', () => {
    for (const theta of [5, 20, 35, 45, 55, 70, 85]) {
      for (const phi of [0, 15, 30, 45, 60, 90, 135, 200, 315]) {
        const { tiltX, tiltY } = projectedTilts(theta, phi)
        expect(tiltMagnitudeDeg(tiltX, tiltY)).toBeCloseTo(theta, 6)
      }
    }
  })

  it('is independent of grip azimuth — the defect it exists to remove', () => {
    const theta = 50
    const readings = [0, 30, 45, 75, 90].map(phi => {
      const { tiltX, tiltY } = projectedTilts(theta, phi)
      return { fixed: tiltMagnitudeDeg(tiltX, tiltY), legacy: legacyHypot(tiltX, tiltY) }
    })
    // Fixed: every grip reports the same lean.
    for (const r of readings) expect(r.fixed).toBeCloseTo(theta, 6)
    // Legacy: the diagonal grip read markedly steeper than the axis-aligned
    // one, which is exactly why the same physical lean drew a different dab.
    const legacySpread = Math.max(...readings.map(r => r.legacy)) - Math.min(...readings.map(r => r.legacy))
    expect(legacySpread).toBeGreaterThan(5)
  })

  it('agrees with hypot when the pen leans along one axis', () => {
    for (const t of [0, 10, 30, 45, 60, 80]) {
      expect(tiltMagnitudeDeg(t, 0)).toBeCloseTo(t, 6)
      expect(tiltMagnitudeDeg(0, -t)).toBeCloseTo(t, 6)
    }
  })

  it('reproduces the two worked examples from the issue', () => {
    expect(tiltMagnitudeDeg(45, 45)).toBeCloseTo(54.7356, 3)
    expect(legacyHypot(45, 45)).toBeCloseTo(63.64, 2)
    expect(tiltMagnitudeDeg(60, 60)).toBeCloseTo(67.7923, 3)
    expect(legacyHypot(60, 60)).toBeCloseTo(84.85, 2)
  })

  it('cannot exceed 90 degrees, unlike the formula it replaces', () => {
    // The issue's own case: hypot(80, 80) = 113, i.e. tiltNorm 1.26 and a
    // pencil aspect well past its stated maximum.
    expect(legacyHypot(80, 80)).toBeGreaterThan(90)
    expect(tiltMagnitudeDeg(80, 80)).toBeLessThan(90)
    expect(tiltNormFrom(80, 80)).toBeLessThan(1)
    // Including the degenerate corner, where tan is ~1.6e16 rather than
    // Infinity — no NaN, no overflow.
    expect(tiltMagnitudeDeg(90, 90)).toBeCloseTo(90, 6)
    expect(tiltNormFrom(90, 90)).toBeLessThanOrEqual(1)
    expect(Number.isFinite(tiltMagnitudeDeg(90, 90))).toBe(true)
  })

  it('is monotonic in lean and signs-agnostic', () => {
    let prev = -1
    for (const theta of [0, 10, 20, 30, 40, 50, 60, 70, 80]) {
      const { tiltX, tiltY } = projectedTilts(theta, 37)
      const mag = tiltMagnitudeDeg(tiltX, tiltY)
      expect(mag).toBeGreaterThan(prev)
      prev = mag
      expect(tiltMagnitudeDeg(-tiltX, tiltY)).toBeCloseTo(mag, 6)
      expect(tiltMagnitudeDeg(tiltX, -tiltY)).toBeCloseTo(mag, 6)
    }
  })

  it('is zero for a device that reports no tilt at all (mouse)', () => {
    expect(tiltMagnitudeDeg(0, 0)).toBe(0)
    expect(tiltNormFrom(0, 0)).toBe(0)
  })
})
