import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceArmFrecpe/samsung-fpcr0.native.json'
import { arm64ReciprocalEstimateF32, arm64ReciprocalEstimateF32Bits } from './sourceArmFrecpe'

describe('source-defined AArch64 FRECPE, FPCR0', () => {
  it('matches every retained actual Samsung record bit for bit', () => {
    expect(fixture.FPCR).toBe(0)
    for (const row of fixture.cases) expect(arm64ReciprocalEstimateF32Bits(row.inputBits), `native record ${row.index}`).toBe(row.expectedBits)
  })
  it('preserves sign, quiets signaling NaN payloads, and handles both zeros and infinities', () => {
    expect(arm64ReciprocalEstimateF32Bits(0)).toBe(0x7f800000)
    expect(arm64ReciprocalEstimateF32Bits(0x80000000)).toBe(0xff800000)
    expect(arm64ReciprocalEstimateF32Bits(0x7f800000)).toBe(0)
    expect(arm64ReciprocalEstimateF32Bits(0xff800000)).toBe(0x80000000)
    expect(arm64ReciprocalEstimateF32Bits(0x7f800001)).toBe(0x7fc00001)
    expect(arm64ReciprocalEstimateF32Bits(0xffc12345)).toBe(0xffc12345)
  })
  it('uses an estimate, not exact division or a Newton-refined reciprocal', () => {
    expect(arm64ReciprocalEstimateF32(1)).toBe(511 / 512)
    expect(arm64ReciprocalEstimateF32(2)).toBe(511 / 1024)
    expect(arm64ReciprocalEstimateF32(3)).not.toBe(Math.fround(1 / 3))
    expect(Object.is(arm64ReciprocalEstimateF32(-Infinity), -0)).toBe(true)
  })
  it('rejects non-u32 raw inputs rather than silently coercing a different profile', () => {
    for (const invalid of [-1, .5, 0x100000000, NaN, Infinity]) expect(() => arm64ReciprocalEstimateF32Bits(invalid)).toThrow(RangeError)
  })
})
