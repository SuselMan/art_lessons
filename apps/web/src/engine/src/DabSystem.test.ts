import { describe, expect, it } from 'vitest'

import { DabSystem } from './DabSystem'
import { fixedAngleShaping, LINER_DAB_SHAPING, PENCIL_DAB_SHAPING, type DabShapingProfile } from './dabShaping'

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

// Pre-corner-fix reference (see #91 corner-preserving follow-up): an exact
// copy of today's centripetal Catmull-Rom buffering + tangent math *without*
// the corner-angle tangent reduction — i.e. what DabSystem did before this
// change, always smoothing uniformly regardless of how sharp the real turn
// is. Exists only so the corner tests below can show the fix actually
// changes the sharp-corner dab positions, while the smooth-curve case is
// unaffected either way — same role `UniformReference` plays for the
// centripetal-vs-uniform comparison above.
function centripetalTangentsNoCorner(p0: Pt, p1: Pt, p2: Pt, p3: Pt): { m1: Pt; m2: Pt } {
  const knotDelta = (a: Pt, b: Pt) => Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y) ** 0.5)
  const t1 = knotDelta(p0, p1)
  const t2 = t1 + knotDelta(p1, p2)
  const t3 = t2 + knotDelta(p2, p3)
  const d10 = t1, d20 = t2, d21 = t2 - t1, d31 = t3 - t1, d32 = t3 - t2
  const m1 = {
    x: d21 * ((p1.x - p0.x) / d10 - (p2.x - p0.x) / d20 + (p2.x - p1.x) / d21),
    y: d21 * ((p1.y - p0.y) / d10 - (p2.y - p0.y) / d20 + (p2.y - p1.y) / d21),
  }
  const m2 = {
    x: d21 * ((p2.x - p1.x) / d21 - (p3.x - p1.x) / d31 + (p3.x - p2.x) / d32),
    y: d21 * ((p2.y - p1.y) / d21 - (p3.y - p1.y) / d31 + (p3.y - p2.y) / d32),
  }
  return { m1, m2 }
}

function hermitePosGeneric(p1: Pt, p2: Pt, m1: Pt, m2: Pt, t: number): Pt {
  const t2 = t * t, t3 = t2 * t
  const h00 = 2*t3 - 3*t2 + 1
  const h10 = t3 - 2*t2 + t
  const h01 = -2*t3 + 3*t2
  const h11 = t3 - t2
  return {
    x: h00*p1.x + h10*m1.x + h01*p2.x + h11*m2.x,
    y: h00*p1.y + h10*m1.y + h01*p2.y + h11*m2.y,
  }
}

function splineDabsCentripetalNoCorner(p0: Pt, p1: Pt, p2: Pt, p3: Pt, spacing: number, remainderIn: number): { dabs: Pt[]; remainderOut: number } {
  const { m1, m2 } = centripetalTangentsNoCorner(p0, p1, p2, p3)
  const STEPS = 16
  const samples: Array<{ t: number; len: number; x: number; y: number }> = [{ t: 0, len: 0, x: p1.x, y: p1.y }]
  let totalLen = 0
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS
    const pos = hermitePosGeneric(p1, p2, m1, m2, t)
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
    dabs.push(hermitePosGeneric(p1, p2, m1, m2, t))
    arcPos += spacing
  }
  const remainderOut = Math.max(0, totalLen - (arcPos - spacing))
  return { dabs, remainderOut }
}

class CentripetalNoCornerReference {
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
    const { dabs, remainderOut } = splineDabsCentripetalNoCorner(p0, p1, p2, p3, spacing, this.remainder)
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
    return splineDabsCentripetalNoCorner(p0, p1, p2, p3, spacing, this.remainder).dabs
  }
}

