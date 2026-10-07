import type { Dab } from '@grafetto/shared'
import type { ILayerBuffer, PaintTarget } from '../buffers/ILayerBuffer'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { CoarseFactor, WorldRect } from '../buffers/tileMath'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import { RibbonStrokePainter, type RibbonStrokePainterContext } from '../dabs/RibbonStrokePainter'
import type { RibbonProfile } from '../dabs/ribbonProfile'
import type { PencilPreset } from '../presets/pencilPresets'
import { PaperWetness, quantizeWet, wetAt } from '../paper/paperWetness'
import { watercolorMixFromPreset } from '../presets/watercolorPresets'
import type { MaterialPresentationExtent } from './WatercolorPresentationOwners'

/** One fixed presentation allocation. The resolver cannot grow tiles outside
 * the owner budget. Coordinates here are projected raster pixels, not world. */
class PresentationLayer implements ILayerBuffer {
  readonly tile: PaintTarget
  constructor(buffer: AccumulationBuffer) { this.tile = { buffer, originX: 0, originY: 0, contentRect: null } }
  resolveForPaint(rect: WorldRect): PaintTarget[] {
    return rect.maxX > 0 && rect.maxY > 0 && rect.minX < this.tile.buffer.width && rect.minY < this.tile.buffer.height ? [this.tile] : []
  }
  resolveVisible(rect: WorldRect): PaintTarget[] { return this.resolveForPaint(rect) }
  resolveExistingForPaint(rect: WorldRect): PaintTarget[] { return this.resolveForPaint(rect) }
  resolveCoarse(_rect: WorldRect, _factor: CoarseFactor): null { return null }
  coarseWorldSize(_factor: CoarseFactor): { w: number; h: number } { return { w: this.tile.buffer.width, h: this.tile.buffer.height } }
  allResident(): PaintTarget[] { return [this.tile] }
  markContentPainted(rect: WorldRect): void {
    const old = this.tile.contentRect
    this.tile.contentRect = old ? { minX: Math.min(old.minX, rect.minX), minY: Math.min(old.minY, rect.minY),
      maxX: Math.max(old.maxX, rect.maxX), maxY: Math.max(old.maxY, rect.maxY) } : { ...rect }
  }
  clearContentAt(): void { this.tile.contentRect = null }
  restoreTileContent(rect: WorldRect): void { this.tile.contentRect = { ...rect } }
  tightenContentRects(): void { /* No readback in the presentation path. */ }
  getContentBoundsWorld(): WorldRect | null { return this.tile.contentRect }
  clear(): void { this.tile.buffer.clear(); this.tile.contentRect = null }
  destroy(): void { this.tile.buffer.destroy() }
}

/** Separate ribbon deposition/composite; never invokes canonical settle, log,
 * dose commit, or the engine's liveComposite slot. The caller supplies primitives
 * that can write ONLY owned projected targets. The output already includes its
 * canonical-base raster and must replace the visible layer, never over-blend it.
 * This is presentation resolution, so it is not a physical-material oracle.
 */
export class WatercolorPresentationRaster {
  readonly paperWet = new PaperWetness()
  private readonly dabPool = new WeakMap<Dab, number>()
  private readonly sourceDabPool: () => WeakMap<Dab, number>
  private readonly layer: PresentationLayer
  private readonly scratch: RibbonStrokeScratch
  private readonly painter: RibbonStrokePainter
  private readonly extent: MaterialPresentationExtent
  private gesture: string | null = null
  private previous: Dab | undefined
  private disposed = false
  constructor(buffer: AccumulationBuffer, extent: MaterialPresentationExtent, pool: RibbonScratchPool,
    primitives: RibbonStrokePainterContext) {
    this.extent = { ...extent }
    this.sourceDabPool = primitives.dabPool
    this.layer = new PresentationLayer(buffer)
    this.scratch = new RibbonStrokeScratch(pool, true, true)
    const clip = (r: WorldRect): WorldRect => ({ minX: Math.max(0, r.minX), minY: Math.max(0, r.minY),
      maxX: Math.min(extent.width, r.maxX), maxY: Math.min(extent.height, r.maxY) })
    this.painter = new RibbonStrokePainter({ ...primitives,
      scratchPool: () => pool, dabPool: () => this.dabPool, infinite: () => false,
      pageSize: () => ({ w: extent.width, h: extent.height }),
      resolveWithinSheet: (_target, rect) => this.layer.resolveForPaint(clip(rect)),
      wcSheetClamp: clip,
      setLiveComposite: () => { throw new Error('Presentation cannot acquire canonical live composite') },
      revealBeforeBatch: () => null, revealAfterBatch: () => {},
    })
  }
  project(dab: Dab): Dab {
    const sx = this.extent.width / this.extent.worldWidth, sy = this.extent.height / this.extent.worldHeight
    // Presentation uses the isotropic minor scale; integer raster rounding can
    // introduce a sub-texel projection discrepancy. This is not canonical geometry.
    return { ...dab, x: (dab.x - this.extent.originX) * sx,
      y: (dab.y - this.extent.originY) * sy, size: dab.size * Math.min(sx, sy) }
  }
  paint(gesture: string, dabs: readonly Dab[], preset: PencilPreset, presetName: string,
    profile: RibbonProfile, color: readonly [number, number, number], wetProfile?: string, seed?: [number, number],
    now = performance.now(), standing?: ReadonlyMap<Dab, number>): void {
    if (this.disposed) throw new Error('Released material presentation')
    if (this.gesture !== gesture) {
      this.paperWet.commitPending(now)
      this.scratch.releaseFilm()
      this.scratch.beginStroke()
      this.previous = undefined
      this.gesture = gesture
    }
    const landing = dabs.map((d, i) => quantizeWet(Math.max(wetAt(wetProfile, i),
      this.paperWet.sample('presentation', d.x, d.y, now)))).join('')
    const water = watercolorMixFromPreset(presetName).water
    for (const d of dabs) this.paperWet.deposit('presentation', d.x, d.y,
      d.size * 0.5 * preset.sizeMultiplier * Math.max(1, d.aspectRatio), standing?.get(d) ?? water, now, true)
    const sourcePools = this.sourceDabPool()
    const projected = dabs.map(d => {
      const copy = this.project(d)
      this.dabPool.set(copy, sourcePools.get(d) ?? 0)
      return copy
    })
    const work = this.painter.paint(this.layer, projected, { ...preset }, presetName, profile, [...color],
      this.scratch, this.previous, landing, seed ? [...seed] : undefined, false, 0,
      { waterOnly: false, segmented: false })
    while (!work.next().done) { /* Bounded raster deposition, never solver drain. */ }
    this.previous = this.scratch.lastKept ?? projected[projected.length - 1] ?? this.previous
  }
  release(lost: boolean): void {
    if (this.disposed) return
    this.disposed = true
    this.paperWet.clear()
    this.painter.releaseWaterSources(lost)
    if (lost) this.scratch.forget(); else this.scratch.destroy()
    // Output lifetime belongs to the layer owner, not its per-gesture scratch.
  }
}
