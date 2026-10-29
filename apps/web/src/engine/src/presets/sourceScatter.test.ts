import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceScatter.native.json'
import { sourceScatter } from './sourceScatter'
describe('actual native Scatter.apply geometry', () => {
  it('matches all128 checked/axis/size/angle/zero-amplitude branches exactly', () => {
    for (const row of fixture.cases) {
      let draws = 0, queries = 0
      const random = { generateNormalized: () => ++draws === 1 ? .179123456789 : .917345678901 }
      const result = sourceScatter(row.input, random, () => { queries++; return row.amplitude })
      expect([...result, draws, queries], JSON.stringify(row)).toEqual(row.output)
    }
  })
})
