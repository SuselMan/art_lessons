import type { Rgba8 } from './mixWeightedRgba8'
import { applyRgba8AlphaMask, compositeRgba8, validateRgba8CompositeControl, validateRgba8Pixel, type Rgba8CompositeControl } from './sourceColorRgba8'

export interface Rgba8Bounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
/** Dense straight RGBA8, with integer world origin. No display premultiplication. */
export interface StraightRgba8Surface extends Rgba8Bounds { readonly pixels: Uint8Array }
export type Rgba8Material =
  | { readonly kind: 'solid'; readonly color: Rgba8; readonly alphaOverride?: number }
  | { readonly kind: 'pixels'; readonly pixels: Uint8Array; readonly alphaOverride?: number }
export interface Rgba8MaskParticle extends Rgba8Bounds {
  readonly material: Rgba8Material
  readonly opacity: number
  readonly coverage?: Uint8Array
}
export interface Rgba8GroupLimits {
  /** Group+returned destination bytes together, at most16MiB for this CPU helper. */
  readonly maximumBytes: number
  readonly maximumParticles: number
  readonly maximumWorkPixels: number
}
interface Rect extends Rgba8Bounds { readonly right: number; readonly bottom: number; readonly area: number }
function rect(r: Rgba8Bounds): Rect {
  if (!r || ![r.x, r.y, r.width, r.height].every(Number.isSafeInteger) || r.width < 0 || r.height < 0
    || !Number.isSafeInteger(r.x + r.width) || !Number.isSafeInteger(r.y + r.height)
    || !Number.isSafeInteger(r.width * r.height) || !Number.isSafeInteger(4 * r.width * r.height)) throw new RangeError('Invalid RGBA8 integer bounds')
  return { ...r, right: r.x + r.width, bottom: r.y + r.height, area: r.width * r.height }
}
function bytes(value: Uint8Array, length: number): void {
  if (!(value instanceof Uint8Array) || !(value.buffer instanceof ArrayBuffer) || value.length !== length) throw new RangeError('Invalid dense byte buffer')
}
function byte(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError('Invalid material alpha override')
}
function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y)
  return rect({ x, y, width: Math.max(0, Math.min(a.right, b.right) - x), height: Math.max(0, Math.min(a.bottom, b.bottom) - y) })
}
/** Complete admission before allocation. Work/bounds limits reject; no clipping,
 * truncation or opacity-zero shortcut may hide invalid later material inputs. */
