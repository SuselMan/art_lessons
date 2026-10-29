import { expect, it } from 'vitest'
import host from './fixtures/sourceArmFmaF32/host-fma.native.json'
import physical from './fixtures/sourceArmFmaF32/actual-frecps.native.json'
import { arm64FusedMultiplyAddF32Bits as reference } from './sourceArmFmaF32'
import { sourceFmaF32, sourceFmaF32Bits } from './sourceFmaF32'

it('matches unchanged host true-fmaf and physical Samsung FRECPS cases', () => {
  for (const [a, b, c, expected] of host.cases) expect(sourceFmaF32Bits(a, b, c)).toBe(expected)
  for (const [a, b, expected] of physical.cases) expect(sourceFmaF32Bits(a, b, 0x40000000)).toBe(expected)
})
it('preserves exact midpoint perturbations, signed zero, cancellation and overflow', () => {
  const edges = [0, 0x80000000, 1, 2, 3, 0x7fffff, 0x800000, 0x3f000000, 0x3f800000, 0x3f800001, 0x3fc00000, 0x73000000, 0x7f7fffff, 0xff7fffff]
  for (const a of edges) for (const b of edges) for (const c of edges) expect(sourceFmaF32Bits(a, b, c)).toBe(reference(a, b, c))
  expect(sourceFmaF32Bits(0x3fc00000, 0x3f800001, 0x80000001)).toBe(0x3fc00001)
  expect(Object.is(sourceFmaF32(-0, 1, -0), -0)).toBe(true)
})
it('matches independent exact BigInt rounding across arbitrary finite exponents', () => {
  let seed = 0x67549231
  const next = (): number => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; const raw = seed >>> 0; return ((raw >>> 23) & 255) === 255 ? (raw ^ 0x00800000) >>> 0 : raw }
  for (let i = 0; i < 50000; i++) { const a = next(), b = next(), c = next(); expect(sourceFmaF32Bits(a, b, c)).toBe(reference(a, b, c)) }
})
it('rejects malformed raw and numeric nonfinite inputs before arithmetic', () => {
  for (const bad of [-1, .5, 0x100000000, NaN, Infinity, 0x7f800000, 0xff800000, 0x7fc00000]) for (const i of [0, 1, 2]) { const args: [number, number, number] = [0, 0, 0]; args[i] = bad; expect(() => sourceFmaF32Bits(...args)).toThrow(RangeError) }
  for (const bad of [NaN, Infinity, 1e100, '1']) expect(() => sourceFmaF32(bad as number, 1, 0)).toThrow(RangeError)
})
