import type { Rgba8 } from './mixWeightedRgba8'
import { validateRgba8Pixel } from './sourceColorRgba8'

/** Explicit portable profile, not the integer fallback or hardware SIMD law.
 * Float32 intermediates, exact IEEE divide, nearest-even byte stores. Native
 * SSE/NEON reciprocal estimates and packet shortcuts are deliberately absent.
 * Controls apply at this composite stage; material alpha masking must already
 * have performed its own byte store when that is what the source pipeline does.
 */
export interface PortableF32OverControl {
  readonly profile: 'portableF32'
  readonly opacity: number
  readonly mask?: number
}
const f = Math.fround
const reciprocalByte = f(1 / 255)
function nearestEvenByte(value: number): number {
  const integer = Math.floor(value)
  const fraction = value - integer
  return fraction > .5 ? integer + 1 : fraction < .5 ? integer : integer + (integer % 2)
}
export function compositePortableF32Over(source: Rgba8, destination: Rgba8, control: PortableF32OverControl): Rgba8 {
  validateRgba8Pixel(source)
  validateRgba8Pixel(destination)
  if (control.profile !== 'portableF32' || !Number.isFinite(control.opacity) || control.opacity < 0 || control.opacity > 1) throw new RangeError('Invalid portable F32 Over control')
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
    blend = f(sourceAlpha / alpha)
  }
  const channel = (index: number): number => blend === 1 ? source[index] : blend === 0 ? destination[index]
    : nearestEvenByte(f(f((source[index] - destination[index]) * blend) + destination[index]))
  return [channel(0), channel(1), channel(2), nearestEvenByte(alpha)]
}
