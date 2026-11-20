/** Serial author lifecycle with bounded continuation turns. Captured inputs and
 * clocks belong to callers; yielding never changes their semantic ordering. */
export interface AuthorInputFIFOContext {
  schedule(callback:()=>void):number
  unschedule(handle:number):void
  now():number
  failed(error:unknown):void
}
export class AuthorInputFIFO {
  private jobs:Array<()=>Generator<void,void,void>>=[]
  private work:Generator<void,void,void>|undefined
  private frame:number|undefined
  private epoch=0
  private pumping=false
  private parked=false
  private insertionAt:number|undefined
  get isParked():boolean{return this.parked}
  park():void{this.parked=true;if(this.frame!==undefined)this.context.unschedule(this.frame);this.frame=undefined}
  resume():void{if(!this.parked)return;this.parked=false;if(this.pending&&!this.pumping&&this.frame===undefined)this.pump()}
  prepend(job:()=>Generator<void,void,void>):void{this.jobs.unshift(job);if(!this.parked&&!this.pumping&&this.frame===undefined)this.pump()}
  private readonly context:AuthorInputFIFOContext
  private readonly budgetMs:number
  private readonly maxSteps:number
  constructor(context:AuthorInputFIFOContext,budgetMs=4,maxSteps=2){this.context=context;this.budgetMs=budgetMs;this.maxSteps=maxSteps}
  get pending():boolean{return !!this.work||this.jobs.length>0}
  /** Insert captured old-gesture events before a queued next start, on this same FIFO. */
  beforeQueued(work:()=>void):void{
    const previous=this.insertionAt;this.insertionAt=0
    try{work()}finally{this.insertionAt=previous}
  }
  enqueue(job:()=>Generator<void,void,void>):void{
    if(this.insertionAt===undefined)this.jobs.push(job)
    else this.jobs.splice(this.insertionAt++,0,job)
    if(!this.parked&&!this.pumping&&this.frame===undefined)this.pump()
  }
  private pump():void{
    if(this.pumping||this.parked)return
    this.pumping=true
    const epoch=this.epoch,start=this.context.now()
    let steps=0
    try{
      while(this.pending&&!this.parked){
        this.work??=this.jobs.shift()!()
        const current=this.work,step=current.next()
        if(epoch!==this.epoch){current.return();return}
        if(step.done)this.work=undefined
        else steps++
        if(steps>=this.maxSteps||this.context.now()-start>=this.budgetMs)break
      }
    }catch(error){this.cancel();this.context.failed(error)}
    finally{this.pumping=false}
    if(!this.parked&&this.pending&&this.frame===undefined){
      this.frame=this.context.schedule(()=>{if(epoch!==this.epoch)return;this.frame=undefined;this.pump()})
    }
  }
  cancel():void{
    this.epoch++
    this.parked=false
    if(this.frame!==undefined)this.context.unschedule(this.frame)
    this.frame=undefined;this.jobs=[]
    const old=this.work;this.work=undefined
    // Reentrant cancellation is observed immediately after .next() returns.
    if(!this.pumping)old?.return()
  }
}