function feedPoints(system: DabSystem | UniformReference | CentripetalNoCornerReference, points: Pt[], baseSize: number): Pt[] {
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

describe('DabSystem.forkForPreview (#92 pointer prediction)', () => {
  it('feeding a wrong prediction into the fork never affects the original instance', () => {
    // `real` is fed real points and, at one point, forked and fed a wildly
    // wrong "predicted" point that a naive implementation might accidentally
    // let leak into the original's `_buf`/`_remainder`. `control` is fed the
    // exact same real points and never forked/predicted at all — if `real`
    // truly never mutated, continuing both with the same next real point
    // must produce identical dabs.
    const baseSize = 20
    const real    = new DabSystem()
    const control = new DabSystem()

    real.startStroke(0, 0, 1, 0, 0, baseSize)
    control.startStroke(0, 0, 1, 0, 0, baseSize)
    real.continueStroke(20, 0, 1, 0, 0, baseSize)
    control.continueStroke(20, 0, 1, 0, 0, baseSize)
    real.continueStroke(40, 0, 1, 0, 0, baseSize)
    control.continueStroke(40, 0, 1, 0, 0, baseSize)

    // Fork off `real` and feed it a bogus predicted point far off the path.
    const fork = real.forkForPreview()
    const predictedDabs = fork.continueStroke(1000, -900, 1, 0, 0, baseSize)
    expect(predictedDabs.length).toBeGreaterThan(0)
    // Sanity: the wrong prediction actually perturbed the fork's output away
    // from the (perfectly straight, y=0) real path — it only bends the
    // tangent at the segment's far endpoint (1-event lag, see the file-level
    // comment on DabSystem), so the deviation is small, but it must be
    // nonzero, otherwise this test would not be exercising anything
    // meaningful.
    expect(predictedDabs.some(d => Math.abs(d.y) > 0.01)).toBe(true)

    // Now feed both `real` and `control` the same genuine next point.
    const realDabs    = real.continueStroke(60, 0, 1, 0, 0, baseSize)
    const controlDabs = control.continueStroke(60, 0, 1, 0, 0, baseSize)

    expect(realDabs.length).toBe(controlDabs.length)
    expect(realDabs.length).toBeGreaterThan(0)
    for (let i = 0; i < realDabs.length; i++) {
      expect(realDabs[i].x).toBeCloseTo(controlDabs[i].x, 9)
      expect(realDabs[i].y).toBeCloseTo(controlDabs[i].y, 9)
    }

    // Also confirm `endStroke` (which reads the same internal buffer) agrees
    // between the two instances, as a second, independent check that no
    // fork-side state leaked into `real`.
    const realEnd    = real.endStroke(baseSize)
    const controlEnd = control.endStroke(baseSize)
    expect(realEnd.length).toBe(controlEnd.length)
    for (let i = 0; i < realEnd.length; i++) {
      expect(realEnd[i].x).toBeCloseTo(controlEnd[i].x, 9)
      expect(realEnd[i].y).toBeCloseTo(controlEnd[i].y, 9)
    }
  })

  it('the fork starts from the same state as the original at fork time', () => {
    // If a fork is fed the exact point the original would have received next
    // (i.e. the "prediction" happens to be perfectly correct), it must
    // produce exactly the dabs the original would have produced — proving
    // the fork's cloned _buf/_remainder faithfully represents the original's
    // state at the moment of forking, not some stale or empty state.
    const baseSize = 15
    const a = new DabSystem()
    const b = new DabSystem()

    a.startStroke(5, 5, 0.8, 1, 2, baseSize)
    b.startStroke(5, 5, 0.8, 1, 2, baseSize)
    a.continueStroke(25, 8, 0.8, 1, 2, baseSize)
    b.continueStroke(25, 8, 0.8, 1, 2, baseSize)
    a.continueStroke(48, 20, 0.8, 1, 2, baseSize)
    b.continueStroke(48, 20, 0.8, 1, 2, baseSize)

    const fork = a.forkForPreview()
    const forkDabs = fork.continueStroke(70, 35, 0.8, 1, 2, baseSize)
    const bDabs    = b.continueStroke(70, 35, 0.8, 1, 2, baseSize)

    expect(forkDabs.length).toBe(bDabs.length)
    expect(forkDabs.length).toBeGreaterThan(0)
    for (let i = 0; i < forkDabs.length; i++) {
      expect(forkDabs[i].x).toBeCloseTo(bDabs[i].x, 9)
      expect(forkDabs[i].y).toBeCloseTo(bDabs[i].y, 9)
    }

    // And `a` itself must still be exactly where it was before forking —
    // continuing it with the same point independently confirms `a`'s state
    // was untouched by creating (or using) the fork.
    const aDabs = a.continueStroke(70, 35, 0.8, 1, 2, baseSize)
    expect(aDabs.length).toBe(bDabs.length)
    for (let i = 0; i < aDabs.length; i++) {
      expect(aDabs[i].x).toBeCloseTo(bDabs[i].x, 9)
      expect(aDabs[i].y).toBeCloseTo(bDabs[i].y, 9)
    }
  })
})

describe('DabSystem.peekTipDabs (#104 live-tip latency reduction)', () => {
  it('returns [] before at least 2 points are buffered', () => {
    const dab = new DabSystem()
    dab.startStroke(0, 0, 1, 0, 0, 20)
    expect(dab.peekTipDabs(20)).toEqual([])
  })

  it('matches endStroke() exactly when called at the same buffer state (same math, only _remainder handling differs)', () => {
    const baseSize = 20
    const a = new DabSystem()
    const b = new DabSystem()
    const pts: Array<[number, number]> = [[0, 0], [15, 4], [33, 2], [50, 10]]

    a.startStroke(pts[0][0], pts[0][1], 1, 0, 0, baseSize)
    b.startStroke(pts[0][0], pts[0][1], 1, 0, 0, baseSize)
    for (let i = 1; i < pts.length; i++) {
      a.continueStroke(pts[i][0], pts[i][1], 1, 0, 0, baseSize)
      b.continueStroke(pts[i][0], pts[i][1], 1, 0, 0, baseSize)
    }

    const tipDabs = a.peekTipDabs(baseSize)
    const endDabs = b.endStroke(baseSize)

    expect(tipDabs.length).toBeGreaterThan(0)
    expect(tipDabs.length).toBe(endDabs.length)
    for (let i = 0; i < tipDabs.length; i++) {
      expect(tipDabs[i].x).toBeCloseTo(endDabs[i].x, 9)
      expect(tipDabs[i].y).toBeCloseTo(endDabs[i].y, 9)
    }
  })

  it('is non-mutating: calling it (once or many times) never changes what a subsequent real continueStroke/endStroke produces', () => {
    const baseSize = 20
    const withPeeks = new DabSystem()
    const control   = new DabSystem()

    withPeeks.startStroke(0, 0, 1, 0, 0, baseSize)
    control.startStroke(0, 0, 1, 0, 0, baseSize)
    withPeeks.continueStroke(20, 5, 1, 0, 0, baseSize)
    control.continueStroke(20, 5, 1, 0, 0, baseSize)

    // Peek repeatedly — must be idempotent and side-effect-free.
    const peek1 = withPeeks.peekTipDabs(baseSize)
    const peek2 = withPeeks.peekTipDabs(baseSize)
    expect(peek1.length).toBe(peek2.length)
    for (let i = 0; i < peek1.length; i++) {
      expect(peek1[i].x).toBeCloseTo(peek2[i].x, 9)
      expect(peek1[i].y).toBeCloseTo(peek2[i].y, 9)
    }

    // Now feed both instances the exact same subsequent real points and
    // confirm they stay in lockstep despite the peeks in between.
    const realDabs1    = withPeeks.continueStroke(42, 18, 1, 0, 0, baseSize)
    const controlDabs1 = control.continueStroke(42, 18, 1, 0, 0, baseSize)
    expect(realDabs1.length).toBe(controlDabs1.length)
    expect(realDabs1.length).toBeGreaterThan(0)
    for (let i = 0; i < realDabs1.length; i++) {
      expect(realDabs1[i].x).toBeCloseTo(controlDabs1[i].x, 9)
      expect(realDabs1[i].y).toBeCloseTo(controlDabs1[i].y, 9)
    }

    withPeeks.peekTipDabs(baseSize) // one more peek, must still be inert

    const endDabs1 = withPeeks.endStroke(baseSize)
    const endDabs2 = control.endStroke(baseSize)
    expect(endDabs1.length).toBe(endDabs2.length)
    for (let i = 0; i < endDabs1.length; i++) {
      expect(endDabs1[i].x).toBeCloseTo(endDabs2[i].x, 9)
      expect(endDabs1[i].y).toBeCloseTo(endDabs2[i].y, 9)
    }
  })
})

describe('DabSystem dab spacing and arc-length remainder carry-over', () => {
  it('spaces dabs evenly (`max(1, baseSize * spacingFactor)` apart) along a straight multi-segment stroke, with no gap or overlap at any continueStroke boundary', () => {
    // A straight, collinear path reduces the spline to plain linear motion in
    // x (see the "keeps a straight line perfectly straight" test above), so
    // arc length along it is easy to check: every consecutive pair of dabs
    // must be `spacing` apart in x — up to the arc-length lookup table's own
    // sampling resolution (STEPS=16 per segment, see _splineDabs), which is
    // an intentional approximation, not something a correct implementation
    // eliminates — all the way through every continueStroke() call boundary,
    // or the fix in #91's 1-event-lag buffering (or the _remainder
    // bookkeeping) is broken.
    const baseSize = 20
    const spacingFactor = 0.22
    const spacing = Math.max(1, baseSize * spacingFactor)
    const dab = new DabSystem({ spacingFactor })

    // Deliberately irregular sample spacing (simulates uneven pointer
    // sampling) so the test can't accidentally pass just because every
    // segment happens to be a clean multiple of `spacing`.
    const xs = [0, 15, 32, 55, 78, 95, 120, 150, 210]
    const dabs: Pt[] = []
    dabs.push(...dab.startStroke(xs[0], 0, 1, 0, 0, baseSize))
    for (let i = 1; i < xs.length; i++) dabs.push(...dab.continueStroke(xs[i], 0, 1, 0, 0, baseSize))
    dabs.push(...dab.endStroke(baseSize))

    expect(dabs.length).toBeGreaterThan(20)
    for (const d of dabs) expect(d.y).toBeCloseTo(0, 9)

    // Every gap must be within 1% of `spacing`, except the very last one —
    // the stroke's final partial arc-length remainder, which is always
    // <= spacing. A broken/reset _remainder would miss by a wide margin
    // (a large fraction of a full spacing step), far outside this tolerance.
    for (let i = 1; i < dabs.length - 1; i++) {
      expect(Math.abs(dabs[i].x - dabs[i - 1].x - spacing)).toBeLessThan(spacing * 0.01)
    }
    const lastGap = dabs[dabs.length - 1].x - dabs[dabs.length - 2].x
    expect(lastGap).toBeGreaterThan(0)
    expect(lastGap).toBeLessThanOrEqual(spacing * 1.01)
  })

  it('never resets spacing at a segment boundary even when a segment is much shorter than one full spacing step', () => {
    // A run of very small steps (each shorter than `spacing`) forces most
    // continueStroke() calls to return zero dabs, deferring the "carry" into
    // _remainder across several segments in a row. If _remainder were
    // (incorrectly) reset to 0 on every call instead of accumulated, dabs
    // would cluster right after each segment starts instead of staying
    // evenly spaced overall.
    const baseSize = 20
    const spacingFactor = 0.22
    const spacing = Math.max(1, baseSize * spacingFactor) // 4.4
    const dab = new DabSystem({ spacingFactor })

    const xs = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20] // steps of 2, well under spacing
    const dabs: Pt[] = []
    dabs.push(...dab.startStroke(xs[0], 0, 1, 0, 0, baseSize))
    for (let i = 1; i < xs.length; i++) dabs.push(...dab.continueStroke(xs[i], 0, 1, 0, 0, baseSize))
    dabs.push(...dab.endStroke(baseSize))

    expect(dabs.length).toBeGreaterThan(2)
    for (let i = 1; i < dabs.length - 1; i++) {
      expect(Math.abs(dabs[i].x - dabs[i - 1].x - spacing)).toBeLessThan(spacing * 0.01)
    }
  })
})

