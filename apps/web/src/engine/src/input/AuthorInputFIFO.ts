/** Serial author lifecycle with bounded continuation turns. Captured inputs and
 * clocks belong to callers; yielding never changes their semantic ordering. */
export interface AuthorInputFIFOContext {
  schedule(callback:()=>void):number
  unschedule(handle:number):void
  now():number
  failed(error:unknown):void
}
interface AuthorInputJob {
  readonly create:()=>Generator<void,void,void>
  readonly release?:()=>void
  iterator?:Generator<void,void,void>
  retired:boolean
}
export class AuthorInputFIFO {
  private jobs:AuthorInputJob[]=[]
  private work:AuthorInputJob|undefined
  private frame:number|undefined
  private epoch=0
  private pumping=false
  private readonly context:AuthorInputFIFOContext
  private readonly budgetMs:number
  private readonly maxSteps:number
  constructor(context:AuthorInputFIFOContext,budgetMs=4,maxSteps=2){this.context=context;this.budgetMs=budgetMs;this.maxSteps=maxSteps}
  get pending():boolean{return !!this.work||this.jobs.length>0}
  /** release owns captured data even if cancellation precedes generator start. */
  enqueue(job:()=>Generator<void,void,void>,release?:()=>void):void{
    this.jobs.push({create:job,release,retired:false})
    if(!this.pumping&&this.frame===undefined)this.pump()
  }
  private retire(job:AuthorInputJob,close:boolean):void {
    if(job.retired)return
    job.retired=true
    let failed=false,primary:unknown
    try{if(close)job.iterator?.return()}catch(error){failed=true;primary=error}
    try{job.release?.()}catch(error){if(!failed){failed=true;primary=error}}
    if(failed)throw primary
  }
  private pump():void{
    if(this.pumping)return
    this.pumping=true
    const epoch=this.epoch
    let steps=0,current:AuthorInputJob|undefined,failed=false,primary:unknown
    try{
      const start=this.context.now()
      while(this.pending){
        current=this.work??=this.jobs.shift()!
        const iterator=current.iterator??=current.create()
        if(epoch!==this.epoch){this.retire(current,true);break}
        const step=iterator.next()
        if(epoch!==this.epoch){this.retire(current,true);break}
        if(step.done){this.work=undefined;this.retire(current,false)}
        else steps++
        if(epoch!==this.epoch||steps>=this.maxSteps||this.context.now()-start>=this.budgetMs)break
        current=undefined
      }
    }catch(error){
      failed=true;primary=error
      // cancel detaches queued owners before invoking arbitrary cleanup. The
      // current generator may have been cancelled reentrantly during next.
      const active=current??this.work
      try{this.cancel()}catch{/* the work failure remains primary */}
      if(active)try{this.retire(active,true)}catch{/* all releases attempted */}
    }finally{this.pumping=false}
    let notificationFailed=false,notificationError:unknown
    try{if(failed)this.context.failed(primary)}catch(error){notificationFailed=true;notificationError=error}
    // Cleanup can enqueue a new epoch. A throwing failure observer must not
    // strand those independently owned jobs without their accepted wakeup.
    try{this.schedulePending()}catch(error){if(!notificationFailed){notificationFailed=true;notificationError=error}}
    if(notificationFailed)throw notificationError
  }
  private schedulePending():void {
    if(this.pending&&this.frame===undefined){
      const scheduledEpoch=this.epoch
      try{this.frame=this.context.schedule(()=>{if(scheduledEpoch!==this.epoch)return;this.frame=undefined;this.pump()})}
      catch(error){try{this.cancel()}catch{/* preserve scheduling failure */}this.context.failed(error)}
    }
  }
  cancel():void{
    this.epoch++
    const frame=this.frame,jobs=this.jobs,old=this.work
    this.frame=undefined;this.jobs=[];this.work=undefined
    let failed=false,primary:unknown
    const attempt=(cleanup:()=>void)=>{try{cleanup()}catch(error){if(!failed){failed=true;primary=error}}}
    if(frame!==undefined)attempt(()=>this.context.unschedule(frame))
    for(const job of jobs)attempt(()=>this.retire(job,false))
    // Reentrant cancellation is observed immediately after .next() returns;
    // captured data must remain alive until its active generator has exited.
    if(!this.pumping&&old)attempt(()=>this.retire(old,true))
    if(failed)throw primary
  }
}
