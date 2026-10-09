import type {WatercolorCanonicalFIFO,CanonicalWatercolorRequest} from '../watercolor/WatercolorCanonicalFIFO'
import type {RoomNativeCentralOwner,RoomNativeMaterialJob} from './roomWatercolorExecutor'

export interface NativeFifoMarker { request: number; kind: 'source'|'material'; phase: string; at: number; queued: number }

/** Native material tasks enter the SAME engine canonical FIFO. This adapter
 * owns no second queue, op journal, pointer input, frame timer or GPU model. */
export class RoomNativeCentralAdapter implements RoomNativeCentralOwner {
 private readonly fifo:WatercolorCanonicalFIFO
 private readonly changed:()=>void
 private executing=false
 private ordinal=0
 private materialQuantumCap=8
 private materialScopeCap=0
 setDiagnosticMaterialScopeCap(value:number){
  if(!import.meta.env.DEV||!Number.isFinite(value)||![0,2,4].includes(value))throw new Error('DEV material scope cap must be0/2/4')
  this.materialScopeCap=value
 }
 /** Explicit DEV-only experiment; material/publication order and4 ms budget stay unchanged. */
 setDiagnosticMaterialQuantumCap(value:number){
  if(!import.meta.env.DEV||!Number.isFinite(value)||![8,16,32].includes(value))throw new Error('DEV material quantum cap must be8/16/32')
  this.materialQuantumCap=value
 }
 /** DEV observer is OFF unless explicitly installed; never controls admission. */
 diagnosticObserver:((event:NativeFifoMarker)=>void)|null=null
 private mark(request:number,kind:NativeFifoMarker['kind'],phase:string){
  if(!import.meta.env.DEV||!this.diagnosticObserver)return
  try{this.diagnosticObserver({request,kind,phase,at:performance.now(),queued:this.fifo.queuedRequestCount})}catch{/* An observer cannot change material execution. */}
 }
 constructor(fifo:WatercolorCanonicalFIFO,changed:()=>void){this.fifo=fifo;this.changed=changed}
 get isIdle(){return this.executing||!this.fifo.pending}
 get ownsCurrentExecution(){return this.executing}
 private request(run:()=>Generator<number,void,void>,cancel:()=>void):CanonicalWatercolorRequest {
  return{gpuBackend:'webgpu',execute:run,cancel}
 }
 /** CPU recipe has already advanced once and been frozen by the painter.
  * Keep its native write and publication ordered before the next recipe. */
 enqueueSource(emit:()=>void,publish:()=>Promise<void>):void {
  let cancelled=false
  const owner=this,id=this.ordinal++
  this.mark(id,'source','admitted')
  this.fifo.enqueue(this.request(function*(){
   owner.mark(id,'source','execute')
   owner.executing=true;try{emit()}finally{owner.executing=false}
   let ready=false,error:unknown
   owner.mark(id,'source','publish:start')
   void publish().then(()=>{owner.mark(id,'source','publish:done');ready=true},e=>{owner.mark(id,'source','publish:failed');error=e;ready=true})
   while(!ready&&!cancelled)yield -1
   if(cancelled)return
   if(error)throw error
   owner.mark(id,'source','complete');owner.changed()
  },()=>{cancelled=true}))
 }
 admit(job:RoomNativeMaterialJob):Promise<void> {return this.admitFactory(()=>job)}
 /** Prepare INSIDE the already queued boundary, never append a nested settle
  * behind later source packets. The same packet owns all original passes. */
 admitFactory(prepare:()=>RoomNativeMaterialJob|null):Promise<void> {
  const quantumCap=this.materialQuantumCap,scopeCap=this.materialScopeCap
  return new Promise((resolve,reject)=>{
   let disposed=false,settled=false,job:RoomNativeMaterialJob|null=null
   const close=()=>{if(!disposed){disposed=true;job?.dispose()}}
   const fail=(e:unknown)=>{if(!settled){settled=true;reject(e)}}
   const owner=this,id=this.ordinal++
   this.mark(id,'material','admitted')
   this.fifo.enqueue(this.request(function*(){
    try{
     owner.mark(id,'material','prepare:start')
     owner.executing=true;try{job=prepare()}finally{owner.executing=false}
     owner.mark(id,'material','prepare:done')
     if(!job){owner.mark(id,'material','prepare:empty');settled=true;resolve();return}
     if(scopeCap&&!job.canStep)throw new Error('Native material scope guard unavailable')
     let done=false
     while(!done){
      const start=performance.now();let count=0
      owner.executing=true
      try{do{if(scopeCap&&!job.canStep!(scopeCap)){owner.mark(id,'material','scope:blocked');break}owner.mark(id,'material','step:start');done=job.step();owner.mark(id,'material','step:done');count++}while(!done&&count<quantumCap&&performance.now()-start<4)}finally{owner.executing=false}
      if(!done)yield -1
     }
     owner.mark(id,'material','finish:start')
     owner.executing=true;try{job.finish()}finally{owner.executing=false}
     owner.mark(id,'material','finish:done')
     if(job.publish){let ready=false,error:unknown;owner.mark(id,'material','publish:start');void job.publish().then(()=>{owner.mark(id,'material','publish:done');ready=true},e=>{owner.mark(id,'material','publish:failed');error=e;ready=true});while(!ready)yield -1;if(error)throw error}
     close();owner.mark(id,'material','complete');owner.changed();settled=true;resolve()
    }catch(e){close();fail(e);throw e}
   },()=>{close();fail(new Error('Native Room canonical task cancelled'))}))
  })
 }
 async drain(){if(!await this.fifo.ready())throw new Error('Native Room central FIFO cancelled')}
 async cancel(reason:Parameters<RoomNativeCentralOwner['cancel']>[0]){this.fifo.cancel(reason==='context-loss')}
}
