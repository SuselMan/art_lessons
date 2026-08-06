import { describe, it, expect } from 'vitest'
import { isAffineHomography, toWireMatrix } from '@grafetto/shared'

import {
  IDENTITY_MATRIX, translateMatrix, scaleAxisMatrix, skewAxisMatrix, rotateAboutMatrix,
  composeMatrix, invertMatrix, applyMatrix, isIdentityMatrix,
  transformGestureKind, isNegligibleTransform,
  frameCorners, distortQuad, solveQuadMatrix, isFrameInFront,
  type Point, type TransformBounds, type TransformMatrix,
} from './transformMath'

const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps)
const nearPoint = (p: Point, x: number, y: number, eps = 1e-9) => {
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

  // (#392) The same property, with a projective gesture in the chain — this is
  // all "accumulate a Distort into the session" is, and it holding is what
  // keeps Distort from needing a session of its own.
  it('accumulates a distort into a session the same way as any other gesture', () => {
    const BOUNDS: TransformBounds = { x: 0, y: 0, width: 200, height: 100 }
    const quad = distortQuad(BOUNDS, 'tr', { x: 260, y: 30 })!
    const distort = solveQuadMatrix(BOUNDS, quad)!
    const session = composeMatrix(rotateAboutMatrix(0.4, 100, 50), composeMatrix(scaleAxisMatrix(1.3, 1, 0, 0), distort))
    const stepwise1 = applyMatrix(distort, 50, 25)
    const stepwise2 = applyMatrix(scaleAxisMatrix(1.3, 1, 0, 0), stepwise1.x, stepwise1.y)
    const stepwise3 = applyMatrix(rotateAboutMatrix(0.4, 100, 50), stepwise2.x, stepwise2.y)
    nearPoint(applyMatrix(session, 50, 25), stepwise3.x, stepwise3.y, 1e-9)
  })
})

// The invariant a move/scale/rotate gizmo owes the user: the frame is always a
// rectangle. It holds only if scaling composes *inside* the accumulated matrix
// (the handles pull along the frame's own axes) and rotation composes
// *outside* (turning the frame is rigid). Get that backwards and a squash
// followed by a turn becomes a shear — Room's handleTransformHandleDown picks
// the side per gesture for exactly this reason.
describe('session composition keeps the frame rectangular', () => {
  const BOUNDS: TransformBounds = { x: 100, y: 200, width: 400, height: 300 }
  const corners = (m: TransformMatrix) => frameCorners(BOUNDS).map(p => applyMatrix(m, p.x, p.y))
  /** Largest deviation from a right angle at any corner, in radians. */
  const worstCornerError = (m: TransformMatrix) => {
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
  const scaleGesture = (m: TransformMatrix, sx: number, sy: number) =>
    composeMatrix(m, scaleAxisMatrix(sx, sy, BOUNDS.x, BOUNDS.y))
  const rotateGesture = (m: TransformMatrix, rad: number) => {
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
      const [a, b, , c, d] = skewAxisMatrix(shear, 0, 0, bottom)
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
    const c = frameCorners(BOUNDS).map(p => applyMatrix(m, p.x, p.y))
    // side 0→1 vs side 3→2 (the two horizontals), and 1→2 vs 0→3.
    near(c[1].x - c[0].x, c[2].x - c[3].x)
    near(c[1].y - c[0].y, c[2].y - c[3].y)
    near(c[2].x - c[1].x, c[3].x - c[0].x)
    near(c[2].y - c[1].y, c[3].y - c[0].y)
    // The horizontals keep their original length: only the verticals slant.
    near(Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y), BOUNDS.width)
  })
})

