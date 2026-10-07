/** Presentation-only ownership. Never a canonical paint input or journal. */
export interface MaterialPresentationExtent {
  originX: number; originY: number; worldWidth: number; worldHeight: number
  width: number; height: number
}

export interface MaterialPresentationOwner<T> {
  readonly layerId: string
  readonly extent: MaterialPresentationExtent
  readonly material: T
  /** Only delivery obligations retire; accumulated raster remains intact. */
  readonly pending: Set<object>
}

/** Fixed per-layer allocation, independent of gesture/chunk count.
 * `planes` includes every owned material/scratch/wet texture, not just output.
 * The caller must use projected coordinates and composite as a layer replacement.
 * Canonical completion alone cannot release the replacement while its solver or
 * reveal still owns the layer. `releaseReady` is the explicit final handoff.
 */
export class WatercolorPresentationOwners<T> {
  private readonly owners = new Map<string, MaterialPresentationOwner<T>>()
  private readonly budgetBytes: number
  private readonly planes: number
  private readonly allocate: (extent: MaterialPresentationExtent) => T
  private readonly release: (material: T, lost: boolean) => void
  constructor(budgetBytes: number, planes: number,
    allocate: (extent: MaterialPresentationExtent) => T,
    release: (material: T, lost: boolean) => void) {
    this.budgetBytes = budgetBytes; this.planes = planes
    this.allocate = allocate; this.release = release
    if (!Number.isFinite(budgetBytes) || !(budgetBytes >= 4 * planes) || !Number.isInteger(planes) || planes < 1) throw new Error('Invalid presentation budget')
  }
  get bytes(): number {
    let bytes = 0
    for (const owner of this.owners.values()) bytes += owner.extent.width * owner.extent.height * 4 * this.planes
    return bytes
  }
  get layers(): ReadonlyMap<string, MaterialPresentationOwner<T>> { return this.owners }
  acquire(layerId: string, view: Omit<MaterialPresentationExtent, 'width' | 'height'>,
    maxSide = 1024): MaterialPresentationOwner<T> {
    const existing = this.owners.get(layerId)
    if (![view.originX, view.originY, view.worldWidth, view.worldHeight, maxSide].every(Number.isFinite)
      || !(view.worldWidth > 0 && view.worldHeight > 0 && maxSide >= 1)) throw new Error('Invalid presentation extent')
    if (existing) {
      if (existing.extent.originX !== view.originX || existing.extent.originY !== view.originY
        || existing.extent.worldWidth !== view.worldWidth || existing.extent.worldHeight !== view.worldHeight) {
        // Caller must reproject or use its bounded CPU fallback before admitting
        // input outside the old owner. Never silently clip to a stale camera.
        throw new Error('Presentation extent requires reprojection')
      }
      return existing
    }
    const pixels = Math.floor((this.budgetBytes - this.bytes) / (4 * this.planes))
    // Never silently discard pigment when the budget is full. This is an
    // explicit owner-admission failure requiring a bounded CPU presentation.
    if (pixels < 1) throw new Error('Presentation owner budget exhausted')
    const scale = Math.min(1, maxSide / Math.max(view.worldWidth, view.worldHeight),
      Math.sqrt(pixels / (view.worldWidth * view.worldHeight)))
    const extent = { ...view, width: Math.max(1, Math.floor(view.worldWidth * scale)),
      height: Math.max(1, Math.floor(view.worldHeight * scale)) }
    // Extremely thin rectangles need a second clamp after the one-pixel floor.
    extent.width = Math.min(extent.width, pixels)
    extent.height = Math.min(extent.height, Math.floor(pixels / extent.width))
    const owner = { layerId, extent, material: this.allocate(extent), pending: new Set<object>() }
    this.owners.set(layerId, owner)
    return owner
  }
  hold(owner: MaterialPresentationOwner<T>): object {
    if (this.owners.get(owner.layerId) !== owner) throw new Error('Stale presentation owner')
    const key = {}
    owner.pending.add(key)
    return key
  }
  retire(owner: MaterialPresentationOwner<T>, key: object): void { owner.pending.delete(key) }
  releaseReady(owner: MaterialPresentationOwner<T>, canonicalReady: boolean): boolean {
    if (this.owners.get(owner.layerId) !== owner || !canonicalReady || owner.pending.size) return false
    this.owners.delete(owner.layerId)
    this.release(owner.material, false)
    return true
  }
  cancel(layerId: string, lost: boolean): void {
    const owner = this.owners.get(layerId)
    if (!owner) return
    this.owners.delete(layerId)
    owner.pending.clear()
    this.release(owner.material, lost)
  }
  clear(lost: boolean): void { for (const id of [...this.owners.keys()]) this.cancel(id, lost) }
}
