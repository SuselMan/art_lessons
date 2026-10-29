import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceCurves.native.json'
import { sourceCurveIsIdentity, sourceCurveTransfer } from './sourceCurve'
describe('native SparseLU polynomial sampling', () => {
  it('matches every native256-sample table for all12 actual stock curve inputs exactly', () => {
    for (const curve of fixture.curves) {
      const points = curve.points.map(p => ({ x: p[0] as number, y: p[1] as number }))
      expect(sourceCurveTransfer({ points, coefficients: curve.coefficients as [number, number, number, number][] }), curve.text).toEqual(curve.samples)
    }
  })
  it('preserves native identity bypass and rejects malformed native programs', () => {
    expect(sourceCurveIsIdentity([{ x: 0, y: 0 }, { x: .5, y: .5000000000001 }, { x: 1, y: 1 }])).toBe(true)
    expect(sourceCurveIsIdentity([{ x: 0, y: .0000000000001 }, { x: 1, y: 1 }])).toBe(false)
    expect(() => sourceCurveTransfer({ points: [{ x: .5, y: 0 }, { x: .5, y: 1 }], coefficients: [[0, 0, 1, 0]] })).toThrow('Invalid')
    expect(() => sourceCurveTransfer({ points: [{ x: 0, y: 0 }], coefficients: [[0, 0, NaN, 0]] })).toThrow('Invalid')
  })
})
