import { describe, it, expect } from 'vitest'

import {
  IDENTITY_MATRIX, translateMatrix, scaleAxisMatrix, rotateAboutMatrix,
  composeMatrix, invertMatrix, applyMatrix, isIdentityMatrix, type AffineMatrix,
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