describe('DabSystem corner-preserving tangent reduction (#91 follow-up)', () => {
  it('leaves a genuinely smooth, continuously-curving path unaffected by corner detection', () => {
    // Same circular-arc configuration used above to validate the centripetal
    // fix: equal 10 degree angular steps mean every control point turns by
    // the same shallow ~10 degree angle (well under CORNER_ANGLE_START =
    // 60 degrees), so corner detection must never engage anywhere along
    // this stroke. If it's truly a no-op here, DabSystem's dabs must match
    // `CentripetalNoCornerReference` (same math, minus the corner-angle
    // tangent reduction) exactly, not just approximately.
    const R = 200
    const points: Pt[] = []
    for (let i = 0; i <= 12; i++) {
      const theta = (i * 10 * Math.PI) / 180
      points.push({ x: R * Math.cos(theta), y: R * Math.sin(theta) })
    }

    const baseSize = 20
    const withFix = new DabSystem()
    const noCorner = new CentripetalNoCornerReference()
    const fixedDabs = feedPoints(withFix, points, baseSize)
    const refDabs = feedPoints(noCorner, points, baseSize)

    expect(fixedDabs.length).toBeGreaterThan(20)
    expect(fixedDabs.length).toBe(refDabs.length)
    for (let i = 0; i < fixedDabs.length; i++) {
      expect(fixedDabs[i].x).toBeCloseTo(refDabs[i].x, 9)
      expect(fixedDabs[i].y).toBeCloseTo(refDabs[i].y, 9)
    }
  })

  it('keeps a sharp direction reversal sharp instead of rounding it into an arc', () => {
    // Simulates the real #91 symptom: a fast pointer reverses direction
    // abruptly (e.g. the tip of a quick spiral), producing few, widely
    // spaced samples either side of the corner. Path is two straight rays
    // meeting at the origin: a run along +x into the corner, then a
    // near-hairpin ~165 degree turn back out along a different ray — a
    // clean V-shaped sharp corner, deliberately built from two collinear
    // triples so "deviation from the true straight ray" is exact and cheap
    // to check (perpendicular distance from the known ray), not just an
    // approximation.
    const points: Pt[] = [
      { x: -60, y: 0 },
      { x: -30, y: 0 },
      { x: 0, y: 0 }, // the corner
      { x: -30, y: 8 },
      { x: -60, y: 16 },
    ]
    const baseSize = 20

    const withFix = new DabSystem()
    const noCorner = new CentripetalNoCornerReference()

    withFix.startStroke(points[0].x, points[0].y, 1, 0, 0, baseSize)
    noCorner.start(points[0].x, points[0].y)
    withFix.continueStroke(points[1].x, points[1].y, 1, 0, 0, baseSize)
    noCorner.continue(points[1].x, points[1].y, baseSize)

    // Renders the segment p0=(-60,0) -> p1=(-30,0): straight, no corner
    // involved yet (buffer only has 3 points, so p1's "far" neighbor is a
    // mirrored ghost point that exactly matches its own direction). Not
    // interesting for this test, just needed to advance the buffer.
    withFix.continueStroke(points[2].x, points[2].y, 1, 0, 0, baseSize)
    noCorner.continue(points[2].x, points[2].y, baseSize)

    // Renders the segment ENDING at the corner (p1=(-30,0) -> corner=(0,0)):
    // both real endpoints sit exactly on the ray y=0, so the corner's
    // tangent (m2, at the far end) is the one under test here.
    const intoCornerFixed = withFix.continueStroke(points[3].x, points[3].y, 1, 0, 0, baseSize)
    const intoCornerRef = noCorner.continue(points[3].x, points[3].y, baseSize)

    // Renders the segment STARTING at the corner (corner=(0,0) ->
    // p3=(-30,8)): the corner's tangent (m1, at the near end) is under
    // test here. p3 and p4=(-60,16) are collinear through the corner, so
    // the true path is exactly the ray from the corner through p3.
    const outOfCornerFixed = withFix.continueStroke(points[4].x, points[4].y, 1, 0, 0, baseSize)
    const outOfCornerRef = noCorner.continue(points[4].x, points[4].y, baseSize)

    expect(intoCornerFixed.length).toBeGreaterThan(0)
    expect(outOfCornerFixed.length).toBeGreaterThan(0)

    // Perpendicular distance from point p to the infinite line through a/b.
    const distToLine = (p: Pt, a: Pt, b: Pt) => {
      const vx = b.x - a.x, vy = b.y - a.y
      const len = Math.hypot(vx, vy)
      return Math.abs((p.x - a.x) * vy - (p.y - a.y) * vx) / len
    }
    const maxDist = (dabs: Pt[], a: Pt, b: Pt) => Math.max(...dabs.map(d => distToLine(d, a, b)))

    const intoCornerLineA = { x: -30, y: 0 }, intoCornerLineB = { x: 0, y: 0 }
    const fixedIntoDev = maxDist(intoCornerFixed, intoCornerLineA, intoCornerLineB)
    const refIntoDev = maxDist(intoCornerRef, intoCornerLineA, intoCornerLineB)

    // Old (no-corner) behavior visibly bulges off the straight ray as it
    // anticipates the upcoming turn; the fix keeps it essentially exact.
    expect(fixedIntoDev).toBeLessThan(0.01)
    expect(refIntoDev).toBeGreaterThan(0.3)

    const outOfCornerLineA = { x: 0, y: 0 }, outOfCornerLineB = { x: -30, y: 8 }
    const fixedOutDev = maxDist(outOfCornerFixed, outOfCornerLineA, outOfCornerLineB)
    const refOutDev = maxDist(outOfCornerRef, outOfCornerLineA, outOfCornerLineB)

    expect(fixedOutDev).toBeLessThan(0.01)
    expect(refOutDev).toBeGreaterThan(0.3)
  })
})

