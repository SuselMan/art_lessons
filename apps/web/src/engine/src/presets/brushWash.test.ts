import { describe, expect, it } from 'vitest'
import { advanceWashOpacity, creamyWash, type WashOpacityState } from './brushWash'

describe('creamy wash opacity history', () => {
  it('rises immediately and decays by one tenth, retaining the previous maximum', () => {
    const state: WashOpacityState = { average: 0, maximum: 0 }
    expect(advanceWashOpacity(state, .8)).toEqual({ average: .8, maxPrev: 0, canBlend: true })
    const falling = advanceWashOpacity(state, .2)
    expect(falling.average).toBeCloseTo(.74, 12)
    expect(falling.maxPrev).toBe(.8)
    expect(falling.canBlend).toBe(false)
    expect(advanceWashOpacity(state, .9)).toEqual({ average: .9, maxPrev: .8, canBlend: true })
    expect(advanceWashOpacity(state, .2).average).toBeCloseTo(.83, 12)
    expect(state.maximum).toBe(.9)
  })
  it('preserves scalar history through arbitrary chunks and a fork', () => {
    const values = [0, .8, .2, .9, .2, 0, .7]
    const state: WashOpacityState = { average: 0, maximum: 0 }
    const expected = values.map(o => advanceWashOpacity(state, o))
    let copy: WashOpacityState = { average: 0, maximum: 0 }
    const actual = values.slice(0, 3).map(o => advanceWashOpacity(copy, o))
    copy = structuredClone(copy)
    actual.push(...values.slice(3).map(o => advanceWashOpacity(copy, o)))
    expect(actual).toEqual(expected)
    expect(copy).toEqual(state)
  })
})

describe('creamy wash independent pixel reference', () => {
  it('retains native red/blue color mixing on falling opacity independently of flow', () => {
    const expected = [[1, .445945945945946], [.25, .411486486486486], [0, .4]]
    for (const [flow, alpha] of expected) {
      const pixel = creamyWash([.4, 0, 0, .4], [0, 0, 1], .5, .2, flow, .74)
      expect(pixel[3]).toBeCloseTo(alpha, 12)
      expect(pixel[0]).toBeCloseTo(.9 * alpha, 12)
      expect(pixel[1]).toBe(0)
      expect(pixel[2]).toBeCloseTo(.1 * alpha, 12)
    }
    // Flow zero changes visible straight color while keeping destination alpha.
    expect(creamyWash([.4, 0, 0, .4], [0, 0, 1], .5, .2, 0, .74)).toEqual([.36000000000000004, 0, .04000000000000001, .4])
  })
  it('ignores hidden RGB on an empty destination and preserves zero mask', () => {
    expect(creamyWash([.7, .3, .1, 0], [0, 0, 1], .5, .2, 1, .74)).toEqual([0, 0, .1, .1])
    expect(creamyWash([.2, .1, 0, .4], [0, 0, 1], 0, .2, .25, .74)).toEqual([.2, .1, 0, .4])
  })
  it('constant opacity one gives OVER alpha even when its color equation differs', () => {
    for (const mask of [0, .1, .5, 1]) for (const flow of [0, .25, 1]) {
      const result = creamyWash([.4, 0, 0, .4], [0, 0, 1], mask, 1, flow, 1)
      expect(result[3]).toBeCloseTo(mask * flow + .4 * (1 - mask * flow), 12)
    }
  })
  it('permits the blend alpha identity on a rising maximum and rejects the falling case', () => {
    const state: WashOpacityState = { average: .4, maximum: .4 }
    const step = advanceWashOpacity(state, .8)
    expect(step.canBlend).toBe(true)
    for (const destination of [0, .1, .4]) for (const mask of [.1, .5, 1]) for (const flow of [0, .25, 1]) {
      const alpha = creamyWash([destination, 0, 0, destination], [0, 0, 1], mask, .8, flow, step.average)[3]
      const q = mask * flow * .8 / step.average
      expect(alpha).toBeCloseTo(step.average * q + destination * (1 - q), 12)
    }
    const falling = advanceWashOpacity(state, .2)
    expect(falling.canBlend).toBe(false)
    const actual = creamyWash([.8, 0, 0, .8], [0, 0, 1], 1, .2, 1, falling.average)[3]
    const q = .2 / falling.average
    expect(Math.abs(actual - (falling.average * q + .8 * (1 - q)))).toBeGreaterThan(.01)
  })
})
