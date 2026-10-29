/** Exact finite binary32 FMA using binary64 expansions, RNE and gradual underflow.
 * Independent arithmetic implementation: a binary32 product has at most48bits,
 * and its exponent range fits normal binary64. TwoSum retains the exact addend.
 * No BigInt, epsilon, approximate midpoint or native dispatch assumption. */
const view = new DataView(new ArrayBuffer(4))
function value(bits: number): number {
  if (!Number.isInteger(bits) || bits < 0 || bits > 0xffffffff || ((bits >>> 23) & 255) === 255) throw new RangeError('Expected finite binary32 bits')
  view.setUint32(0, bits, true)
  return view.getFloat32(0, true)
}
function bits(value: number): number {
  view.setFloat32(0, value, true)
  return view.getUint32(0, true)
}
/** Compare exact hi+lo against an exactly representable binary64 midpoint.
 * If hi differs, its nearest-rounding error lo cannot cross another binary64.
 * Equality is decided by the retained exact residual, including tiny addends. */
function compare(hi: number, lo: number, midpoint: number): number {
  return hi === midpoint ? Math.sign(lo) : hi < midpoint ? -1 : 1
}
export function sourceFmaF32Bits(aBits: number, bBits: number, cBits: number): number {
  const a = value(aBits), b = value(bBits), c = value(cBits)
  const product = a * b
  const hi = product + c
  const recoveredC = hi - product
  const lo = (product - (hi - recoveredC)) + (c - recoveredC)
  if (hi === 0 && lo === 0) {
    return product === 0 && c === 0 && ((aBits ^ bBits) >>> 31) !== 0 && (cBits >>> 31) !== 0 ? 0x80000000 : 0
  }
  const negative = hi < 0 || (hi === 0 && lo < 0)
  const h = negative ? -hi : hi, l = negative ? -lo : lo
  const sign = negative ? 0x80000000 : 0
  const overflowMidpoint = 2 ** 128 - 2 ** 103
  let rounded = bits(h)
  if (rounded === 0x7f800000) {
    if (compare(h, l, overflowMidpoint) < 0) rounded--
  } else {
    const q = value(rounded)
    const upper = rounded === 0x7f7fffff ? overflowMidpoint : (q + value(rounded + 1)) / 2
    const upperComparison = compare(h, l, upper)
    if (upperComparison > 0 || (upperComparison === 0 && (rounded & 1) !== 0)) rounded++
    else if (rounded > 0) {
      const lower = (q + value(rounded - 1)) / 2
      const lowerComparison = compare(h, l, lower)
      if (lowerComparison < 0 || (lowerComparison === 0 && (rounded & 1) !== 0)) rounded--
    }
  }
  return (sign | rounded) >>> 0
}
/** Numeric convenience narrows inputs once, rejecting nonfinite F32 inputs. */
export function sourceFmaF32(a: number, b: number, c: number): number {
  if (![a, b, c].every(v => typeof v === 'number' && Number.isFinite(v))) throw new RangeError('Expected finite numeric FMA inputs')
  const result = sourceFmaF32Bits(bits(a), bits(b), bits(c))
  view.setUint32(0, result, true)
  return view.getFloat32(0, true)
}
