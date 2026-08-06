import { describe, it, expect } from 'vitest'
import {
  toHomography, toWireMatrix, isAffineHomography,
  type AffineMatrixTuple, type HomographyMatrixTuple,
} from './index'

/** (#392) The wire form of a layer_transform is six numbers or nine, and the
 *  whole point of that union is that nothing downstream has to care which one
 *  arrived. These tests pin the two properties that guarantee it: widening is
 *  faithful, and narrowing is its exact inverse whenever there is no
 *  perspective to lose. */
describe('layer_transform matrix encoding', () => {
  const affine: AffineMatrixTuple = [2, 0.5, -0.25, 3, 40, -17]

  it('widens the affine tuple into the homography its math already was', () => {
    // Column-major 3x3 with the projective row zeroed and w pinned at 1.
    expect(toHomography(affine)).toEqual([2, 0.5, 0, -0.25, 3, 0, 40, -17, 1])
  })

  it('passes a nine-number matrix through untouched', () => {
    const h: HomographyMatrixTuple = [1, 0, 0.002, 0, 1, -0.001, 5, 6, 1]
    expect(toHomography(h)).toBe(h)
  })

  it('round-trips an affine matrix back to six numbers', () => {
    // The property that keeps ordinary drags off the wider encoding: an
    // affine gesture composed in 3x3 still writes the compact form.
    expect(toWireMatrix(toHomography(affine))).toEqual(affine)
  })

  it('keeps a genuine perspective on the nine-number form', () => {
    const h: HomographyMatrixTuple = [1, 0, 0.002, 0, 1, 0, 0, 0, 1]
    expect(isAffineHomography(h)).toBe(false)
    expect(toWireMatrix(h)).toEqual(h)
  })

  it('treats accumulated float noise in the projective row as affine', () => {
    // Composing many affine drags in 3x3 leaves g/h at ~1e-17, not exactly
    // zero. Widening the encoding for that would be a lie about the gesture.
    const h: HomographyMatrixTuple = [1, 0, 1e-17, 0, 1, -3e-18, 0, 0, 1]
    expect(isAffineHomography(h)).toBe(true)
    expect(toWireMatrix(h)).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('does not mistake a scaled-w homography for an affine one', () => {
    // i !== 1 means the tuple is not normalised; narrowing it by dropping the
    // row would silently change what it maps to.
    const h: HomographyMatrixTuple = [2, 0, 0, 0, 2, 0, 0, 0, 2]
    expect(isAffineHomography(h)).toBe(false)
  })
})
