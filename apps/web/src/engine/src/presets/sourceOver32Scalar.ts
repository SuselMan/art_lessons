import type { Rgba8 } from './mixWeightedRgba8'
import { validateRgba8Pixel } from './sourceColorRgba8'
import { arm64ReciprocalEstimateF32 } from './sourceArmFrecpe'
import { sourceImageRoundEven } from './sourceImageTransformReciprocal'

/** Explicit scalar point laws, no vector packet, FMA or factory dispatch claim.
 * NEON64 is FPCR nearest-even/gradual, one FRECPE then F32 multiply, no refinement. */
export interface SourceOver32ScalarControl {
 readonly profile: 'portable-f32-division-rne-v1' | 'optimized32-neon64-scalar-frecpe-rne-v1'
 readonly opacity: number
 readonly mask?: number
}
const f = Math.fround
const reciprocalByte = f(1 / 255)
const nearestEvenByte = (value:number) => sourceImageRoundEven(value) || 0
export function compositeSourceOver32Scalar(source: Rgba8, destination: Rgba8, control: SourceOver32ScalarControl): Rgba8 {
  validateRgba8Pixel(source)
  validateRgba8Pixel(destination)
  if (!['portable-f32-division-rne-v1', 'optimized32-neon64-scalar-frecpe-rne-v1'].includes(control.profile) || !Number.isFinite(control.opacity) || control.opacity < 0 || control.opacity > 1) throw new RangeError('Invalid portable F32 Over control')
  if (control.mask !== undefined && (!Number.isInteger(control.mask) || control.mask < 0 || control.mask > 255)) throw new RangeError('Invalid composite mask byte')
  let sourceAlpha = f(source[3] * f(control.opacity))
  if (control.mask !== undefined) sourceAlpha = f(sourceAlpha * f(control.mask * reciprocalByte))
  if (sourceAlpha === 0) return [...destination]
  let alpha = destination[3]
  let blend: number
  if (alpha === 255) blend = f(sourceAlpha * reciprocalByte)
  else if (alpha === 0) { alpha = sourceAlpha; blend = 1 }
  else {
    alpha = f(alpha + f(f(f(255 - alpha) * sourceAlpha) * reciprocalByte))
    blend = control.profile === 'portable-f32-division-rne-v1' ? f(sourceAlpha / alpha) : f(arm64ReciprocalEstimateF32(alpha) * sourceAlpha)
  }
  const channel = (index: number): number => blend === 1 ? source[index] : blend === 0 ? destination[index]
    : nearestEvenByte(f(f((source[index] - destination[index]) * blend) + destination[index]))
  return [channel(0), channel(1), channel(2), nearestEvenByte(alpha)]
}
