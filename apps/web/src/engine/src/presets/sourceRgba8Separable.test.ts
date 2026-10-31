import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceRgba8Separable/source-law.native.json'
import { compositeRgba8, sourceRgba8SeparableChannel, SOURCE_RGBA8_GENERIC_SC_PROFILE, type SourceRgba8SeparableMode } from './sourceColorRgba8'
import { canonicalizeSourceRgba8Control, SOURCE_RGBA8_COMPOSITE_GLSL } from '../raster/sourceRgba8CompositeShader'
import { SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL } from '../raster/sourceRgba8CompositeWebGL1'
import type { Rgba8 } from './mixWeightedRgba8'
const pixel = (v: number[]): Rgba8 => {
  if (v.length !== 4) throw new Error('Native fixture pixel must have four channels')
  return [v[0], v[1], v[2], v[3]]
}
const modes = ['multiply', 'lighten', 'colorDodge', 'overlay'] as const
const sha = (v: Uint8Array) => createHash('sha256').update(v).digest('hex')
describe('pinned generic SC byte separable operators', () => {
  for (const mode of modes) it(`matches all65536 native C++ ${mode} channel pairs`, () => {
    const bytes = new Uint8Array(65536)
    for (let s = 0; s < 256; s++) for (let d = 0; d < 256; d++) bytes[s * 256 + d] = sourceRgba8SeparableChannel(mode, s, d)
    expect(sha(bytes)).toBe(fixture.channelOutputSHA256[mode])
  })
  it('matches260 original generic template composites with mask/alpha/opacity branches', () => {
    const pixels = new Uint8Array(fixture.cases.length * 4)
    for (const [i, row] of fixture.cases.entries()) {
      const control = { mode: row.mode as SourceRgba8SeparableMode, profile: SOURCE_RGBA8_GENERIC_SC_PROFILE, opacity: row.opacity,
        ...(row.mask < 0 ? {} : { mask: row.mask }) }
      const output = compositeRgba8(pixel(row.src), pixel(row.dst), control)
      expect(output, `${i} ${row.mode}`).toEqual(row.expected)
      pixels.set(output, i * 4)
    }
    expect(sha(pixels)).toBe(fixture.pixelOutputSHA256)
  })
  it('retains MULT3 even with absent mask and preserves zero-alpha hidden RGB', () => {
    const c = { mode: 'multiply', profile: SOURCE_RGBA8_GENERIC_SC_PROFILE, opacity: 248 / 255 } as const
    expect(compositeRgba8([1, 2, 3, 91], [4, 5, 6, 0], c)).toEqual([1, 2, 3, 88])
    expect(compositeRgba8([1, 2, 3, 0], [4, 5, 6, 0], c)).toEqual([4, 5, 6, 0])
    expect(compositeRgba8([1, 2, 3, 255], [4, 5, 6, 17], { ...c, mask: 0 })).toEqual([4, 5, 6, 17])
  })
  it('casts opacity to native float before half-up byte quantization', () => {
    expect(Math.trunc((.5 - 1e-12) * 255 + .5)).toBe(127)
    expect(compositeRgba8([17, 129, 254, 255], [93, 1, 252, 0], { mode: 'multiply', profile: SOURCE_RGBA8_GENERIC_SC_PROFILE, opacity: .5 - 1e-12 })).toEqual([17, 129, 254, 128])
  })
  it('retains native overlay127 identity and dodge zero denominator corners', () => {
    for (let s = 0; s < 256; s++) expect(sourceRgba8SeparableChannel('overlay', s, 127)).toBe(s)
    expect(sourceRgba8SeparableChannel('overlay', 0, 128)).toBe(1)
    expect(sourceRgba8SeparableChannel('colorDodge', 255, 0)).toBe(0)
    expect(sourceRgba8SeparableChannel('colorDodge', 255, 1)).toBe(255)
  })
  it('requires explicit generic U8 profile and keeps mode ids closed in both dialects', () => {
    for (const [i, mode] of modes.entries()) {
      expect(canonicalizeSourceRgba8Control({ mode, profile: SOURCE_RGBA8_GENERIC_SC_PROFILE, opacity: .5 }).mode).toBe(i + 3)
      expect(() => canonicalizeSourceRgba8Control({ mode, opacity: .5 } as never)).toThrow('profile')
    }
    expect(() => canonicalizeSourceRgba8Control({ mode: 'unknown', opacity: .5 } as never)).toThrow()
    expect(() => sourceRgba8SeparableChannel('unknown' as never, 1, 2)).toThrow()
    for (const shader of [SOURCE_RGBA8_COMPOSITE_GLSL, SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL]) {
      expect(shader).toContain('sourceRgba8GenericScChannel')
      expect(shader).toContain('sourceRgba8SeparableChannel')
      expect(shader).toContain('destination == 127')
    }
  })
})
