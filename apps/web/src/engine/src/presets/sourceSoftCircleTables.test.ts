import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceSoftCircle/tables.native.json'
import { sourceCurveTransfer, type SourceCurvePolynomial } from './sourceCurve'
function program(row: typeof native.constructors[number]): SourceCurvePolynomial {
  return { points: row.points, coefficients: row.coefficients.map(c => [c[0], c[1], c[2], c[3]] as const) }
}
describe('native soft-circle dense radial curve tables', () => {
  it('matches all3610 F64 values from original SparseLU/floatTransfer for allfive actual stock curves', () => {
    let values = 0
    for (const row of native.constructors) {
      const actual = sourceCurveTransfer(program(row), { layout: 'soft-mask', resolution: row.resolution, arithmetic: 'installed-arm64-fused-v1' })
      expect(actual).toHaveLength(row.resolution + 2)
      for (let i = 0; i < actual.length; i++) expect(Object.is(actual[i], row.values[i]), `${row.index}/${i}: ${actual[i]} != ${row.values[i]}`).toBe(true)
      values += actual.length
    }
    expect(values).toBe(3610)
  })
  it('keeps the256 sensor grid separate and includes clamped nonzero first-knot domains', () => {
    const row = native.constructors.find(r => r.index === 72)!
    expect(sourceCurveTransfer(program(row))).toHaveLength(256)
    const actual = sourceCurveTransfer(program(row), { layout: 'soft-mask', resolution: row.resolution, arithmetic: 'installed-arm64-fused-v1' })
    expect(actual.slice(0, 164)).toEqual(row.values.slice(0, 164))
    expect(actual[0]).toBe(row.points[0].y)
    expect(() => sourceCurveTransfer(program(row), { layout: 'soft-mask', resolution: 16383, arithmetic: 'installed-arm64-fused-v1' })).toThrow(RangeError)
  })
})
