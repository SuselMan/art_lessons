import { describe, expect, it } from 'vitest'
import { brushAlphaThreshold } from './brushAlphaThreshold'

describe('mask alpha threshold before texture', () => {
  it('turns every positive U8 alpha opaque at value one', () => {
    expect([0,1,127,255].map(v=>brushAlphaThreshold(v/255,{value:1,softness:0}))).toEqual([0,1,1,1])
    expect(brushAlphaThreshold(.49/255,{value:1,softness:0})).toBe(0)
    expect(brushAlphaThreshold(.51/255,{value:1,softness:0})).toBe(1)
  })
  it('preserves the soft interval and uses the strict byte boundary', () => {
    const settings={value:.5,softness:.5}
    expect(brushAlphaThreshold(63/255,settings)).toBe(0)
    expect(brushAlphaThreshold(64/255,settings)).toBe(64/255)
    expect(brushAlphaThreshold(127/255,settings)).toBe(127/255)
    expect(brushAlphaThreshold(128/255,settings)).toBe(1)
    expect(brushAlphaThreshold(127/255,{value:.5,softness:0})).toBe(0)
  })
  it('keeps texture holes after threshold and leaves historical masks unchanged', () => {
    const mask=brushAlphaThreshold(1/255,{value:1,softness:0})
    expect([0,1].map(texture=>Math.max(0,mask-texture))).toEqual([1,0])
    // Thresholding after a partial texture value would incorrectly remove its tone.
    expect(Math.max(0,mask-.4)).toBe(.6)
    expect(brushAlphaThreshold(.12345)).toBe(.12345)
    expect(brushAlphaThreshold(1,{value:0,softness:0})).toBe(0)
  })
})
