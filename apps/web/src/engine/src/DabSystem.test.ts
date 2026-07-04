import { describe, expect, it } from 'vitest'

import { DabSystem } from './DabSystem'

// Geometry-focused tests for the #91 centripetal Catmull-Rom fix.
//
// Real symptom: a fast, tight round stroke (e.g. a quick spiral) is sampled
// at a fixed time-rate, so it produces widely AND unevenly spaced points
// relative to slower parts of the same stroke. The old uniform-parameterized
// Catmull-Rom handles that unevenness poorly and under-curves across the
// wide gaps, so a genuinely continuous curve looks like a faceted polyline
// with rounded-off corners — even though no point is a real corner.
//
// DabSystem's tangent math is private, so these tests drive the real public
// API (startStroke / continueStroke / endStroke) with hand-picked point
// sequences and inspect the resulting dab positions. `UniformReference`
// below is a deliberately-preserved copy of the pre-#91 uniform-parameterized
// buffering + Catmull-Rom math — it exists only so these tests can quantify
// "better than the old uniform behavior"; it is not used by the engine.

interface Pt { x: number; y: number }

function mirrorBefore(p1: Pt, p2: Pt): Pt {
  return { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y }
}

function crPosUniform(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t, t3 = t2 * t
  return {
    x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
  }
}

function splineDabsUniform(p0: Pt, p1: Pt, p2: Pt, p3: Pt, spacing: number, remainderIn: number): { dabs: Pt[]; remainderOut: number } {
  const STEPS = 16
  const samples: Array<{ t: number; len: number; x: number; y: number }> = [{ t: 0, len: 0, x: p1.x, y: p1.y }]
  let totalLen = 0
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS
    const pos = crPosUniform(p0, p1, p2, p3, t)
    const prev = samples[i - 1]
    totalLen += Math.hypot(pos.x - prev.x, pos.y - prev.y)
    samples.push({ t, len: totalLen, x: pos.x, y: pos.y })
  }
  if (totalLen < 0.001) return { dabs: [], remainderOut: remainderIn }

  const dabs: Pt[] = []
  let arcPos = spacing - remainderIn
  let si = 0
  while (arcPos <= totalLen + 1e-6) {
    while (si < STEPS - 1 && samples[si + 1].len < arcPos) si++
    const s0 = samples[si]
    const s1 = samples[si + 1]
    const frac = s1.len > s0.len ? (arcPos - s0.len) / (s1.len - s0.len) : 0
    const t = s0.t + frac * (s1.t - s0.t)
    dabs.push(crPosUniform(p0, p1, p2, p3, t))
    arcPos += spacing
  }
  const remainderOut = Math.max(0, totalLen - (arcPos - spacing))
  return { dabs, remainderOut }
}

// Pre-#91 buffering, reproduced exactly (see DabSystem's startStroke /
// continueStroke / endStroke), but with the fixed/uniform (alpha = 0)
// Catmull-Rom tangent formula instead of the centripetal one.
class UniformReference {
  private buf: Pt[] = []
  private remainder = 0

  start(x: number, y: number): Pt[] {
    this.buf = [{ x, y }]
    this.remainder = 0
    return [{ x, y }]
  }

  continue(x: number, y: number, baseSize: number, spacingFactor = 0.22): Pt[] {
    this.buf.push({ x, y })
    const n = this.buf.length
    if (n < 3) return []

    const p0 = n >= 4 ? this.buf[n - 4] : mirrorBefore(this.buf[n - 3], this.buf[n - 2])
    const p1 = this.buf[n - 3]
    const p2 = this.buf[n - 2]
    const p3 = this.buf[n - 1]
    if (n > 4) this.buf.shift()

    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.5) return []

    const spacing = Math.max(1, baseSize * spacingFactor)
    const { dabs, remainderOut } = splineDabsUniform(p0, p1, p2, p3, spacing, this.remainder)
    this.remainder = remainderOut
    return dabs
  }

  end(baseSize: number, spacingFactor = 0.22): Pt[] {
    const n = this.buf.length
    if (n < 2) return []
    const p1 = this.buf[n - 2]
    const p2 = this.buf[n - 1]
    const p0 = n >= 3 ? this.buf[n - 3] : mirrorBefore(p1, p2)
    const p3: Pt = { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y }
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.5) return []

    const spacing = Math.max(1, baseSize * spacingFactor)
    return splineDabsUniform(p0, p1, p2, p3, spacing, this.remainder).dabs
  }
}

