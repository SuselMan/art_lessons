import { describe, expect, it } from 'vitest'

import { applyAffine, composeAffine, IDENTITY_MATRIX, invertAffine, translationMatrix } from './affine'

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
