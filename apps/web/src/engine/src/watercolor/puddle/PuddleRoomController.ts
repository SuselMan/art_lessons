import {WATERCOLOR_WET_DRY_MS, type Dab} from '@grafetto/shared'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import type {ILayerBuffer, PaintTarget} from '../../buffers/ILayerBuffer'
import {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
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
  dryAt?: number
}
export interface PuddleRoomHost extends PuddleTargetHost {
  size: number
  drawing(): boolean
  render(scratch: RibbonStrokeScratch, tile: PaintTarget, context: Context,
    output: AccumulationBuffer, material: Material): void
  changed(target: ILayerBuffer): void
  display(): void
  released(scratch: RibbonStrokeScratch): void
}

/** QA room adapter. Canonical source is shared by every author on a layer.
 * Presentation clocks never modify it. One cancellable solver owns the shared
 * field; dirty revisions replace each other rather than queueing stroke jobs.
 * Deliberately limited to one square tile until the atlas implementation lands.
 */
export class PuddleRoomController {
  private readonly layers = new Map<ILayerBuffer, Layer>()
  private readonly solver: ReturnType<typeof createNativePuddleTarget>
  private solving: Layer | null = null
  private raf = 0
  private disposed = false
  private readonly closing = new Set<ILayerBuffer>()
  private cancellations = 0
  private computations = 0
  private readonly host: PuddleRoomHost
  constructor(host: PuddleRoomHost) {
    this.host=host
    const plan=host.settlePlan,prepare=plan.prepare
    this.solver = createNativePuddleTarget(host, host.size, {portableNoise:true,prepare:(...args)=>{
      const old=plan.diagnosticSkipBrushContacts
      plan.diagnosticSkipBrushContacts=true
      try{return prepare.apply(plan,args)}finally{plan.diagnosticSkipBrushContacts=old}
    }})
  }
  get state() {
    return {layers: this.layers.size, drying:this.closing.size > 0, cancellations:this.cancellations, computations:this.computations, pending: this.closing.size > 0 || !!this.solving || [...this.layers.values()].some(l => l.dirty),
      revisions: [...this.layers.values()].map(l => ({epoch:l.epoch, ready:l.goalReady, active:l.active}))}
  }
  has(target: ILayerBuffer): boolean { return this.layers.has(target) }
  /** Read material, never presentation. Structural copies are rare and may
   * synchronously finish the current goal; the original water stays active. */
  canonicalTiles(target: ILayerBuffer): readonly PaintTarget[] {
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
  source(target: ILayerBuffer, gesture: string, profile: RibbonProfile, timestamp: number, boundary=''): {scratch: RibbonStrokeScratch; prevDab?: Dab} {
    let layer = this.layers.get(target)
    // Logical operation time, never animation progress, closes a dried wash.
    if (layer && (boundary!==layer.boundary || timestamp >= layer.timestamp + WATERCOLOR_WET_DRY_MS)) { this.close(target); layer = undefined }
    if (!layer) {
      // A sliced replay can own real material before its first accept().
      // Only the engine's explicit prewarm placeholder is disposable here.
      for(const [key,old]of this.layers)if(old.gesture==='prewarm' && !old.context)this.forget(key)
      if (this.layers.size >= 2) throw new Error('M70 QA supports two wet layers at once; dry a layer first')
      const make = () => new AccumulationBuffer(this.host.gl, this.host.size, this.host.size)
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
    return {scratch:layer.scratch,prevDab:layer.previous}
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
  accept(scratch: RibbonStrokeScratch): void {
    const layer = this.find(scratch), context = scratch.finishContext
    if (!layer || !context) return
    const tile = context.target.allResident().find(t => !!scratch.peek(t.buffer)?.inkColor)
    if (!tile) return
    if (context.target.allResident().length !== 1 || tile.originX || tile.originY ||
      tile.buffer.width !== this.host.size || tile.buffer.height !== this.host.size) {
      throw new Error('M70 QA requires one square page tile')
    }
    const entry = scratch.peek(tile.buffer)!
    if (!entry.inkLoad || !entry.inkColor) return
    if (!layer.context) {
      entry.original.copyTo(layer.raw)
      layer.presentation.reset(layer.raw,layer.epoch)
    }
    layer.tile = tile; layer.context = context
    this.host.render(scratch,tile,context,layer.next,{p:entry.inkLoad,c:entry.inkColor,coverage:entry.coverage})
    layer.presentation.acceptInput(layer.raw,layer.next,layer.epoch)
    layer.presentationDirty=true
    layer.next.copyTo(layer.raw)
    layer.dirty = true
    layer.after = performance.now()+60
    this.present(layer)
  }
  finish(scratch: RibbonStrokeScratch): void {
    this.accept(scratch)
    scratch.diffusePending = false
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
    layer.presentation.setTarget(layer.goal,this.solver.buffers().coverage,layer.epoch)
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
    if (!layer.tile || !layer.context || !layer.presentationDirty) return
    layer.presentationDirty=false
    layer.presentation.tick(0,{dry:false}).copyTo(layer.tile.buffer)
    this.host.changed(layer.target)
  }
  /** Materialize natural drying on the operation timeline, independently of
   * whether presentation has completed on this particular device. */
  closeIfDry(target: ILayerBuffer, logicalAt: number): boolean {
    const layer = this.layers.get(target)
    if (!layer || !Number.isFinite(logicalAt)
      || logicalAt < layer.timestamp + WATERCOLOR_WET_DRY_MS) return false
    this.close(target)
    return true
  }
  /** Mutate only the dry substrate. Wet deposits remain the canonical source;
   * presentation pixels are never fed back into either material buffer. */
  eraseDryBase(target: ILayerBuffer, paint: (base: AccumulationBuffer) => void, logicalAt?: number): boolean {
    // Never use Date.now here: historical replay must retain water until the
    // next recorded action actually crosses the layer's expiry boundary.
    if (logicalAt !== undefined) this.closeIfDry(target, logicalAt)
    const layer = this.layers.get(target)
    if (!layer?.tile || !layer.context) return false
    const entry = layer.scratch.peek(layer.tile.buffer)
    if (!entry?.inkLoad || !entry.inkColor) return false
    this.cancelCurrent()
    paint(entry.original)
    layer.epoch++
    this.host.render(layer.scratch, layer.tile, layer.context, layer.raw,
      {p: entry.inkLoad, c: entry.inkColor, coverage: entry.coverage})
    layer.presentation.reset(layer.raw, layer.epoch)
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
    this.cancelCurrent()
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
  forget(target: ILayerBuffer): void {
    const layer=this.layers.get(target)
    if (!layer) return
    if (this.solving===layer) { this.solver.cancel();this.solving=null }
    this.layers.delete(target)
    this.closing.delete(target)
    this.host.released(layer.scratch)
    layer.scratch.destroy();layer.raw.destroy();layer.next.destroy();layer.goal.destroy();layer.presentation.destroy()
  }
  destroy(): void {
    if (this.disposed) return
    this.disposed=true
    this.closing.clear()
    if (this.raf) cancelAnimationFrame(this.raf)
    for (const target of [...this.layers.keys()]) this.forget(target)
    this.solver.destroy()
  }
}