describe('DabSystem C1 continuity across segment boundaries', () => {
  // Smallest positive angle between two direction angles (radians), wrapped
  // into [0, PI] so e.g. comparing -179deg and +179deg reports a ~2deg
  // difference rather than ~358deg.
  function angleDelta(a: number, b: number): number {
    let d = Math.abs(a - b) % (2 * Math.PI)
    if (d > Math.PI) d = 2 * Math.PI - d
    return d
  }

  it('has no larger a jump in dab angle (tangent direction) at a continueStroke segment boundary than within a segment, on a smooth curve', () => {
    // Same shallow circular-arc configuration used for the centripetal/
    // corner-detection tests: every real point turns by the same shallow
    // ~10deg, well under CORNER_ANGLE_START, so this is a genuinely smooth,
    // continuously-curving path with no real corner anywhere. `Dab.angle`
    // (the path tangent angle, since tiltX/tiltY are 0 here) must therefore
    // change smoothly dab-to-dab, including right at the seam between one
    // continueStroke()'s output and the next's — a real C1 discontinuity
    // ("kink") would show up as an outsized jump exactly at that seam.
    const R = 200
    const points: Pt[] = []
    for (let i = 0; i <= 12; i++) {
      const theta = (i * 10 * Math.PI) / 180
      points.push({ x: R * Math.cos(theta), y: R * Math.sin(theta) })
    }
    const baseSize = 20
    const dab = new DabSystem()
    dab.startStroke(points[0].x, points[0].y, 1, 0, 0, baseSize)

    const segments: { x: number; y: number; angle: number }[][] = []
    for (let i = 1; i < points.length; i++) {
      segments.push(dab.continueStroke(points[i].x, points[i].y, 1, 0, 0, baseSize))
    }
    segments.push(dab.endStroke(baseSize))
    const nonEmpty = segments.filter(s => s.length > 1)
    expect(nonEmpty.length).toBeGreaterThan(3) // sanity: the curve actually produced several multi-dab segments

    // Largest angle jump seen strictly *within* any single segment's own dabs.
    let maxWithinSegmentJump = 0
    for (const seg of nonEmpty) {
      for (let i = 1; i < seg.length; i++) {
        maxWithinSegmentJump = Math.max(maxWithinSegmentJump, angleDelta(seg[i].angle, seg[i - 1].angle))
      }
    }

    // Jump measured right across each seam (last dab of one segment vs first
    // dab of the next) must not exceed the within-segment baseline by more
    // than a small, generous margin — a real kink would blow well past it.
    for (let s = 0; s < nonEmpty.length - 1; s++) {
      const seamJump = angleDelta(nonEmpty[s + 1][0].angle, nonEmpty[s][nonEmpty[s].length - 1].angle)
      expect(seamJump).toBeLessThanOrEqual(maxWithinSegmentJump + 0.01)
    }
  })
})