// Distort (#392). What the user is promised is entirely geometric: the corner
// you drag ends up under the pointer, the three you didn't stay put, and
// straight lines stay straight.
describe('solveQuadMatrix', () => {
  const BOUNDS: TransformBounds = { x: 100, y: 200, width: 400, height: 300 }

  it('puts every corner exactly where it was asked to go', () => {
    const target: [Point, Point, Point, Point] = [
      { x: 130, y: 190 }, { x: 520, y: 260 }, { x: 470, y: 540 }, { x: 90, y: 480 },
    ]
    const m = solveQuadMatrix(BOUNDS, target)!
    expect(m).not.toBeNull()
    frameCorners(BOUNDS).forEach((src, i) => {
      nearPoint(applyMatrix(m, src.x, src.y), target[i].x, target[i].y, 1e-6)
    })
  })

  it('leaves the three corners a drag did not touch exactly where they were', () => {
    const quad = distortQuad(BOUNDS, 'tr', { x: 620, y: 120 })!
    const m = solveQuadMatrix(BOUNDS, quad)!
    const src = frameCorners(BOUNDS)
    nearPoint(applyMatrix(m, src[0].x, src[0].y), src[0].x, src[0].y, 1e-6)
    nearPoint(applyMatrix(m, src[2].x, src[2].y), src[2].x, src[2].y, 1e-6)
    nearPoint(applyMatrix(m, src[3].x, src[3].y), src[3].x, src[3].y, 1e-6)
    nearPoint(applyMatrix(m, src[1].x, src[1].y), 620, 120, 1e-6)
  })

  // A homography maps lines to lines — that is the whole difference between
  // this and a free-form warp, and it is what makes a distorted drawing still
  // look like a drawing in perspective rather than a smear.
  it('keeps straight lines straight', () => {
    const quad = distortQuad(BOUNDS, 'br', { x: 380, y: 620 })!
    const m = solveQuadMatrix(BOUNDS, quad)!
    const a = applyMatrix(m, 100, 200)
    const b = applyMatrix(m, 500, 500)
    // Six points spread along the source diagonal must land on the segment ab.
    for (const t of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      const p = applyMatrix(m, 100 + 400 * t, 200 + 300 * t)
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      expect(Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1e-6)
    }
  })

  // A drag that happens to keep the frame a parallelogram is affine, and the
  // solver has to say so exactly — the wire form narrows back to six numbers
  // on `isAffineHomography`, which does not tolerate float dust in g/h.
  it('produces an exactly affine matrix for a parallelogram', () => {
    const parallelogram: [Point, Point, Point, Point] = [
      { x: 140, y: 200 }, { x: 540, y: 200 }, { x: 500, y: 500 }, { x: 100, y: 500 },
    ]
    const m = solveQuadMatrix(BOUNDS, parallelogram)!
    expect(isAffineHomography(m)).toBe(true)
    expect(toWireMatrix(m)).toHaveLength(6)
  })

  it('produces a genuinely projective matrix for a trapezoid', () => {
    const quad = distortQuad(BOUNDS, 'tr', { x: 420, y: 260 })!
    const m = solveQuadMatrix(BOUNDS, quad)!
    expect(isAffineHomography(m)).toBe(false)
    expect(toWireMatrix(m)).toHaveLength(9)
  })

  // The degenerate cases return null rather than throwing or producing NaN:
  // Room's answer to null is "this pointer position has no picture, leave the
  // frame where it was", which is only possible if the failure is a value.
  it('refuses a quad with three corners on one line', () => {
    const collinear: [Point, Point, Point, Point] = [
      { x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 200 }, { x: 0, y: 300 },
    ]
    expect(solveQuadMatrix(BOUNDS, collinear)).toBeNull()
  })

  it('refuses a quad collapsed onto a point, and a frame with no area', () => {
    const collapsed: [Point, Point, Point, Point] = [
      { x: 50, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 50 },
    ]
    expect(solveQuadMatrix(BOUNDS, collapsed)).toBeNull()
    expect(solveQuadMatrix({ x: 0, y: 0, width: 0, height: 10 }, frameCorners(BOUNDS))).toBeNull()
  })

  it('refuses a quad that has collapsed to a line (zero area, still a parallelogram)', () => {
    const flat: [Point, Point, Point, Point] = [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 0 },
    ]
    expect(solveQuadMatrix(BOUNDS, flat)).toBeNull()
  })
})

describe('distortQuad', () => {
  const BOUNDS: TransformBounds = { x: 0, y: 0, width: 10, height: 20 }

  it('moves exactly the named corner and leaves the rest of the frame alone', () => {
    const quad = distortQuad(BOUNDS, 'bl', { x: -5, y: 25 })!
    expect(quad).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: -5, y: 25 }])
  })

  it('refuses a handle that names no corner', () => {
    expect(distortQuad(BOUNDS, 't', { x: 0, y: 0 })).toBeNull()
    expect(distortQuad(BOUNDS, 'body', { x: 0, y: 0 })).toBeNull()
    expect(distortQuad(BOUNDS, 'rotate-tl', { x: 0, y: 0 })).toBeNull()
  })
})

