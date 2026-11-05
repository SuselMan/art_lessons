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
  private readonly context:AuthorInputFIFOContext
  private readonly budgetMs:number
  private readonly maxSteps:number
  constructor(context:AuthorInputFIFOContext,budgetMs=4,maxSteps=2){this.context=context;this.budgetMs=budgetMs;this.maxSteps=maxSteps}
  get pending():boolean{return !!this.work||this.jobs.length>0}
  enqueue(job:()=>Generator<void,void,void>):void{
    this.jobs.push(job)
    if(!this.pumping&&this.frame===undefined)this.pump()
  }
  private pump():void{
    if(this.pumping)return
    this.pumping=true
    const epoch=this.epoch,start=this.context.now()
    let steps=0
    try{
      while(this.pending){
        this.work??=this.jobs.shift()!()
        const current=this.work,step=current.next()
        if(epoch!==this.epoch){current.return();return}
        if(step.done)this.work=undefined
        else steps++
        if(steps>=this.maxSteps||this.context.now()-start>=this.budgetMs)break
      }
    }catch(error){this.cancel();this.context.failed(error)}
    finally{this.pumping=false}
    if(this.pending&&this.frame===undefined){
      this.frame=this.context.schedule(()=>{if(epoch!==this.epoch)return;this.frame=undefined;this.pump()})
    }
  }
  cancel():void{
    this.epoch++
    if(this.frame!==undefined)this.context.unschedule(this.frame)
    this.frame=undefined;this.jobs=[]
    const old=this.work;this.work=undefined
    // Reentrant cancellation is observed immediately after .next() returns.
    if(!this.pumping)old?.return()
  }
}
