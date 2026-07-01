// Converts a pointer path into a series of brush dabs spaced along the stroke.
// Uses Catmull-Rom spline with 1-event lag for true C1 continuity (no kinks at sample points).
//
// Why 1-event lag:
//   To render segment P1→P2 smoothly we need actual P3 (not extrapolated).
//   With extrapolated P3 the tangent at P2 doesn't match the next segment → visible kinks.
//   The lag is one pointer event (~5-16ms) which is imperceptible.

import type { Dab } from '@art-lessons/shared'
import { clamp01 } from '../../lib/math'

interface ControlPoint {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
}

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
    // Arc-length lookup table for uniform dab spacing along the curve
    const STEPS = 16
    const samples: Array<{ t: number; len: number; x: number; y: number }> = [{ t: 0, len: 0, x: p1.x, y: p1.y }]
    let totalLen = 0

    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS
      const pos = crPos(p0, p1, p2, p3, t)
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

      const pos      = crPos(p0, p1, p2, p3, t)
      const pressure = clamp01(crScalar(p0.pressure, p1.pressure, p2.pressure, p3.pressure, t))
      const tiltX    = crScalar(p0.tiltX, p1.tiltX, p2.tiltX, p3.tiltX, t)
      const tiltY    = crScalar(p0.tiltY, p1.tiltY, p2.tiltY, p3.tiltY, t)
      const tan      = crTangent(p0, p1, p2, p3, t)

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
    return { x, y, pressure, tiltX, tiltY, size, aspectRatio, angle }
  }
}

// Ghost point mirrored before p1 (used when no real predecessor exists)
function mirrorBefore(p1: ControlPoint, p2: ControlPoint): ControlPoint {
  return { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y, pressure: p1.pressure, tiltX: p1.tiltX, tiltY: p1.tiltY }
}

function crPos(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, t: number): { x: number; y: number } {
  const t2 = t * t, t3 = t2 * t
  return {
    x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
  }
}

function crTangent(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, t: number): { x: number; y: number } {
  const t2 = t * t
  return {
    x: 0.5 * ((-p0.x+p2.x) + 2*(2*p0.x-5*p1.x+4*p2.x-p3.x)*t + 3*(-p0.x+3*p1.x-3*p2.x+p3.x)*t2),
    y: 0.5 * ((-p0.y+p2.y) + 2*(2*p0.y-5*p1.y+4*p2.y-p3.y)*t + 3*(-p0.y+3*p1.y-3*p2.y+p3.y)*t2),
  }
}

function crScalar(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t2 + (-a+3*b-3*c+d)*t3)
}
