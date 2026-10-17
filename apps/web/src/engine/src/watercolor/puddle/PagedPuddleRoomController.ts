import {rawInputFingerprint,sameInputFingerprint,type InputFingerprint} from './PuddleInputFingerprint'
import { presentationRegion, unionPresentationRegion, regionIsFull, renderPuddleRegion, type PresentationRegion, type PresentationBounds } from './PuddlePresentationRegion'
import {WATERCOLOR_WET_DRY_MS, type Dab} from '@grafetto/shared'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import type {ILayerBuffer, PaintTarget} from '../../buffers/ILayerBuffer'
import {MaterialResidency} from './MaterialResidency'
import {RibbonStrokeScratch, type CpuScratchSnapshot} from '../../buffers/RibbonStrokeScratch'
import type {RibbonProfile} from '../../dabs/ribbonProfile'
import {MaterialSourceBusy, MaterialHistoryNotReady, type PuddleRoomHost} from './PuddleRoomController'
import {createPuddlePresentation} from './PuddlePresentation'
import {morphProgress} from './morphClock'

type Context = NonNullable<RibbonStrokeScratch['finishContext']>
type Presentation = ReturnType<typeof createPuddlePresentation>
type Material = {p: AccumulationBuffer; c: AccumulationBuffer; coverage: AccumulationBuffer}
interface Layer {
  presentationInputSignature?:string|null
  target: ILayerBuffer
  scratch: RibbonStrokeScratch
  gesture: string
  previous?: Dab
  timestamp: number
  tiles: Map<AccumulationBuffer, TileState>
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
interface TileState {
  inputFingerprint?:InputFingerprint|null
  shownDirty: boolean
  region: PresentationRegion
  tile: PaintTarget
  raw: AccumulationBuffer
  next: AccumulationBuffer
  goal: AccumulationBuffer
  presentation: Presentation
}
export interface PagedPuddleSolver {
  readonly state: {done: boolean; admissionBlocked?:boolean; executing?:boolean}
  resetFromScratch(source: RibbonStrokeScratch, target: ILayerBuffer, epoch: number): void
  step(maxOps?: number): unknown
  buffers(tile: PaintTarget): Material
  dry(): boolean
  cancel(): void
  destroy(): void
}
export interface PagedPuddleRoomHost extends PuddleRoomHost {
  /** After solver cancellation, before any raw mutation or CPU rehydrate. */
  beginInput?():void
  /** Host certifies ALL scalar/gesture inputs of render. Missing/unknown means full fallback. */
  presentationInputSignature?(scratch:RibbonStrokeScratch,context:Context):string|null
  /** Opt-in proof: current raw painting lies inside these world bounds and
   * canonical output outside retained raw support equals the dry substrate.
   * Unknown/foreign/historical inputs return null and retain whole tiles. */
  presentationBounds?(scratch: RibbonStrokeScratch, context: Context): PresentationBounds | null
  createSolver(): PagedPuddleSolver
  makeBuffer?(width: number, height: number, filter?: 'linear' | 'nearest'): AccumulationBuffer
}

/** QA room adapter. Canonical source is shared by every author on a layer.
 * Presentation clocks never modify it. One cancellable solver owns the shared
 * field; dirty revisions replace each other rather than queueing stroke jobs.
 * Per-tile presentation is independent; the injected solver owns the whole material field.
 */
export class PagedPuddleRoomController {
  private readonly parked = new Map<ILayerBuffer, ParkedLayer>()
  private readonly residency: MaterialResidency<ILayerBuffer, CpuScratchSnapshot>
  private readonly layers = new Map<ILayerBuffer, Layer>()
  private readonly solver: PagedPuddleSolver
  private solving: Layer | null = null
  private raf = 0
  private disposed = false
  private readonly closing = new Set<ILayerBuffer>()
  private cancellations = 0
  private computations = 0
  private undoCaptures=0
  private undoHits=0
  private undoCaptureLastMs=0
  private undoRestoreLastMs=0
  private readonly host: PagedPuddleRoomHost
  constructor(host: PagedPuddleRoomHost) {
    this.host=host
    this.residency=new MaterialResidency(2, host.cpuByteBudget)
    this.solver = host.createSolver()
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
    if (!layer?.tiles.size || !layer.context) return target.allResident()
    if (!layer.goalReady || layer.dirty) {
      this.cancelCurrent(); this.start(layer)
      this.finishField(layer)
    }
    return target.allResident().map(tile => {
      const state=layer.tiles.get(tile.buffer)
      return state ? {...tile, buffer:state.goal, contentRect:{minX:tile.originX,minY:tile.originY,
        maxX:tile.originX+state.goal.width,maxY:tile.originY+state.goal.height}} : tile
    })
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
    for(const tile of tiles){
      const destination=victim.target.allResident().find(t=>t.originX===tile.originX && t.originY===tile.originY)!.buffer
      if(tile.buffer!==destination)tile.buffer.copyTo(destination)
    }
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
    const scratch=RibbonStrokeScratch.restoreCpu(this.host.pool,snapshot,target)
    const layer:Layer={...old,scratch,tiles:new Map(),dirty:true,goalReady:false,active:false,started:0,after:0,presentationDirty:true}
    layer.context=scratch.finishContext ?? undefined
    try {
      if(layer.context)for(const tile of target.allResident()) {
        const entry=scratch.peek(tile.buffer)
        if(!entry?.inkLoad || !entry.inkColor)continue
        const state=this.ensureTile(layer,tile,this.region(layer,tile,layer.context))
        this.render(layer,state,layer.context,state.raw,{p:entry.inkLoad,c:entry.inkColor,coverage:entry.coverage})
        this.resetPresentation(state,tile.buffer,layer.epoch)
      }
    } catch(error) {
      scratch.destroy(); this.destroyTiles(layer); throw error
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
  /** Optional Undo cache is disabled; journal replay remains authoritative. */
  captureUndo(_target: ILayerBuffer, _valid: () => boolean, _readWet: () => Float64Array): boolean { return false }
  restoreUndo(_target: ILayerBuffer): {wet:Float64Array} | null { return null }
  source(target: ILayerBuffer, gesture: string, profile: RibbonProfile, timestamp: number, boundary='', request?: {pin?: boolean; beforeRecordedOpId?: string}): {scratch: RibbonStrokeScratch; prevDab?: Dab; release: () => void; recordTimestamp: (at: number) => boolean} {
    this.cancelCurrent();this.host.beginInput?.()
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
      layer = {target, scratch:new RibbonStrokeScratch(this.host.pool, profile.ink, profile.normalizeDeposit),
        gesture:'',timestamp,boundary,tiles:new Map(),
        epoch:0,presentationDirty:true,dirty:false,goalReady:false,active:false,started:0,after:0}
      this.layers.set(target,layer)
    }
    this.cancelCurrent();this.host.beginInput?.()
    if (layer.gesture !== gesture) {
      layer.scratch.releaseFilm()
      layer.scratch.beginStroke()
      layer.gesture = gesture
      layer.previous = undefined
    }
    layer.timestamp = timestamp
    layer.epoch++
    for(const state of layer.tiles.values())state.presentation.invalidate(layer.epoch)
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
    this.cancelCurrent();this.host.beginInput?.()
    layer.active = false
    layer.goalReady = false
  }
  private makeBuffer(width:number,height:number,filter:'linear'|'nearest'='linear'):AccumulationBuffer {
    return this.host.makeBuffer?.(width,height,filter) ?? new AccumulationBuffer(this.host.gl,width,height,filter)
  }
  private region(layer: Layer, tile: PaintTarget, context: Context): PresentationRegion {
    const bounds=layer.scratch.retainedInputBounds
    if(!this.host.presentationBounds?.(layer.scratch,context) || !bounds)return {x:0,y:0,width:tile.buffer.width,height:tile.buffer.height}
    return presentationRegion(tile,bounds) ?? {x:0,y:0,width:tile.buffer.width,height:tile.buffer.height}
  }
  private crop(source:AccumulationBuffer,destination:AccumulationBuffer,region:PresentationRegion):void {
    if(regionIsFull(region,source))source.copyTo(destination)
    else source.copyRegionInto(destination,region.x,region.y,0,0,region.width,region.height)
  }
  private render(layer:Layer,state:TileState,context:Context,out:AccumulationBuffer,material:Material):void {
    if(regionIsFull(state.region,state.tile.buffer))this.host.render(layer.scratch,state.tile,context,out,material)
    else renderPuddleRegion(this.host,layer.scratch,state.tile,context,out,material,state.region)
  }
  private resetPresentation(state:TileState,source:AccumulationBuffer,epoch:number):void {
    if(source.width===state.region.width && source.height===state.region.height)state.presentation.reset(source,epoch)
    else {this.crop(source,state.next,state.region);state.presentation.reset(state.next,epoch)}
    state.shownDirty=true
  }
  private ensureTile(layer:Layer,tile:PaintTarget,requested:PresentationRegion={x:0,y:0,width:tile.buffer.width,height:tile.buffer.height}):TileState {
    const existing=layer.tiles.get(tile.buffer)
    const region=existing?unionPresentationRegion(existing.region,requested):requested
    if(existing && Object.keys(region).every(key=>region[key as keyof PresentationRegion]===existing.region[key as keyof PresentationRegion]))return existing
    const allocated:AccumulationBuffer[]=[]
    const make=(w:number,h:number)=>{const b=this.makeBuffer(w,h);allocated.push(b);return b}
    let presentation:Presentation|undefined
    try {
      const raw=make(region.width,region.height),next=make(region.width,region.height)
      const goal=existing?.goal ?? make(tile.buffer.width,tile.buffer.height)
      presentation=createPuddlePresentation(this.host.gl,{width:region.width,height:region.height},
        {smoothArrival:true,bufferFactory:(w,h,filter)=>this.makeBuffer(w,h,filter)})
      if(existing){
        const original=layer.scratch.peek(tile.buffer)!.original
        this.crop(original,raw,region);this.crop(original,next,region)
        existing.raw.copyRegionInto(raw,0,0,existing.region.x-region.x,existing.region.y-region.y,existing.region.width,existing.region.height)
        const shown=existing.presentation.tick(0,{dry:false})
        shown.copyRegionInto(next,0,0,existing.region.x-region.x,existing.region.y-region.y,existing.region.width,existing.region.height)
        presentation.reset(next,layer.epoch)
      }
      const state={tile,region,raw,next,goal,presentation,shownDirty:true}
      layer.tiles.set(tile.buffer,state)
      if(existing){existing.raw.destroy();existing.next.destroy();existing.presentation.destroy()}
      return state
    } catch(error) {for(const b of allocated)b.destroy();presentation?.destroy();throw error}
  }
  accept(scratch: RibbonStrokeScratch): void {
    const layer=this.find(scratch),context=scratch.finishContext
    if(!layer || !context)return
    const deferred=this.host.deferPresentation?.(layer.target)===true
    const candidate=this.host.presentationBounds?.(scratch,context)
    const proof=candidate && Object.values(candidate).every(Number.isFinite) && candidate.maxX>candidate.minX && candidate.maxY>candidate.minY ? candidate : null
    scratch.noteRetainedInputBounds(proof)
    const known=!!proof && !!scratch.retainedInputBounds
    const signature=this.host.presentationInputSignature?.(scratch,context)??null
    const unchangedGlobals=signature!==null&&signature===layer.presentationInputSignature
    let accepted=false
    for(const tile of context.target.allResident()) {
      if(known && !presentationRegion(tile,proof!,0))continue
      const entry=scratch.peek(tile.buffer)
      if(!entry?.inkLoad || !entry.inkColor)continue
      const fingerprint=rawInputFingerprint(entry),previous=layer.tiles.get(tile.buffer),region=this.region(layer,tile,context)
      if(!deferred&&unchangedGlobals&&previous&&sameInputFingerprint(previous.inputFingerprint,fingerprint)&&Object.keys(region).every(key=>region[key as keyof PresentationRegion]===previous.region[key as keyof PresentationRegion])){accepted=true;continue}
      const fresh=!previous
      const state=this.ensureTile(layer,tile,region)
      accepted=true
      if(fresh && !deferred){this.crop(entry.original,state.raw,state.region);state.presentation.reset(state.raw,layer.epoch)}
      if(deferred)continue
      this.render(layer,state,context,state.next,{p:entry.inkLoad,c:entry.inkColor,coverage:entry.coverage})
      state.presentation.acceptInput(state.raw,state.next,layer.epoch)
      state.next.copyTo(state.raw);state.shownDirty=true;state.inputFingerprint=fingerprint
    }
    if(!accepted&&!layer.tiles.size)return
    layer.presentationInputSignature=signature
    layer.context=context;layer.dirty=true;layer.after=performance.now()+60
    if(deferred){layer.deferredPresentation=true;return}
    layer.presentationDirty=true;this.present(layer)
  }
  finish(scratch: RibbonStrokeScratch): void {
    this.accept(scratch)
    scratch.diffusePending = false
    scratch.releaseFilm()
    this.request()
  }
  private finishField(layer:Layer):void {
    const epoch=layer.epoch
    while(!this.solver.state.done){
      this.solver.step(16)
      if(this.solver.state.admissionBlocked){this.cancelCurrent();throw new MaterialSourceBusy()}
      if(this.solving!==layer||layer.epoch!==epoch||this.disposed)throw new MaterialSourceBusy()
    }
    if(this.solving!==layer||layer.epoch!==epoch||this.disposed)throw new MaterialSourceBusy()
    this.complete(layer)
  }
  get fieldWorkPending():boolean {return this.solver.state.executing===true}
  /** Retire only speculative solver work; raw and the last shown goal stay owned. */
  cancelFieldWork():void {this.cancelCurrent()}
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
    if(this.fieldWorkPending)throw new MaterialSourceBusy()
    if (!layer.tiles.size) return
    this.computations++
    this.solver.resetFromScratch(layer.scratch,layer.target,layer.epoch)
    this.solving=layer;layer.dirty=false
  }
  private complete(layer: Layer): void {
    if (!layer.tiles.size || !layer.context) return
    this.solver.dry()
    // The completed generator has unwound and released its field family.
    // Busy foreign owners retain the solve budget; their textures stay protected.
    this.host.beginInput?.()
    for(const previous of [...layer.tiles.values()]) {
      const state=this.ensureTile(layer,previous.tile,this.region(layer,previous.tile,layer.context))
      const material=this.solver.buffers(state.tile)
      this.host.render(layer.scratch,state.tile,layer.context,state.goal,material)
      if(!this.host.deferPresentation?.(layer.target)){
        if(regionIsFull(state.region,state.tile.buffer))state.presentation.setTarget(state.goal,material.coverage,layer.epoch)
        else {
          const coverage=this.host.pool.acquire(state.region.width,state.region.height)
          try{this.crop(state.goal,state.next,state.region);this.crop(material.coverage,coverage,state.region);state.presentation.setTarget(state.next,coverage,layer.epoch)}
          finally{this.host.pool.release(coverage)}
        }
      }
    }
    layer.dirty=false;layer.goalReady=true;layer.active=true;layer.started=performance.now()
    if(this.closing.has(layer.target))layer.dryAt=layer.started
    if(this.host.deferPresentation?.(layer.target)){layer.deferredPresentation=true;layer.active=false}
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
      const layer=this.solving,epoch=layer.epoch
      this.solver.step(4)
      if (!this.disposed&&this.solving===layer&&layer.epoch===epoch&&this.solver.state.done) this.complete(layer)
    }
    if(this.disposed)return
    let moving=false
    for (const layer of this.layers.values()) if (layer.active) {
      const progress=morphProgress(at-layer.started+(layer.dryAt===undefined?0:99*Math.max(0,at-layer.dryAt)),120000)
      for(const state of layer.tiles.values()){state.presentation.tick(16,{dry:false,progress});state.shownDirty=true}
      layer.presentationDirty=true
      this.present(layer)
      if (progress>=1) {
        layer.active=false
        if(this.closing.has(layer.target)){this.commit(layer);this.forget(layer.target)}
      }
      else moving=true
    }
    this.host.display()
    if (moving || this.solving || [...this.layers.values()].some(l => l.dirty)) this.request()
  }
  private commit(layer:Layer):void {
    for(const state of layer.tiles.values())state.goal.copyTo(state.tile.buffer)
    this.host.changed(layer.target)
  }
  private present(layer: Layer): void {
    if(!layer.tiles.size || !layer.context || !layer.presentationDirty || this.host.deferPresentation?.(layer.target))return
    layer.presentationDirty=false
    for(const state of layer.tiles.values()){
      if(!state.shownDirty)continue
      const shown=state.presentation.tick(0,{dry:false})
      if(regionIsFull(state.region,state.tile.buffer))shown.copyTo(state.tile.buffer)
      else shown.copyRegionInto(state.tile.buffer,0,0,state.region.x,state.region.y,state.region.width,state.region.height)
      state.shownDirty=false
    }
    this.host.changed(layer.target)
  }
  resumePresentation(target: ILayerBuffer): void {
    const layer=this.layers.get(target)
    if(!layer?.deferredPresentation || !layer.context)return
    layer.deferredPresentation=false
    for(const state of layer.tiles.values()) {
      const entry=layer.scratch.peek(state.tile.buffer)!
      this.render(layer,state,layer.context,state.raw,{p:entry.inkLoad!,c:entry.inkColor!,coverage:entry.coverage})
      this.resetPresentation(state,layer.goalReady && !layer.dirty ? state.goal : state.raw,layer.epoch)
    }
    if(layer.goalReady && !layer.dirty)layer.active=false
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
    if (!layer?.tiles.size || !layer.context) return false
    this.cancelCurrent()
    layer.epoch++
    for(const state of layer.tiles.values()) {
      const entry=layer.scratch.peek(state.tile.buffer)
      if(!entry?.inkLoad || !entry.inkColor)continue
      paint(entry.original,state.tile)
      if(this.host.deferPresentation?.(target))layer.deferredPresentation=true
      else {
        if(!regionIsFull(state.region,state.tile.buffer))entry.original.copyTo(state.tile.buffer)
        this.render(layer,state,layer.context,state.raw,{p:entry.inkLoad,c:entry.inkColor,coverage:entry.coverage})
        state.presentation.reset(state.raw,layer.epoch);state.shownDirty=true
      }
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
      if (layer.context && layer.tiles.size) {
        if (!layer.goalReady || layer.dirty) {
          this.start(layer)
          this.finishField(layer)
        }
        this.commit(layer)
      }
      this.forget(layer.target)
    }
  }
  private destroyTiles(layer:Layer):void {
    for(const state of layer.tiles.values()){state.raw.destroy();state.next.destroy();state.goal.destroy();state.presentation.destroy()}
    layer.tiles.clear()
  }
  private releaseResident(layer: Layer): void {
    if(this.solving===layer){this.solver.cancel();this.solving=null}
    this.layers.delete(layer.target)
    this.host.released(layer.scratch)
    layer.scratch.destroy();this.destroyTiles(layer)
  }
  forget(target: ILayerBuffer): void {
    if(this.fieldWorkPending){this.cancelCurrent();queueMicrotask(()=>this.forget(target));return}
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
    if(this.fieldWorkPending){this.cancelCurrent();queueMicrotask(()=>this.destroyNow());return}
    this.destroyNow()
  }
  private destroyNow():void {
    for (const target of [...this.layers.keys(),...this.parked.keys()]) this.forget(target)
    this.solver.destroy()
  }
}
