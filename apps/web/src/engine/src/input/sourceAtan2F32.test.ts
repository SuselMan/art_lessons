import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceAtan2F32.aosp13.json'
import { sourceAtan2F32 } from './sourceAtan2F32'

const buffer = new ArrayBuffer(4)
const words = new Uint32Array(buffer)
const floats = new Float32Array(buffer)
function decode(hex: string): number {
  words[0] = parseInt(hex, 16)
  return floats[0]
}
function encode(value: number): string {
  floats[0] = value
  return words[0].toString(16).padStart(8, '0')
}

describe('source-defined AOSP13 binary32 atan2 without FMA', () => {
  it('matches 512 independently generated C++ results bit for bit', () => {
    expect(fixture.cases).toHaveLength(512)
    for (const row of fixture.cases) {
      expect(encode(sourceAtan2F32(decode(row.y), decode(row.x))), `${row.y}/${row.x}`).toBe(row.result)
    }
  })

  it('preserves signed zeros and rounds arguments before quadrant selection', () => {
    expect(Object.is(sourceAtan2F32(-0, 1), -0)).toBe(true)
    expect(Object.is(sourceAtan2F32(0, 1), 0)).toBe(true)
    expect(Object.is(sourceAtan2F32(-1, Infinity), -0)).toBe(true)
    expect(encode(sourceAtan2F32(0, -1))).toBe('40490fdb')
    expect(encode(sourceAtan2F32(-0, -1))).toBe('c0490fdb')
    // A double value can round to a signed subnormal zero or overflow to infinity.
    expect(Object.is(sourceAtan2F32(-Number.MIN_VALUE, 1), -0)).toBe(true)
    expect(encode(sourceAtan2F32(1e40, 1e40))).toBe('3f490fdb')
    expect(sourceAtan2F32(1 + 2 ** -25, 1)).toBe(sourceAtan2F32(1, 1))
  })

  it('keeps the source float division/polynomial result instead of rounding host double atan2', () => {
    expect(sourceAtan2F32(85.875, 82.75)).toBe(0.8039282560348511)
    // Recorded Node20 double-atan2/fround value, not a requirement on every host libm.
    expect(sourceAtan2F32(85.875, 82.75)).not.toBe(0.8039283156394958)
  })

  it('retains a strict fan boundary that host double atan2 rounding crosses', () => {
    const x1 = decode('c2df856e'), y1 = decode('c4210aff')
    const x2 = decode('43bc3c5d'), y2 = decode('c405a199')
    const step = Math.PI / 4
    const sourceDistance = Math.abs(sourceAtan2F32(y2, x2) - sourceAtan2F32(y1, x1))
    expect(sourceDistance).toBe(0.7853981256484985)
    expect(sourceDistance > step).toBe(false)
    // Independently recorded double-atan2/fround witness; the test itself
    // must not depend on whichever transcendental implementation runs it.
    const recordedHostDistance = Math.abs(-0.9571831822395325 - -1.7425813674926758)
    expect(recordedHostDistance > step).toBe(true)
  })

  it('returns NaN classification without promising payload or floating exceptions', () => {
    for (const x of [NaN, 0, -0, Infinity, -Infinity, 1, -1]) {
      expect(Number.isNaN(sourceAtan2F32(NaN, x))).toBe(true)
      expect(Number.isNaN(sourceAtan2F32(x, NaN))).toBe(true)
    }
  })
})
