import { describe, it, expect } from 'vitest'

import { tiltAzimuthRad, tiltMagnitudeDeg, tiltNormFrom } from './tiltMath'

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

// #482 — the azimuth half of the same recovery, and #388's unfixed twin. The
// engine derived the grip's direction as `atan2(tiltY, tiltX)` right up until
// this, which is the identical category error #388 diagnosed for the
// magnitude: tiltX/tiltY are two projected *angles*, so what combines is their
// tangents, not the values themselves.
describe('tiltAzimuthRad (#482)', () => {
  /** atan2's own range, so a round trip can be compared against the phi it
   *  started from without every case needing its own wrap. */
  function wrapDeg(phi: number): number {
    return ((phi + 180) % 360 + 360) % 360 - 180
  }

  it('recovers the azimuth it was built from, at every lean', () => {
    for (const theta of [5, 20, 35, 45, 55, 70, 85]) {
      for (const phi of [0, 15, 30, 45, 60, 90, 135, 200, 315]) {
        const { tiltX, tiltY } = projectedTilts(theta, phi)
        expect(tiltAzimuthRad(tiltX, tiltY) * 180 / Math.PI).toBeCloseTo(wrapDeg(phi), 6)
      }
    }
  })

  it('differs from the legacy atan2-of-angles exactly where the old formula was wrong', () => {
    const legacyAzimuth = (tiltX: number, tiltY: number) => Math.atan2(tiltY, tiltX) * 180 / Math.PI
    const trueAzimuth   = (tiltX: number, tiltY: number) => tiltAzimuthRad(tiltX, tiltY) * 180 / Math.PI

    // Agrees where one component is zero (an axis-aligned grip — which is why
    // this went unnoticed for as long as the magnitude bug did) ...
    for (const [x, y] of [[40, 0], [0, 40], [-55, 0], [0, -55]] as const) {
      expect(trueAzimuth(x, y)).toBeCloseTo(legacyAzimuth(x, y), 6)
    }
    // ... and on the exact diagonal, where the two tangents scale alike.
    expect(trueAzimuth(30, 30)).toBeCloseTo(legacyAzimuth(30, 30), 6)

    // Everywhere in between it does not, and the gap is large enough to see in
    // a mark: a 30/60 grip was pointed 8.1 degrees off, a 20/70 one 8.4.
    expect(trueAzimuth(30, 60)).toBeCloseTo(71.57, 2)
    expect(legacyAzimuth(30, 60)).toBeCloseTo(63.43, 2)
    expect(trueAzimuth(20, 70)).toBeCloseTo(82.45, 2)
    expect(legacyAzimuth(20, 70)).toBeCloseTo(74.05, 2)
  })

  it('survives the degenerate ends the magnitude function also has to', () => {
    // A device reporting no tilt has no azimuth; 0 rather than NaN.
    expect(tiltAzimuthRad(0, 0)).toBe(0)
    // tan(90 degrees) is ~1.6e16, not Infinity — atan2 of two of those is still
    // a finite, sensible 45 degrees.
    expect(Number.isFinite(tiltAzimuthRad(90, 90))).toBe(true)
    expect(tiltAzimuthRad(90, 90) * 180 / Math.PI).toBeCloseTo(45, 6)
  })
})
