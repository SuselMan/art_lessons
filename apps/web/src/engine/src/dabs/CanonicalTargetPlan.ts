import { tilesOverlappingRect, tileWorldRect, type TileCoord, type WorldRect } from '../buffers/tileMath'

export interface CanonicalTargetTile extends TileCoord {
  /** Full storage geometry; never shrink a target to the page intersection. */
  readonly storage: Readonly<WorldRect>
  /** Pixel write bound. The compositor must also enforce this intersection. */
  readonly paint: Readonly<WorldRect>
}
export interface CanonicalTargetPlan {
  readonly clippedRect: Readonly<WorldRect> | undefined
  readonly tiles: readonly CanonicalTargetTile[]
}
const validRect = (r: WorldRect) => !!r && [r.minX, r.minY, r.maxX, r.maxY].every(Number.isSafeInteger)
  && r.maxX >= r.minX && r.maxY >= r.minY
const intersection = (a: WorldRect, b: WorldRect): WorldRect => ({
  minX: Math.max(a.minX, b.minX), minY: Math.max(a.minY, b.minY),
  maxX: Math.min(a.maxX, b.maxX), maxY: Math.min(a.maxY, b.maxY),
})

/** Pure admission geometry shared by enqueue/execution/packetization.
 * pageBounds comes from the authoritative room, never the local viewport.
 * null explicitly means an infinite page. Fanout is checked BEFORE enumerating
 * the infinite tile grid, so a giant rejected footprint cannot allocate a list.
 * This helper alone does not clip GPU writes or authorize a room profile. */
export function planCanonicalTargets(
  footprint: Readonly<WorldRect>, pageBounds: Readonly<WorldRect> | null,
  tileWidth: number, tileHeight: number, maxTargets = 64,
): CanonicalTargetPlan {
  if (!validRect(footprint) || pageBounds !== null && !validRect(pageBounds)
    || !Number.isSafeInteger(tileWidth) || tileWidth < 1 || tileWidth > 4096
    || !Number.isSafeInteger(tileHeight) || tileHeight < 1 || tileHeight > 4096
    || !Number.isSafeInteger(maxTargets) || maxTargets < 1 || maxTargets > 64)
    throw new RangeError('Invalid canonical target geometry')
  const clipped = pageBounds === null ? { ...footprint } : intersection(footprint, pageBounds)
  if (clipped.maxX <= clipped.minX || clipped.maxY <= clipped.minY)
    return Object.freeze({ clippedRect: undefined, tiles: Object.freeze([]) })
  const left = Math.floor(clipped.minX / tileWidth), right = Math.ceil(clipped.maxX / tileWidth) - 1
  const top = Math.floor(clipped.minY / tileHeight), bottom = Math.ceil(clipped.maxY / tileHeight) - 1
  const columns = right - left + 1, rows = bottom - top + 1
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows)
    || columns > maxTargets || rows > Math.floor(maxTargets / columns))
    throw new RangeError('Canonical draw exceeds tile fanout')
  // Safe input coordinates alone are insufficient: outward tile rounding may
  // cross Number.MAX_SAFE_INTEGER. Reject before enumeration/target resolution.
  for (const value of [left * tileWidth, (right + 1) * tileWidth, top * tileHeight, (bottom + 1) * tileHeight])
    if (!Number.isSafeInteger(value)) throw new RangeError('Unsafe canonical tile extent')
  const tiles = tilesOverlappingRect(clipped, tileWidth, tileHeight).map(coord => {
    const storage = tileWorldRect(coord.tileX, coord.tileY, tileWidth, tileHeight)
    return Object.freeze({ ...coord, storage: Object.freeze(storage), paint: Object.freeze(intersection(clipped, storage)) })
  })
  return Object.freeze({ clippedRect: Object.freeze(clipped), tiles: Object.freeze(tiles) })
}
