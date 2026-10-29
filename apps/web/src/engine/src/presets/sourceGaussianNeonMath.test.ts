import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceGaussianNeonMath/rsqrt.native.json'
import { sourceGaussianNeonRsqrtEstimate as estimate, sourceGaussianNeonRsqrtStep as step,
  sourceGaussianNeonSqrt as sqrt, sourceGaussianNeonExp as exp, sourceGaussianNeonErf as erf } from './sourceGaussianNeonMath'
const view = new DataView(new ArrayBuffer(4))
function value(bits: string): number { view.setUint32(0, parseInt(bits, 16), false); return view.getFloat32(0, false) }
function bits(n: number): string { view.setFloat32(0, n, false); return view.getUint32(0, false).toString(16).padStart(8, '0') }
describe('Gaussian explicit NEON numerical reference', () => {
  it('matches6144 original estimate/Newton/sqrt instruction sequences bit for bit', () => {
    expect(native.cases).toHaveLength(6144)
    for (const row of native.cases) {
      const x = value(row.inputBits), e = estimate(x)
      expect(bits(e), row.inputBits).toBe(row.estimateBits)
      if (x === 0) { expect(sqrt(x)).toBe(0); continue }
      const s = step(Math.fround(x * e), e)
      expect(bits(s)).toBe(row.stepBits)
      expect(bits(Math.fround(e * s))).toBe(row.refinedBits)
      expect(bits(sqrt(x))).toBe(row.sqrtBeforeZeroMaskBits)
    }
  })
  it('fails closed outside the finite/canonical-zero and positive Newton domains', () => {
    for (const x of [-0, -1, Infinity, NaN, 1.1]) {
      expect(() => estimate(x)).toThrow(RangeError)
      expect(() => sqrt(x)).toThrow(RangeError)
    }
    for (const pair of [[0, 1], [1, Infinity], [1, NaN], [4, 1], [1, .1]]) expect(() => step(pair[0], pair[1])).toThrow(RangeError)
    for (const x of [NaN, Infinity, -Infinity, 1, -87, -.1]) expect(() => exp(x)).toThrow(RangeError)
    expect(exp(0)).toBe(1)
    expect(erf(Math.fround(10))).toBe(1)
    expect(erf(Math.fround(-10))).toBe(-1)
    expect(() => erf(.1)).toThrow(RangeError)
  })
})
