import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import fixture from './fixtures/sourceRgba8ColorHsy/source-law.native.json'
import { compositeRgba8, sourceRgba8ColorHsyChannels, SOURCE_RGBA8_COLOR_HSY_PROFILE, SOURCE_RGBA8_GENERIC_SC_PROFILE } from './sourceColorRgba8'
import { canonicalizeSourceRgba8Control } from '../raster/sourceRgba8CompositeShader'
import type { Rgba8 } from './mixWeightedRgba8'
const pixel = (v: number[]): Rgba8 => {
  if (v.length !== 4) throw Error('Fixture pixel length')
  return [v[0], v[1], v[2], v[3]]
}
it('matches258 pinned native separate-F32 HSY bit graphs and full generic HSL composites', () => {
  const raw = new Uint8Array(fixture.cases.length * 16), view = new DataView(raw.buffer)
  for (const [i, row] of fixture.cases.entries()) {
    const source = pixel(row.src), destination = pixel(row.dst), cf = sourceRgba8ColorHsyChannels(source, destination)
    const bits = cf.map((n, c) => { view.setFloat32(i * 16 + 4 + c * 4, n, true); return view.getUint32(i * 16 + 4 + c * 4, true) })
    expect(bits, `HSY ${i}`).toEqual(row.colorF32Bits)
    const output = compositeRgba8(source, destination, { mode: 'colorHsy', profile: SOURCE_RGBA8_COLOR_HSY_PROFILE, opacity: row.opacity,
      ...(row.mask < 0 ? {} : { mask: row.mask }) })
    expect(output, `RGBA ${i}`).toEqual(row.expected)
    raw.set(output, i * 16)
  }
  expect(createHash('sha256').update(raw).digest('hex')).toBe(fixture.outputRGBAAndColorF32BitsSHA256)
})
it('does not substitute SC empty-source/destination shortcuts for the HSL byte stage', () => {
  const control = { mode: 'colorHsy', profile: SOURCE_RGBA8_COLOR_HSY_PROFILE, opacity: 0 } as const
  expect(compositeRgba8([255, 0, 0, 0], [3, 7, 19, 1], control)).toEqual([0, 0, 0, 1])
  expect(compositeRgba8([3, 7, 19, 1], [93, 18, 177, 0], { ...control, opacity: 1 })).toEqual([0, 0, 0, 1])
})
it('keeps the source-only HSY profile closed from GLSL SC IDs and wrong profiles', () => {
  const control = { mode: 'colorHsy', profile: SOURCE_RGBA8_COLOR_HSY_PROFILE, opacity: 1 } as const
  expect(() => canonicalizeSourceRgba8Control(control)).toThrow('no GPU mode')
  expect(() => compositeRgba8([0, 0, 0, 255], [0, 0, 0, 255], { ...control, profile: SOURCE_RGBA8_GENERIC_SC_PROFILE } as never)).toThrow('HSY')
})
