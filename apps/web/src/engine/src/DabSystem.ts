// Converts a pointer path into a series of brush dabs spaced along the stroke.
// Uses a centripetal Catmull-Rom spline (see #91) with 1-event lag for true
// C1 continuity (no kinks at sample points).
//
// Why 1-event lag:
//   To render segment P1→P2 smoothly we need actual P3 (not extrapolated).
//   With extrapolated P3 the tangent at P2 doesn't match the next segment → visible kinks.
//   The lag is one pointer event (~5-16ms) which is imperceptible.

import type { Dab } from '@art-lessons/shared'
import { clamp } from 'lodash-es'

interface ControlPoint {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
}

// --- Centripetal Catmull-Rom parameterization (see #91) --------------------
// Plain/uniform Catmull-Rom gives every segment the same unit knot interval
// regardless of how far apart its control points actually are in space.
// Pointer input is sampled at a fixed time-rate, so a fast stroke (e.g. a
// quick round spiral) produces widely, *unevenly* spaced points relative to
// slower parts of the same stroke. Uniform parameterization handles uneven
// spacing poorly: the fitted curve under-curves across the wide gaps between
// sparse fast-stroke samples, so a genuinely smooth, continuously-curving
// path ends up looking like a faceted polyline with rounded-off corners —
// not because any point is a real corner, but because the tangent estimate
// at each point is a poor fit when neighboring segment lengths differ a lot.
//
// Centripetal parameterization (knot spacing proportional to |ΔP|^alpha,
// alpha = 0.5) is the standard, well-established fix for exactly this
// problem (Yuksel, Schaefer & Keyser 2011, "On the Parameterization of
// Catmull-Rom Curves"): centripetal curves provably never form cusps or
// self-intersections for any control-point configuration, and — because the
// tangent formula below is invariant to uniform rescaling of the knot
// values — this reduces to *exactly* today's fixed-tangent behavior whenever
// the four points happen to already be evenly spaced. alpha = 0 would be
// today's uniform parameterization; alpha = 1 ("chordal") overcorrects and
// re-introduces its own overshoot on some configurations — 0.5 is the
// standard middle ground.
const CENTRIPETAL_ALPHA = 0.5
const MIN_KNOT_DELTA = 1e-6 // guards divide-by-zero if two control points coincide

export class DabSystem {
  spacingFactor: number
  private _buf: ControlPoint[]
  private _remainder: number

  constructor({ spacingFactor = 0.22 }: { spacingFactor?: number } = {}) {
    this.spacingFactor = spacingFactor
    this._buf = []
    this._remainder = 0
  }

  private _reset(): void {
    this._buf = []
    this._remainder = 0
  }

  // Non-mutating fork for speculative pointer prediction (#92): clones the
  // current control-point buffer and arc-length remainder into a fresh
  // DabSystem so predicted points can be fed through the exact same spline/
  // spacing math (for visual consistency with real dabs) without ever
  // touching this instance's `_buf`/`_remainder`. A wrong prediction must
  // never corrupt the curve fit used for the next *real* segment — the
  // caller is expected to discard the fork after use (typically once per
  // pointermove, re-forking fresh from the real, now-updated state each
  // time) rather than keep feeding it more real points.
  forkForPreview(): DabSystem {
    const fork = new DabSystem({ spacingFactor: this.spacingFactor })
    fork._buf = this._buf.map(p => ({ ...p }))
    fork._remainder = this._remainder
    return fork
  }

  // Returns first dab; subsequent segment rendering is deferred by 1 event.
  startStroke(x: number, y: number, pressure: number, tiltX: number, tiltY: number, baseSize: number): Dab[] {
    this._reset()
    this._buf = [{ x, y, pressure, tiltX, tiltY }]
    return [this._makeDab(x, y, pressure, tiltX, tiltY, baseSize, 0)]
  }

  // Returns dabs for the segment one step behind the current point.
  // Segment [n-3]→[n-2] is rendered once [n-1] (=P3) is known.
  continueStroke(x: number, y: number, pressure: number, tiltX: number, tiltY: number, baseSize: number): Dab[] {
    this._buf.push({ x, y, pressure, tiltX, tiltY })
    const n = this._buf.length

    if (n < 3) return [] // need at least 3 pts to define a segment

    const p0 = n >= 4 ? this._buf[n - 4] : mirrorBefore(this._buf[n - 3], this._buf[n - 2])
    const p1 = this._buf[n - 3]
    const p2 = this._buf[n - 2]
    const p3 = this._buf[n - 1]

    if (n > 4) this._buf.shift() // keep buffer at max 4

    const dx = p2.x - p1.x, dy = p2.y - p1.y
    if (Math.hypot(dx, dy) < 0.5) return []

    return this._splineDabs(p0, p1, p2, p3, baseSize)
  }

  // Must be called on pointerup to flush the last pending segment.
  endStroke(baseSize: number): Dab[] {
    const n = this._buf.length
    if (n < 2) return []

    const p1 = this._buf[n - 2]
    const p2 = this._buf[n - 1]
    const p0 = n >= 3 ? this._buf[n - 3] : mirrorBefore(p1, p2)
    // Extrapolate P3 only at end — no alternative here
    const p3: ControlPoint = { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y, pressure: p2.pressure, tiltX: p2.tiltX, tiltY: p2.tiltY }

    const dx = p2.x - p1.x, dy = p2.y - p1.y
    if (Math.hypot(dx, dy) < 0.5) return []

    return this._splineDabs(p0, p1, p2, p3, baseSize)
  }

