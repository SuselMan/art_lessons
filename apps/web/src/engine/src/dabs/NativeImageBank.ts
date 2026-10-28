import type { BrushTip, TipMaskId } from '@grafetto/shared'
import { buildNativeImageLevel, selectNativeImageLevel, type NativeImageLevelSelection } from '../raster/nativeImageLevel'
import { canvasMeanDabRect } from '../raster/canvasMeanGeometry'
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
  const levels = new Map<number, NativeImageResource>()
  for (let scale = 8; ; scale *= .5) {
    const selected = selectNativeImageLevel(rect, longest * scale)
    if (!levels.has(selected.scale)) {
      const width = selected.nativeWidth + 2, height = selected.nativeHeight + 2
      const spanX = longest / rect.width * selected.nativeWidth
      const spanY = longest / rect.height * selected.nativeHeight
      levels.set(selected.scale, {
        ...selected, id, rect, width, height,
        key: `t:integer-pyramid:inverse-gray:${id}:${rect.x},${rect.y},${rect.width},${rect.height}:${selected.scale}`,
        bounds: { x: (1 + (selected.nativeWidth - spanX) / 2) / width,
          y: (1 + (selected.nativeHeight - spanY) / 2) / height, width: spanX / width, height: spanY / height },
      })
    }
    if (Math.floor(rect.width * scale * .5 + .5) === 0 || Math.floor(rect.height * scale * .5 + .5) === 0) break
  }
  const result = [...levels.values()]
  byFrame.set(id, result)
  return result
}

export function nativeImageResource(id: TipMaskId, tip: BrushTip, physicalExtentX: number): NativeImageResource | undefined {
  if (!tip.imageSampling) return undefined
  const selected = selectNativeImageLevel(tip.imageSampling.sourceRect, physicalExtentX)
  const resource = nativeImageBank(id, tip).find(level => level.scale === selected.scale)
  if (!resource) throw Error('Native image level is absent from its preparation bank')
  return resource
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
  return canvasMeanDabRect(x, y, c * width + s * height, s * width + c * height)
}

export function nativeImageDomainUniform(domain: WorldRect, originX: number, originY: number, tileHeight: number): [number, number, number, number] {
  return [domain.minX - originX, tileHeight - (domain.maxY - originY), domain.maxX - originX, tileHeight - (domain.minY - originY)]
}