describe('isFrameInFront', () => {
  const BOUNDS: TransformBounds = { x: 100, y: 200, width: 400, height: 300 }

  it('passes every affine matrix, whatever it does', () => {
    for (const m of [
      IDENTITY_MATRIX, translateMatrix(-5000, 900), rotateAboutMatrix(2.3, 0, 0),
      scaleAxisMatrix(-1, 1, 300, 350), skewAxisMatrix(19, 0, 0, 500),
    ]) {
      expect(isFrameInFront(m, BOUNDS)).toBe(true)
    }
  })

  it('passes a normal distort', () => {
    const quad = distortQuad(BOUNDS, 'tr', { x: 430, y: 280 })!
    expect(isFrameInFront(solveQuadMatrix(BOUNDS, quad)!, BOUNDS)).toBe(true)
  })

  // A vanishing line crossing the frame: past it the projection reflects
  // points through the origin, so half the layer would be drawn mirrored.
  // Handmade rather than solved, because the solver's own output is always
  // w-positive over the source rect by construction — this is the state a
  // *composition* of several distorts could reach.
  it('rejects a matrix whose vanishing line crosses the frame', () => {
    // w = 1 - x/300: zero at x = 300, which is inside x ∈ [100, 500].
    const m: TransformMatrix = [1, 0, -1 / 300, 0, 1, 0, 0, 0, 1]
    expect(isFrameInFront(m, BOUNDS)).toBe(false)
  })
})

describe('transformGestureKind (#391, #392)', () => {
  it('gives the edge handles their mode-dependent meaning and nothing else does', () => {
    for (const handle of ['t', 'b'] as const) {
      expect(transformGestureKind(handle, 'free')).toBe('scale')
      expect(transformGestureKind(handle, 'rotateSkew')).toBe('skewX')
      expect(transformGestureKind(handle, 'distort')).toBe('scale')
    }
    for (const handle of ['l', 'r'] as const) {
      expect(transformGestureKind(handle, 'free')).toBe('scale')
      expect(transformGestureKind(handle, 'rotateSkew')).toBe('skewY')
      expect(transformGestureKind(handle, 'distort')).toBe('scale')
    }
  })

  it('hands the corners to Distort and leaves them scaling elsewhere', () => {
    for (const handle of ['tl', 'tr', 'bl', 'br'] as const) {
      expect(transformGestureKind(handle, 'free')).toBe('scale')
      expect(transformGestureKind(handle, 'rotateSkew')).toBe('scale')
      expect(transformGestureKind(handle, 'distort')).toBe('distort')
    }
  })

  it('keeps the rings rotating and the body moving in every mode', () => {
    for (const mode of ['free', 'rotateSkew', 'distort'] as const) {
      for (const handle of ['rotate-tl', 'rotate-tr', 'rotate-bl', 'rotate-br'] as const) {
        expect(transformGestureKind(handle, mode)).toBe('rotate')
      }
      expect(transformGestureKind('body', mode)).toBe('move')
    }
  })
})

