import { describe, expect, it } from 'vitest'
import native from './fixtures/rgba64Straight.qt5157.json'
import halfway from '../presets/fixtures/sourceImageTransformRcpA8.native.json'
import { sourceImageTransformPixels } from '../presets/sourceImageTransformPixels'
import { affineSpan16Straight, affineSpan16StraightInteger64 } from './affineImageSpan16'

describe('explicit Qt wordsize64 straight store', () => {
  it('matches unchanged native QRgba64 header outputs across the retained alpha/channel boundaries', () => {
    const input = new Uint16Array(native.cases.flatMap(([c, a]) => [c!, c!, c!, a!]))
    const before = input.slice()
    const expected = new Uint8Array(native.cases.flatMap(([, , , , color, alpha]) => [color!, color!, color!, alpha!]))
    expect(affineSpan16StraightInteger64(input)).toEqual(expected)
    expect(input).toEqual(before)
    // A legacy SSE float store cannot silently implement this source law.
    expect(affineSpan16Straight(input)).not.toEqual(expected)
  })
  it('preserves independent RGB channels and transparent/opaque boundaries', () => {
    expect(affineSpan16StraightInteger64(new Uint16Array([0, 0, 0, 0, 0, 32768, 65535, 65535, 0, 1, 2, 2])))
      .toEqual(new Uint8Array([0, 0, 0, 0, 0, 128, 255, 255, 0, 128, 255, 0]))
  })
  it('selects the explicit integer store in the shared transform without changing the source decode law', () => {
    const c = halfway
    // Actual unchanged Qt header store on the separately proven PM16 sampler's
    // output; fixes-v50/rgba64-transform-store.json. Not a full ARM image oracle.
    const expected = [126,126,126,1,128,128,128,1,85,85,85,0,127,127,127,251,128,128,128,254,128,128,128,3]
    const profile = { products: 'separate', sourceDecode: 'wide8', straightStore: 'qt-wordsize64' } as const
    expect([...sourceImageTransformPixels(Uint8Array.from(c.expected.levelRGBA), c.width, c.height, c.shape, c.subX, c.subY, profile)]).toEqual(expected)
    expect(() => sourceImageTransformPixels(Uint8Array.from(c.expected.levelRGBA), c.width, c.height, c.shape, c.subX, c.subY,
      { ...profile, reciprocalEstimate: () => { throw new Error('must not execute') } })).toThrow(RangeError)
  })
  it('rejects malformed or nonpremultiplied buffers before conversion', () => {
    for (const invalid of [new Uint16Array([1]), new Uint16Array([0, 1, 0, 0]), new Uint16Array([3, 0, 0, 2])]) {
      expect(() => affineSpan16StraightInteger64(invalid)).toThrow(RangeError)
    }
    expect(affineSpan16StraightInteger64(new Uint16Array())).toEqual(new Uint8Array())
  })
})
