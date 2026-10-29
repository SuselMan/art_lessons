import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceOverPortable/scalar-sse.native.json'
import { compositePortableF32Over } from './sourceOverPortable'
import { applyRgba8AlphaMask, compositeRgba8 } from './sourceColorRgba8'
import type { Rgba8 } from './mixWeightedRgba8'

describe('explicit portable float32 Over profile', () => {
  it('bounds all 512 independent native scalar SSE receipts and records exact reciprocal residuals', () => {
    const residuals: number[] = []
    fixture.cases.forEach((row, index) => {
      const output = compositePortableF32Over(row.src as Rgba8, row.dst as Rgba8, { profile: 'portableF32', opacity: row.opacity, mask: row.mask < 0 ? undefined : row.mask })
      if (output.some((v, channel) => v !== row.expected[channel])) residuals.push(index)
      expect(output[3]).toBe(row.expected[3])
      output.forEach((v, channel) => expect(Math.abs(v - row.expected[channel])).toBeLessThanOrEqual(1))
    })
    expect(residuals).toEqual([213, 253])
  })
  it('keeps material mask byte storage distinct from a composite mask', () => {
    const source: Rgba8 = [128, 64, 32, 128]
    const empty: Rgba8 = [0, 0, 0, 0]
    expect(compositePortableF32Over(source, empty, { profile: 'portableF32', opacity: .99, mask: 1 })[3]).toBe(0)
    expect(compositePortableF32Over(applyRgba8AlphaMask(source, 1), empty, { profile: 'portableF32', opacity: .99 })[3]).toBe(1)
  })
  it('does not silently select integer opacity rounding or overwrite transparent destination RGB', () => {
    const source: Rgba8 = [128, 64, 32, 1], destination: Rgba8 = [0, 0, 0, 0]
    expect(compositePortableF32Over(source, destination, { profile: 'portableF32', opacity: .5 })).toEqual([128, 64, 32, 0])
    expect(compositeRgba8(source, destination, { mode: 'over', opacity: .5 })[3]).toBe(1)
    expect(compositePortableF32Over(source, [9, 8, 7, 0], { profile: 'portableF32', opacity: 0 })).toEqual([9, 8, 7, 0])
  })
  it('validates the complete immutable input even for invisible output', () => {
    const good: Rgba8 = [0, 0, 0, 0]
    expect(() => compositePortableF32Over([0, 0, 0, 256], good, { profile: 'portableF32', opacity: 0 })).toThrow()
    for (const opacity of [NaN, Infinity, -.1, 1.1]) expect(() => compositePortableF32Over(good, good, { profile: 'portableF32', opacity })).toThrow()
    for (const mask of [NaN, 1.5, -1, 256]) expect(() => compositePortableF32Over(good, good, { profile: 'portableF32', opacity: 1, mask })).toThrow()
  })
})
