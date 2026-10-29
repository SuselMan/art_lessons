import { describe, expect, it, vi } from 'vitest'
import coefficients from './fixtures/sourceGaussianResolvedMask/coefficients.native.json'
import masks from './fixtures/sourceGaussianWholePath/whole.native.json'
import { sourceGaussianResolvedMaskReference as evaluate, type SourceGaussianResolvedMaskRequest } from './sourceGaussianResolvedMaskReference'
function request(i = 0): SourceGaussianResolvedMaskRequest { return coefficients.cases[i].request as SourceGaussianResolvedMaskRequest }
describe('explicit native-coefficient Gaussian CPU coverage reference', () => {
  it('matches all104 original scalar/NEON masks, closing all4548 former vector differences', () => {
    expect(coefficients.cases).toHaveLength(104)
    let pixels = 0, vectors = 0
    for (let i = 0; i < coefficients.cases.length; i++) {
      const c = coefficients.cases[i], m = masks.cases[i]
      expect([c.index, c.variant, c.mode, c.expectedCoverageSHA256]).toEqual([m.index, m.variant, m.mode, m.coverageSHA256])
      const actual = evaluate(request(i))
      expect(Buffer.from(actual.mask).toString('base64'), `${c.index}/${c.variant}/${c.mode}`).toBe(m.coverageBase64)
      expect(actual.route === 'neon64-vector').toBe(c.vectorBranch)
      pixels += actual.mask.length; vectors += +(actual.route === 'neon64-vector')
    }
    expect(pixels).toBe(29098)
    expect(vectors).toBe(51)
  })
  it('rejects malformed coefficients, finite-domain overflow and exhausted budgets before allocating output', () => {
    const r = request(), { center: _center, ...missingCenter } = r.coefficients
    const invalid = [
      { ...r, maxPixels: r.width * r.height - 1 }, { ...r, maxWorkSamples: 1 },
      { ...r, width: 4097 }, { ...r, coefficients: missingCenter },
      { ...r, coefficients: { ...r.coefficients, center: NaN } },
      { ...r, coefficients: { ...r.coefficients, radius: 0 } },
      { ...r, coefficients: { ...r.coefficients, fadeStart: r.coefficients.radius } },
      { ...r, centerX: Number.MAX_VALUE },
    ]
    let allocations = 0
    const errors: unknown[] = []
    vi.stubGlobal('Uint8Array', class { constructor() { allocations++; throw new Error('unexpected output allocation') } })
    try { for (const item of invalid) try { evaluate(item as SourceGaussianResolvedMaskRequest) } catch (error) { errors.push(error) } }
    finally { vi.unstubAllGlobals() }
    expect(allocations).toBe(0)
    expect(errors).toHaveLength(invalid.length)
    for (const error of errors) expect(error).toBeInstanceOf(RangeError)
  })
})
