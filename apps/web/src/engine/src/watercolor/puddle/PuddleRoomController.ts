import {puddleDimensions,type PuddleSize} from './PuddleDimensions'
import {WATERCOLOR_WET_DRY_MS, type Dab} from '@grafetto/shared'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import type {ILayerBuffer, PaintTarget} from '../../buffers/ILayerBuffer'
import {MaterialResidency} from './MaterialResidency'
import {RibbonStrokeScratch, type CpuScratchSnapshot} from '../../buffers/RibbonStrokeScratch'
import type {RibbonProfile} from '../../dabs/ribbonProfile'
import {createNativePuddleTarget, type PuddleTargetHost} from './PuddleTarget'
import {createPuddlePresentation} from './PuddlePresentation'
import {morphProgress} from './morphClock'

type Context = NonNullable<RibbonStrokeScratch['finishContext']>
type Presentation = ReturnType<typeof createPuddlePresentation>
type Material = {p: AccumulationBuffer; c: AccumulationBuffer; coverage: AccumulationBuffer}
interface Layer {
  target: ILayerBuffer
  scratch: RibbonStrokeScratch
  gesture: string
  previous?: Dab
  timestamp: number
  raw: AccumulationBuffer
  next: AccumulationBuffer
  goal: AccumulationBuffer
  presentation: Presentation
  tile?: PaintTarget
  context?: Context
  boundary: string
  epoch: number
  dirty: boolean
  goalReady: boolean
  active: boolean
  started: number
  after: number
  presentationDirty: boolean
  deferredPresentation?: boolean
  dryAt?: number
}
type ParkedLayer = Pick<Layer, 'target'|'gesture'|'previous'|'timestamp'|'boundary'|'epoch'>
interface UndoMaterialSnapshot extends CpuScratchSnapshot {
  undo: {layer: ParkedLayer; goal: Uint8Array; wet: Float64Array; valid: () => boolean}
}
function undoSnapshot(value: CpuScratchSnapshot | undefined): value is UndoMaterialSnapshot { return !!value && 'undo' in value }
export class MaterialSourceBusy extends Error {
  constructor() { super('M70 material sources are executing; retry after an operation boundary') }
}
export class MaterialHistoryNotReady extends MaterialSourceBusy {}
export interface PuddleRoomHost extends PuddleTargetHost {
  size: PuddleSize
  cpuByteBudget?: number
  materialReady?(target: ILayerBuffer): boolean
  rehydrate?(target: ILayerBuffer, beforeRecordedOpId?: string): CpuScratchSnapshot
  drawing(): boolean
  /** Synchronous material reads/barriers must acquire the shared field first. */
  finishLegacySettle?(): void
  /** Hidden replay changes material only until its target becomes visible. */
  deferPresentation?(target: ILayerBuffer): boolean
  render(scratch: RibbonStrokeScratch, tile: PaintTarget, context: Context,
    output: AccumulationBuffer, material: Material, samplingOrigin?: readonly [number, number]): void
  changed(target: ILayerBuffer): void
  display(): void
  released(scratch: RibbonStrokeScratch): void
}

/** QA room adapter. Canonical source is shared by every author on a layer.
 * Presentation clocks never modify it. One cancellable solver owns the shared
 * field; dirty revisions replace each other rather than queueing stroke jobs.
 * Deliberately limited to one full-page tile until the atlas implementation lands.
 */
