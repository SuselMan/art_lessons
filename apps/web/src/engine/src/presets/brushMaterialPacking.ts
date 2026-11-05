import { lightnessMaterialMips } from './lightnessMaterial'

/** Runtime derivatives only: source CAS planes and animation order stay immutable. */
export interface MaterialFrameSource { readonly alpha: string; readonly gray: string }
export interface MaterialTextureGroup {
  readonly key: string
  readonly size: number
  readonly frames: readonly MaterialFrameSource[]
  readonly format: 'la' | 'rgba'
}
export interface MaterialFrameView {
  readonly group: MaterialTextureGroup
  /** LA singleton uses red/alpha; packed pairs use red/green or blue/alpha. */
  readonly channels: 'ra' | 'rg' | 'ba'
}
export interface MaterialPackingPlan {
  readonly groups: readonly MaterialTextureGroup[]
  readonly frames: readonly MaterialFrameView[]
}

function validSize(size: number): boolean {
  return Number.isInteger(size) && size >= 2 && size <= 2048 && (size & (size - 1)) === 0
}

/** Pair adjacent material frames, retaining the historical LA singleton key.
 * Ordered JSON tuples make the pair key unambiguous even for non-CAS test IDs.
 * A fresh plan holds metadata only; callers may weakly cache it per descriptor.
 */
export function materialPackingPlan(sources: readonly MaterialFrameSource[], size: number): MaterialPackingPlan {
  if (!validSize(size) || sources.length < 1 || sources.length > 256)
    throw Error('Invalid material animation dimensions/count')
  for (const source of sources) {
    if (!source.alpha || !source.gray) throw Error('Missing material plane identity')
  }
  const groups: MaterialTextureGroup[] = [], frames: MaterialFrameView[] = []
  for (let index = 0; index < sources.length; index += 2) {
    const pair = sources.slice(index, index + 2).map(source => Object.freeze({ ...source }))
    const singleton = pair.length === 1
    const key = singleton ? `t:lightness:${pair[0].alpha}:${pair[0].gray}`
      : `t:materialPair:v1:${size}:${JSON.stringify(pair.map(frame => [frame.alpha, frame.gray]))}`
    const group: MaterialTextureGroup = Object.freeze({ key, size, frames: Object.freeze(pair), format: singleton ? 'la' : 'rgba' })
    groups.push(group)
    pair.forEach((_, offset) => frames.push(Object.freeze({ group, channels: singleton ? 'ra' : offset === 0 ? 'rg' : 'ba' })))
  }
  return Object.freeze({ groups: Object.freeze(groups), frames: Object.freeze(frames) })
}

export function materialMipPixelCount(size: number): number {
  if (!validSize(size)) throw Error('Invalid material texture side')
  let pixels = 0
  for (let side = size; side >= 1; side >>= 1) pixels += side * side
  return pixels
}

/** GPU accounting retains the existing conservative four bytes per texel. */
export function materialGroupBytes(group: MaterialTextureGroup): { cpu: number; gpu: number } {
  const pixels = materialMipPixelCount(group.size)
  return { cpu: pixels * (group.format === 'la' ? 2 : 4), gpu: pixels * 4 }
}

/** Interleave already rounded LA mip bytes. Recomputing gray after filtering
 * alpha would change transparent edges, so no resampling occurs here.
 * Singletons return their original immutable chain without allocating a copy.
 */
export function packMaterialMips(group: MaterialTextureGroup, chains: readonly (readonly Uint8Array[])[]): readonly Uint8Array[] {
  if (chains.length !== group.frames.length || (group.format === 'la' ? chains.length !== 1 : chains.length !== 2))
    throw Error('Material group plane count mismatch')
  const levelCount = Math.log2(group.size) + 1
  for (const chain of chains) {
    if (chain.length !== levelCount) throw Error('Incomplete material mip chain')
    chain.forEach((level, index) => {
      const side = group.size >> index
      if (level.length !== side * side * 2) throw Error('Material mip dimensions mismatch')
    })
  }
  if (group.format === 'la') return chains[0]
  return chains[0].map((left, index) => {
    const right = chains[1][index], packed = new Uint8Array(left.length * 2)
    for (let pixel = 0; pixel < left.length / 2; pixel++) {
      packed[pixel * 4] = left[pixel * 2]
      packed[pixel * 4 + 1] = left[pixel * 2 + 1]
      packed[pixel * 4 + 2] = right[pixel * 2]
      packed[pixel * 4 + 3] = right[pixel * 2 + 1]
    }
    return packed
  })
}

/** Build paired channels directly, retaining the historical per-plane U8
 * rounding without allocating two intermediate LA pyramids. */
export function materialGroupMips(group: MaterialTextureGroup, pixels: (id: string) => Uint8Array): readonly Uint8Array[] {
  if (!validSize(group.size) || group.frames.length !== (group.format === 'la' ? 1 : 2))
    throw Error('Invalid material group dimensions/count')
  const planes = group.frames.map(frame => ({ alpha: pixels(frame.alpha), gray: pixels(frame.gray) }))
  if (planes.some(plane => plane.alpha.length !== group.size * group.size || plane.gray.length !== group.size * group.size))
    throw Error('Material source dimensions mismatch')
  if (group.format === 'la') return lightnessMaterialMips(planes[0].alpha, planes[0].gray)
  const base = new Uint8Array(group.size * group.size * 4)
  for (let i = 0; i < group.size * group.size; i++) for (let frame = 0; frame < 2; frame++) {
    const { alpha, gray } = planes[frame], offset = i * 4 + frame * 2
    base[offset] = Math.round(gray[i] * alpha[i] / 255)
    base[offset + 1] = alpha[i]
  }
  const levels = [base]
  for (let size = group.size; size > 1; size >>= 1) {
    const source = levels[levels.length - 1], half = size >> 1, next = new Uint8Array(half * half * 4)
    for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) for (let c = 0; c < 4; c++) {
      const i = (y * 2 * size + x * 2) * 4 + c
      next[(y * half + x) * 4 + c] = (source[i] + source[i + 4] + source[i + size * 4] + source[i + size * 4 + 4] + 2) >> 2
    }
    levels.push(next)
  }
  return levels
}

/** Legacy sampler channels are unchanged. Packed material pairs reconstruct
 * the same sampled premultiplied gray/red and alpha before any mask operation.
 */
export const BRUSH_TIP_PACKING_GLSL = `
uniform float u_tipPacking;
uniform float u_dualTipPacking;
vec4 brushTipSample(sampler2D tip,vec2 uv,float mode) {
  vec4 sampled=texture2D(tip,uv);
  if(mode>1.5) return vec4(sampled.b,sampled.b,sampled.b,sampled.a);
  if(mode>0.5) return vec4(sampled.r,sampled.r,sampled.r,sampled.g);
  return sampled;
}
`
