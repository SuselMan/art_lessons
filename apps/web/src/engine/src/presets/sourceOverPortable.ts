import type { Rgba8 } from './mixWeightedRgba8'
import { compositeSourceOver32Scalar } from './sourceOver32Scalar'

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
export function compositePortableF32Over(source: Rgba8, destination: Rgba8, control: PortableF32OverControl): Rgba8 {
 if (control.profile !== 'portableF32') throw new RangeError('Invalid portable F32 Over control')
 return compositeSourceOver32Scalar(source, destination, { ...control, profile: 'portable-f32-division-rne-v1' })
}
