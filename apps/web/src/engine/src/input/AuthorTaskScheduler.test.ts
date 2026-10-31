import {expect,it,vi} from 'vitest'
import {AuthorTaskScheduler,type AuthorTaskChannel} from './AuthorTaskScheduler'
function harness(){
 const deliveries:Array<()=>void>=[],frames=new Map<number,()=>void>(),channels:AuthorTaskChannel[]=[];let frameId=0
 const createChannel=()=>{
  const port1={onmessage:null as ((event:MessageEvent)=>unknown)|null,postMessage:vi.fn(),close:vi.fn()}
  const port2={onmessage:null,postMessage:(token:number)=>{const handler=port1.onmessage;deliveries.push(()=>handler?.({data:token} as MessageEvent))},close:vi.fn()}
  const channel={port1,port2};channels.push(channel);return channel
 }
 const context={createChannel,scheduleFrame:(callback:()=>void)=>{const id=++frameId;frames.set(id,()=>{frames.delete(id);callback()});return id},cancelFrame:(id:number)=>{frames.delete(id)}}
 return{context,deliveries,frames,channels}
}
it('creates one channel lazily and reuses it without waiting for RAF',()=>{
 const h=harness(),scheduler=new AuthorTaskScheduler(h.context),done:number[]=[]
 expect(h.channels).toHaveLength(0)
 scheduler.schedule(()=>done.push(1));scheduler.schedule(()=>done.push(2))
 expect(h.channels).toHaveLength(1);expect(h.frames.size).toBe(0);expect(done).toEqual([])
 h.deliveries.shift()!();h.deliveries.shift()!();expect(done).toEqual([1,2])
 scheduler.schedule(()=>done.push(3));h.deliveries.shift()!();expect(h.channels).toHaveLength(1)
 scheduler.destroy();expect(h.channels[0].port1.close).toHaveBeenCalledOnce();expect(h.channels[0].port2.close).toHaveBeenCalledOnce()
})
it('cancels stale tokens and closes both ports on reset before accepting a fresh generation',()=>{
 const h=harness(),scheduler=new AuthorTaskScheduler(h.context),done=vi.fn()
 const first=scheduler.schedule(done);scheduler.unschedule(first);h.deliveries.shift()!();expect(done).not.toHaveBeenCalled()
 scheduler.schedule(done);const oldDelivery=h.deliveries.shift()!
 scheduler.reset();expect(h.channels[0].port1.close).toHaveBeenCalledOnce();expect(h.channels[0].port2.close).toHaveBeenCalledOnce()
 scheduler.schedule(done);oldDelivery();expect(done).not.toHaveBeenCalled();h.deliveries.shift()!();expect(done).toHaveBeenCalledOnce()
 scheduler.destroy();expect(()=>scheduler.schedule(done)).toThrow(/destroyed/)
})
it('falls back to owned cancellable RAF when no browser provider exists',()=>{
 const h=harness(),scheduler=new AuthorTaskScheduler({...h.context,createChannel:undefined}),done=vi.fn()
 const token=scheduler.schedule(done);expect(h.channels).toHaveLength(0);expect(h.frames.size).toBe(1)
 scheduler.unschedule(token);expect(h.frames.size).toBe(0);expect(done).not.toHaveBeenCalled()
 scheduler.schedule(done);const stale=[...h.frames.values()][0];scheduler.reset();stale();expect(done).not.toHaveBeenCalled()
 scheduler.schedule(done);[...h.frames.values()][0]();expect(done).toHaveBeenCalledOnce();scheduler.destroy()
})
it('preserves queued callbacks through a posting failure and retries browser provider only after reset',()=>{
 const h=harness();let broken=true
 const createChannel=vi.fn(()=>{const c=h.context.createChannel();if(broken)c.port2.postMessage=()=>{throw Error('posting failed')};return c})
 const scheduler=new AuthorTaskScheduler({...h.context,createChannel}),done=vi.fn()
 scheduler.schedule(done);expect(h.frames.size).toBe(1);[...h.frames.values()][0]();expect(done).toHaveBeenCalledOnce()
 scheduler.schedule(done);expect(createChannel).toHaveBeenCalledOnce()
 scheduler.reset();broken=false;scheduler.schedule(done);expect(createChannel).toHaveBeenCalledTimes(2);h.deliveries.shift()!();expect(done).toHaveBeenCalledTimes(2)
 scheduler.destroy()
})
it('allows reset from the executing task and never reuses its closed channel',()=>{
 const h=harness(),scheduler=new AuthorTaskScheduler(h.context),done:string[]=[]
 scheduler.schedule(()=>{done.push('old');scheduler.reset();scheduler.schedule(()=>done.push('new'))})
 h.deliveries.shift()!();expect(done).toEqual(['old']);expect(h.channels).toHaveLength(2)
 expect(h.channels[0].port1.close).toHaveBeenCalledOnce();expect(h.channels[0].port2.close).toHaveBeenCalledOnce()
 h.deliveries.shift()!();expect(done).toEqual(['old','new']);scheduler.destroy()
})
it('uses RAF when creating a channel fails without leaking or dropping accepted work',()=>{
 const h=harness(),createChannel=vi.fn(()=>{throw Error('Unavailable browser provider')}),done=vi.fn()
 const scheduler=new AuthorTaskScheduler({...h.context,createChannel})
 scheduler.schedule(done);expect(createChannel).toHaveBeenCalledOnce();[...h.frames.values()][0]();expect(done).toHaveBeenCalledOnce()
 scheduler.schedule(done);expect(createChannel).toHaveBeenCalledOnce();scheduler.destroy();expect(h.frames.size).toBe(0)
})
it('releases idle ports without discarding another owner\'s pending wakeup',()=>{
 const h=harness(),scheduler=new AuthorTaskScheduler(h.context),author=vi.fn(),rebuild=vi.fn()
 const authorToken=scheduler.schedule(author);scheduler.schedule(rebuild)
 scheduler.unschedule(authorToken);scheduler.resetIfIdle()
 expect(h.channels[0].port1.close).not.toHaveBeenCalled()
 h.deliveries.shift()!();h.deliveries.shift()!()
 expect(author).not.toHaveBeenCalled();expect(rebuild).toHaveBeenCalledOnce()
 scheduler.resetIfIdle();expect(h.channels[0].port1.close).toHaveBeenCalledOnce();expect(h.channels[0].port2.close).toHaveBeenCalledOnce()
 scheduler.schedule(rebuild);expect(h.channels).toHaveLength(2);h.deliveries.shift()!();expect(rebuild).toHaveBeenCalledTimes(2);scheduler.destroy()
})
