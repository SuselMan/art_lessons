/** Explicit Gaussian NEON numerical CPU candidate. Original instruction
 * conformance is required; no GUI factory, hardware execution or hot-path claim. */
import { sourceFmaF32 as fma } from './sourceFmaF32'
import { sourceVector32RefinedDivide } from './sourceVector32'
import { sourceImageRoundEven } from './sourceImageTransformReciprocal'
const f = Math.fround, data = new DataView(new ArrayBuffer(4))
function bits(value: number): number { data.setFloat32(0, value, true); return data.getUint32(0, true) }
function value(bits: number): number { data.setUint32(0, bits, true); return data.getFloat32(0, true) }
function finiteF32(input: number): void {
  if (!Number.isFinite(input) || f(input) !== input) throw new RangeError('Expected finite binary32 Gaussian value')
}
/** Integer threshold construction of the ARM 8fraction-bit reciprocal-square-
 * root estimate. This is a generic ISA value law, not a fixture lookup. */
export function sourceGaussianNeonRsqrtEstimate(input: number): number {
  finiteF32(input)
  if (input < 0 || Object.is(input, -0)) throw new RangeError('Gaussian rsqrt requires positive input or canonical+0')
  if (input === 0) return Infinity
  const raw = bits(input)
  let exponent = (raw >>> 23) & 255, fraction = raw & 0x7fffff
  if (exponent === 0) {
    while ((fraction & 0x400000) === 0) { fraction *= 2; exponent-- }
    fraction = (fraction & 0x3fffff) * 2
  }
  const bucket = (exponent & 1) === 0 ? 256 + (fraction >>> 15) : 128 + (fraction >>> 16)
  const midpoint = bucket < 256 ? 2 * bucket + 1 : 2 * ((bucket & ~1) + 1)
  // Smallest integer whose square crosses2^28/midpoint. Every integer
  // product is <2^31 and exact in binary64. No host sqrt is consulted.
  let low = 512, high = 1024
  while (low < high) {
    const middle = (low + high) >>> 1
    if (midpoint * middle * middle >= 2 ** 28) high = middle
    else low = middle + 1
  }
  const estimate = Math.floor(low / 2), resultExponent = Math.floor((380 - exponent) / 2)
  return value((resultExponent << 23) | ((estimate & 255) << 15))
}
/** Fused (3-a*b)/2 at the positive Newton domain. The exact F32 product
 * needs48bits and subtraction from3 needs<53 here, so binary64 is exact. */
export function sourceGaussianNeonRsqrtStep(a: number, b: number): number {
  finiteF32(a); finiteF32(b)
  if (!(a > 0 && b > 0 && a * b >= .5 && a * b <= 2)) throw new RangeError('Gaussian rsqrt step outside Newton domain')
  return f((3 - a * b) * .5)
}
export function sourceGaussianNeonSqrt(input: number): number {
  finiteF32(input)
  if (input < 0 || Object.is(input, -0)) throw new RangeError('Gaussian sqrt requires positive input or canonical+0')
  if (input === 0) return input
  let reciprocal = sourceGaussianNeonRsqrtEstimate(input)
  reciprocal = f(reciprocal * sourceGaussianNeonRsqrtStep(f(input * reciprocal), reciprocal))
  const product = f(input * reciprocal)
  return f(product * sourceGaussianNeonRsqrtStep(product, reciprocal))
}
/** Closed F32 exp candidate for Krita's9.3-limited vector erf. Polynomial and
 * reduction constants are source-derived xsimd candidate data, not a claim
 * about the installed dependency version. Whole instruction proof is separate. */
export function sourceGaussianNeonExp(input: number): number {
  finiteF32(input)
  if (input < -86.5 || input > 0) throw new RangeError('Gaussian NEON exp requires [-86.5,0]')
  const k = sourceImageRoundEven(f(f(1.4426950408889634) * input))
  let reduced = fma(-k, value(0x3f318000), input)
  reduced = fma(-k, value(0xb95e8083), reduced)
  let polynomial = value(0x3ab778cf)
  for (const coefficient of [0x3c098d8b, 0x3d2aa957, 0x3e2aa9a5, 0x3f000000]) polynomial = fma(polynomial, reduced, value(coefficient))
  const approximation = f(1 + fma(polynomial, f(reduced * reduced), reduced))
  return f(approximation * 2 ** k)
}
export function sourceGaussianNeonErf(input: number): number {
  finiteF32(input)
  const absolute = Math.abs(input)
  if (absolute >= f(9.3)) return input < 0 ? -1 : 1
  const t = sourceVector32RefinedDivide(1, fma(f(.3275911), absolute, 1))
  let polynomial = fma(f(1.061405429), t, f(-1.453152027))
  polynomial = fma(polynomial, t, f(1.421413741))
  polynomial = fma(polynomial, t, f(-.284496736))
  polynomial = fma(polynomial, t, f(.254829592))
  const y = fma(-f(polynomial * t), sourceGaussianNeonExp(f(-f(absolute * absolute))), 1)
  return f((input < 0 ? -1 : 1) * y)
}
