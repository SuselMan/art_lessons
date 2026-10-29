import { describe, expect, it } from 'vitest'
import edges from './fixtures/sourceGaussianResolvedMask/coefficient-edges.native.json'
import inputs from './fixtures/sourceGaussianResolvedMask/coefficient-inputs.native.json'
import native from './fixtures/sourceGaussianResolvedMask/coefficients.native.json'
import { sourceGaussianCoefficients as construct } from './sourceGaussianCoefficients'
describe('isolated native Gaussian coefficient construction', () => {
  it('reconstructs all eight directly captured fields of all104 original constructor/setScale calls exactly', () => {
    expect(inputs.cases).toHaveLength(104)
    for (let i = 0; i < inputs.cases.length; i++) {
      const input = inputs.cases[i], expected = native.cases[i]
      expect([input.index, input.variant, input.mode]).toEqual([expected.index, expected.variant, expected.mode])
      expect(construct(input).coefficients).toEqual(expected.request.coefficients)
    }
  })
  it('matches512 directly captured edge fields including fade0/1, fractional tiny/anisotropic scales', () => {
    expect(edges.cases).toHaveLength(64)
    for (const row of edges.cases) expect(construct(row.input).coefficients).toEqual(row.coefficients)
  })
  it('rejects missing, nonfinite and degenerate inputs without admitting a generic descriptor', () => {
    const valid = inputs.cases[0]
    for (const override of [{ diameter: 0 }, { ratio: 0 }, { ratio: 2 }, { horizontalFade: -1 }, { verticalFade: 2 }, { scaleX: Infinity }, { scaleY: Number.MIN_VALUE }, { diameter: Number.MAX_VALUE, scaleX: 2 }]) {
      expect(() => construct({ ...valid, ...override })).toThrow(RangeError)
    }
  })
})
