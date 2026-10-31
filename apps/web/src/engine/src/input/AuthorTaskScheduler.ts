/** Owned macrotask wakeups for the cooperative author FIFO. This schedules
 * execution only; source timestamps and paint quantum remain caller-owned.
 * A browser provider is injected explicitly so Node's MessageChannel never
 * creates worker ports in the headless engine tests. */
export interface AuthorTaskPort {
  onmessage:((event:MessageEvent)=>unknown)|null
  postMessage(token:number):void
  close():void
}
export interface AuthorTaskChannel {port1:AuthorTaskPort;port2:AuthorTaskPort}
export interface AuthorTaskSchedulerContext {
  createChannel?:()=>AuthorTaskChannel
  scheduleFrame(callback:()=>void):number
  cancelFrame(handle:number):void
}
interface PendingTask {callback:()=>void;frame?:number}
export class AuthorTaskScheduler {
  private readonly context:AuthorTaskSchedulerContext
  private readonly tasks=new Map<number,PendingTask>()
  private channel:AuthorTaskChannel|undefined
  private attempted=false
  private epoch=0
  private nextToken=0
  private destroyed=false
  constructor(context:AuthorTaskSchedulerContext){this.context=context}
  schedule(callback:()=>void):number {
    if(this.destroyed)throw Error('Author task scheduler is destroyed')
    const token=++this.nextToken,task={callback}
    this.tasks.set(token,task)
    if(this.ensureChannel()){
      try{this.channel!.port2.postMessage(token)}catch{
        // A failed transport must not lose accepted input. Rehome all owned
        // pending tasks, invalidate old deliveries, and use RAF until reset.
        this.closeChannel()
        for(const [key,pending]of this.tasks)if(pending.frame===undefined)this.scheduleFrame(key,pending)
      }
    }else this.scheduleFrame(token,task)
    return token
  }
  unschedule(token:number):void {
    const task=this.tasks.get(token)
    if(!task)return
    this.tasks.delete(token)
    if(task.frame!==undefined)this.context.cancelFrame(task.frame)
  }
  /** Close idle ports as well as pending work. A later gesture may lazily
   * create a new channel after visibility/context recovery. */
  reset():void {
    for(const task of this.tasks.values())if(task.frame!==undefined)this.context.cancelFrame(task.frame)
    this.tasks.clear();this.closeChannel();this.attempted=false
  }
  /** A caller that cancelled its own work must not discard another owner's
   * accepted wakeup. Close idle ports without cancelling shared pending work. */
  resetIfIdle():void {if(!this.tasks.size)this.reset()}
  destroy():void {this.reset();this.destroyed=true}
  private ensureChannel():boolean {
    if(this.channel)return true
    if(this.attempted)return false
    this.attempted=true
    try{
      const channel=this.context.createChannel?.()
      if(!channel)return false
      this.channel=channel
      const epoch=this.epoch
      channel.port1.onmessage=event=>{
        if(this.destroyed||this.channel!==channel||epoch!==this.epoch)return
        if(typeof event.data!=='number')return
        this.execute(event.data)
      }
      return true
    }catch{this.closeChannel();return false}
  }
  private scheduleFrame(token:number,task:PendingTask):void {
    const epoch=this.epoch
    task.frame=this.context.scheduleFrame(()=>{
      if(!this.destroyed&&epoch===this.epoch)this.execute(token)
    })
  }
  private execute(token:number):void {
    const task=this.tasks.get(token)
    if(!task)return
    this.tasks.delete(token)
    task.callback()
  }
  private closeChannel():void {
    this.epoch++
    const channel=this.channel;this.channel=undefined
    if(channel){channel.port1.onmessage=null;try{channel.port1.close()}finally{channel.port2.close()}}
  }
}
