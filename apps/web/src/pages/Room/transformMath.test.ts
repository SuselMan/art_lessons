import { describe, it, expect } from 'vitest'

import {
  IDENTITY_MATRIX, translateMatrix, scaleAxisMatrix, skewAxisMatrix, rotateAboutMatrix,
  composeMatrix, invertMatrix, applyMatrix, isIdentityMatrix,
  transformGestureKind, isNegligibleTransform, type AffineMatrix,
} from './transformMath'

const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps)
const nearPoint = (p: { x: number; y: number }, x: number, y: number, eps = 1e-9) => {
  near(p.x, x, eps)
  near(p.y, y, eps)
}

describe('composeMatrix', () => {
  it('applies the inner matrix first, then the outer one', () => {
    const inner = translateMatrix(10, 0)
    const outer = scaleAxisMatrix(2, 2, 0, 0)
    // (5,0) -> translate -> (15,0) -> scale about origin -> (30,0).
    nearPoint(applyMatrix(composeMatrix(outer, inner), 5, 0), 30, 0)
    // Order matters: the other way scales first (10,0) then translates (20,0).
    nearPoint(applyMatrix(composeMatrix(inner, outer), 5, 0), 20, 0)
  })

  it('is what "apply each gesture in turn" means for a point', () => {
    // This is the property the session relies on: composing the gestures and
    // mapping once must equal mapping through each gesture in order.
    const g1 = rotateAboutMatrix(Math.PI / 6, 100, 100)
    const g2 = translateMatrix(-40, 25)
    const g3 = scaleAxisMatrix(1.5, 0.5, 100, 100)
    const session = composeMatrix(g3, composeMatrix(g2, g1))
    const after1 = applyMatrix(g1, 12, 34)
    const after2 = applyMatrix(g2, after1.x, after1.y)
    const stepwise = applyMatrix(g3, after2.x, after2.y)
    nearPoint(applyMatrix(session, 12, 34), stepwise.x, stepwise.y)
  })

  it('leaves a matrix alone when composed with the identity', () => {
    const m = rotateAboutMatrix(0.7, 5, -9)
    expect(composeMatrix(IDENTITY_MATRIX, m)).toEqual(m)
    composeMatrix(m, IDENTITY_MATRIX).forEach((v, i) => near(v, m[i]))
  })
})

// The invariant a move/scale/rotate gizmo owes the user: the frame is always a
// rectangle. It holds only if scaling composes *inside* the accumulated matrix
// (the handles pull along the frame's own axes) and rotation composes
// *outside* (turning the frame is rigid). Get that backwards and a squash
// followed by a turn becomes a shear — Room's handleTransformHandleDown picks
// the side per gesture for exactly this reason.
describe('session composition keeps the frame rectangular', () => {
  const BOUNDS = { x: 100, y: 200, width: 400, height: 300 }
  const corners = (m: AffineMatrix) => [
    applyMatrix(m, BOUNDS.x, BOUNDS.y),
    applyMatrix(m, BOUNDS.x + BOUNDS.width, BOUNDS.y),
    applyMatrix(m, BOUNDS.x + BOUNDS.width, BOUNDS.y + BOUNDS.height),
    applyMatrix(m, BOUNDS.x, BOUNDS.y + BOUNDS.height),
  ]
  /** Largest deviation from a right angle at any corner, in radians. */
  const worstCornerError = (m: AffineMatrix) => {
    const c = corners(m)
    let worst = 0
    for (let i = 0; i < 4; i++) {
      const prev = c[(i + 3) % 4], here = c[i], next = c[(i + 1) % 4]
      const ax = prev.x - here.x, ay = prev.y - here.y
      const bx = next.x - here.x, by = next.y - here.y
      const cosine = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by))
      worst = Math.max(worst, Math.abs(Math.acos(Math.min(1, Math.max(-1, cosine))) - Math.PI / 2))
    }
    return worst
  }
  // How Room accumulates a gesture: scales fold in, rotations wrap around.
  const scaleGesture = (m: AffineMatrix, sx: number, sy: number) =>
    composeMatrix(m, scaleAxisMatrix(sx, sy, BOUNDS.x, BOUNDS.y))
  const rotateGesture = (m: AffineMatrix, rad: number) => {
    const c = applyMatrix(m, BOUNDS.x + BOUNDS.width / 2, BOUNDS.y + BOUNDS.height / 2)
    return composeMatrix(rotateAboutMatrix(rad, c.x, c.y), m)
  }

  it('stays rectangular through squash then rotate — the reported case', () => {
    const squashed = scaleGesture(IDENTITY_MATRIX, 0.35, 1)
    expect(worstCornerError(rotateGesture(squashed, 0.6))).toBeLessThan(1e-9)
  })

  it('stays rectangular through squash, rotate, squash, rotate', () => {
    let m = scaleGesture(IDENTITY_MATRIX, 0.35, 1)
    m = rotateGesture(m, 0.6)
    m = scaleGesture(m, 1, 2.4)
    m = rotateGesture(m, -1.9)
    expect(worstCornerError(m)).toBeLessThan(1e-9)
  })

  // Guards the actual mistake rather than just asserting the fix: folding a
  // rotation *inside* an existing non-uniform scale shears the frame, and by a
  // wide margin — 15 degrees off square for this one.
  it('shears if a rotation is composed inside a non-uniform scale', () => {
    const squashed = scaleGesture(IDENTITY_MATRIX, 0.35, 1)
    const wrong = composeMatrix(squashed, rotateAboutMatrix(0.6, BOUNDS.x, BOUNDS.y))
    expect(worstCornerError(wrong)).toBeGreaterThan(0.25)
  })
})

