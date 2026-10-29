import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceColorRgba8/scalar.native.json'
import { hsvAdjustColor } from './brushBehavior'
import { adjustHsvChromaRgba8, adjustHslCompatibilityRgba8, compositeRgba8 } from './sourceColorRgba8'
import type { Rgba8 } from './mixWeightedRgba8'

const pixel = (v: readonly number[]): Rgba8 => [v[0], v[1], v[2], v[3]]
describe('non-compatibility HSV/chroma RGB8 (actual native float transform)', () => {
  for (const [i, row] of fixture.hsv.entries()) it(`exact native bytes ${i}`, () => {
    expect(adjustHsvChromaRgba8(pixel(row.input), row.adjust[0], row.adjust[1], row.adjust[2])).toEqual(row.expected)
  })
  it('stores colour bytes before coverage instead of deferring quantization until the final blend', () => {
    // Authored native request4: controls lie inside the active stock71 range.
    const row = fixture.hsv[4], source = pixel(row.input)
    const native = adjustHsvChromaRgba8(source, row.adjust[0], row.adjust[1], row.adjust[2])
    const legacy = hsvAdjustColor([source[0] / 255, source[1] / 255, source[2] / 255], row.adjust[0], row.adjust[1], row.adjust[2])
    expect(native).toEqual([117, 233, 31, 90])
    const covered = compositeRgba8([native[0], native[1], native[2], 128], [0, 0, 0, 255], { mode: 'over', opacity: 1 })
    expect(covered).toEqual([59, 117, 16, 255])
    expect(legacy.map(v => Math.round(v * 128))).toEqual([59, 117, 15])
  })
  it('keeps hidden RGB and alpha0, and selects a different mathematical model from HSL compatibility', () => {
    expect(adjustHsvChromaRgba8([255, 0, 0, 0], 1, 0, 0)).toEqual([0, 255, 255, 0])
    const input = Object.freeze([128, 64, 32, 79] as const)
    expect(adjustHsvChromaRgba8(input, .2, .5, .3)).not.toEqual(adjustHslCompatibilityRgba8(input, .2, .5, .3))
    expect(adjustHsvChromaRgba8(input, 0, 0, 0)).toEqual(input)
    expect(input).toEqual([128, 64, 32, 79])
  })
  it('rejects malformed pixels and non-signed controls before computing colour', () => {
    for (const value of [NaN, -1.01, Infinity, 1.01]) expect(() => adjustHsvChromaRgba8([1, 2, 3, 4], 0, 0, value)).toThrow()
    expect(() => adjustHsvChromaRgba8([1.5, 2, 3, 4], 0, 0, 0)).toThrow()
  })
})