describe('isNegligibleTransform', () => {
  const FRAME: TransformBounds = { x: 100, y: 200, width: 400, height: 300 }

  it('drops a click on any handle', () => {
    expect(isNegligibleTransform('move', IDENTITY_MATRIX, FRAME)).toBe(true)
    expect(isNegligibleTransform('rotate', IDENTITY_MATRIX, FRAME)).toBe(true)
    expect(isNegligibleTransform('scale', IDENTITY_MATRIX, FRAME)).toBe(true)
    expect(isNegligibleTransform('skewX', IDENTITY_MATRIX, FRAME)).toBe(true)
    expect(isNegligibleTransform('skewY', IDENTITY_MATRIX, FRAME)).toBe(true)
    expect(isNegligibleTransform('distort', IDENTITY_MATRIX, FRAME)).toBe(true)
  })

  it('keeps a real move, rotation and scale', () => {
    expect(isNegligibleTransform('move', translateMatrix(3, 0), FRAME)).toBe(false)
    expect(isNegligibleTransform('rotate', rotateAboutMatrix(0.05, 200, 100), FRAME)).toBe(false)
    expect(isNegligibleTransform('scale', scaleAxisMatrix(1.4, 1, 0, 0), FRAME)).toBe(false)
  })

  // The regression this rewrite exists for: a shear leaves both scale terms at
  // exactly 1, so the scale test an edge handle used to get unconditionally
  // called every skew in the world a no-op and threw it away.
  it('keeps a skew that the scale test would have thrown away', () => {
    const skew = skewAxisMatrix(0.4, 0, 0, 500)
    expect(isNegligibleTransform('skewX', skew, FRAME)).toBe(false)
    expect(isNegligibleTransform('scale', skew, FRAME)).toBe(true) // what the old code asked
  })

  // Same shape of mistake on the other side: Free transform's corner drag
  // scales the axes independently, so "did scaleX move?" is not the question.
  it('keeps a corner drag that only moved one axis', () => {
    expect(isNegligibleTransform('scale', scaleAxisMatrix(1, 1.6, 0, 0), FRAME)).toBe(false)
  })

  it('does not mistake one gesture\'s leftovers for another\'s', () => {
    // A pure shearX has no shearY component, and vice versa.
    expect(isNegligibleTransform('skewY', skewAxisMatrix(0.4, 0, 0, 500), FRAME)).toBe(true)
    expect(isNegligibleTransform('skewX', skewAxisMatrix(0, 0.4, 500, 0), FRAME)).toBe(true)
  })

  // (#392) The third shape of the same mistake: a Distort's coefficients are
  // in units of 1/px, so no threshold on them means anything without the
  // frame. Measured in px of corner travel instead — a 40px drag is real, a
  // 0.2px one is the pen resting on the glass.
  it('measures a distort in pixels the corner actually moved', () => {
    const dragged = solveQuadMatrix(FRAME, distortQuad(FRAME, 'br', { x: 540, y: 500 })!)!
    expect(isNegligibleTransform('distort', dragged, FRAME)).toBe(false)
    const jitter = solveQuadMatrix(FRAME, distortQuad(FRAME, 'br', { x: 500.2, y: 500.1 })!)!
    expect(isNegligibleTransform('distort', jitter, FRAME)).toBe(true)
  })

  // Scale-relative, which is the entire reason it takes the frame: the same
  // matrix that barely moves a big layer's corners folds a small one.
  it('reads the same distort differently on frames of different sizes', () => {
    const small: TransformBounds = { x: 0, y: 0, width: 20, height: 20 }
    const m = solveQuadMatrix(small, distortQuad(small, 'br', { x: 26, y: 22 })!)!
    expect(isNegligibleTransform('distort', m, small)).toBe(false)
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

  // (#392) Same guarantee for a projective matrix, which is what the session
  // has to invert to read a pointer position back into the frame's own space
  // once a Distort is in it.
  it('inverts a distort back to the identity', () => {
    const bounds: TransformBounds = { x: 100, y: 200, width: 400, height: 300 }
    const m = solveQuadMatrix(bounds, distortQuad(bounds, 'tl', { x: 60, y: 150 })!)!
    const inv = invertMatrix(m)!
    const round = composeMatrix(inv, m)
    // Projective matrices are equal up to scale, so normalize before comparing.
    round.forEach((v, i) => near(v / round[8], IDENTITY_MATRIX[i], 1e-9))
    const p = applyMatrix(m, 333, 444)
    nearPoint(applyMatrix(inv, p.x, p.y), 333, 444, 1e-6)
  })

  // A collapsed axis has no inverse — the gesture-to-local-space conversion
  // has to skip rather than produce Infinity/NaN coordinates.
  it('returns null for a degenerate matrix', () => {
    expect(invertMatrix([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull()
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
    const m: TransformMatrix = rotateAboutMatrix(0.002, 1200, 1600)
    expect(isIdentityMatrix(m)).toBe(false)
  })

  // (#392) Any projective part at all is a real transform: composing affine
  // matrices leaves exact zeros there, so a non-zero one cannot be float dust,
  // and a session carrying one that never got baked leaves the preview and the
  // layer showing different things.
  it('rejects a session carrying a projective part, however small', () => {
    const m: TransformMatrix = [1, 0, 1e-9, 0, 1, 0, 0, 0, 1]
    expect(isIdentityMatrix(m)).toBe(false)
  })
})
