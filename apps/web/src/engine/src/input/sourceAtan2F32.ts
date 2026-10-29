/*! @license
 * Source-version binary32 atan2: AOSP android-13.0.0_r1 / FreeBSD msun.
 * https://android.googlesource.com/platform/bionic/+/android-13.0.0_r1/libm/upstream-freebsd/lib/msun/src/e_atan2f.c
 * SHA256 e4d4c123670b7d40f132630cae4699a9fa67695accdc8f8a8c175bdecb39d8af
 * https://android.googlesource.com/platform/bionic/+/android-13.0.0_r1/libm/upstream-freebsd/lib/msun/src/s_atanf.c
 * SHA256 c5d396befa5c58581f4e43b57e1b39373447d4416901fe936b0fa1cfb85066f4
 * Conversion to float by Ian Lance Taylor, Cygnus Support, ian@cygnus.com.
 *
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 * Developed at SunPro, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this software is freely
 * granted, provided that this notice is preserved.
 */

const f32 = Math.fround
const floatView = new Float32Array(1)
const wordView = new Uint32Array(floatView.buffer)

function floatWord(value: number): number {
  floatView[0] = value
  return wordView[0] | 0
}

// Each source float operation rounds separately. Deliberately no fused multiply-add.
const add = (a: number, b: number): number => f32(a + b)
const subtract = (a: number, b: number): number => f32(a - b)
const multiply = (a: number, b: number): number => f32(a * b)
const divide = (a: number, b: number): number => f32(a / b)

const atanHi = [.46364760399, .78539812565, .98279368877, 1.5707962513].map(f32)
const atanLo = [5.012158244e-9, 3.7748947079e-8, 3.447321717e-8, 7.5497894159e-8].map(f32)
const coefficients = [.33333328366, -.19999158382, .14253635705, -.10648017377, .061687607318].map(f32)
const huge = f32(1e30)
const tiny = f32(1e-30)
const pi = f32(3.141592741)
const piLo = f32(-8.7422776573e-8)
const quarterPi = f32(.78539818525)
const halfPi = f32(1.5707963705)

function sourceAtanF32(value: number): number {
  let x = f32(value)
  const hx = floatWord(x)
  const ix = hx & 0x7fffffff
  let id: number
  if (ix >= 0x4c800000) {
    if (ix > 0x7f800000) return add(x, x)
    return hx > 0 ? add(atanHi[3], atanLo[3]) : subtract(-atanHi[3], atanLo[3])
  }
  if (ix < 0x3ee00000) {
    if (ix < 0x39800000 && add(huge, x) > 1) return x
    id = -1
  } else {
    x = Math.abs(x)
    if (ix < 0x3f980000) {
      if (ix < 0x3f300000) {
        id = 0
        x = divide(subtract(multiply(2, x), 1), add(2, x))
      } else {
        id = 1
        x = divide(subtract(x, 1), add(x, 1))
      }
    } else if (ix < 0x401c0000) {
      id = 2
      x = divide(subtract(x, 1.5), add(1, multiply(1.5, x)))
    } else {
      id = 3
      x = divide(-1, x)
    }
  }
  const z = multiply(x, x)
  const w = multiply(z, z)
  const odd = multiply(z, add(coefficients[0], multiply(w, add(coefficients[2], multiply(w, coefficients[4])))))
  const even = multiply(w, add(coefficients[1], multiply(w, coefficients[3])))
  if (id < 0) return subtract(x, multiply(x, add(odd, even)))
  const result = subtract(atanHi[id], subtract(subtract(multiply(x, add(odd, even)), atanLo[id]), x))
  return hx < 0 ? -result : result
}

/** A source-defined, no-FMA, round-to-nearest-even binary32 algorithm.
 * Keeps signed zero and gradual underflow. Unlike Math.atan2, its finite value
 * law does not depend on a host transcendental implementation. This does not
 * assert identity with an arbitrary Android/glibc binary or compiler variant.
 * NaN classification is preserved; payload/sign and floating exceptions are
 * outside this JS Number API. Arguments round to binary32 before evaluation.
 */
export function sourceAtan2F32(yValue: number, xValue: number): number {
  const y = f32(yValue)
  const x = f32(xValue)
  const hx = floatWord(x)
  const hy = floatWord(y)
  const ix = hx & 0x7fffffff
  const iy = hy & 0x7fffffff
  if (ix > 0x7f800000 || iy > 0x7f800000) return NaN
  if (hx === 0x3f800000) return sourceAtanF32(y)
  let quadrant = ((hy >> 31) & 1) | ((hx >> 30) & 2)
  let z: number
  if (iy === 0) {
    if (quadrant < 2) return y
    return quadrant === 2 ? add(pi, tiny) : subtract(-pi, tiny)
  }
  if (ix === 0) return hy < 0 ? subtract(-halfPi, tiny) : add(halfPi, tiny)
  if (ix === 0x7f800000) {
    if (iy === 0x7f800000) {
      if (quadrant === 0) return add(quarterPi, tiny)
      if (quadrant === 1) return subtract(-quarterPi, tiny)
      if (quadrant === 2) return add(multiply(3, quarterPi), tiny)
      return subtract(multiply(-3, quarterPi), tiny)
    }
    if (quadrant === 0) return 0
    if (quadrant === 1) return -0
    return quadrant === 2 ? add(pi, tiny) : subtract(-pi, tiny)
  }
  if (iy === 0x7f800000) return hy < 0 ? subtract(-halfPi, tiny) : add(halfPi, tiny)
  const exponentDelta = (iy - ix) >> 23
  if (exponentDelta > 26) {
    z = add(halfPi, multiply(.5, piLo))
    quadrant &= 1
  } else if (exponentDelta < -26 && hx < 0) {
    z = 0
  } else {
    z = sourceAtanF32(Math.abs(divide(y, x)))
  }
  if (quadrant === 0) return z
  if (quadrant === 1) return -z
  if (quadrant === 2) return subtract(pi, subtract(z, piLo))
  return subtract(subtract(z, piLo), pi)
}
