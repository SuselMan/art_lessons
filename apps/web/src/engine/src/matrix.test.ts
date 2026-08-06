import { describe, expect, it } from 'vitest'

import {
  applyMatrix, composeMatrix, IDENTITY_MATRIX, invertMatrix, scaleMatrix, scaleRotateMatrix, toMat3, translationMatrix,
  type Matrix3,
} from './matrix'

describe('applyMatrix', () => {
  it('identity leaves a point unchanged', () => {
    expect(applyMatrix(IDENTITY_MATRIX, 3, 5)).toEqual([3, 5])
  })

  it('translation shifts a point', () => {
    expect(applyMatrix(translationMatrix(10, -4), 1, 1)).toEqual([11, -3])
  })

  // (#392) The projective half: w varies across the plane, so the same matrix
  // moves a far point further than a near one — which is the whole content of
  // a perspective. Straight lines still come out straight, and that is what
  // distinguishes a homography from an arbitrary warp.
  it('divides through by w for a projective matrix', () => {
    // x' = x / (0.001*x + 1): a horizon at x = 1000.
    const m: Matrix3 = [1, 0, 0.001, 0, 1, 0, 0, 0, 1]
    expect(applyMatrix(m, 0, 0)).toEqual([0, 0])
    const [x100] = applyMatrix(m, 100, 0)
    const [x500] = applyMatrix(m, 500, 0)
    expect(x100).toBeCloseTo(100 / 1.1, 9)
    expect(x500).toBeCloseTo(500 / 1.5, 9)
  })
})

describe('composeMatrix', () => {
  it('composeMatrix(A, B)(p) === A(B(p))', () => {
    const a = translationMatrix(5, 0)
    const b = translationMatrix(0, 7)
    const composed = composeMatrix(a, b)
    expect(applyMatrix(composed, 1, 1)).toEqual(applyMatrix(a, ...applyMatrix(b, 1, 1)))
  })

  it('composing a matrix with its inverse yields identity', () => {
    const m: Matrix3 = [2, 0, 0, 0, 0.5, 0, 10, -3, 1]
    const composed = composeMatrix(invertMatrix(m), m)
    const [x, y] = applyMatrix(composed, 17, -6)
    expect(x).toBeCloseTo(17, 6)
    expect(y).toBeCloseTo(-6, 6)
  })

  // The property the tile-aware bake (#133) rides on: a destination tile's
  // origin translation folds into the same matrix the shader already takes,
  // and does so for a projective matrix exactly as it did for an affine one.
  it('folds tile-origin translations around a projective matrix', () => {
    const m: Matrix3 = [1, 0, 0.0004, 0.2, 1.1, -0.0002, 30, -12, 1]
    const toWorld = translationMatrix(512, 256)
    const toLocal = translationMatrix(-64, -128)
    const folded = composeMatrix(toLocal, composeMatrix(m, toWorld))
    const stepwise = applyMatrix(toLocal, ...applyMatrix(m, ...applyMatrix(toWorld, 40, 70)))
    const [x, y] = applyMatrix(folded, 40, 70)
    expect(x).toBeCloseTo(stepwise[0], 9)
    expect(y).toBeCloseTo(stepwise[1], 9)
  })
})

describe('invertMatrix', () => {
  it('round-trips a point through a projective matrix', () => {
    const m: Matrix3 = [1.4, 0.2, 0.0003, -0.1, 0.9, 0.0007, 25, -40, 1]
    const [x, y] = applyMatrix(m, 123, -45)
    const [bx, by] = applyMatrix(invertMatrix(m), x, y)
    expect(bx).toBeCloseTo(123, 6)
    expect(by).toBeCloseTo(-45, 6)
  })

  // (#392) The sign of w survives inversion — the shader discards w <= 0
  // fragments, so an inverse that returned the bare adjugate would blank every
  // pixel of a mirrored layer instead of drawing it.
  it('keeps w positive through a mirroring (negative-determinant) matrix', () => {
    const mirrored: Matrix3 = [-1, 0, 0, 0, 1, 0, 0, 0, 1]
    const inv = invertMatrix(mirrored)
    expect(inv[2] * 300 + inv[5] * 200 + inv[8]).toBeGreaterThan(0)
  })

  it('falls back to identity for a collapsed matrix rather than dividing by zero', () => {
    expect(invertMatrix(scaleMatrix(1, 0))).toEqual(IDENTITY_MATRIX)
  })
})

describe('scaleMatrix', () => {
  it('scales each axis independently, about the origin', () => {
    expect(applyMatrix(scaleMatrix(2, 3), 4, 5)).toEqual([8, 15])
  })
})

describe('scaleRotateMatrix', () => {
  it('angle 0 is a pure uniform scale', () => {
    const [x, y] = applyMatrix(scaleRotateMatrix(2, 0), 4, 5)
    expect(x).toBeCloseTo(8, 6)
    expect(y).toBeCloseTo(10, 6)
  })

  it('scale 1, angle 90deg rotates (1,0) to (0,1)', () => {
    const [x, y] = applyMatrix(scaleRotateMatrix(1, Math.PI / 2), 1, 0)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(1, 6)
  })
})

describe('toMat3', () => {
  // Both wire forms reach a uniform without anyone branching on length, and
  // — the part worth a test — neither gets transposed on the way: the tuple
  // is already the column-major layout gl.uniformMatrix3fv wants.
  it('widens the six-number wire form in place', () => {
    expect([...toMat3([2, 3, 4, 5, 6, 7])]).toEqual([2, 3, 0, 4, 5, 0, 6, 7, 1])
  })

  it('passes the nine-number form through untouched', () => {
    const m: Matrix3 = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect([...toMat3(m)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