// Rotate & Skew's edge handles (#391). The properties that matter to the user
// are geometric, not algebraic: the opposite edge must not move, the grabbed
// one must follow the pointer, and the layer must keep its area (a skew slants
// a rectangle into a parallelogram — it never stretches it).
describe('skewAxisMatrix', () => {
  const BOUNDS = { x: 100, y: 200, width: 400, height: 300 }
  const bottom = BOUNDS.y + BOUNDS.height
  const right = BOUNDS.x + BOUNDS.width

  it('pins the fixed line and slides everything else in proportion to its distance', () => {
    // Dragging the top edge right: the bottom edge (y = fixedY) is the anchor.
    // The shear is negative because the top edge sits *above* the anchor —
    // Room measures it as (pointer travel) / (signed distance to the anchor),
    // so this sign falls out of the gesture rather than being chosen.
    const m = skewAxisMatrix(-0.5, 0, 0, bottom)
    nearPoint(applyMatrix(m, BOUNDS.x, bottom), BOUNDS.x, bottom)      // anchor: unmoved
    nearPoint(applyMatrix(m, right, bottom), right, bottom)
    // The top edge is 300px away, so it slides 0.5*300 = 150px.
    nearPoint(applyMatrix(m, BOUNDS.x, BOUNDS.y), BOUNDS.x + 150, BOUNDS.y)
    // Halfway up slides half as far — that proportionality is the shear.
    nearPoint(applyMatrix(m, BOUNDS.x, bottom - 150), BOUNDS.x + 75, bottom - 150)
  })

  it('shears the other axis about a vertical line, mirroring the first', () => {
    // Dragging the left edge down: the right edge is the anchor.
    const m = skewAxisMatrix(0, -0.25, right, 0)
    nearPoint(applyMatrix(m, right, BOUNDS.y), right, BOUNDS.y)
    nearPoint(applyMatrix(m, BOUNDS.x, BOUNDS.y), BOUNDS.x, BOUNDS.y + 100) // -0.25 * -400
  })

  it('leaves a single-axis shear area-preserving and invertible', () => {
    for (const shear of [0.3, -2.5, 20]) {
      const [a, b, c, d] = skewAxisMatrix(shear, 0, 0, bottom)
      near(a * d - b * c, 1)
      expect(invertMatrix(skewAxisMatrix(0, shear, right, 0))).not.toBeNull()
    }
  })

  it('is the identity for a zero shear', () => {
    // Component-wise: the translation terms come out as -0, which is the
    // identity everywhere except in toEqual's eyes.
    skewAxisMatrix(0, 0, 123, 456).forEach((v, i) => near(v, IDENTITY_MATRIX[i]))
  })

  // What a skew is *for*: the rectangle slants into a parallelogram. Opposite
  // sides stay parallel and equal — which is exactly what the frame stops
  // being if the shear ever leaks into the scale terms.
  it('turns the frame into a parallelogram, never a trapezoid', () => {
    const m = skewAxisMatrix(0.75, 0, 0, bottom)
    const c = [
      applyMatrix(m, BOUNDS.x, BOUNDS.y), applyMatrix(m, right, BOUNDS.y),
      applyMatrix(m, right, bottom), applyMatrix(m, BOUNDS.x, bottom),
    ]
    // side 0→1 vs side 3→2 (the two horizontals), and 1→2 vs 0→3.
    near(c[1].x - c[0].x, c[2].x - c[3].x)
    near(c[1].y - c[0].y, c[2].y - c[3].y)
    near(c[2].x - c[1].x, c[3].x - c[0].x)
    near(c[2].y - c[1].y, c[3].y - c[0].y)
    // The horizontals keep their original length: only the verticals slant.
    near(Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y), BOUNDS.width)
  })
})

