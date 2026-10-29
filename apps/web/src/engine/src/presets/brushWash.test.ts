import { describe, expect, it } from 'vitest'
import { advanceWashOpacity, creamyWash, sourceBlendAverageOpacity, type WashOpacityState } from './brushWash'
import nativeAverage from './fixtures/sourceAlphaDarken32/opacity-average.native.json'

describe('creamy wash opacity history', () => {
  it('rises immediately and decays by one tenth, retaining the previous maximum', () => {
    const state: WashOpacityState = { average: 0, maximum: 0 }
    expect(advanceWashOpacity(state, .8)).toEqual({ average: .8, maxPrev: 0, canBlend: true })
    const falling = advanceWashOpacity(state, .2)
    expect(falling.average).toBe(0.7399999991059303)
    expect(falling.maxPrev).toBe(.8)
    expect(falling.canBlend).toBe(false)
    expect(advanceWashOpacity(state, .9)).toEqual({ average: .9, maxPrev: .8, canBlend: true })
    expect(advanceWashOpacity(state, .2).average).toBe(0.8299999989569187)
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
  it('matches unchanged native qreal average history and its later float narrowing', () => {
    let cases=0,oldFloatDifferences=0
    for(const sequence of nativeAverage.sequences) {
      let average=sequence.initial,maximum=sequence.initial
      let oldAverage=sequence.initial
      for(const [index,step] of sequence.steps.entries()) {
        expect(average).toBe(step.before)
        const actual=sourceBlendAverageOpacity(step.opacity,average)
        expect(actual).toBe(step.expected)
        expect(Math.fround(actual)).toBe(step.floatExpected)
        // Actual preview and new canonical composition share one history law.
        const state={average,maximum}
        expect(advanceWashOpacity(state,step.opacity).average).toBe(step.expected)
        maximum=state.maximum
        oldAverage=step.opacity>oldAverage?step.opacity:.1*step.opacity+.9*oldAverage
        if(Math.fround(oldAverage)!==step.floatExpected)oldFloatDifferences++
        average=actual;cases++
        // A transport cut/checkpoint must keep qreal, not an already rounded
        // ParameterInfo value. Clone only; never restart the ordered history.
        if(index%7===0)average=structuredClone(average)
      }
    }
    expect(cases).toBe(640)
    expect(oldFloatDifferences).toBeGreaterThan(0)
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
