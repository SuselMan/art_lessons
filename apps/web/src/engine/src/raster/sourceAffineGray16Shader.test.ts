import { describe, expect, it } from 'vitest'
import { assertSourceAffineGray16Row, SOURCE_AFFINE_GRAY16_GLSL, type SourceAffineGray16Row } from './sourceAffineGray16Shader'
const row: SourceAffineGray16Row = { origin: [-2, 65535, 1, 32768], step: [1, 12345, -1, 32768], length: 9, decode: 'wide8', products: 'separate' }
describe('isolated WebGL1 gray16 sampling profile', () => {
  it('admits bounded split rows including negative coordinates, never requiring WebGL2 integer syntax', () => {
    expect(() => assertSourceAffineGray16Row(row, 23)).not.toThrow()
    expect(() => assertSourceAffineGray16Row({ ...row, decode: 'neon4', products: 'summed' }, 23)).not.toThrow()
    expect(SOURCE_AFFINE_GRAY16_GLSL).not.toMatch(/\b(?:uint|usampler2D|texelFetch)\b/)
  })
  it('rejects unknown precision, invalid fractional fields, span budgets and signed fixed overflow', () => {
    for (const bits of [0, 16, 22, NaN]) expect(() => assertSourceAffineGray16Row(row, bits)).toThrow()
    expect(() => assertSourceAffineGray16Row({ ...row, length: 2049 }, 23)).toThrow()
    expect(() => assertSourceAffineGray16Row({ ...row, decode: 'auto' as 'wide8' }, 23)).toThrow()
    expect(() => assertSourceAffineGray16Row({ ...row, origin: [0, -1, 0, 0] }, 23)).toThrow()
    expect(() => assertSourceAffineGray16Row({ ...row, step: [32767, 0, 0, 0] }, 23)).toThrow()
  })
  it('keeps the CPU store and final A8 operation outside this shader profile', () => {
    expect(SOURCE_AFFINE_GRAY16_GLSL).not.toMatch(/reciprocal|unpremul|inverse.red|65535\.0\s*\//i)
    expect(SOURCE_AFFINE_GRAY16_GLSL).toContain('floor(result.x/256.0)')
  })
})
