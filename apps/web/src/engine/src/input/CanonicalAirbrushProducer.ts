import type {SourceAuthorPacket} from '../presets/sourceStrokeAuthor'
import type {AuthorInputFIFO,AuthorInputYield} from './AuthorInputFIFO'

export type CanonicalAirbrushSample=Omit<SourceAuthorPacket,'t'>
export interface CanonicalAirbrushProducerContext {
 readonly fifo:Pick<AuthorInputFIFO,'enqueue'>
 /** Monotonic dispatch clock, in milliseconds. Never a predicted pen time. */
 now():number
 /** Provider must schedule asynchronously, as native setTimeout does. */
 scheduleDelay(callback:()=>void,milliseconds:number):number
 cancelDelay(handle:number):void
 reserve(bytes:number):()=>void
 assertCurrent():void
 /** SAME prepared author/state/adapter; drains all native yields, no new RNG. */
 produce(packet:SourceAuthorPacket):Generator<AuthorInputYield,void,void>
 finish():Generator<AuthorInputYield,void,void>
 failed(error:unknown):void
}
interface SampleCell {readonly sample:CanonicalAirbrushSample;readonly time:number}
interface Wake {handle?:number}
const MAX_SAMPLES=32,CLOCK_SLICE_MS=32,WAKE_MS=16
/** One gesture, one FIFO job, bounded captured input. Clock debt is a scalar,
 * not a queue of paints: the native author distance/time iterator emits every
 * overdue dab cooperatively. This is authoring only, never replay/permission. */
