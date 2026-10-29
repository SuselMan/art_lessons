import { describe, expect, it } from 'vitest'
import { buildRgba64FactorLut, SOURCE_RGBA64_STRAIGHT_GLSL } from './sourceRgba64StraightShader'
import { rgba64UnpremultiplyFactor } from './affineImageSpan16'
describe('explicit GPU Qt-wordsize64 factor resources', () => {
  it('packs all canonical factors without any host reciprocal or duplicate unpremultiply algorithm', () => {
    const lut = buildRgba64FactorLut()
    expect(lut.low.length + lut.high.length).toBe(lut.bytes)
    for (let alpha = 0; alpha <= 65535; alpha++) {
      let actual = 0
      for (let byte = 5; byte >= 0; byte--) actual = actual * 256 + (byte < 4 ? lut.low[alpha * 4 + byte] : lut.high[alpha * 4 + byte - 4])
      expect(actual).toBe(rgba64UnpremultiplyFactor(alpha))
      expect(lut.high[alpha * 4 + 2]).toBe(0)
      expect(lut.high[alpha * 4 + 3]).toBe(0)
    }
  })
  it('gives each preparation caller independent arrays and leaves legacy CPU store selection alone', () => {
    const a = buildRgba64FactorLut(), b = buildRgba64FactorLut()
    a.low[4] = 1
    expect(b.low[4]).toBe(0)
    a.high[4] = 0
    expect(b.high[4]).not.toBe(0)
    expect(SOURCE_RGBA64_STRAIGHT_GLSL).not.toMatch(/\b(?:uint|usampler2D|texelFetch)\b/)
  })
})
