import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceSpray/consumer.native.json'
import { sampleSourceSprayDistribution, sourceSprayInverseCDF } from './sourceSprayDistribution'

describe('source spray sampled inverse CDF', () => {
  it('preserves native simplified Gaussian knots and their upper-bound interpolation', () => {
    const samples = fixture.cdf.map(([x, cumulative, inverseDelta]) => ({ x, cumulative, inverseDelta }))
    const distribution = sourceSprayInverseCDF(samples)
    expect(samples).toHaveLength(319)
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1]
      expect(sampleSourceSprayDistribution(distribution, a.cumulative)).toBe(a.x)
      const midpoint = (a.cumulative + b.cumulative) / 2
      const expected = a.x + ((midpoint - a.cumulative) * b.inverseDelta) * (b.x - a.x)
      expect(sampleSourceSprayDistribution(distribution, midpoint)).toBe(expected)
    }
    samples[0].x = 100 // caller mutation cannot change admitted data
    expect(sampleSourceSprayDistribution(distribution, 0)).toBe(0)
  })
  it('explicitly repairs the native U=1 end-dereference and uses U, not sqrt(U), for uniform radius', () => {
    const d = sourceSprayInverseCDF([{ x: 0, cumulative: 0, inverseDelta: 0 }, { x: 2.5, cumulative: 1, inverseDelta: 1 }])
    expect(sampleSourceSprayDistribution(d, 1)).toBe(2.5)
    expect(sampleSourceSprayDistribution({ kind: 'uniform' }, .25)).toBe(.25)
    for (const u of [-1, NaN, Infinity, 1.00001]) expect(() => sampleSourceSprayDistribution(d, u)).toThrow()
  })
  it('rejects malformed, nonfinite, unbounded or nonmonotone input before the hot loop', () => {
    const a = { x: 0, cumulative: 0, inverseDelta: 0 }, b = { x: 1, cumulative: 1, inverseDelta: 1 }
    for (const samples of [[], [a], [a, { ...b, x: 0 }], [a, { ...b, cumulative: .5 }], [a, { ...b, inverseDelta: Infinity }], [a, { ...b, cumulative: 0 }], Array.from({ length: 4097 }, () => b)]) expect(() => sourceSprayInverseCDF(samples)).toThrow()
  })
})
