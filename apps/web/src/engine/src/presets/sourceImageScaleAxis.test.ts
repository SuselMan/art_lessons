import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceImageScaleAxis.native.json'
import { sourceImageScaleAxis } from './sourceImageScaleAxis'

describe('native fixed-point resize axis tables', () => {
  it('matches actual Qt source for up/down sampling, odd dimensions and reversal', () => {
    for (const c of native.cases) expect(sourceImageScaleAxis(c.source, c.target)).toEqual({
      up: Math.abs(c.target) >= c.source, positions: c.positions, weights: c.weights,
    })
  })
  it('retains native edge weights and area coverage rather than generic bilinear weights', () => {
    expect(sourceImageScaleAxis(3, 5)).toEqual({ up: true, positions: [0, 0, 0, 1, 2], weights: [0, 102, 255, 153, 0] })
    expect(sourceImageScaleAxis(3, -5).weights).toEqual([0, 153, 255, 102, 0])
    const down = sourceImageScaleAxis(3, 2)
    expect(down.weights).toEqual([715860651, 715855189])
    expect(Object.isFrozen(down.weights)).toBe(true)
  })
  it('rejects unproven signed-int overflow and allocation domains', () => {
    for (const n of [0, -1, .1, NaN, Infinity, 65536]) expect(() => sourceImageScaleAxis(n, 1)).toThrow()
    for (const n of [0, .1, NaN, Infinity, 524281, -524281]) expect(() => sourceImageScaleAxis(1, n)).toThrow()
  })
})