  private _splineDabs(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, baseSize: number): Dab[] {
    // Centripetal tangents at the segment's two endpoints (see #91 constants
    // above). These reduce algebraically to the standard fixed Catmull-Rom
    // tangents (P2-P0)/2 and (P3-P1)/2 whenever p0..p3 are evenly spaced.
    const { m1, m2 } = centripetalTangents(p0, p1, p2, p3)

    // Arc-length lookup table for uniform dab spacing along the curve
    const STEPS = 16
    const samples: Array<{ t: number; len: number; x: number; y: number }> = [{ t: 0, len: 0, x: p1.x, y: p1.y }]
    let totalLen = 0

    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS
      const pos = hermitePos(p1, p2, m1, m2, t)
      const prev = samples[i - 1]
      totalLen += Math.hypot(pos.x - prev.x, pos.y - prev.y)
      samples.push({ t, len: totalLen, x: pos.x, y: pos.y })
    }

    if (totalLen < 0.001) return []

    const spacing = Math.max(1, baseSize * this.spacingFactor)
    const dabs: Dab[] = []
    let arcPos = spacing - this._remainder
    let si = 0

    while (arcPos <= totalLen + 1e-6) {
      while (si < STEPS - 1 && samples[si + 1].len < arcPos) si++

      const s0 = samples[si]
      const s1 = samples[si + 1]
      const frac = s1.len > s0.len ? (arcPos - s0.len) / (s1.len - s0.len) : 0
      const t = s0.t + frac * (s1.t - s0.t)

      const pos      = hermitePos(p1, p2, m1, m2, t)
      const pressure = clamp(crScalar(p0.pressure, p1.pressure, p2.pressure, p3.pressure, t), 0, 1)
      const tiltX    = crScalar(p0.tiltX, p1.tiltX, p2.tiltX, p3.tiltX, t)
      const tiltY    = crScalar(p0.tiltY, p1.tiltY, p2.tiltY, p3.tiltY, t)
      const tan      = hermiteTangent(p1, p2, m1, m2, t)

      dabs.push(this._makeDab(pos.x, pos.y, pressure, tiltX, tiltY, baseSize, Math.atan2(tan.y, tan.x)))
      arcPos += spacing
    }

    this._remainder = Math.max(0, totalLen - (arcPos - spacing))
    return dabs
  }

  private _makeDab(x: number, y: number, pressure: number, tiltX: number, tiltY: number, baseSize: number, pathAngle: number): Dab {
    const tiltMag    = Math.sqrt(tiltX * tiltX + tiltY * tiltY)
    const size       = baseSize * (0.3 + 0.7 * pressure)
    const tiltNorm   = tiltMag / 90
    const aspectRatio = 1 + tiltNorm * tiltNorm * 2.0
    const angle      = tiltMag > 15 ? Math.atan2(tiltY, tiltX) : pathAngle
    // opacity is geometric-neutral here; the engine bakes the final value
    // (preset × user opacity × speed) before rendering and recording
    return { x, y, pressure, tiltX, tiltY, size, aspectRatio, angle, opacity: 1 }
  }
}

// Ghost point mirrored before p1 (used when no real predecessor exists)
function mirrorBefore(p1: ControlPoint, p2: ControlPoint): ControlPoint {
  return { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y, pressure: p1.pressure, tiltX: p1.tiltX, tiltY: p1.tiltY }
}

function crScalar(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t2 + (-a+3*b-3*c+d)*t3)
}

// Knot interval between two consecutive control points, per CENTRIPETAL_ALPHA.
function knotDelta(a: ControlPoint, b: ControlPoint): number {
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  return Math.max(MIN_KNOT_DELTA, dist ** CENTRIPETAL_ALPHA)
}

// Non-uniform (centripetal) Catmull-Rom tangents at p1 and p2, derived from
// the actual knot spacing t0..t3 rather than assuming t = 0,1,2,3. Standard
// formula (Yuksel et al. 2011):
//   m1 = (t2-t1) * [ (p1-p0)/(t1-t0) - (p2-p0)/(t2-t0) + (p2-p1)/(t2-t1) ]
//   m2 = (t2-t1) * [ (p2-p1)/(t2-t1) - (p3-p1)/(t3-t1) + (p3-p2)/(t3-t2) ]
// This is scale-invariant under uniform rescaling of the knot values, so
// when p0..p3 are evenly spaced (t_i = i * k for any k) it reduces exactly
// to the fixed Catmull-Rom tangents (p2-p0)/2 and (p3-p1)/2.
function centripetalTangents(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint): { m1: { x: number; y: number }; m2: { x: number; y: number } } {
  const t1 = knotDelta(p0, p1)
  const t2 = t1 + knotDelta(p1, p2)
  const t3 = t2 + knotDelta(p2, p3)
  // t0 = 0
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

// Cubic Hermite basis, parameterized by endpoint positions p1/p2 and their
// tangents m1/m2 (parameterization-agnostic: works for both the plain fixed
// Catmull-Rom tangent and the centripetal one computed above).
function hermitePos(p1: ControlPoint, p2: ControlPoint, m1: { x: number; y: number }, m2: { x: number; y: number }, t: number): { x: number; y: number } {
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

function hermiteTangent(p1: ControlPoint, p2: ControlPoint, m1: { x: number; y: number }, m2: { x: number; y: number }, t: number): { x: number; y: number } {
  const t2 = t * t
  const dh00 = 6*t2 - 6*t
  const dh10 = 3*t2 - 4*t + 1
  const dh01 = -6*t2 + 6*t
  const dh11 = 3*t2 - 2*t
  return {
    x: dh00*p1.x + dh10*m1.x + dh01*p2.x + dh11*m2.x,
    y: dh00*p1.y + dh10*m1.y + dh01*p2.y + dh11*m2.y,
  }
}
