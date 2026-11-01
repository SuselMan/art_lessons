/** Serial author lifecycle with bounded continuation turns. Captured inputs and
 * clocks belong to callers; yielding never changes their semantic ordering. */
export interface AuthorInputFIFOContext {
  schedule(callback:()=>void):number
  unschedule(handle:number):void
  now():number
  failed(error:unknown):void
}
/** A scheduling wait, never an authorisation/result value. Deadline uses context.now. */
export interface AuthorInputWait {
  readonly kind:'author-input-wait'
  readonly promise:Promise<unknown>
  readonly deadline:number
  readonly timeoutError:Error
}
export type AuthorInputYield=void|AuthorInputWait
type WaitOutcome={ok:true}|{ok:false;error:unknown}
interface WaitCell { wake?: (outcome:WaitOutcome)=>void }
interface JobWait {
  readonly cell:WaitCell
  outcome?:WaitOutcome
  timer?:ReturnType<typeof setTimeout>
}
// Promise reactions retain only this detachable cell after cancellation.
function observeWait(promise:unknown,cell:WaitCell):void {
  void Promise.resolve(promise).then(()=>cell.wake?.({ok:true}),error=>cell.wake?.({ok:false,error}))
}
interface AuthorInputJob {
  readonly create:()=>Generator<AuthorInputYield,void,void>
  readonly release?:()=>void
  iterator?:Generator<AuthorInputYield,void,void>
  wait?:JobWait
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
  enqueue(job:()=>Generator<AuthorInputYield,void,void>,release?:()=>void):void{
    this.jobs.push({create:job,release,retired:false})
    if(!this.pumping&&!this.work?.wait&&this.frame===undefined)this.pump()
  }
  private retire(job:AuthorInputJob,close:boolean):void {
    if(job.retired)return
    job.retired=true
    let failed=false,primary:unknown
    const wait=job.wait;job.wait=undefined
    try{if(wait)this.detachWait(wait)}catch(error){failed=true;primary=error}
    try{if(close)job.iterator?.return()}catch(error){if(!failed){failed=true;primary=error}}
    try{job.release?.()}catch(error){if(!failed){failed=true;primary=error}}
    if(failed)throw primary
  }
  private pump():void{
    if(this.pumping||(this.work?.wait&&!this.work.wait.outcome))return
    this.pumping=true
    const epoch=this.epoch
    let steps=0,current:AuthorInputJob|undefined,failed=false,primary:unknown
    try{
      const start=this.context.now()
      while(this.pending){
        current=this.work??=this.jobs.shift()!
        const iterator=current.iterator??=current.create()
        if(epoch!==this.epoch){this.retire(current,true);break}
        const wait=current.wait
        current.wait=undefined
        const step=wait?.outcome?.ok===false?iterator.throw(wait.outcome.error):iterator.next()
        if(epoch!==this.epoch){this.retire(current,true);break}
        if(step.done){this.work=undefined;this.retire(current,false)}
        else if(step.value!==undefined){this.park(current,step.value,epoch);if(epoch!==this.epoch)this.retire(current,true);break}
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
  private detachWait(wait:JobWait):void {
    wait.cell.wake=undefined
    const timer=wait.timer;wait.timer=undefined
    if(timer!==undefined)clearTimeout(timer)
  }
  private park(job:AuthorInputJob,token:AuthorInputWait,epoch:number):void {
    // Capture data fields without invoking accessors from a malformed yield.
    const fields=Object.getOwnPropertyDescriptors(token)
    for(const key of ['kind','promise','deadline','timeoutError']){
      if(!fields[key]||!Object.hasOwn(fields[key],'value'))throw new TypeError('Invalid author input wait')
    }
    const kind=fields.kind.value,promise=fields.promise.value
    const deadline=fields.deadline.value,timeoutError=fields.timeoutError.value
    if(kind!=='author-input-wait'||typeof deadline!=='number'||!Number.isFinite(deadline))throw new TypeError('Invalid author input wait')
    if(epoch!==this.epoch||this.work!==job)return
    const wait:JobWait={cell:{}}
    job.wait=wait
    const current=()=>epoch===this.epoch&&this.work===job&&job.wait===wait&&!job.retired
    const wake=(outcome:WaitOutcome)=>{
      if(!current()||wait.outcome)return
      try{if(this.context.now()>deadline)outcome={ok:false,error:timeoutError}}
      catch(error){outcome={ok:false,error}}
      wait.outcome=outcome
      try{this.detachWait(wait)}catch(error){if(outcome.ok)wait.outcome={ok:false,error}}
      if(!current()||this.pumping)return
      // Async observers cannot surface a throwing failed observer as an
      // unhandled promise rejection. schedulePending already retires owners.
      try{this.schedulePending()}catch{try{this.schedulePending()}catch{/* already notified */}}
    }
    wait.cell.wake=wake
    observeWait(promise,wait.cell)
    if(!current())return
    const remaining=deadline-this.context.now()
    if(remaining<=0){wake({ok:false,error:timeoutError});return}
    const timer=setTimeout(()=>wait.cell.wake?.({ok:false,error:timeoutError}),Math.ceil(remaining))
    if(current()&&!wait.outcome)wait.timer=timer
    else clearTimeout(timer)
  }
  private schedulePending():void {
    if(this.pending&&(!this.work?.wait||this.work.wait.outcome)&&this.frame===undefined){
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
    if(old?.wait){const wait=old.wait;old.wait=undefined;attempt(()=>this.detachWait(wait))}
    if(frame!==undefined)attempt(()=>this.context.unschedule(frame))
    for(const job of jobs)attempt(()=>this.retire(job,false))
    // Reentrant cancellation is observed immediately after .next() returns;
    // captured data must remain alive until its active generator has exited.
    if(!this.pumping&&old)attempt(()=>this.retire(old,true))
    if(failed)throw primary
  }
}
