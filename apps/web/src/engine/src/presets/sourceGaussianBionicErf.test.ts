import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceGaussianBionicErf/math.native.json'
import whole from './fixtures/sourceGaussianWholePath/whole.native.json'
import { sourceGaussianBionicErf, sourceGaussianBionicExp } from './sourceGaussianBionicErf'
const view = new DataView(new ArrayBuffer(8))
function value(bits: string): number { view.setBigUint64(0, BigInt(`0x${bits}`), false); return view.getFloat64(0, false) }
function bits(n: number): string { view.setFloat64(0, n, false); return view.getBigUint64(0, false).toString(16).padStart(16, '0') }
describe('Gaussian finite Bionic elementary-function CPU reference', () => {
  it('matches all4096 independent original installed erf/exp result bits', () => {
    expect(native.cases).toHaveLength(4096)
    for (const row of native.cases) {
      const actual = row.kind === 'erf' ? sourceGaussianBionicErf(value(row.inputBits)) : sourceGaussianBionicExp(value(row.inputBits))
      expect(bits(actual), `${row.kind}/${row.inputBits}`).toBe(row.outputBits)
    }
  })
  it('reconstructs every independently captured constructor alphafactor without a per-preset lookup', () => {
    for (const row of whole.cases) expect(255 / (2 * sourceGaussianBionicErf(row.constructorCoefficients[2]))).toBe(row.constructorCoefficients[4])
  })
  it('preserves signedzero/subnormal results and rejects unsupported exp/nonfinite domains', () => {
    expect(Object.is(sourceGaussianBionicErf(-0), -0)).toBe(true)
    expect(bits(sourceGaussianBionicErf(Number.MIN_VALUE))).toBe('0000000000000001')
    expect(sourceGaussianBionicErf(Number.MAX_VALUE)).toBe(1)
    expect(sourceGaussianBionicErf(-Number.MAX_VALUE)).toBe(-1)
    for (const x of [NaN, Infinity, -Infinity]) expect(() => sourceGaussianBionicErf(x)).toThrow(RangeError)
    for (const x of [NaN, Infinity, -Infinity, -40.000001, 1.000001]) expect(() => sourceGaussianBionicExp(x)).toThrow(RangeError)
  })
})
