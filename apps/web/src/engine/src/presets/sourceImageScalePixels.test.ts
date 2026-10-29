import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceImageScalePixels.native.json'
import { sourceImageScalePixels, sourceImageScaleStraightScalar } from './sourceImageScalePixels'

describe('source-informed QImage smooth resize pixels', () => {
  it('matches actual compiled scalar and SSE kernels for every channel', () => {
    for (const c of native.cases) for (const law of ['scalar', 'simd'] as const) {
      const result = sourceImageScalePixels(new Uint8Array(c.input), c.width, c.height, c.targetWidth, c.targetHeight, law)
      const identity = c.width === c.targetWidth && c.height === c.targetHeight
      expect(result.format).toBe(identity ? 'straight' : 'premultiplied')
      expect([...result.pixels]).toEqual(identity ? c.input : c[law])
    }
  })
  it('matches actual host QImage::scaled and separately the scalar ARGB32 conversion', () => {
    for (const c of native.cases) {
      const result = sourceImageScalePixels(new Uint8Array(c.input), c.width, c.height, c.targetWidth, c.targetHeight, 'simd')
      expect([...result.pixels]).toEqual(c.qt)
      expect([...sourceImageScaleStraightScalar(result)]).toEqual(c.scalarStraight)
      expect(result.format).toBe(c.qtFormat === 5 ? 'straight' : 'premultiplied')
    }
  })
  it('keeps the scalar/SIMD difference explicit and never infers a replay law from the device', () => {
    const differing = native.cases.filter(c => c.scalar.some((v, i) => v !== c.simd[i]))
    expect(differing.length).toBeGreaterThanOrEqual(6)
    expect(native.cases.some(c => c.scalarStraight.some((v, i) => v !== c.qtStraight[i]))).toBe(true)
    for (const c of differing) {
      const a = sourceImageScalePixels(new Uint8Array(c.input), c.width, c.height, c.targetWidth, c.targetHeight, 'scalar')
      const b = sourceImageScalePixels(new Uint8Array(c.input), c.width, c.height, c.targetWidth, c.targetHeight, 'simd')
      expect(a.pixels).not.toEqual(b.pixels)
    }
  })
  it('retains identity colors even under alpha zero and does not alias input', () => {
    const input = Buffer.from([12, 34, 56, 0])
    const result = sourceImageScalePixels(input, 1, 1, 1, 1, 'simd')
    expect(result.format).toBe('straight')
    expect([...result.pixels]).toEqual([...input])
    result.pixels[0] = 99
    expect(input[0]).toBe(12)
    const scaled = sourceImageScalePixels(input, 1, 1, 2, 2, 'simd')
    expect([...scaled.pixels]).toEqual(Array(16).fill(0))
  })
  it('validates byte count, sizes, law and allocation bounds before pixel work', () => {
    for (const n of [0, -1, .1, NaN, Infinity, 65536]) expect(() => sourceImageScalePixels(new Uint8Array(4), n, 1, 1, 1, 'simd')).toThrow()
    expect(() => sourceImageScalePixels(new Uint8Array(4), 1025, 1025, 1, 1, 'simd')).toThrow()
    expect(() => sourceImageScalePixels(new Uint8Array(4), 1, 1, 1025, 1025, 'simd')).toThrow()
    expect(() => sourceImageScalePixels(new Uint8Array(4096 * 2 * 4), 4096, 2, 2, 4096, 'simd')).toThrow(/work exceeds the budget/)
    expect(() => sourceImageScalePixels(new Uint8Array(4097 * 4), 4097, 1, 1, 1, 'simd')).toThrow()
    expect(() => sourceImageScalePixels(new Uint8Array(3), 1, 1, 1, 1, 'simd')).toThrow()
    expect(() => sourceImageScalePixels(new Uint8Array(4), 1, 1, 1, 1, 'unknown' as 'simd')).toThrow()
    expect(() => sourceImageScaleStraightScalar({ pixels: new Uint8Array([2, 0, 0, 1]), format: 'premultiplied' })).toThrow()
  })
})
