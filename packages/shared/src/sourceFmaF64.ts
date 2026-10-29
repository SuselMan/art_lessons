import { sourceFmaF64Reference } from './sourceFmaF64Reference.js'

const SPLITTER = 134217729 // 2^27+1, Dekker split for binary64
const MIN_OPERAND = 2 ** -400, MAX_OPERAND = 2 ** 400
const bits = new DataView(new ArrayBuffer(8))
function bounded(n: number): boolean {
  if (!Number.isFinite(n)) return false
  const v = Math.abs(n)
  return v === 0 || v >= MIN_OPERAND && v <= MAX_OPERAND
}
/** Knuth TwoSum: the two returned doubles sum EXACTLY to a+b. The bounded
 * domain below excludes overflow and underflow of all nonzero error terms. */
function twoSum(a: number, b: number): readonly [number, number] {
  const sum = a + b, bv = sum - a
  return [sum, (a - (sum - bv)) + (b - bv)]
}
/** Adjacent binary64, used only for finite, normal, nonzero bounded values. */
function neighbour(n: number, up: boolean): number {
  bits.setFloat64(0, n, false)
  let high = bits.getUint32(0, false), low = bits.getUint32(4, false)
  if ((n > 0) === up) { if (low === 0xffffffff) { high++; low = 0 } else low++ }
  else { if (low === 0) { high--; low = 0xffffffff } else low-- }
  bits.setUint32(0, high, false); bits.setUint32(4, low, false)
  return bits.getFloat64(0, false)
}
/** Compare an exact nonoverlapping TwoSum expansion hi+lo to an exactly
 * representable boundary. If hi differs, lo (<=half an ulp) cannot cross it. */
function compare(hi: number, lo: number, boundary: number): number {
  return hi < boundary ? -1 : hi > boundary ? 1 : Math.sign(lo)
}

/** Exact finite-input binary64 FMA, RNE, with a certified ordinary-number
 * path and the independent integer reference outside its bounded domain.
 * No error tolerance or approximation is used to accept a result.
 *
 * Nonzero operands in [2^-400,2^400] keep products/splits/sums finite and
 * every nonzero expansion component normal (the finest product grid is
 * 2^-904). Dekker's product and TwoSum form an exact expansion. We compare
 * its final residual against the actual asymmetric neighbour midpoints,
 * including halfway parity. Severe cancellation needing a nonadjacent
 * correction, zero results and extreme inputs fall back to integer rounding.
 */
export function sourceFmaF64(a: number, b: number, c: number): number {
  if (!bounded(a) || !bounded(b) || !bounded(c)) return sourceFmaF64Reference(a, b, c)
  const product = a * b
  if (a === 0 || b === 0) return product + c // exact signed-zero addition
  if (c === 0) return product // nonzero normal product in this domain
  const ca = SPLITTER * a, ah = ca - (ca - a), al = a - ah
  const cb = SPLITTER * b, bh = cb - (cb - b), bl = b - bh
  const err1 = product - ah * bh, err2 = err1 - al * bh, err3 = err2 - ah * bl
  const productError = al * bl - err3
  const [sum, sumError] = twoSum(product, c)
  const [tail, tailError] = twoSum(productError, sumError)
  const [rounded, roundedError] = twoSum(sum, tail)
  if (rounded === 0) return sourceFmaF64Reference(a, b, c)
  const [residual, residualError] = twoSum(roundedError, tailError)
  const down = neighbour(rounded, false), up = neighbour(rounded, true)
  const lowerHalf = (down - rounded) / 2, upperHalf = (up - rounded) / 2
  // Establish that at most one neighbouring correction is needed. Do not
  // assume cancellation left the first rounded approximation close enough.
  const lowerOuter = (down - rounded) + (neighbour(down, false) - down) / 2
  const upperOuter = (up - rounded) + (neighbour(up, true) - up) / 2
  if (compare(residual, residualError, lowerOuter) <= 0 || compare(residual, residualError, upperOuter) >= 0)
    return sourceFmaF64Reference(a, b, c)
  const lower = compare(residual, residualError, lowerHalf), upper = compare(residual, residualError, upperHalf)
  if (lower < 0) return down
  if (upper > 0) return up
  if (lower === 0 || upper === 0) {
    bits.setFloat64(0, rounded, false)
    if (bits.getUint32(4, false) & 1) return lower === 0 ? down : up
  }
  return rounded
}
