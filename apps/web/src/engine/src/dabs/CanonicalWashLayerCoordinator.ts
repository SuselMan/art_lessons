import { CANONICAL_STROKE_RASTER_PROFILE, isCanonicalStrokeComposition, type CanonicalStrokeComposition } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { PaintTarget } from '../buffers/ILayerBuffer'
import type { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import type { WorldRect } from '../buffers/tileMath'
import { runBrushGlBatch, runBrushGlTurn } from './BrushGlBatch'
import { bindCanonicalLayerTargets } from './CanonicalLayerTargets'
import { CanonicalFrameExecutor, canonicalWashOuterOperation, type CanonicalFrameExecutorOptions, type CanonicalFrameSubmission, type CanonicalWashLocalTile, type CanonicalWashOwnership } from './CanonicalFrameExecutor'
import { planCanonicalTargets } from './CanonicalTargetPlan'
import type { CanonicalRgba8SourceView } from './CanonicalRgba8CompositePass'

export interface CanonicalWashLayerCoordinatorOptions extends Omit<CanonicalFrameExecutorOptions, 'washMode' | 'autoSource' | 'bank' | 'softProgramOwner' | 'changed' | 'poison'> {
  readonly layerId: string
  readonly layerEpoch: number
  /** Distinct derived straight layer; the coordinator never owns/destroys it. */
  readonly presentation: () => { readonly buffer: TiledLayerBuffer; readonly epoch: number }
  /** Trusted gesture source binding, NOT data selected by a material frame. */
  readonly source: (gestureId: string) => Pick<CanonicalFrameExecutorOptions, 'autoSource' | 'bank' | 'softProgramOwner'>
  /** Explicit caller capacity; no implicit queue, expiry or GPU quota. Includes
   * completed IDs until this coordinator is discarded after trusted rebuild. */
  readonly maxGestures: number
  readonly changed: (layerId: string) => void
  readonly poison: (layerId: string, reason: unknown) => void
}
interface Entry {
  readonly id: string
  readonly firstSequence: number
  readonly executor: CanonicalFrameExecutor
  readonly opacity: number
  readonly blend: CanonicalStrokeComposition['outerBlend']
  readonly releaseMetadata: () => void
  ownership?: CanonicalWashOwnership
  committed: boolean
  tile: number
  part: number
  committingBuffer?: AccumulationBuffer
}
interface Position { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface PresentationWork {
  readonly position: Position
  readonly revision: number
  stage: number
  part: number
  buffer?: AccumulationBuffer
}
const rect = (p: Position): WorldRect => ({ minX: p.x, minY: p.y, maxX: p.x + p.width, maxY: p.y + p.height })
const key = (p: Position) => `${p.x}:${p.y}`

/** Recorded-order lane for one layer. Deposition uses the real executor; local
 * raw surfaces are folded over stable pixels in FIRST-RECORDED-gesture order.
 * A sealed B cannot commit past an open A. No server, engine, checkpoint or
 * unsequenced live hook is enabled here. All writes to these layers must enter
 * this lane or a future ordered barrier; seq alone does not serialize peers. */
export class CanonicalWashLayerCoordinator {
  private readonly options: CanonicalWashLayerCoordinatorOptions
  private readonly stable: TiledLayerBuffer
  private readonly derived: TiledLayerBuffer
  private readonly derivedEpoch: number
  private readonly preparations: readonly Readonly<{ width: number; height: number; epoch: object }>[]
  private readonly entries: Entry[] = []
  private readonly queue: Entry[] = []
  private readonly positions = new Map<string, Position>()
  private readonly dirty = new Set<string>()
  private readonly reservations: (() => void)[] = []
  private readonly errors: unknown[] = []
  private work?: PresentationWork
  private revision = 0
  private lastSequence = 0
  private busy = false
  private failed = false
  private closed = false

  constructor(options: CanonicalWashLayerCoordinatorOptions) {
    if (!options.layerId || !Number.isSafeInteger(options.layerEpoch) || options.layerEpoch < 0
      || !Number.isSafeInteger(options.maxGestures) || options.maxGestures < 1) throw new TypeError('Invalid canonical wash layer capacity/identity')
    const stable = options.layer(options.layerId), derived = options.presentation()
    if (!Number.isSafeInteger(derived.epoch) || derived.epoch < 0 || stable.epoch !== options.layerEpoch || stable.buffer === derived.buffer
      || stable.buffer.pixelEncoding !== 'straight-rgba8' || derived.buffer.pixelEncoding !== 'straight-rgba8'
      || stable.buffer.tileWidth !== derived.buffer.tileWidth || stable.buffer.tileHeight !== derived.buffer.tileHeight) throw new Error('Canonical wash requires distinct matching straight layers')
    this.preparations = [options.prepass.preparedCapacity(), options.composite.preparedCapacity()]
    // The existing CPU owner charges bounded metadata, not actual JS heap.
    const release = options.prepass.brushGlBatchInfo().cpu.reserve(options.maxGestures * 1024)
    this.reservations.push(release)
    this.options = Object.freeze({ ...options, pageBounds: options.pageBounds ? Object.freeze({ ...options.pageBounds }) : null })
    this.stable = stable.buffer; this.derived = derived.buffer; this.derivedEpoch = derived.epoch
  }

  get poisoned(): boolean { return this.failed }
  get pending(): boolean { return !!this.queue.length || !!this.dirty.size || !!this.entries.find(e => !e.committed)?.ownership }
  get presentationReady(): boolean { return !this.failed && !this.closed && !this.dirty.size && !this.work }
  get checkpointReady(): boolean { return this.presentationReady && !this.queue.length && this.entries.every(e => e.committed) }
  get cleanupFailures(): readonly unknown[] { return Object.freeze([...this.errors]) }

  /** Sequence is from authoritative recorded history, never a guessed local
   * ordinal. Caller supplies a complete ordered same-layer lane (no gaps from
   * omitted same-layer writers). Runtime live acknowledgements remain outside. */
  enqueue(input: CanonicalFrameSubmission, recordedSequence: number): void {
    this.assertOpen(); this.busy = true
    try {
    if (!Number.isSafeInteger(recordedSequence) || recordedSequence <= this.lastSequence || input.layerId !== this.options.layerId
      || input.layerEpoch !== this.options.layerEpoch || input.composition.mode !== 'wash') throw new Error('Invalid recorded wash lane order/context')
    if (!isCanonicalStrokeComposition(input.composition, this.options.rasterProfile === 'reference-scalar-f32-rne-v1' ? CANONICAL_STROKE_RASTER_PROFILE : this.options.rasterProfile)) throw new TypeError('Invalid recorded wash composition for pinned raster profile')
    if (this.queue.length >= 8) throw new RangeError('Canonical wash lane queue is full')
    this.assertLayers()
    let entry = this.entries.find(e => e.id === input.gestureId)
    if (!entry && this.entries.length >= this.options.maxGestures) throw new RangeError('Canonical wash lane gesture capacity exceeded')
    if (entry?.committed || entry?.ownership) throw new Error('Recorded wash gesture is already sealed')
    const fresh = new Map<string, Position>()
    for (const d of input.frame.draws) {
      const r = input.frame.definitions[d.definition]
      if (!r) throw new TypeError('Invalid canonical wash definition')
      for (const tile of planCanonicalTargets({ minX: d.x, minY: d.y, maxX: d.x + r.width, maxY: d.y + r.height }, this.options.pageBounds ?? null, this.stable.tileWidth, this.stable.tileHeight).tiles) {
        const p = { x: tile.storage.minX, y: tile.storage.minY, width: this.stable.tileWidth, height: this.stable.tileHeight }
        if (!this.positions.has(key(p))) fresh.set(key(p), p)
      }
    }
    let candidate: CanonicalFrameExecutor | undefined
    let releaseGpu: (() => void) | undefined, releaseCpu: (() => void) | undefined, releaseEntry: (() => void) | undefined
    try {
      if (fresh.size) {
        releaseCpu = this.options.prepass.brushGlBatchInfo().cpu.reserve(fresh.size * 256)
        releaseGpu = this.options.reserveTransient([...fresh.values()].reduce((n, t) => n + t.width * t.height * 4, 0))
      }
      if (!entry) {
        releaseEntry = this.options.prepass.brushGlBatchInfo().cpu.reserve(1024)
        const executor = candidate = new CanonicalFrameExecutor({ ...this.options, ...this.options.source(input.gestureId), washMode: 'deposition-only',
          changed: () => this.invalidate(), poison: (_id, reason) => this.notifyPoison(reason) })
        entry = { id: input.gestureId, firstSequence: recordedSequence, executor, opacity: input.composition.outerResourceOpacity, blend: input.composition.outerBlend,
          committed: false, tile: 0, part: 0, releaseMetadata: releaseEntry }
      }
      entry.executor.enqueue(input)
    } catch (error) {
      if (candidate) this.clean(() => candidate!.cancel(error, { lost: this.options.prepass.brushGlBatchInfo().gl.isContextLost() }))
      if (releaseGpu) this.clean(releaseGpu)
      if (releaseCpu) this.clean(releaseCpu)
      if (releaseEntry) this.clean(releaseEntry)
      throw error
    }
    if (releaseEntry) this.entries.push(entry!)
    if (releaseGpu) { const gpu = releaseGpu, cpu = releaseCpu!; this.reservations.push(() => { try { gpu() } finally { cpu() } }) }
    for (const [k, p] of fresh) this.positions.set(k, Object.freeze(p))
    this.queue.push(entry!); this.lastSequence = recordedSequence
    } finally { this.busy = false }
  }

  /** Exactly one existing deposition turn OR one <=8 draw rebase/commit turn.
   * No leases, RAF, promise or automatic retry survive the synchronous return. */
  advance(): void {
    this.assertOpen(); this.busy = true
    try {
      this.assertLayers()
      const frontier = this.entries.find(e => !e.committed)
      if (frontier?.ownership) this.commit(frontier)
      else if (this.dirty.size) this.present()
      else if (this.queue.length) {
        const entry = this.queue[0], before = entry.executor.pendingFrameCount
        entry.executor.advance()
        if (entry.executor.pendingFrameCount < before) this.queue.shift()
        if (entry.executor.rawWashSealed) { entry.ownership = entry.executor.takeRawWash(); this.invalidate() }
      }
    } catch (error) {
      this.failed = true
      this.clean(() => this.notifyPoison(error))
      this.releaseAll(this.options.prepass.brushGlBatchInfo().gl.isContextLost())
      throw error
    } finally { this.busy = false }
  }

  private invalidate(): void {
    this.revision++
    for (const k of this.positions.keys()) this.dirty.add(k)
    this.work = undefined
  }
  private locals(entry: Entry): readonly CanonicalWashLocalTile[] { return entry.ownership?.tiles ?? (entry.committed ? [] : entry.executor.rawWashTiles()) }
  private resolve(layer: TiledLayerBuffer, p: Position): PaintTarget {
    const target = layer.resolveForPaint(rect(p)).find(t => t.originX === p.x && t.originY === p.y)
    if (!target || target.buffer.width !== p.width || target.buffer.height !== p.height) throw new Error('Canonical wash target geometry changed')
    return target
  }
  private part(view: CanonicalRgba8SourceView, part: number): { view: CanonicalRgba8SourceView; count: number } {
    const capacity = this.options.composite.preparedCapacity(), columns = Math.ceil(view.textureWidth / capacity.width)
    const count = columns * Math.ceil(view.textureHeight / capacity.height)
    const x = part % columns * capacity.width, y = Math.floor(part / columns) * capacity.height
    const width = Math.min(capacity.width, view.textureWidth - x), height = Math.min(capacity.height, view.textureHeight - y)
    return { count, view: { ...view, rect: { x: view.rect.x + x, y: view.rect.y + y, width, height },
      bounds: { x: x / view.textureWidth, y: (view.textureHeight - y - height) / view.textureHeight, width: width / view.textureWidth, height: height / view.textureHeight } } }
  }

  private commit(entry: Entry): void {
    const tiles = entry.ownership!.tiles
    if (entry.tile < tiles.length) runBrushGlTurn({ participants: [this.options.prepass, this.options.composite] }, turn => {
      const gl=this.options.prepass.brushGlBatchInfo().gl
      gl.activeTexture(gl.TEXTURE0)
      const tile = tiles[entry.tile], target = this.resolve(this.stable, tile)
      if (entry.committingBuffer && entry.committingBuffer !== target.buffer) throw new Error('Partially committed canonical target was replaced; rebuild required')
      const bound = bindCanonicalLayerTargets(this.stable, [target])[0]
      if(tile.view.residency.kind!=='external')throw new Error('Raw wash must have explicit ownership')
      runBrushGlBatch({turn,participants:[this.options.prepass,this.options.composite],owners:[bound.lifetime,tile.view.residency]},frame=>{
        let draws=0
        while(draws++<8){
          this.assertLayers()
          const part = this.part(tile.view, entry.part)
          this.options.composite.drawSource({ source: { kind: 'straightRgba8', view: part.view }, target: bound, operation: canonicalWashOuterOperation(this.options.rasterProfile, entry.blend, entry.opacity), writeBounds: this.options.pageBounds ?? undefined }, frame)
          entry.committingBuffer = target.buffer; entry.part++
          this.stable.markContentPainted(rect(tile))
          if(entry.part===part.count){entry.part=0;entry.tile++;entry.committingBuffer=undefined;break}
          if(frame.shouldYield)break
        }
      })
    })
    // During partial commit no old derived preview is exposed as ready.
    this.invalidate()
    if (entry.tile === tiles.length) {
      entry.committed = true
      const ownership = entry.ownership!; entry.ownership = undefined
      ownership.release(); entry.releaseMetadata()
      this.options.changed(this.options.layerId)
    }
  }

  private present(): void {
    const k = this.dirty.values().next().value as string | undefined
    if (k === undefined) return
    this.work ??= { position: this.positions.get(k)!, revision: this.revision, stage: -1, part: 0 }
    const work = this.work, p = work.position
    runBrushGlTurn({participants:[this.options.prepass,this.options.composite]},turn=>{
      const gl=this.options.prepass.brushGlBatchInfo().gl
      gl.activeTexture(gl.TEXTURE0)
      // Resolve while preserving the caller's complete GL state. Each actual
      // layer binding is retained only inside this one synchronous capsule.
      const target = this.resolve(this.derived, p), stable = this.resolve(this.stable, p)
      const bound = bindCanonicalLayerTargets(this.derived, [target])[0], base = bindCanonicalLayerTargets(this.stable, [stable])[0]
      if (work.buffer !== target.buffer) { work.stage = -1; work.part = 0; work.buffer = target.buffer }
      const tiles=this.entries.map(entry=>this.locals(entry).find(t=>key(t)===key(p)))
      const owners=[base.lifetime,bound.lifetime]
      for(const tile of tiles)if(tile){
        if(tile.view.residency.kind!=='external')throw new Error('Raw wash must have explicit ownership')
        owners.push(tile.view.residency)
      }
      runBrushGlBatch({turn,participants:[this.options.prepass,this.options.composite],owners},frame=>{
        if (work.stage === -1) { stable.buffer.copyTo(target.buffer); work.stage = 0 }
        let draws=0
        while(work.stage<this.entries.length&&draws<8){
          const entry=this.entries[work.stage],tile=tiles[work.stage]
          if(entry.committed||!tile){work.stage++;work.part=0;continue}
          this.assertLayers()
          const part=this.part(tile.view,work.part)
          this.options.composite.drawSource({source:{kind:'straightRgba8',view:part.view},target:bound,operation:canonicalWashOuterOperation(this.options.rasterProfile, entry.blend, entry.opacity),writeBounds:this.options.pageBounds??undefined},frame)
          work.part++;draws++
          if(work.part===part.count){work.part=0;work.stage++}
          if(frame.shouldYield)break
        }
        this.derived.markContentPainted(rect(p))
      })
    })
    if (work.stage === this.entries.length) { this.dirty.delete(k); this.work = undefined; this.options.changed(this.options.layerId) }
  }

  private assertOpen(): void { if (this.closed || this.failed || this.busy) throw new Error('Canonical wash coordinator is closed, poisoned or busy') }
  private assertLayers(): void {
    const current = [this.options.prepass.preparedCapacity(), this.options.composite.preparedCapacity()]
    for (let i = 0; i < current.length; i++) {
      const a=current[i], b=this.preparations[i]
      if(a.width!==b.width||a.height!==b.height||a.epoch!==b.epoch)throw new Error('Canonical wash service preparation changed')
    }
    const a = this.options.layer(this.options.layerId), b = this.options.presentation()
    if (a.buffer !== this.stable || a.epoch !== this.options.layerEpoch || b.buffer !== this.derived || b.epoch !== this.derivedEpoch) throw new Error('Canonical wash layer epoch changed')
  }
  private notifyPoison(reason: unknown): void { this.failed = true; this.options.poison(this.options.layerId, reason) }
  private clean(action: () => void): void { try { action() } catch (error) { this.errors.push(error) } }
  private releaseAll(lost: boolean): void {
    this.queue.length = 0; this.dirty.clear(); this.work = undefined
    for (const e of this.entries) {
      if (e.ownership) { const owned = e.ownership; e.ownership = undefined; this.clean(() => owned.release({ lost })) }
      this.clean(() => e.executor.cancel(new Error('Canonical wash lane cancelled'), { lost }))
      this.clean(e.releaseMetadata)
    }
    const releases = this.reservations.splice(0)
    for (const release of releases) this.clean(release)
  }
  cancel(reason: unknown = new Error('Canonical wash layer cancelled'), options: { lost?: boolean } = {}): void {
    if (this.busy) throw new Error('Cannot cancel a canonical wash turn')
    if (options.lost && !this.options.prepass.brushGlBatchInfo().gl.isContextLost()) throw new Error('Cannot forget canonical wash on live context')
    if (this.closed) return
    this.closed = true; this.failed = true
    this.clean(() => this.notifyPoison(reason)); this.releaseAll(options.lost ?? this.options.prepass.brushGlBatchInfo().gl.isContextLost())
  }
}
