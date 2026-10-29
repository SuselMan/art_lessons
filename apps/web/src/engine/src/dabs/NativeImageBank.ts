import type { BrushTip, TipMaskId } from '@grafetto/shared'
import { assertNativeImageSourceSize, buildNativeImageLevel, type NativeImageLevelSelection } from '../raster/nativeImageLevel'
import { sourcePngPyramid } from '../presets/sourcePngPyramid'
import type { WorldRect } from '../buffers/tileMath'

type SourceRect = NonNullable<BrushTip['imageSampling']>['sourceRect']
export interface NativeImageResource extends NativeImageLevelSelection {
  key: string
  id: TipMaskId
  rect: SourceRect
  width: number
  height: number
  bounds: { x: number; y: number; width: number; height: number }
}
const banks = new WeakMap<BrushTip, Map<TipMaskId, readonly NativeImageResource[]>>()

/** Finite metadata only. The complete reachable bank is budgeted before any
 * derivative allocation/upload; no requested size is needed for readiness. */
export function nativeImageBank(id: TipMaskId, tip: BrushTip): readonly NativeImageResource[] {
  const policy = tip.imageSampling
  if (!policy) return []
  let byFrame = banks.get(tip)
  if (!byFrame) { byFrame = new Map(); banks.set(tip, byFrame) }
  const cached = byFrame.get(id)
  if (cached) return cached
  const rect = policy.sourceRect, longest = Math.max(rect.width, rect.height)
  assertNativeImageSourceSize(rect)
  const result = sourcePngPyramid(rect.width, rect.height).levels.map((level): NativeImageResource => {
    const selected = { scale: level.scale, nativeWidth: level.width, nativeHeight: level.height }
    const width = level.storedWidth, height = level.storedHeight
    const spanX = longest / rect.width * selected.nativeWidth
    const spanY = longest / rect.height * selected.nativeHeight
    return {
      ...selected, id, rect, width, height,
      key: `t:integer-pyramid:inverse-gray:${id}:${rect.x},${rect.y},${rect.width},${rect.height}:${selected.scale}`,
      bounds: { x: (1 + (selected.nativeWidth - spanX) / 2) / width,
        y: (1 + (selected.nativeHeight - spanY) / 2) / height, width: spanX / width, height: spanY / height },
    }
  })
  byFrame.set(id, result)
  return result
}

export function nativeImageResource(id: TipMaskId, tip: BrushTip, physicalExtentX: number): NativeImageResource | undefined {
  if (!tip.imageSampling) return undefined
  if (!Number.isFinite(physicalExtentX) || physicalExtentX <= 0) throw new RangeError('Invalid physical image extent')
  const rect = tip.imageSampling.sourceRect
  const requested = physicalExtentX / Math.max(rect.width, rect.height)
  const bank = nativeImageBank(id, tip)
  let index = 0
  while (index + 1 < bank.length) {
    const next = bank[index + 1].scale
    if (next > requested || Math.abs(next - requested) < 1e-6) index++
    else break
  }
  return bank[index]
}

export function nativeImagePixels(resource: NativeImageResource, original: Uint8Array): Uint8Array {
  const side = Math.sqrt(original.length), rect = resource.rect
  if (!Number.isInteger(side) || !Number.isInteger(rect.x) || !Number.isInteger(rect.y) || rect.x < 0 || rect.y < 0 || rect.x + rect.width > side || rect.y + rect.height > side) throw Error('Native image source rectangle exceeds its asset')
  const cropped = new Uint8Array(rect.width * rect.height)
  for (let y = 0; y < rect.height; y++) cropped.set(original.subarray((rect.y + y) * side + rect.x, (rect.y + y) * side + rect.x + rect.width), y * rect.width)
  const plane = buildNativeImageLevel(cropped, rect, Math.max(rect.width, rect.height) * resource.scale)
  if (plane.width !== resource.width || plane.height !== resource.height) throw Error('Native image resource dimensions changed')
  return plane.pixels
}

/** Native mask allocation clips to its outward-aligned transformed original
 * extent, not the nominal square profile quad. Coordinates are world top-down. */
export function nativeImageDomain(tip: BrushTip, x: number, y: number, radiusX: number, radiusY: number, angle: number): WorldRect {
  const rect = tip.imageSampling?.sourceRect
  if (!rect) throw Error('Native image domain requires its source rectangle')
  const longest = Math.max(rect.width, rect.height)
  const width = 2 * radiusX * rect.width / longest, height = 2 * radiusY * rect.height / longest
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle))
  const axis = (center: number, extent: number) => {
    const left = center - Math.max(1, extent) / 2
    const whole = Math.floor(left)
    let start = left - whole, span = extent
    if (start < 1e-6) { span += start; start = 0 }
    const rounded = Math.floor(span + .5)
    if (Math.abs(span - rounded) < 1e-6) span = rounded
    return [whole, whole + Math.max(1, Math.ceil(start + span))] as const
  }
  const [minX, maxX] = axis(x, c * width + s * height)
  const [minY, maxY] = axis(y, s * width + c * height)
  return { minX, minY, maxX, maxY }
}

export function nativeImageDomainUniform(domain: WorldRect, originX: number, originY: number, tileHeight: number): [number, number, number, number] {
  return [domain.minX - originX, tileHeight - (domain.maxY - originY), domain.maxX - originX, tileHeight - (domain.minY - originY)]
}

/** Hotspot is clamped in WORLD axes; the transformed source itself is not.
 * Return a texture-coordinate translation after the tip's inverse rotation. */
export function nativeImageUVShift(resource: NativeImageResource, radiusX: number, radiusY: number, angle: number, flipX = 1, flipY = 1): [number, number] {
  const { width, height } = resource.rect
  const longest = Math.max(width, height)
  const c = Math.cos(angle), s = Math.sin(angle)
  const w = 2 * radiusX * width / longest, h = 2 * radiusY * height / longest
  const bx = Math.abs(c) * w + Math.abs(s) * h
  const by = Math.abs(s) * w + Math.abs(c) * h
  const dx = (bx - Math.max(1, bx)) / 2, dy = (by - Math.max(1, by)) / 2
  return [-(c * dx + s * dy) / radiusX * .5 * resource.bounds.width * flipX || 0,
    -(-s * dx + c * dy) / radiusY * .5 * resource.bounds.height * flipY || 0]
}
