import { describe, expect, it } from 'vitest'

import {
  applyAffine, composeAffine, IDENTITY_MATRIX, invertAffine, scaleMatrix, scaleRotateMatrix, translationMatrix,
} from './affine'

describe('applyAffine', () => {
  it('identity leaves a point unchanged', () => {
    expect(applyAffine(IDENTITY_MATRIX, 3, 5)).toEqual([3, 5])
  })

  it('translation shifts a point', () => {
    expect(applyAffine(translationMatrix(10, -4), 1, 1)).toEqual([11, -3])
  })
})

describe('composeAffine', () => {
  it('composeAffine(A, B)(p) === A(B(p))', () => {
    const a = translationMatrix(5, 0)
    const b = translationMatrix(0, 7)
    const composed = composeAffine(a, b)
    expect(applyAffine(composed, 1, 1)).toEqual(applyAffine(a, ...applyAffine(b, 1, 1)))
  })

  it('composing a matrix with its inverse yields identity', () => {
    const m: [number, number, number, number, number, number] = [2, 0, 0, 0.5, 10, -3]
    const composed = composeAffine(invertAffine(m), m)
    const [x, y] = applyAffine(composed, 17, -6)
    expect(x).toBeCloseTo(17, 6)
    expect(y).toBeCloseTo(-6, 6)
  })
})

describe('scaleMatrix', () => {
  it('scales each axis independently, about the origin', () => {
    expect(applyAffine(scaleMatrix(2, 3), 4, 5)).toEqual([8, 15])
  })
})

describe('scaleRotateMatrix', () => {
  it('angle 0 is a pure uniform scale', () => {
    const [x, y] = applyAffine(scaleRotateMatrix(2, 0), 4, 5)
    expect(x).toBeCloseTo(8, 6)
    expect(y).toBeCloseTo(10, 6)
  })

  it('scale 1, angle 90deg rotates (1,0) to (0,1)', () => {
    const [x, y] = applyAffine(scaleRotateMatrix(1, Math.PI / 2), 1, 0)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(1, 6)
  })
})
