import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import fixture from './fixtures/sourceImageTransformStore.native.json'
import { affineSpan16Straight } from '../raster/affineImageSpan16'

const bytes = Buffer.from(fixture.estimatesF32LE, 'base64')
const estimates = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const estimate = (alpha: number): number => estimates.getFloat32(alpha * 4, true)

it('matches actual Qt SSE4 store methods using independently captured finite-domain instruction inputs', () => {
  expect(bytes.byteLength).toBe(65536 * 4)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.provenance.rawSha256)
  for (const c of fixture.cases) expect([...affineSpan16Straight(Uint16Array.from(c.input), estimate)]).toEqual(c.expected)
})

it('preserves the concrete reciprocal rounding counterexample instead of relaxing comparison', () => {
  const input = Uint16Array.from([1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2])
  expect([...affineSpan16Straight(input)]).toEqual([128, 255, 128, 0, 128, 255, 128, 0, 128, 255, 128, 0, 128, 255, 128, 0])
  expect([...affineSpan16Straight(input, estimate)]).toEqual([127, 255, 127, 0, 127, 255, 127, 0, 127, 255, 127, 0, 127, 255, 127, 0])
})

it('validates and latches each callback result once before producing output bytes', () => {
  const input = Uint16Array.from([1, 2, 1, 2, 1, 2, 1, 2])
  let calls = 0
  const actual = affineSpan16Straight(input, alpha => { calls++; return estimate(alpha) })
  expect(calls).toBe(1)
  expect(actual.length).toBe(input.length)
  for (const invalid of [0, -1, NaN, Infinity, 1, 1 / 3]) expect(() => affineSpan16Straight(input, () => invalid)).toThrow(/reciprocal/)
  expect(() => affineSpan16Straight(input, null as unknown as (alpha: number) => number)).toThrow()
  expect(() => affineSpan16Straight(Uint16Array.from([3, 0, 0, 2]), estimate)).toThrow(/premultiplied/)
  expect([...input]).toEqual([1, 2, 1, 2, 1, 2, 1, 2])
})

it('checks all65535 finite alpha divisors against actual source-store bytes, including half-way colors', () => {
  const input = new Uint16Array(65535 * 16)
  for (let a = 1; a <= 65535; a++) input.set([0, a, Math.floor(a / 2), a,
    Math.min(1, a), a - 1, Math.floor(a * 127 / 255), a,
    Math.floor(a * 128 / 255), Math.min(a, 1 + Math.floor(a * 127 / 255)), Math.floor(a * 254 / 255), a,
    Math.floor(a / 3), Math.floor(2 * a / 3), a, a], (a - 1) * 16)
  const output = affineSpan16Straight(input, estimate)
  expect(output.length / 4).toBe(fixture.allAlpha.pixels)
  expect(createHash('sha256').update(output).digest('hex')).toBe(fixture.allAlpha.expectedSha256)
  expect(fixture.provenance.mxcsr & 0x6000).toBe(0)
})
