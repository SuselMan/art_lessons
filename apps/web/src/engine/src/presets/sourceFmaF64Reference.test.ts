import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceAutoGeometry/math.native.json'
import { sourceFmaF64Reference } from './sourceFmaF64Reference'
const buffer = new ArrayBuffer(8), view = new DataView(buffer)
function fromBits(hex: string): number { view.setBigUint64(0, BigInt(`0x${hex}`), false); return view.getFloat64(0, false) }
function toBits(value: number): string { view.setFloat64(0, value, false); return view.getBigUint64(0, false).toString(16).padStart(16, '0') }
describe('sourceFmaF64Reference', () => {
  it('matches 512 unchanged original Qt ARM64 FMADD executions, including underflow and cancellation', () => {
    expect(native.fmaCases).toHaveLength(512)
    for (const row of native.fmaCases) {
      const [a, b, c] = row.inputBits.map(fromBits)
      expect(toBits(sourceFmaF64Reference(a, b, c)), row.inputBits.join(',')).toBe(row.outputBits)
    }
  })
  it('preserves signed zero and performs one rounding instead of product then add', () => {
    expect(Object.is(sourceFmaF64Reference(-0, 1, -0), -0)).toBe(true)
    expect(Object.is(sourceFmaF64Reference(1, 1, -1), 0)).toBe(true)
    expect(sourceFmaF64Reference(1 + 2 ** -27, 1 - 2 ** -27, -1)).toBe(-(2 ** -54))
    expect(sourceFmaF64Reference(Number.MAX_VALUE, 2, -Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
    expect(sourceFmaF64Reference(Number.MAX_VALUE, 2, Number.MAX_VALUE)).toBe(Infinity)
  })
  it('rejects nonfinite operands before integer decomposition', () => {
    for (const value of [NaN, Infinity, -Infinity]) for (const input of [[value, 1, 1], [1, value, 1], [1, 1, value]]) {
      expect(() => sourceFmaF64Reference(input[0], input[1], input[2])).toThrow(RangeError)
    }
  })
})