function feedPoints(system: DabSystem | UniformReference, points: Pt[], baseSize: number): Pt[] {
  const dabs: Pt[] = []
  if (system instanceof DabSystem) {
    dabs.push(...system.startStroke(points[0].x, points[0].y, 1, 0, 0, baseSize))
    for (let i = 1; i < points.length; i++) dabs.push(...system.continueStroke(points[i].x, points[i].y, 1, 0, 0, baseSize))
    dabs.push(...system.endStroke(baseSize))
  } else {
    dabs.push(...system.start(points[0].x, points[0].y))
    for (let i = 1; i < points.length; i++) dabs.push(...system.continue(points[i].x, points[i].y, baseSize))
    dabs.push(...system.end(baseSize))
  }
  return dabs
}

describe('DabSystem centripetal Catmull-Rom (#91)', () => {
  it('keeps a straight line perfectly straight', () => {
    const dab = new DabSystem()
    const baseSize = 20
    const pts: Pt[] = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 }, { x: 60, y: 0 }, { x: 80, y: 0 }, { x: 100, y: 0 }]
    const dabs = feedPoints(dab, pts, baseSize)

    expect(dabs.length).toBeGreaterThan(5)
    for (const d of dabs) expect(d.y).toBeCloseTo(0, 9)
  })

  it('reproduces the pre-#91 uniform output exactly for evenly-spaced points (no regression)', () => {
    const R = 200
    const points: Pt[] = []
    for (let i = 0; i <= 12; i++) {
      const theta = (i * 10 * Math.PI) / 180
      points.push({ x: R * Math.cos(theta), y: R * Math.sin(theta) })
    }
    // Equal angular steps on a circle -> equal chord lengths -> centripetal
    // knot spacing is exactly proportional to uniform knot spacing, so the
    // two formulas must agree exactly (see centripetalTangents' scale-
    // invariance comment in DabSystem.ts).
    const chordLens = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
    for (const len of chordLens) expect(len).toBeCloseTo(chordLens[0], 9)

    const baseSize = 20
    const real = new DabSystem()
    const ref = new UniformReference()
    const realDabs = feedPoints(real, points, baseSize)
    const refDabs = feedPoints(ref, points, baseSize)

    expect(realDabs.length).toBeGreaterThan(20)
    expect(realDabs.length).toBe(refDabs.length)
    for (let i = 0; i < realDabs.length; i++) {
      expect(realDabs[i].x).toBeCloseTo(refDabs[i].x, 6)
      expect(realDabs[i].y).toBeCloseTo(refDabs[i].y, 6)
    }
  })

  it('tracks a true circular arc much more closely than uniform Catmull-Rom when samples are sparse and unevenly spaced (fast-spiral simulation)', () => {
    // Simulates a fast pointer moving through a round shape at a fixed
    // sample-rate: dense sampling (10 degree steps) while slow, then one
    // long, sparse jump (80 degrees) while fast, then dense again.
    const R = 200
    const anglesDeg = [0, 10, 20, 100, 110, 120]
    const points: Pt[] = anglesDeg.map(deg => {
      const rad = (deg * Math.PI) / 180
      return { x: R * Math.cos(rad), y: R * Math.sin(rad) }
    })

    const baseSize = 30

    // The 4th continueStroke call is the one that renders the segment
    // spanning the big 80 degree gap (control points at 10, 20, 100, 110
    // degrees; interpolated segment is 20 degrees -> 100 degrees).
    const real = new DabSystem()
    real.startStroke(points[0].x, points[0].y, 1, 0, 0, baseSize)
    real.continueStroke(points[1].x, points[1].y, 1, 0, 0, baseSize)
    real.continueStroke(points[2].x, points[2].y, 1, 0, 0, baseSize)
    real.continueStroke(points[3].x, points[3].y, 1, 0, 0, baseSize)
    const newGapDabs = real.continueStroke(points[4].x, points[4].y, 1, 0, 0, baseSize)

    const ref = new UniformReference()
    ref.start(points[0].x, points[0].y)
    ref.continue(points[1].x, points[1].y, baseSize)
    ref.continue(points[2].x, points[2].y, baseSize)
    ref.continue(points[3].x, points[3].y, baseSize)
    const oldGapDabs = ref.continue(points[4].x, points[4].y, baseSize)

    expect(newGapDabs.length).toBeGreaterThan(2)
    expect(oldGapDabs.length).toBeGreaterThan(2)

    // Deviation from the true circle radius: 0 would mean the fitted curve
    // sits exactly on the true circle at that point. Faceting/under-curving
    // across the wide gap shows up as a large deviation.
    const maxRadialDeviation = (dabs: Pt[]) => Math.max(...dabs.map(d => Math.abs(Math.hypot(d.x, d.y) - R)))

    const newDeviation = maxRadialDeviation(newGapDabs)
    const oldDeviation = maxRadialDeviation(oldGapDabs)

    // Empirically ~21% smaller peak deviation for this configuration; assert
    // a conservative meaningful margin rather than the exact figure so the
    // test doesn't become brittle to minor formula tweaks.
    expect(newDeviation).toBeLessThan(oldDeviation * 0.9)
  })
})
