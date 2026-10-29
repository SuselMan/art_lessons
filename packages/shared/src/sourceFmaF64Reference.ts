/** Exact finite-input binary64 fused multiply-add, RNE. Deliberately a BigInt
 * reference for source-law validation; this is not an author hot-path kernel. */
const bitsBuffer = new ArrayBuffer(8)
const bitsView = new DataView(bitsBuffer)
interface Parts { readonly significand: bigint; readonly exponent: number; readonly negative: boolean }
function parts(value: number): Parts {
  if (!Number.isFinite(value)) throw new RangeError('Expected finite binary64 input')
  bitsView.setFloat64(0, value, false)
  const bits = bitsView.getBigUint64(0, false), fraction = bits & 0xfffffffffffffn
  const field = Number((bits >> 52n) & 2047n)
  return { significand: field ? fraction | 0x10000000000000n : fraction,
    exponent: field ? field - 1075 : -1074, negative: (bits >> 63n) !== 0n }
}
function signed(value: bigint, negative: boolean): bigint { return negative ? -value : value }
export function sourceFmaF64Reference(a: number, b: number, c: number): number {
  const x = parts(a), y = parts(b), z = parts(c), productExponent = x.exponent + y.exponent
  const exponent = Math.min(productExponent, z.exponent), productNegative = x.negative !== y.negative
  const exact = (signed(x.significand * y.significand, productNegative) << BigInt(productExponent - exponent))
    + (signed(z.significand, z.negative) << BigInt(z.exponent - exponent))
  if (exact === 0n) return productNegative && z.negative ? -0 : 0
  const negative = exact < 0n, magnitude = negative ? -exact : exact
  const top = magnitude.toString(2).length - 1, quantum = Math.max(-1074, top + exponent - 52)
  const shift = quantum - exponent
  let rounded: bigint
  if (shift <= 0) rounded = magnitude << BigInt(-shift)
  else {
    rounded = magnitude >> BigInt(shift)
    const remainder = magnitude - (rounded << BigInt(shift)), halfway = 1n << BigInt(shift - 1)
    if (remainder > halfway || (remainder === halfway && (rounded & 1n) !== 0n)) rounded++
  }
  const value = Number(rounded) * 2 ** quantum
  return negative ? -value : value
}
