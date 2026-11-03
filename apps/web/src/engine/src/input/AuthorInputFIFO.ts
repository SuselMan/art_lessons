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
/** Internal scheduling signal: retain this exact handoff and let other tasks drain. */
export interface AuthorInputBackpressure {readonly kind:'author-input-backpressure';readonly promise?:Promise<unknown>}
export type AuthorInputCutYield=void|AuthorInputBackpressure
/** Pending material stays with the producer. This only cuts its SAME owner
 * before another pump/input proceeds; it never carries a source result. */
export interface AuthorInputCheckpoint {
  readonly kind:'author-input-checkpoint'
  readonly flush:()=>Generator<AuthorInputCutYield,void,void>
  readonly immediate?:true
  /** Local absolute scheduling hint; never extends a pending cut deadline. */
  readonly deadline?:number
}
export type AuthorInputYield=void|AuthorInputWait|AuthorInputCheckpoint|AuthorInputBackpressure
interface PendingCheckpoint {readonly flush:()=>Generator<AuthorInputCutYield,void,void>;immediate:boolean;deadline?:number}
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
  checkpoint?:PendingCheckpoint
  capacityWait?:JobWait
  checkpointSuspended?:boolean
  cut?:Generator<AuthorInputCutYield,void,void>
  producerDone?:boolean
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
  constructor(context:AuthorInputFIFOContext,budgetMs=4,maxSteps=32){this.context=context;this.budgetMs=budgetMs;this.maxSteps=maxSteps}
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
    const wait=job.wait,capacity=job.capacityWait,cut=job.cut,iterator=job.iterator
    job.wait=undefined;job.capacityWait=undefined;job.cut=undefined;job.iterator=undefined;job.checkpoint=undefined;job.checkpointSuspended=undefined
    try{if(wait)this.detachWait(wait)}catch(error){failed=true;primary=error}
    try{if(capacity)this.detachWait(capacity)}catch(error){if(!failed){failed=true;primary=error}}
    try{if(close)cut?.return()}catch(error){if(!failed){failed=true;primary=error}}
    try{if(close)iterator?.return()}catch(error){if(!failed){failed=true;primary=error}}
    try{job.release?.()}catch(error){if(!failed){failed=true;primary=error}}
    if(failed)throw primary
  }
  private runnable():boolean {
    const job=this.work
    if(job?.capacityWait&&!job.capacityWait.outcome)return job.wait?.outcome?.ok===false
    return !job?.wait||!!job.wait.outcome||!!job.cut||!!job.checkpoint
  }
  private captureYield(value:AuthorInputWait|AuthorInputCheckpoint|AuthorInputBackpressure):PendingCheckpoint|{readonly kind:'backpressure';readonly promise?:unknown}|undefined {
    const fields=Object.getOwnPropertyDescriptors(value),kind=fields.kind
    if(!kind||!Object.hasOwn(kind,'value'))throw new TypeError('Invalid author input yield')
    if(kind.value==='author-input-backpressure'){
      if(Reflect.ownKeys(fields).some(k=>k!=='kind'&&k!=='promise')||fields.promise&&!Object.hasOwn(fields.promise,'value'))throw new TypeError('Invalid author input backpressure')
      return{kind:'backpressure',...fields.promise?{promise:fields.promise.value}:{}}
    }
    if(kind.value!=='author-input-checkpoint')return undefined
    if(Reflect.ownKeys(fields).some(key=>!['kind','flush','immediate','deadline'].includes(String(key)))
      ||!fields.flush||!Object.hasOwn(fields.flush,'value')||typeof fields.flush.value!=='function'
      ||fields.immediate&&(!Object.hasOwn(fields.immediate,'value')||fields.immediate.value!==true)
      ||('deadline'in value&&!fields.deadline)||fields.deadline&&(!Object.hasOwn(fields.deadline,'value')||typeof fields.deadline.value!=='number'||!Number.isFinite(fields.deadline.value)||fields.deadline.value<0))throw new TypeError('Invalid author input checkpoint')
    return{flush:fields.flush.value,immediate:fields.immediate?.value===true,...fields.deadline?{deadline:fields.deadline.value}:{}}
  }
  private pump():void{
    if(this.pumping||!this.runnable())return
    this.pumping=true
    const epoch=this.epoch
    let steps=0,calls=0,current:AuthorInputJob|undefined,failed=false,primary:unknown
    try{
      const start=this.context.now()
      // Old callers retain pump cuts. Opted-in remainder survives turns only
      // until its original absolute deadline (or an explicit immediate token).
      if(this.work?.checkpoint&&!this.work.checkpointSuspended
        &&(this.work.checkpoint.deadline===undefined||start>=this.work.checkpoint.deadline))this.work.checkpoint.immediate=true
      while(this.pending){
        current=this.work??=this.jobs.shift()!
        if(epoch!==this.epoch){this.retire(current,true);break}
        const capacity=current.capacityWait
        if(capacity&&!capacity.outcome){
          if(current.wait?.outcome?.ok===false)throw current.wait.outcome.error
          break
        }
        if(capacity)current.capacityWait=undefined
        if(current.checkpoint&&!current.checkpointSuspended&&!current.checkpoint.immediate
          &&current.checkpoint.deadline!==undefined){
          const now=this.context.now()
          if(epoch!==this.epoch){this.retire(current,true);break}
          if(current.checkpoint&&now>=current.checkpoint.deadline!)current.checkpoint.immediate=true
        }
        if(current.checkpoint?.immediate&&!current.checkpointSuspended&&!current.cut){
          const checkpoint=current.checkpoint;current.checkpoint=undefined
          current.cut=checkpoint.flush()
          if(epoch!==this.epoch){this.retire(current,true);break}
        }
        if(current.cut){
          calls++
          const step=capacity?.outcome?.ok===false?current.cut.throw(capacity.outcome.error):current.cut.next()
          if(epoch!==this.epoch){this.retire(current,true);break}
          if(step.done){
            current.cut=undefined
            if(current.producerDone){this.work=undefined;this.retire(current,false)}
            else if(current.wait&&!current.wait.outcome)break
          }else{
            if(step.value!==undefined){
              const pressure=this.captureYield(step.value)
              if(epoch!==this.epoch){this.retire(current,true);break}
              if(!pressure||!('kind'in pressure)||pressure.kind!=='backpressure')throw new TypeError('Author checkpoint may only yield queue pressure')
              if(Object.hasOwn(pressure,'promise'))this.parkCapacity(current,pressure.promise,epoch)
            }
            // A cut yield is already a full local queue/CPU admission wait.
            // Retain its cursor; do not poll it another 31 times this turn.
            steps++;break
          }
        }else{
          if(current.wait&&!current.wait.outcome)break
          const iterator=current.iterator??=current.create()
          if(epoch!==this.epoch){this.retire(current,true);break}
          const wait=current.wait;current.wait=undefined
          // Resuming a producer can enter an older automatic-cut handoff. A
          // plain queue-pressure yield is NOT a new cut-safe suspension point.
          if(current.checkpoint)current.checkpointSuspended=true
          calls++
          const step=capacity?.outcome?.ok===false?iterator.throw(capacity.outcome.error):wait?.outcome?.ok===false?iterator.throw(wait.outcome.error):iterator.next()
          if(epoch!==this.epoch){this.retire(current,true);break}
          if(step.done){
            current.producerDone=true;current.checkpointSuspended=false
            if(current.checkpoint)current.checkpoint.immediate=true
            else{this.work=undefined;this.retire(current,false)}
          }else if(step.value!==undefined){
            const checkpoint=this.captureYield(step.value)
            if(epoch!==this.epoch){this.retire(current,true);break}
            if(checkpoint&&'kind'in checkpoint&&checkpoint.kind==='backpressure'){
              if(Object.hasOwn(checkpoint,'promise'))this.parkCapacity(current,checkpoint.promise,epoch)
              // Keep checkpointSuspended: an older automatic handoff may still
              // own a cut. Never flush newer pending data ahead of that cursor.
              steps++;break
            }
            if(checkpoint&&'flush'in checkpoint){
              if(current.checkpoint&&current.checkpoint.flush!==checkpoint.flush)throw new TypeError('Pending author checkpoint owner changed')
              if(current.checkpoint){
                checkpoint.immediate||=current.checkpoint.immediate
                if(current.checkpoint.deadline!==undefined)checkpoint.deadline=checkpoint.deadline===undefined?current.checkpoint.deadline:Math.min(current.checkpoint.deadline,checkpoint.deadline)
              }
              current.checkpoint=checkpoint;current.checkpointSuspended=false;steps++
            }else{
              current.checkpointSuspended=false
              this.park(current,step.value,epoch)
              if(epoch!==this.epoch){this.retire(current,true);break}
              if(current.checkpoint)current.checkpoint.immediate=true
              else break
            }
          }else steps++
        }
        if(epoch!==this.epoch||steps>=this.maxSteps||calls>=32||this.context.now()-start>=this.budgetMs)break
        current=undefined
      }
    }catch(error){
      failed=true;primary=error
      const active=current??this.work
      try{this.cancel()}catch{/* the work failure remains primary */}
      if(active)try{this.retire(active,true)}catch{/* all releases attempted */}
    }finally{
      if(epoch===this.epoch&&this.work?.checkpoint&&!this.work.checkpointSuspended&&this.work.checkpoint.deadline===undefined)this.work.checkpoint.immediate=true
      this.pumping=false
    }
    let notificationFailed=false,notificationError:unknown
    try{if(failed)this.context.failed(primary)}catch(error){notificationFailed=true;notificationError=error}
    try{this.schedulePending()}catch(error){if(!notificationFailed){notificationFailed=true;notificationError=error}}
    if(notificationFailed)throw notificationError
  }
  /** Progress-only pressure wait: no timer or result/authority is introduced. */
  private parkCapacity(job:AuthorInputJob,promise:unknown,epoch:number):void {
    if(job.capacityWait)throw new Error('Local capacity wait already attached')
    const wait:JobWait={cell:{}};job.capacityWait=wait
    const current=()=>epoch===this.epoch&&this.work===job&&job.capacityWait===wait&&!job.retired
    wait.cell.wake=outcome=>{
      if(!current()||wait.outcome)return
      wait.outcome=outcome;this.detachWait(wait)
      if(!current()||this.pumping)return
      try{this.schedulePending()}catch{try{this.schedulePending()}catch{/* already notified */}}
    }
    observeWait(promise,wait.cell)
  }
  private detachWait(wait:JobWait):void {
    wait.cell.wake=undefined
    const timer=wait.timer;wait.timer=undefined
    if(timer!==undefined)clearTimeout(timer)
  }
  private park(job:AuthorInputJob,token:AuthorInputWait|AuthorInputCheckpoint|AuthorInputBackpressure,epoch:number):void {
    // Capture data fields without invoking accessors from a malformed yield.
    const fields=Object.getOwnPropertyDescriptors(token)
    for(const key of ['kind','promise','deadline','timeoutError']){
      if(!fields[key]||!Object.hasOwn(fields[key],'value'))throw new TypeError('Invalid author input wait')
    }
    const kind=fields.kind.value,promise=fields.promise?.value
    const deadline=fields.deadline?.value,timeoutError=fields.timeoutError.value
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
    if(this.pending&&this.runnable()&&this.frame===undefined){
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