export class PuddleRoomController {
  private readonly parked = new Map<ILayerBuffer, ParkedLayer>()
  private readonly residency: MaterialResidency<ILayerBuffer, CpuScratchSnapshot>
  private readonly layers = new Map<ILayerBuffer, Layer>()
  private readonly solver: ReturnType<typeof createNativePuddleTarget>
  private solving: Layer | null = null
  private raf = 0
  private disposed = false
  private readonly closing = new Set<ILayerBuffer>()
  private cancellations = 0
  private computations = 0
  private readonly dimensions: {width:number;height:number}
  private undoCaptures=0
  private undoHits=0
  private undoCaptureLastMs=0
  private undoRestoreLastMs=0
  private readonly host: PuddleRoomHost
  constructor(host: PuddleRoomHost) {
    this.host=host
    this.dimensions=puddleDimensions(host.size)
    this.residency=new MaterialResidency(2, host.cpuByteBudget)
    this.solver = createNativePuddleTarget(host, host.size, {portableNoise:true})
  }
  get state() {
    return {undoCaptureLastMs:this.undoCaptureLastMs,undoRestoreLastMs:this.undoRestoreLastMs,undoCaptures:this.undoCaptures,undoHits:this.undoHits,layers: this.layers.size + this.parked.size, residentLayers:this.layers.size, parkedLayers:this.parked.size, cpuBytes:this.residency.bytes, drying:this.closing.size > 0, cancellations:this.cancellations, computations:this.computations, pending: this.closing.size > 0 || !!this.solving || [...this.layers.values()].some(l => l.dirty),
      revisions: [...this.layers.values()].map(l => ({epoch:l.epoch, ready:l.goalReady, active:l.active}))}
  }
  has(target: ILayerBuffer): boolean { return this.layers.has(target) || this.parked.has(target) }
  hasMaterial(target: ILayerBuffer): boolean {
    const layer=this.layers.get(target)
    return this.parked.has(target) || !!layer && (layer.gesture!=='prewarm' || !!layer.context)
  }
  /** Read material, never presentation. Structural copies are rare and may
   * synchronously finish the current goal; the original water stays active. */
  canonicalTiles(target: ILayerBuffer): readonly PaintTarget[] {
    this.host.finishLegacySettle?.()
    const layer = this.layers.get(target)
    if (!layer?.tile || !layer.context) return target.allResident()
    if (!layer.goalReady || layer.dirty) {
      this.cancelCurrent()
      this.start(layer)
      while (!this.solver.state.done) this.solver.step(16)
      this.complete(layer)
    }
    const tile = layer.tile
    return [{ ...tile, buffer: layer.goal, contentRect: {
      minX: tile.originX, minY: tile.originY,
      maxX: tile.originX + layer.goal.width, maxY: tile.originY + layer.goal.height,
    } }]
  }
  owns(scratch: RibbonStrokeScratch): boolean {
    return [...this.layers.values()].some(l => l.scratch === scratch)
  }
  /** No allocation/readback. Suspended generators own their textures until finally. */
  assertMaterialReady(target: ILayerBuffer): void {
    if(this.parked.has(target) && !this.residency.hasBytes(target) && this.host.materialReady?.(target)===false)throw new MaterialHistoryNotReady()
  }
  assertSourceAvailable(target: ILayerBuffer): void {
    this.assertMaterialReady(target)
    if (this.layers.has(target) || this.layers.size < 2) return
    if (![...this.layers.values()].some(l => !this.residency.pinned(l.target)
      && (l.gesture==='prewarm' && !l.context || !!l.context && l.scratch.canCaptureRestingCpu()))) throw new MaterialSourceBusy()
  }
  private ensureSlot(target: ILayerBuffer): void {
    this.assertSourceAvailable(target)
    if (this.layers.has(target) || this.layers.size < 2) return
    const victim=[...this.layers.values()].find(l => !this.residency.pinned(l.target)
      && (l.gesture==='prewarm' && !l.context || !!l.context && l.scratch.canCaptureRestingCpu()))!
    if (!victim.context) { this.forget(victim.target); return }
    const tiles=this.canonicalTiles(victim.target)
    const snapshot=victim.scratch.captureRestingCpu(buffer=>{
      const tile=victim.target.allResident().find(t=>t.buffer===buffer)
      return tile ? {originX:tile.originX,originY:tile.originY} : null
    })
    if (!snapshot) throw new MaterialSourceBusy()
    // Anchor display to the canonical goal, retaining the original wet source.
    for(const tile of tiles)tile.buffer.copyTo(victim.target.allResident().find(t=>t.originX===tile.originX && t.originY===tile.originY)!.buffer)
    const {gesture,previous,timestamp,boundary,epoch}=victim
    this.parked.set(victim.target,{target:victim.target,gesture,previous,timestamp,boundary,epoch})
    this.residency.store(victim.target,snapshot)
    this.releaseResident(victim)
    this.host.pool.trimFree()
    this.host.changed(victim.target)
  }
  /** Journal fallback must replay a strict prefix, excluding the incoming op. */
  private awaken(target: ILayerBuffer, beforeRecordedOpId?: string, prepared?:CpuScratchSnapshot): Layer | undefined {
    const old=this.parked.get(target)
    if(!old)return undefined
    this.ensureSlot(target)
    // A journal cache miss temporarily replays through another controller.
    // It shares the solver field even when this controller has a spare slot.
    this.cancelCurrent()
    const snapshot=prepared ?? this.residency.take(target) ?? this.host.rehydrate?.(target,beforeRecordedOpId)
    if(!snapshot)throw new Error('M70 evicted material requires journal reconstruction')
    if(snapshot.tiles.length!==1 || snapshot.tiles[0].originX || snapshot.tiles[0].originY || snapshot.tiles[0].width!==this.dimensions.width || snapshot.tiles[0].height!==this.dimensions.height)throw new Error('M70 material snapshot dimensions differ from page')
    const scratch=RibbonStrokeScratch.restoreCpu(this.host.pool,snapshot,target)
    const allocated:AccumulationBuffer[]=[]
    let presentation:Presentation|undefined
    let layer:Layer
    try {
      const make=()=>{const buffer=new AccumulationBuffer(this.host.gl,this.dimensions.width,this.dimensions.height);allocated.push(buffer);return buffer}
      presentation=createPuddlePresentation(this.host.gl,this.host.size,{smoothArrival:true})
      layer={...old,scratch,raw:make(),next:make(),goal:make(),presentation,
        dirty:true,goalReady:false,active:false,started:0,after:0,presentationDirty:true}
      layer.context=scratch.finishContext ?? undefined
      layer.tile=target.allResident().find(t=>!!scratch.peek(t.buffer)?.inkColor)
      if(layer.context && layer.tile){
        const entry=scratch.peek(layer.tile.buffer)!
        this.host.render(scratch,layer.tile,layer.context,layer.raw,{p:entry.inkLoad!,c:entry.inkColor!,coverage:entry.coverage})
        layer.presentation.reset(layer.tile.buffer,layer.epoch)
      }
    } catch(error) {
      scratch.destroy();for(const buffer of allocated)buffer.destroy();presentation?.destroy()
      throw error
    }
    this.parked.delete(target)
    this.layers.set(target,layer)
    return layer
  }
  /** Transfers an operation-boundary source for an isolated journal replay. */
  capture(target: ILayerBuffer): CpuScratchSnapshot | null {
    const layer=this.layers.get(target)
    if(!layer || this.residency.pinned(target))return null
    return layer.scratch.captureRestingCpu(buffer=>{
      const tile=target.allResident().find(t=>t.buffer===buffer)
      return tile ? {originX:tile.originX,originY:tile.originY} : null
    })
  }
  /** QA-only fast Undo cache, charged to the same byte budget as parked water.
   * Never finish a pending goal on DOWN just to manufacture a checkpoint. */
  captureUndo(target: ILayerBuffer, valid: () => boolean, readWet: () => Float64Array): boolean {
    const layer=this.layers.get(target)
    if(!layer?.tile || !layer.context || !layer.goalReady || layer.dirty || this.residency.pinned(target) || this.closing.has(target) || this.residency.byteBudget===0)return false
    const started=performance.now()
    try {
      const source=this.capture(target)
      if(!source)return false
      const goal=layer.goal.readPixels()
      const wet=readWet()
      const {gesture,previous,timestamp,boundary,epoch}=layer
      const saved:UndoMaterialSnapshot={...source,bytes:source.bytes+goal.byteLength+wet.byteLength,
        undo:{layer:{target,gesture,previous,timestamp,boundary,epoch},goal,wet,valid}}
      if(saved.bytes>this.residency.byteBudget)return false
      this.residency.store(target,saved)
      if(!this.residency.hasBytes(target))return false
      this.undoCaptures++
      return true
    } catch { return false } // Optional cache failure must never reject DOWN.
    finally { this.undoCaptureLastMs=performance.now()-started }
  }
  /** The caller has already folded Undo into its journal. Exact proof failure
   * preserves ordinary replay; water-only/foreign/Dry states cannot use this. */
  restoreUndo(target: ILayerBuffer): {wet:Float64Array} | null {
    const saved=this.residency.peek(target)
    if(!undoSnapshot(saved) || saved.bytes>this.residency.byteBudget || !saved.undo.valid() || this.residency.pinned(target))return null
    const current=this.layers.get(target)
    if(!current || this.closing.has(target))return null
    const started=performance.now()
    this.residency.take(target)
    this.parked.set(target,saved.undo.layer)
    this.releaseResident(current)
    try {
      const layer=this.awaken(target,undefined,saved)
      if(!layer?.tile)throw new Error('Cached Undo has no source tile')
      layer.goal.restorePixelsRect(this.dimensions.width,this.dimensions.height,saved.undo.goal)
      layer.presentation.reset(layer.goal,layer.epoch)
      layer.goalReady=true;layer.dirty=false;layer.active=false;layer.presentationDirty=false
      layer.goal.copyTo(layer.tile.buffer)
      this.host.changed(target)
      this.undoHits++
      return {wet:saved.undo.wet}
    } catch { return null } // Root display is unchanged until all restore allocations succeed.
    finally { this.undoRestoreLastMs=performance.now()-started }
  }
  source(target: ILayerBuffer, gesture: string, profile: RibbonProfile, timestamp: number, boundary='', request?: {pin?: boolean; beforeRecordedOpId?: string}): {scratch: RibbonStrokeScratch; prevDab?: Dab; release: () => void; recordTimestamp: (at: number) => boolean} {
    const parked=this.parked.get(target)
    const prior=this.layers.get(target) ?? parked
    // Empty prewarm placeholders are not an earlier material epoch.
    let priorAt=prior && !(prior.gesture==='prewarm' && !('context' in prior && prior.context)) ? prior.timestamp : undefined
    let boundaryClosed=!!prior && prior.boundary!==boundary
    let physicalClosed=priorAt!==undefined && (boundaryClosed || timestamp>=priorAt+WATERCOLOR_WET_DRY_MS)
    if(parked && (boundary!==parked.boundary || timestamp>=parked.timestamp+WATERCOLOR_WET_DRY_MS))this.close(target)
    let layer = this.layers.get(target) ?? this.awaken(target,request?.beforeRecordedOpId)
    // Logical operation time, never animation progress, closes a dried wash.
    if (layer && (boundary!==layer.boundary || timestamp >= layer.timestamp + WATERCOLOR_WET_DRY_MS)) { this.close(target); layer = undefined }
    if (!layer) {
      // A sliced replay can own real material before its first accept().
      // Only the engine's explicit prewarm placeholder is disposable here.
      for(const [key,old]of this.layers)if(old.gesture==='prewarm' && !old.context)this.forget(key)
      this.ensureSlot(target)
      const make = () => new AccumulationBuffer(this.host.gl, this.dimensions.width, this.dimensions.height)
      layer = {target, scratch:new RibbonStrokeScratch(this.host.pool, profile.ink, profile.normalizeDeposit),
        gesture:'',timestamp,boundary,raw:make(),next:make(),goal:make(),
        presentation:createPuddlePresentation(this.host.gl,this.host.size,{smoothArrival:true}),
        epoch:0,presentationDirty:true,dirty:false,goalReady:false,active:false,started:0,after:0}
      this.layers.set(target,layer)
    }
    this.cancelCurrent()
    if (layer.gesture !== gesture) {
      layer.scratch.releaseFilm()
      layer.scratch.beginStroke()
      layer.gesture = gesture
      layer.previous = undefined
    }
    layer.timestamp = timestamp
    layer.epoch++
    layer.presentation.invalidate(layer.epoch)
    layer.active = false
    layer.goalReady = false
    return {scratch:layer.scratch,prevDab:layer.previous,release:request?.pin ? this.residency.acquire(target) : () => {},
      recordTimestamp:at=>{
        const recordedClosed=priorAt!==undefined && (boundaryClosed || at>=priorAt+WATERCOLOR_WET_DRY_MS)
        const repair=recordedClosed!==physicalClosed
        // Subsequent chunks physically continue this scratch, but their
        // canonical epoch is measured from the previous recorded chunk.
        priorAt=at
        physicalClosed=false
        boundaryClosed=false
        if(this.layers.get(target)===layer)layer.timestamp=at
        return repair
      }}
  }
  previous(scratch: RibbonStrokeScratch, dab: Dab | undefined): void {
    const layer = this.find(scratch)
    if (layer) layer.previous = dab
  }
  private find(scratch: RibbonStrokeScratch): Layer | undefined {
    return [...this.layers.values()].find(l => l.scratch === scratch)
  }
  beforePaint(scratch: RibbonStrokeScratch): void {
    const layer = this.find(scratch)
    if (!layer) return
    this.cancelCurrent()
    layer.active = false
    layer.goalReady = false
  }
  accept(scratch: RibbonStrokeScratch,context=scratch.finishContext): void {
    const layer = this.find(scratch)
    if (!layer || !context) return
    const tile = context.target.allResident().find(t => !!scratch.peek(t.buffer)?.inkColor)
    if (!tile) return
    if (context.target.allResident().length !== 1 || tile.originX || tile.originY ||
      tile.buffer.width !== this.dimensions.width || tile.buffer.height !== this.dimensions.height) {
      throw new Error('M70 QA requires one full-page tile')
    }
    const entry = scratch.peek(tile.buffer)!
    if (!entry.inkLoad || !entry.inkColor) return
    const deferred=this.host.deferPresentation?.(layer.target)===true
    if (!layer.context && !deferred) {
      entry.original.copyTo(layer.raw)
      layer.presentation.reset(layer.raw,layer.epoch)
    }
    layer.tile = tile; layer.context = context
    if(deferred){layer.deferredPresentation=true;layer.dirty=true;layer.after=performance.now()+60;return}
    this.host.render(scratch,tile,context,layer.next,{p:entry.inkLoad,c:entry.inkColor,coverage:entry.coverage})
    layer.presentation.acceptInput(layer.raw,layer.next,layer.epoch)
    layer.presentationDirty=true
    layer.next.copyTo(layer.raw)
    layer.dirty = true
    layer.after = performance.now()+60
    this.present(layer)
  }
  finish(scratch: RibbonStrokeScratch,owned?:{gesture:number;finish:RibbonStrokeScratch['finishContext']}): void {
    this.accept(scratch,owned?.finish??scratch.finishContext)
    // Input may already own a later logical film while this FIFO boundary lands.
    if(!owned||owned.gesture===scratch.gesture)scratch.diffusePending = false
    scratch.releaseFilm(owned?.gesture)
    this.request()
  }
  private cancelCurrent(): void {
    if (!this.solving) return
    this.cancellations++
    this.solving.dirty = true
    this.solver.cancel()
    this.solving = null
  }
  private request(): void {
    if (!this.raf && !this.disposed) this.raf=requestAnimationFrame(this.frame)
  }
  private start(layer: Layer): void {
    if (!layer.tile) return
    this.computations++
    this.solver.resetFromScratch(layer.scratch,layer.tile,layer.epoch)
    this.solving=layer;layer.dirty=false
  }
  private complete(layer: Layer): void {
    if (!layer.tile || !layer.context) return
    this.solver.dry()
    this.host.render(layer.scratch,layer.tile,layer.context,layer.goal,this.solver.buffers())
    layer.dirty=false;layer.goalReady=true;layer.active=true;layer.started=performance.now()
    if(this.closing.has(layer.target)) layer.dryAt=layer.started
    if(this.host.deferPresentation?.(layer.target)){layer.deferredPresentation=true;layer.active=false}
    else layer.presentation.setTarget(layer.goal,this.solver.buffers().coverage,layer.epoch)
    this.solving=null
  }
  private readonly frame = (at: number): void => {
    this.raf=0
    if (this.disposed) return
    if (this.host.drawing()) { this.request();return }
    if (!this.solving) {
      const next=[...this.layers.values()].find(l => l.dirty && l.context && at>=l.after)
      if (next) this.start(next)
    }
    if (this.solving) {
      this.solver.step(4)
      if (this.solver.state.done) this.complete(this.solving)
    }
    let moving=false
    for (const layer of this.layers.values()) if (layer.active) {
      const progress=morphProgress(at-layer.started+(layer.dryAt===undefined?0:99*Math.max(0,at-layer.dryAt)),120000)
      layer.presentation.tick(16,{dry:false,progress})
      layer.presentationDirty=true
      this.present(layer)
      if (progress>=1) {
        layer.active=false
        if(this.closing.has(layer.target) && layer.tile){layer.goal.copyTo(layer.tile.buffer);this.host.changed(layer.target);this.forget(layer.target)}
      }
      else moving=true
    }
    this.host.display()
    if (moving || this.solving || [...this.layers.values()].some(l => l.dirty)) this.request()
  }
  private present(layer: Layer): void {
    if (!layer.tile || !layer.context || !layer.presentationDirty || this.host.deferPresentation?.(layer.target)) return
    layer.presentationDirty=false
    layer.presentation.tick(0,{dry:false}).copyTo(layer.tile.buffer)
    this.host.changed(layer.target)
  }
  /** Leave hidden replay once. Canonical material and its ordinary solver
   * were never skipped; only transient display buffers need initialization. */
  resumePresentation(target: ILayerBuffer): void {
    const layer=this.layers.get(target)
    if(!layer?.deferredPresentation || !layer.tile || !layer.context)return
    layer.deferredPresentation=false
    // raw is the baseline for the next live acceptInput delta even when the
    // visible correction can start directly from an already solved goal.
    const entry=layer.scratch.peek(layer.tile.buffer)!
    this.host.render(layer.scratch,layer.tile,layer.context,layer.raw,{p:entry.inkLoad!,c:entry.inkColor!,coverage:entry.coverage})
    if(layer.goalReady && !layer.dirty){
      // A completed canonical goal is already authoritative. Keep its water
      // source, while undo/load appears immediately at the corrected target.
      layer.presentation.reset(layer.goal,layer.epoch);layer.active=false
    }else{
      layer.presentation.reset(layer.raw,layer.epoch)
    }
    layer.presentationDirty=true;this.present(layer);this.request()
  }
  /** Materialize natural drying on the operation timeline, independently of
   * whether presentation has completed on this particular device. */
  closeIfDry(target: ILayerBuffer, logicalAt: number): boolean {
    const layer = this.layers.get(target) ?? this.parked.get(target)
    if (!layer || !Number.isFinite(logicalAt)
      || logicalAt < layer.timestamp + WATERCOLOR_WET_DRY_MS) return false
    this.close(target)
    return true
  }
  /** Mutate only the dry substrate. Wet deposits remain the canonical source;
   * presentation pixels are never fed back into either material buffer. */
  eraseDryBase(target: ILayerBuffer, paint: (base: AccumulationBuffer,tile?:PaintTarget) => void, logicalAt?: number, beforeRecordedOpId?: string): boolean {
    // Never use Date.now here: historical replay must retain water until the
    // next recorded action actually crosses the layer's expiry boundary.
    if (logicalAt !== undefined) this.closeIfDry(target, logicalAt)
    const layer = this.layers.get(target) ?? this.awaken(target,beforeRecordedOpId)
    if (!layer?.tile || !layer.context) return false
    const entry = layer.scratch.peek(layer.tile.buffer)
    if (!entry?.inkLoad || !entry.inkColor) return false
    this.cancelCurrent()
    paint(entry.original)
    layer.epoch++
    if(this.host.deferPresentation?.(target))layer.deferredPresentation=true
    else {
      this.host.render(layer.scratch, layer.tile, layer.context, layer.raw,
        {p: entry.inkLoad, c: entry.inkColor, coverage: entry.coverage})
      layer.presentation.reset(layer.raw, layer.epoch)
    }
    layer.presentationDirty = true
    layer.active = false
    layer.goalReady = false
    layer.dirty = true
    layer.after = 0
    this.present(layer)
    this.request()
    return true
  }
  presentAll(): void { for (const layer of this.layers.values()) this.present(layer) }
  /** Manual Dry accelerates presentation and computes only the current target.
   * The engine defers later log operations until this explicit boundary lands. */
  dry(target?: ILayerBuffer): void {
    for(const key of [...this.parked.keys()])if(!target || key===target)this.forget(key)
    if(!this.layers.size)return
    const now=performance.now()
    for(const layer of [...this.layers.values()]) {
      if((target && layer.target !== target) || this.closing.has(layer.target)) continue
      this.closing.add(layer.target)
      if(!layer.context){this.forget(layer.target);continue}
      layer.after=0
      if(layer.goalReady){layer.active=true;layer.dryAt=now}
      else if(this.solving!==layer) layer.dirty=true
    }
    this.request()
  }
  /** Finish accepted Dry boundaries before new input, preserving other wet layers. */
  finishDrying(): void {
    for (const target of [...this.closing]) this.close(target)
  }
  /** Explicit recorded boundary. Replays and manual Dry use the same goal.
   * This first QA adapter drains the outstanding goal synchronously here. */
  close(target?: ILayerBuffer): void {
    this.host.finishLegacySettle?.()
    this.cancelCurrent()
    for(const key of [...this.parked.keys()])if(!target || key===target)this.forget(key)
    for (const layer of [...this.layers.values()]) {
      if (target && layer.target!==target) continue
      if (layer.context && layer.tile) {
        if (!layer.goalReady || layer.dirty) {
          this.start(layer)
          while (!this.solver.state.done) this.solver.step(16)
          this.complete(layer)
        }
        layer.goal.copyTo(layer.tile.buffer)
        this.host.changed(layer.target)
      }
      this.forget(layer.target)
    }
  }
  private releaseResident(layer: Layer): void {
    if(this.solving===layer){this.solver.cancel();this.solving=null}
    this.layers.delete(layer.target)
    this.host.released(layer.scratch)
    layer.scratch.destroy();layer.raw.destroy();layer.next.destroy();layer.goal.destroy();layer.presentation.destroy()
  }
  forget(target: ILayerBuffer): void {
    // Caller must cancel/finish the operation before disposing its material.
    this.residency.forget(target)
    this.parked.delete(target)
    this.closing.delete(target)
    const layer=this.layers.get(target)
    if(layer)this.releaseResident(layer)
  }
  destroy(): void {
    if (this.disposed) return
    this.disposed=true
    this.closing.clear()
    if (this.raf) cancelAnimationFrame(this.raf)
    for (const target of [...this.layers.keys(),...this.parked.keys()]) this.forget(target)
    this.solver.destroy()
  }
}