export class CanonicalAirbrushProducer {
 static readonly reservedBytes=4096+MAX_SAMPLES*256
 private readonly samples:SampleCell[]=[]
 private readonly context:CanonicalAirbrushProducerContext
 private release:(()=>void)|undefined
 private held:CanonicalAirbrushSample|undefined
 private wake:Wake|undefined
 private epoch=0
 private queued=false
 private lastClock:number
 private segmentStart:number
 private elapsed=0
 private demand=0
 private consumed=0
 private started=false
 private paused=false
 private ending=false
 private closed=false
 private notified=false
 constructor(context:CanonicalAirbrushProducerContext){
  this.context=context
  const now=context.now()
  if(!Number.isFinite(now)||now<0)throw new RangeError('Invalid airbrush clock')
  this.lastClock=this.segmentStart=now
  const release=context.reserve(CanonicalAirbrushProducer.reservedBytes)
  try{context.assertCurrent();this.release=release}catch(error){try{release()}catch{/* preserve original, including undefined */}throw error}
 }
 get pending():boolean{return this.queued||this.samples.length>0||this.demand>this.consumed}
 start(sample:CanonicalAirbrushSample):void {
  try{
  this.assertOpen()
  if(this.started)throw Error('Airbrush already started')
  const captured=this.capture(sample),time=this.time()
  this.started=true;this.samples.push({sample:captured,time});this.demand=time
  this.submit();this.arm()

  }catch(error){this.fail(error);throw error}
 }
 /** Attach immediately AFTER the existing initial START was enqueued, BEFORE
  * its async BEGIN wait. That FIFO job alone owns the t=0 initial paint. */
 attachAfterStart(sample:CanonicalAirbrushSample):void {
  try{
   this.assertOpen()
   if(this.started)throw Error('Airbrush already started')
   this.held=this.capture(sample);this.segmentStart=this.clock();this.elapsed=this.consumed=this.demand=0;this.started=true
   this.arm()
  }catch(error){this.fail(error);throw error}
 }
 /** Route genuine timed MOVE here instead of enqueueing it a second time. */
 input(sample:CanonicalAirbrushSample):void {
  try{
  this.assertOpen()
  if(!this.started||this.paused||this.ending)throw Error('Airbrush input unavailable')
  if(this.samples.length>=MAX_SAMPLES){const error=new RangeError('Airbrush input queue capacity');this.fail(error);throw error}
  const captured=this.capture(sample),time=this.time()
  this.samples.push({sample:captured,time});this.demand=Math.max(this.demand,time)
  this.submit()

  }catch(error){this.fail(error);throw error}
 }
 /** Preserve debt accepted before pause; hidden time never produces paint. */
 pause():void {
  try{
  this.assertOpen()
  if(this.paused||this.ending)return
  const time=this.time();this.elapsed=time;this.demand=Math.max(this.demand,time);this.paused=true
  this.clearWake();this.submit()

  }catch(error){this.fail(error);throw error}
 }
 resume():void {
  try{
  this.assertOpen()
  if(!this.paused||this.ending)return
  const now=this.clock();this.segmentStart=now;this.paused=false;this.arm()

  }catch(error){this.fail(error);throw error}
 }
 /** Drain the real elapsed prefix, then call the existing native finish once. */
 finish():void {
  try{
  this.assertOpen()
  if(!this.started||this.ending)throw Error('Airbrush finish unavailable')
  this.demand=Math.max(this.demand,this.time());this.ending=true;this.clearWake();this.submit()

  }catch(error){this.fail(error);throw error}
 }
 /** Does not cancel another owner's FIFO work. Caller also retires its source. */
 cancel():void {
  if(this.closed)return
  this.closed=true;this.epoch++;this.samples.length=0;this.held=undefined
  let failed=false,primary:unknown
  try{this.clearWake()}catch(error){failed=true;primary=error}
  // An active/suspended generator owns this reservation until its FIFO release.
  if(!this.queued)try{this.retire()}catch(error){if(!failed){failed=true;primary=error}}
  if(failed)throw primary
 }
 dispose():void {this.cancel()}
 private capture(sample:CanonicalAirbrushSample):CanonicalAirbrushSample {
  const result:Record<string,number|boolean>={}
  const fields=['x','y','pressure','tiltX','tiltY','speed','rotation','tangentialPressure','perspective','canvasRotation','mirroredH','mirroredV','tiltDirectionOffset','hover'] as const
  if(!sample||typeof sample!=='object')throw new TypeError('Invalid airbrush sample')
  const raw=Object.getOwnPropertyDescriptor(sample,'sourceViewSpeed'),keys=Reflect.ownKeys(sample)
  if(keys.length!==fields.length+(raw?1:0)||keys.some(key=>key!=='sourceViewSpeed'&&!fields.some(field=>field===key)))throw new TypeError('Invalid airbrush sample')
  if(raw){if(!Object.hasOwn(raw,'value')||typeof raw.value!=='number'||!Number.isFinite(raw.value)||raw.value<0)throw new TypeError('Invalid airbrush raw speed');result.sourceViewSpeed=raw.value}
  for(const key of fields){
   const d=Object.getOwnPropertyDescriptor(sample,key)
   if(!d||!Object.hasOwn(d,'value')||(key==='mirroredH'||key==='mirroredV'||key==='hover'?typeof d.value!=='boolean':typeof d.value!=='number'||!Number.isFinite(d.value)))throw new TypeError('Invalid airbrush sample field')
   result[key]=d.value
  }
  // Geometry/domain validation still belongs to SAME native author on consume.
  return Object.freeze(result) as unknown as CanonicalAirbrushSample
 }
 private assertOpen():void {
  if(this.closed)throw Error('Airbrush producer closed')
  const epoch=this.epoch;this.context.assertCurrent()
  if(this.closed||epoch!==this.epoch)throw Error('Airbrush lifetime changed')
 }
 private clock():number {
  const epoch=this.epoch,now=this.context.now()
  if(this.closed||epoch!==this.epoch)throw Error('Airbrush clock lifetime changed')
  if(!Number.isFinite(now)||now<this.lastClock)throw new RangeError('Airbrush clock regressed')
  this.lastClock=now;return now
 }
 private time():number {return this.paused?this.elapsed:this.elapsed+(this.clock()-this.segmentStart)}
 private arm():void {
  if(this.closed||this.paused||this.ending||this.wake)return
  const wake:Wake={},epoch=this.epoch;this.wake=wake
  try{wake.handle=this.context.scheduleDelay(()=>{
   if(this.closed||epoch!==this.epoch||this.wake!==wake)return
   this.wake=undefined
   try{this.assertOpen();this.demand=Math.max(this.demand,this.time());this.submit();this.arm()}catch(error){this.fail(error)}
  },WAKE_MS)
   if(this.closed||epoch!==this.epoch||this.wake!==wake)this.context.cancelDelay(wake.handle)
  }catch(error){if(this.wake===wake)this.wake=undefined;this.fail(error);throw error}
 }
 private clearWake():void {
  const wake=this.wake;this.wake=undefined
  if(wake?.handle!==undefined)this.context.cancelDelay(wake.handle)
 }
 private submit():void {
  if(this.closed||!this.started||this.queued)return
  const epoch=this.epoch;let completed=false
  this.queued=true
  try{this.context.fifo.enqueue(()=>this.drain(epoch,()=>{completed=true}),()=>{
   this.queued=false
   if(!completed&&!this.closed){const error=new Error('Airbrush FIFO cancelled');try{this.cancel()}finally{this.context.failed(error)}}
   if(this.closed)this.retire()
  })}catch(error){this.queued=false;this.fail(error);throw error}
 }
 private *drain(epoch:number,complete:()=>void):Generator<AuthorInputYield,void,void> {
  try{
   while(!this.closed&&epoch===this.epoch){
    this.assertOpen()
    const next=this.samples[0]
    if(!this.held&&next){
     yield* this.context.produce(Object.freeze({...next.sample,t:next.time}))
     if(this.closed||epoch!==this.epoch)return
     this.held=next.sample;this.consumed=next.time;this.samples.shift();continue
    }
    // A genuine MOVE keeps native interpolation from the last accepted sample.
    // Never first consume its elapsed time at the old stationary position.
    if(next){
     yield* this.context.produce(Object.freeze({...next.sample,t:next.time}))
     if(this.closed||epoch!==this.epoch)return
     this.held=next.sample;this.consumed=next.time;this.samples.shift();continue
    }
    if(this.held&&this.demand>this.consumed){
     const t=Math.min(this.demand,this.consumed+CLOCK_SLICE_MS)
     yield* this.context.produce(Object.freeze({...this.held,t}))
     if(this.closed||epoch!==this.epoch)return
     this.consumed=t
     // Bound catchup even when a native endpoint produces no author yields.
     yield;continue
    }
    if(this.ending){yield* this.context.finish();if(this.closed||epoch!==this.epoch)return;complete();this.cancel();return}
    complete();return
   }
  }catch(error){this.fail(error);throw error}
 }
 private retire():void {const release=this.release;this.release=undefined;release?.()}
 private fail(error:unknown):void {
  if(this.notified)return
  this.notified=true
  // Primary failure is handed to the source owner even for throw undefined.
  try{this.cancel()}catch{/* the original failure remains primary */}
  try{this.context.failed(error)}catch{throw error}
 }
}
