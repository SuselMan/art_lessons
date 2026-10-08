import type {WatercolorCanonicalFIFO,CanonicalWatercolorRequest} from '../watercolor/WatercolorCanonicalFIFO'
import type {RoomNativeCentralOwner,RoomNativeMaterialJob} from './roomWatercolorExecutor'

/** Native material tasks enter the SAME engine canonical FIFO. This adapter
 * owns no second queue, op journal, pointer input, frame timer or GPU model. */
export class RoomNativeCentralAdapter implements RoomNativeCentralOwner {
 private readonly fifo:WatercolorCanonicalFIFO
 private readonly changed:()=>void
 private executing=false
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
  const owner=this
  this.fifo.enqueue(this.request(function*(){
   owner.executing=true;try{emit()}finally{owner.executing=false}
   let ready=false,error:unknown
   void publish().then(()=>{ready=true},e=>{error=e;ready=true})
   while(!ready&&!cancelled)yield -1
   if(cancelled)return
   if(error)throw error
   owner.changed()
  },()=>{cancelled=true}))
 }
 admit(job:RoomNativeMaterialJob):Promise<void> {return this.admitFactory(()=>job)}
 /** Prepare INSIDE the already queued boundary, never append a nested settle
  * behind later source packets. The same packet owns all original passes. */
 admitFactory(prepare:()=>RoomNativeMaterialJob|null):Promise<void> {
  return new Promise((resolve,reject)=>{
   let disposed=false,settled=false,job:RoomNativeMaterialJob|null=null
   const close=()=>{if(!disposed){disposed=true;job?.dispose()}}
   const fail=(e:unknown)=>{if(!settled){settled=true;reject(e)}}
   const owner=this
   this.fifo.enqueue(this.request(function*(){
    try{
     owner.executing=true;try{job=prepare()}finally{owner.executing=false}
     if(!job){settled=true;resolve();return}
     let done=false
     while(!done){
      const start=performance.now();let count=0
      owner.executing=true
      try{do{done=job.step();count++}while(!done&&count<8&&performance.now()-start<4)}finally{owner.executing=false}
      if(!done)yield -1
     }
     owner.executing=true;try{job.finish()}finally{owner.executing=false}
     if(job.publish){let ready=false,error:unknown;void job.publish().then(()=>{ready=true},e=>{error=e;ready=true});while(!ready)yield -1;if(error)throw error}
     close();owner.changed();settled=true;resolve()
    }catch(e){close();fail(e);throw e}
   },()=>{close();fail(new Error('Native Room canonical task cancelled'))}))
  })
 }
 async drain(){if(!await this.fifo.ready())throw new Error('Native Room central FIFO cancelled')}
 async cancel(reason:Parameters<RoomNativeCentralOwner['cancel']>[0]){this.fifo.cancel(reason==='context-loss')}
}