describe('DabSystem per-tool dab shaping (#240)', () => {
  // Angle is deliberately left at the shared default here (not exercised by
  // these size/aspect-focused tests) — see the #249 describe block below for
  // angle-specific coverage.
  const FLAT_SHAPING: DabShapingProfile = { size: () => 1, aspect: () => 1, angle: (_tiltMag, _tiltX, _tiltY, pathAngle) => pathAngle }
  const baseSize = 20

  it('defaults to PENCIL_DAB_SHAPING, matching the pre-#240 hardcoded formulas', () => {
    const dab = new DabSystem()
    const [d] = dab.startStroke(0, 0, 0.5, 0, 0, baseSize)
    expect(d.size).toBeCloseTo(baseSize * PENCIL_DAB_SHAPING.size(0.5))
    expect(d.aspectRatio).toBeCloseTo(PENCIL_DAB_SHAPING.aspect(0))
  })

  it('setShaping overrides size/aspect for subsequently produced dabs', () => {
    const dab = new DabSystem()
    dab.setShaping(FLAT_SHAPING)
    // Pressure 0.1 and a sharp tilt would move the default pencil curve
    // well away from 1 — FLAT_SHAPING must win regardless.
    const [d] = dab.startStroke(0, 0, 0.1, 60, 0, baseSize)
    expect(d.size).toBeCloseTo(baseSize)
    expect(d.aspectRatio).toBeCloseTo(1)
  })

  it('forkForPreview carries over the current shaping profile, not the default', () => {
    const real = new DabSystem()
    real.setShaping(FLAT_SHAPING)
    real.startStroke(0, 0, 1, 0, 0, baseSize)
    real.continueStroke(10, 0, 0.1, 60, 0, baseSize)
    real.continueStroke(20, 0, 0.1, 60, 0, baseSize)

    const fork = real.forkForPreview()
    const dabs = fork.continueStroke(30, 0, 0.1, 60, 0, baseSize)
    expect(dabs.length).toBeGreaterThan(0)
    for (const d of dabs) {
      expect(d.size).toBeCloseTo(baseSize)
      expect(d.aspectRatio).toBeCloseTo(1)
    }
  })
})

