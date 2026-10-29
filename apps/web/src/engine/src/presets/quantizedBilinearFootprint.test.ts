import { describe, expect, it } from 'vitest'
import { quantizedBilinearFootprint as footprint } from './quantizedBilinearFootprint'

describe('quantized bilinear source footprint', () => {
  it('keeps all four ordered old-data reads even at exact integer positions', () => {
    expect(footprint(3, -2)).toEqual({ pixels: [
      { x: 3, y: -2, weight: 255 }, { x: 4, y: -2, weight: 0 },
      { x: 3, y: -1, weight: 0 }, { x: 4, y: -1, weight: 0 },
    ], weightSum: 255 })
  })
  it('independently rounds half-pixel weights and returns 256 rather than renormalizing to 255', () => {
    expect(footprint(0.5, 0.5).pixels.map(p => p.weight)).toEqual([64, 64, 64, 64])
    expect(footprint(0.5, 0.5).weightSum).toBe(256)
    expect(footprint(0.5, 0).pixels.map(p => p.weight)).toEqual([128, 128, 0, 0])
  })
  it('uses floor at negative fractional positions, preserving matching translated weights', () => {
    expect(footprint(-0.25, -0.75)).toEqual({ pixels: [
      { x: -1, y: -1, weight: 48 }, { x: 0, y: -1, weight: 143 },
      { x: -1, y: 0, weight: 16 }, { x: 0, y: 0, weight: 48 },
    ], weightSum: 255 })
    expect(footprint(-0.25, -0.75).pixels.map(p => p.weight))
      .toEqual(footprint(4.75, 7.25).pixels.map(p => p.weight))
  })
  it('preserves source multiplication order near a rounding boundary', () => {
    // Fixed binary fractions, not fitted pixel output: weights 15.9375,
    // 47.8125, 47.8125, 143.4375 round independently.
    expect(footprint(0.75, 0.75).pixels.map(p => p.weight)).toEqual([16, 48, 48, 143])
  })
  it('rejects nonfinite and unrepresentable neighbor positions without wraparound', () => {
    for (const [x, y] of [[NaN, 0], [0, Infinity], [-Infinity, 0], [0x7fffffff, 0],
      [0, 0x7fffffff], [-0x80000001, 0], [0, -0x80000001], [1e100, 0]])
      expect(() => footprint(x, y)).toThrow(RangeError)
    expect(footprint(-0x80000000, 0).pixels[0].x).toBe(-0x80000000)
    expect(footprint(0x7ffffffe, 0).pixels[1].x).toBe(0x7fffffff)
  })
})
