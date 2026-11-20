import { describe, expect, it } from 'vitest'
import fixtures from './mixWeightedRgba8.fixtures.json'
import { mixWeightedRgba8, type Rgba8 } from './mixWeightedRgba8'
import { quantizedBilinearFootprint } from './quantizedBilinearFootprint'

describe('integer RGBA8 weighted mixing', () => {
  it('matches the pinned upstream C++ mixing implementation', () => {
    expect(fixtures.cases).toHaveLength(256)
    for (const row of fixtures.cases) {
      const pixels: Rgba8[] = row.pixels.map(p => [p[0], p[1], p[2], p[3]])
      expect(mixWeightedRgba8(pixels, row.weights, row.normalizer)).toEqual(row.expected)
    }
  })
  it('excludes hidden RGB and preserves the alpha-weighted color', () => {
    expect(mixWeightedRgba8([[255, 0, 0, 0], [0, 0, 255, 255]], [128, 127], 255)).toEqual([0, 0, 255, 127])
    expect(mixWeightedRgba8([[255, 0, 0, 0], [0, 255, 0, 0]], [128, 127], 255)).toEqual([0, 0, 0, 0])
  })
  it('uses the actual independently quantized footprint sum', () => {
    const footprint = quantizedBilinearFootprint(.5, .5)
    const pixels: Rgba8[] = [[10, 20, 30, 100], [10, 20, 30, 100], [10, 20, 30, 100], [10, 20, 30, 100]]
    expect(footprint.weightSum).toBe(256)
    expect(mixWeightedRgba8(pixels, footprint.pixels.map(p => p.weight), footprint.weightSum)).toEqual([10, 20, 30, 100])
  })
  it('keeps the deliberate opacity loss of background weights with normalizer 255', () => {
    // Native Grid truncates both pressure weights: pressure .5 -> 127 + 127.
    const pixels: Rgba8[] = [[255, 0, 0, 255], [0, 0, 255, 255]]
    expect(mixWeightedRgba8(pixels, [127, 127], 255)).toEqual([128, 0, 128, 254])
    expect(mixWeightedRgba8(pixels, [127, 127], 254)).toEqual([128, 0, 128, 255])
  })
  it('rounds integer half ties upward and clamps alpha independently', () => {
    expect(mixWeightedRgba8([[0, 0, 0, 1], [1, 3, 5, 1]], [1, 1], 2)).toEqual([1, 2, 3, 1])
    expect(mixWeightedRgba8([[10, 20, 30, 255]], [32767], 1)).toEqual([10, 20, 30, 255])
  })
  it('does not mutate sources used by the frozen gesture view', () => {
    const pixels = Object.freeze([Object.freeze([10, 20, 30, 40] as const)])
    expect(mixWeightedRgba8(pixels, Object.freeze([255]), 255)).toEqual([10, 20, 30, 40])
  })
  it.each([0, -1, .5, Infinity, NaN, 0x80000000])('rejects invalid normalizer %s', normalizer => {
    expect(() => mixWeightedRgba8([[0, 0, 0, 255]], [1], normalizer)).toThrow(RangeError)
  })
  it.each([-1, .5, 32768, Infinity, NaN])('rejects invalid weight %s', weight => {
    expect(() => mixWeightedRgba8([[0, 0, 0, 255]], [weight], 255)).toThrow(RangeError)
  })
  it.each([-1, .5, 256, Infinity, NaN])('rejects invalid channel %s', channel => {
    expect(() => mixWeightedRgba8([[channel, 0, 0, 255]], [255], 255)).toThrow(RangeError)
  })
  it('rejects empty, mismatched and unsafe sample counts', () => {
    expect(() => mixWeightedRgba8([], [], 255)).toThrow(RangeError)
    expect(() => mixWeightedRgba8([[0, 0, 0, 255]], [], 255)).toThrow(RangeError)
    expect(() => mixWeightedRgba8(Array.from({ length: 65536 }, () => [0, 0, 0, 255] as const), Array(65536).fill(1), 65536)).toThrow(RangeError)
  })
})
