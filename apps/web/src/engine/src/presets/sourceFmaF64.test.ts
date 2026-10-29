import { describe, expect, it, vi } from 'vitest'
import native from './fixtures/sourceAutoGeometry/math.native.json'
import { sourceFmaF64 } from './sourceFmaF64'
import * as reference from './sourceFmaF64Reference'
const view = new DataView(new ArrayBuffer(8))
function fromBits(hex: string): number { view.setBigUint64(0, BigInt(`0x${hex}`), false); return view.getFloat64(0, false) }
function toBits(value: number): string { view.setFloat64(0, value, false); return view.getBigUint64(0, false).toString(16).padStart(16, '0') }
function same(a: number, b: number, c: number) {
  expect(toBits(sourceFmaF64(a, b, c)), [a, b, c].join(',')).toBe(toBits(reference.sourceFmaF64Reference(a, b, c)))
}
describe('certified binary64 FMA number path', () => {
  it('matches every unchanged original Qt ARM64 FMADD case including signed zeros and extreme inputs', () => {
    expect(native.fmaCases).toHaveLength(512)
    for (const row of native.fmaCases) {
      const [a, b, c] = row.inputBits.map(fromBits)
      expect(toBits(sourceFmaF64(a, b, c)), row.inputBits.join(',')).toBe(row.outputBits)
    }
  })
  it('keeps exact halfway parity, asymmetric power-of-two boundaries and cancellation', () => {
    for (const sign of [-1, 1]) for (const exponent of [-400, -100, -1, 0, 1, 100, 400]) {
      const x = sign * 2 ** exponent
      for (const step of [-1, 0, 1, 2, 3]) for (const delta of [-1, 0, 1]) {
        same(1 + step * 2 ** -52, x, delta * 2 ** (exponent - 53))
        same(1 + step * 2 ** -52, x, -x)
      }
    }
    same(1 + 2 ** -27, 1 - 2 ** -27, -1)
    for (const a of [-0, 0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE])
      for (const b of [-0, 0, 1, -1, 2]) for (const c of [-0, 0, 1, -1]) same(a, b, c)
  })
  it('matches the independent integer reference across bounded and wide finite raw-bit inputs', () => {
    let seed = 0x32e89f17
    const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0 }
    for (let i = 0; i < 30000; i++) {
      const values = Array.from({ length: 3 }, () => ((next() / 0xffffffff) * 2 - 1) * 2 ** ((next() % 801) - 400))
      same(values[0], values[1], i % 3 === 0 ? -values[0] * values[1] : values[2])
    }
    for (let i = 0; i < 5000; i++) {
      const values = Array.from({ length: 3 }, () => { const high = next(), low = next(); view.setUint32(0, (high & 0x800fffff) | ((next() % 2047) << 20), false); view.setUint32(4, low, false); return view.getFloat64(0, false) })
      same(values[0], values[1], values[2])
    }
  }, 20000)
  it('does not enter BigInt rounding for ordinary geometry operands and rejects nonfinite inputs', () => {
    const fallback = vi.spyOn(reference, 'sourceFmaF64Reference')
    try {
      for (const [a, b, c] of [[.1, 40, Math.cos(Math.PI / 2) * 4], [.73, .61, -.27], [1 + 2 ** -27, 1 - 2 ** -27, -1], [0, 1, -.7], [2, 3, 0]]) sourceFmaF64(a, b, c)
      expect(fallback).not.toHaveBeenCalled()
      for (const n of [NaN, Infinity, -Infinity, '1', null, undefined, 1n, Symbol()] as never[]) expect(() => sourceFmaF64(n, 1, 1)).toThrow(RangeError)
    } finally { fallback.mockRestore() }
  })
})