describe('transformGestureKind (#391)', () => {
  it('gives the edge handles their mode-dependent meaning and nothing else does', () => {
    for (const handle of ['t', 'b'] as const) {
      expect(transformGestureKind(handle, 'free')).toBe('scale')
      expect(transformGestureKind(handle, 'rotateSkew')).toBe('skewX')
    }
    for (const handle of ['l', 'r'] as const) {
      expect(transformGestureKind(handle, 'free')).toBe('scale')
      expect(transformGestureKind(handle, 'rotateSkew')).toBe('skewY')
    }
  })

  it('keeps corners scaling, rings rotating and the body moving in both modes', () => {
    for (const mode of ['free', 'rotateSkew'] as const) {
      for (const handle of ['tl', 'tr', 'bl', 'br'] as const) {
        expect(transformGestureKind(handle, mode)).toBe('scale')
      }
      for (const handle of ['rotate-tl', 'rotate-tr', 'rotate-bl', 'rotate-br'] as const) {
        expect(transformGestureKind(handle, mode)).toBe('rotate')
      }
      expect(transformGestureKind('body', mode)).toBe('move')
    }
  })
})

describe('isNegligibleTransform', () => {
  it('drops a click on any handle', () => {
    expect(isNegligibleTransform('move', IDENTITY_MATRIX)).toBe(true)
    expect(isNegligibleTransform('rotate', IDENTITY_MATRIX)).toBe(true)
    expect(isNegligibleTransform('scale', IDENTITY_MATRIX)).toBe(true)
    expect(isNegligibleTransform('skewX', IDENTITY_MATRIX)).toBe(true)
    expect(isNegligibleTransform('skewY', IDENTITY_MATRIX)).toBe(true)
  })

  it('keeps a real move, rotation and scale', () => {
    expect(isNegligibleTransform('move', translateMatrix(3, 0))).toBe(false)
    expect(isNegligibleTransform('rotate', rotateAboutMatrix(0.05, 200, 100))).toBe(false)
    expect(isNegligibleTransform('scale', scaleAxisMatrix(1.4, 1, 0, 0))).toBe(false)
  })

  // The regression this rewrite exists for: a shear leaves both scale terms at
  // exactly 1, so the scale test an edge handle used to get unconditionally
  // called every skew in the world a no-op and threw it away.
  it('keeps a skew that the scale test would have thrown away', () => {
    const skew = skewAxisMatrix(0.4, 0, 0, 500)
    expect(isNegligibleTransform('skewX', skew)).toBe(false)
    expect(isNegligibleTransform('scale', skew)).toBe(true) // what the old code asked
  })

  // Same shape of mistake on the other side: Free transform's corner drag
  // scales the axes independently, so "did scaleX move?" is not the question.
  it('keeps a corner drag that only moved one axis', () => {
    expect(isNegligibleTransform('scale', scaleAxisMatrix(1, 1.6, 0, 0))).toBe(false)
  })

  it('does not mistake one gesture\'s leftovers for another\'s', () => {
    // A pure shearX has no shearY component, and vice versa.
    expect(isNegligibleTransform('skewY', skewAxisMatrix(0.4, 0, 0, 500))).toBe(true)
    expect(isNegligibleTransform('skewX', skewAxisMatrix(0, 0.4, 500, 0))).toBe(true)
  })
})

describe('invertMatrix', () => {
  it('round-trips a point through a rotation, scale and translation', () => {
    const m = composeMatrix(
      rotateAboutMatrix(-1.1, 250, 80),
      composeMatrix(scaleAxisMatrix(3, 0.4, 10, 20), translateMatrix(70, -15)),
    )
    const inv = invertMatrix(m)
    expect(inv).not.toBeNull()
    const p = applyMatrix(m, 33, 44)
    nearPoint(applyMatrix(inv!, p.x, p.y), 33, 44, 1e-6)
  })

  it('composes with its own matrix to the identity', () => {
    const m = rotateAboutMatrix(0.42, 12, 34)
    composeMatrix(invertMatrix(m)!, m).forEach((v, i) => near(v, IDENTITY_MATRIX[i], 1e-9))
  })

  // A collapsed axis has no inverse — the gesture-to-local-space conversion
  // has to skip rather than produce Infinity/NaN coordinates.
  it('returns null for a degenerate matrix', () => {
    expect(invertMatrix([0, 0, 0, 0, 0, 0])).toBeNull()
    expect(invertMatrix(scaleAxisMatrix(1, 0, 0, 0))).toBeNull()
  })
})

describe('isIdentityMatrix', () => {
  it('accepts the identity and sub-pixel jitter', () => {
    expect(isIdentityMatrix(IDENTITY_MATRIX)).toBe(true)
    expect(isIdentityMatrix(translateMatrix(0.2, -0.3))).toBe(true)
  })

  it('rejects a real move, scale or rotation', () => {
    expect(isIdentityMatrix(translateMatrix(1, 0))).toBe(false)
    expect(isIdentityMatrix(scaleAxisMatrix(1.01, 1, 0, 0))).toBe(false)
    expect(isIdentityMatrix(rotateAboutMatrix(0.01, 0, 0))).toBe(false)
  })

  // A rotation of a large layer about a far-off centre is mostly *translation*
  // in the matrix — the linear part is what gives it away, so that half needs
  // the tighter epsilon.
  it('rejects a tiny rotation about a distant centre', () => {
    const m: AffineMatrix = rotateAboutMatrix(0.002, 1200, 1600)
    expect(isIdentityMatrix(m)).toBe(false)
  })
})