describe('DabSystem per-tool angle shaping (#249)', () => {
  const baseSize = 20

  // Bit-for-bit pin of the pre-#249 hardcoded formula in DabSystem._makeDab:
  // `tiltMag > 15 ? atan2(tiltY, tiltX) : pathAngle`. Every existing tool
  // (pencil/eraser/smudge via PENCIL_DAB_SHAPING, and liner via
  // LINER_DAB_SHAPING) must still produce exactly this angle.
  function referenceAngle(tiltX: number, tiltY: number, pathAngle: number): number {
    const tiltMag = Math.sqrt(tiltX * tiltX + tiltY * tiltY)
    return tiltMag > 15 ? Math.atan2(tiltY, tiltX) : pathAngle
  }

  it('PENCIL_DAB_SHAPING.angle reproduces the pre-#249 formula for low and high tilt', () => {
    // Low tilt (magnitude <= 15) -> falls back to path angle regardless of
    // tilt direction.
    expect(PENCIL_DAB_SHAPING.angle(10, 10, 0, 1.2345)).toBeCloseTo(referenceAngle(10, 0, 1.2345))
    expect(PENCIL_DAB_SHAPING.angle(0, 0, 0, -0.75)).toBeCloseTo(referenceAngle(0, 0, -0.75))
    // High tilt (magnitude > 15) -> tilt direction wins, path angle ignored.
    expect(PENCIL_DAB_SHAPING.angle(30, 21.21, 21.21, 1.2345)).toBeCloseTo(referenceAngle(21.21, 21.21, 1.2345))
    expect(PENCIL_DAB_SHAPING.angle(90, 0, -90, 0)).toBeCloseTo(referenceAngle(0, -90, 0))
  })

  it('LINER_DAB_SHAPING.angle uses the same default tilt-or-path formula as pencil', () => {
    const cases: Array<[number, number, number]> = [[10, 0, 1.2345], [21.21, 21.21, 1.2345], [0, -90, 0]]
    for (const [tiltX, tiltY, pathAngle] of cases) {
      const tiltMag = Math.sqrt(tiltX * tiltX + tiltY * tiltY)
      expect(LINER_DAB_SHAPING.angle(tiltMag, tiltX, tiltY, pathAngle)).toBeCloseTo(referenceAngle(tiltX, tiltY, pathAngle))
    }
  })

  it('DabSystem._makeDab produces bit-for-bit the pre-#249 angle for pencil/liner shaping via the public API', () => {
    for (const shaping of [PENCIL_DAB_SHAPING, LINER_DAB_SHAPING]) {
      const dab = new DabSystem({ shaping })
      // tiltX=30, tiltY=40 -> tiltMag=50 (> 15) -> tilt direction wins,
      // path angle (whatever it is for a stroke's first dab) is ignored.
      const [highTilt] = dab.startStroke(0, 0, 0.5, 30, 40, baseSize)
      expect(highTilt.angle).toBeCloseTo(Math.atan2(40, 30))
    }
  })

  it('DabSystem._makeDab falls back to path angle at/under the tilt threshold, matching the reference formula (via a straight-line stroke with a known tangent)', () => {
    for (const shaping of [PENCIL_DAB_SHAPING, LINER_DAB_SHAPING]) {
      const dab = new DabSystem({ shaping })
      // A straight horizontal stroke with zero tilt on every point: the
      // spline's tangent is unambiguously along +x (angle 0) everywhere,
      // including at segment boundaries, so this pins the low-tilt branch
      // without depending on Catmull-Rom internals.
      dab.startStroke(0, 0, 0.5, 0, 0, baseSize)
      dab.continueStroke(50, 0, 0.5, 0, 0, baseSize)
      // 1-event lag (see file header): a segment's dabs only materialize
      // once the *next* real point is known, so a second continueStroke is
      // needed before any land.
      const dabs = dab.continueStroke(100, 0, 0.5, 0, 0, baseSize)
      expect(dabs.length).toBeGreaterThan(0)
      for (const d of dabs) {
        expect(d.angle).toBeCloseTo(referenceAngle(0, 0, 0))
      }
    }
  })

  it('fixedAngleShaping ignores tilt and path direction entirely', () => {
    const fixed = Math.PI / 4
    const shaping: DabShapingProfile = { size: () => 1, aspect: () => 1, angle: fixedAngleShaping(fixed) }
    const dab = new DabSystem({ shaping })

    // Even with a strong, opposite-direction tilt and a real path angle,
    // the fixed angle wins.
    const [d1] = dab.startStroke(0, 0, 0.5, -90, -90, baseSize)
    expect(d1.angle).toBeCloseTo(fixed)

    dab.continueStroke(10, 10, 0.5, 0, 0, baseSize)
    const [d2] = dab.continueStroke(20, 20, 0.5, 0, 0, baseSize)
    expect(d2.angle).toBeCloseTo(fixed)
  })
})