function preflight(destination: StraightRgba8Surface, particles: readonly Rgba8MaskParticle[], outer: Rgba8CompositeControl, limits: Rgba8GroupLimits, groupBounds?: Rgba8Bounds): { target: Rect; group: Rect; overlap: Rect } {
  if (!limits || !Number.isSafeInteger(limits.maximumBytes) || limits.maximumBytes < 0 || limits.maximumBytes > 16 * 1024 * 1024
    || !Number.isInteger(limits.maximumParticles) || limits.maximumParticles < 0 || limits.maximumParticles > 65535
    || !Number.isSafeInteger(limits.maximumWorkPixels) || limits.maximumWorkPixels < 0 || limits.maximumWorkPixels > 16 * 1024 * 1024
    || !Array.isArray(particles) || particles.length > limits.maximumParticles) throw new RangeError('Invalid RGBA8 group budget')
  const target = rect(destination)
  bytes(destination.pixels, 4 * target.area)
  validateRgba8CompositeControl(outer)
  let group: Rect | undefined, work = 0
  for (const p of particles) {
    const bounds = rect(p)
    if (!Number.isFinite(p.opacity) || p.opacity < 0 || p.opacity > 1) throw new RangeError('Invalid local painter opacity')
    if (!p.material || !['solid', 'pixels'].includes(p.material.kind)) throw new RangeError('Unknown material')
    if (p.material.kind === 'solid') validateRgba8Pixel(p.material.color)
    else bytes(p.material.pixels, 4 * bounds.area)
    if (p.material.alphaOverride !== undefined) byte(p.material.alphaOverride)
    if (p.coverage !== undefined) bytes(p.coverage, bounds.area)
    work += bounds.area
    if (!Number.isSafeInteger(work) || work > limits.maximumWorkPixels) throw new RangeError('RGBA8 group work budget exceeded')
    if (bounds.area) {
      if (!group) group = bounds
      else {
        const x = Math.min(group.x, bounds.x), y = Math.min(group.y, bounds.y)
        group = rect({ x, y, width: Math.max(group.right, bounds.right) - x, height: Math.max(group.bottom, bounds.bottom) - y })
      }
    }
  }
  if (groupBounds !== undefined) {
    const requested = rect(groupBounds)
    if (group && (requested.x > group.x || requested.y > group.y || requested.right < group.right || requested.bottom < group.bottom)) throw new RangeError('Group bounds must contain every particle')
    group = requested
  }
  group ??= rect({ x: 0, y: 0, width: 0, height: 0 })
  const overlap = intersect(group, target)
  if (4 * (group.area + target.area) > limits.maximumBytes) throw new RangeError('RGBA8 group byte budget exceeded')
  if (!Number.isSafeInteger(work + overlap.area) || work + overlap.area > limits.maximumWorkPixels) throw new RangeError('RGBA8 group work budget exceeded')
  return { target, group, overlap }
}
function read(buffer: Uint8Array, offset: number): Rgba8 { return [buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]] }
function surface(bounds: Rect, pixels: Uint8Array): StraightRgba8Surface {
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, pixels }
}
/** Reference material/group kernel. Alpha-mask U8 store → local no-mask Over →
 * one outer transfer. Every intermediate remains straightRGBA8, including alpha1
 * and hidden RGB. This explicit scalar profile is NOT native RGB8 SIMD dispatch.
 * Optional explicit group bounds preserve an external storage window; minimal
 * union is only a convenience, NOT a claim about native paint-device tile extent.
 * Input buffers remain untouched; the two returned buffers have independent ownership.
 */
export function renderRgba8Group(destination: StraightRgba8Surface, particles: readonly Rgba8MaskParticle[], outer: Rgba8CompositeControl, limits: Rgba8GroupLimits, groupBounds?: Rgba8Bounds): { group: StraightRgba8Surface; output: StraightRgba8Surface } {
  const plan = preflight(destination, particles, outer, limits, groupBounds)
  const group = new Uint8Array(plan.group.area * 4)
  const output = new Uint8Array(plan.target.area * 4)
  if (plan.target.area) output.set(destination.pixels)
  for (const p of particles) {
    if (!p.width || !p.height) continue
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      const local = y * p.width + x
      const source = p.material.kind === 'solid' ? p.material.color : read(p.material.pixels, local * 4)
      const material: Rgba8 = p.material.alphaOverride === undefined ? source : [source[0], source[1], source[2], p.material.alphaOverride]
      const masked = p.coverage === undefined ? material : applyRgba8AlphaMask(material, p.coverage[local])
      const offset = ((p.y + y - plan.group.y) * plan.group.width + p.x + x - plan.group.x) * 4
      group.set(compositeRgba8(masked, read(group, offset), { mode: 'over', opacity: p.opacity }), offset)
    }
  }
  const { overlap } = plan
  if (overlap.area) for (let y = overlap.y; y < overlap.bottom; y++) for (let x = overlap.x; x < overlap.right; x++) {
    const src = ((y - plan.group.y) * plan.group.width + x - plan.group.x) * 4
    const dst = ((y - plan.target.y) * plan.target.width + x - plan.target.x) * 4
    output.set(compositeRgba8(read(group, src), read(output, dst), outer), dst)
  }
  return { group: surface(plan.group, group), output: surface(plan.target, output) }
}
