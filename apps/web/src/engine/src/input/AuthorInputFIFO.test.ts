import {afterEach,expect,it,vi} from 'vitest'
import type {AuthorInputWait} from './AuthorInputFIFO'
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()})
import {AuthorInputFIFO} from './AuthorInputFIFO'
it('bounds an input turn and preserves end/next-start metadata behind a long catchup',()=>{
 const frames:Array<()=>void>=[], output:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,2)
 fifo.enqueue(function*(){for(let i=0;i<9;i++){output.push(`a${i}`);yield}})
 const snapshot={color:'red',time:17};fifo.enqueue(function*(){output.push('endA')})
 fifo.enqueue(function*(){output.push(`startB:${snapshot.color}:${snapshot.time}`)})
 expect(output).toEqual(['a0','a1']);expect(fifo.pending).toBe(true)
 while(frames.length)frames.shift()!()
 expect(output).toEqual(['a0','a1','a2','a3','a4','a5','a6','a7','a8','endA','startB:red:17'])
})
it('closes an owned suspended generator exactly once on cancellation and ignores stale scheduled work',()=>{
 const frames:Array<()=>void>=[];let closed=0,writes=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,1)
 fifo.enqueue(function*(){try{while(true){writes++;yield}}finally{closed++}})
 expect(writes).toBe(1);fifo.cancel();expect(closed).toBe(1)
 frames.shift()!();expect(writes).toBe(1);fifo.cancel();expect(closed).toBe(1)
})
it('releases queued owned jobs without starting them and closes the active owner exactly once',()=>{
 const frames:Array<()=>void>=[],events:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,1)
 fifo.enqueue(function*(){try{yield}finally{events.push('active-finally')}},()=>events.push('active-release'))
 fifo.enqueue(function*(){events.push('queued-factory')},()=>events.push('queued-release'))
 fifo.cancel();fifo.cancel();frames.shift()!()
 expect(events).toEqual(['queued-release','active-finally','active-release']);expect(fifo.pending).toBe(false)
})
it('attempts every retirement when unschedule, generator return and releases throw, preserving the first cleanup error',()=>{
 const primary=new Error('unschedule'),events:string[]=[],frames:Array<()=>void>=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{throw primary},now:()=>0,failed:e=>{throw e}},4,1)
 fifo.enqueue(function*(){try{yield}finally{events.push('finally');throw Error('return')}},()=>{events.push('active');throw Error('release')})
 fifo.enqueue(function*(){},()=>{events.push('queued');throw Error('queued release')})
 expect(()=>fifo.cancel()).toThrow(primary);expect(events).toEqual(['queued','finally','active']);expect(fifo.pending).toBe(false)
 expect(()=>fifo.cancel()).not.toThrow();frames.shift()!();expect(events).toHaveLength(3)
})
it('releases a throwing factory and queued jobs before reporting the exact primary failure',()=>{
 const primary=new Error('factory'),events:string[]=[],frames:Array<()=>void>=[],errors:unknown[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{events.push('failed');errors.push(e)}},4,1)
 fifo.enqueue(function*(){yield})
 fifo.enqueue(()=>{throw primary},()=>{events.push('factory-release');throw Error('secondary')})
 fifo.enqueue(function*(){events.push('never')},()=>events.push('queued-release'))
 frames.shift()!()
 expect(errors).toEqual([primary]);expect(events).toEqual(['queued-release','factory-release','failed']);expect(fifo.pending).toBe(false)
})
it('defers an active release until reentrant cancellation exits next and preserves freshly enqueued work',()=>{
 const events:string[]=[],frames:Array<()=>void>=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,1)
 fifo.enqueue(function*(){try{events.push('next');fifo.cancel();events.push('after-cancel');yield}finally{events.push('finally')}},()=>{events.push('release');fifo.enqueue(function*(){events.push('fresh')})})
 while(frames.length)frames.shift()!()
 expect(events).toEqual(['next','after-cancel','finally','release','fresh']);expect(fifo.pending).toBe(false)
})
it('retires suspended and queued owners when a later turn clock throws before selecting work',()=>{
 const primary=new Error('clock'),events:string[]=[],frames:Array<()=>void>=[];let clockFails=false
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>{if(clockFails)throw primary;return 0},failed:e=>events.push(e===primary?'primary':'wrong')},4,1)
 fifo.enqueue(function*(){try{yield;events.push('never')}finally{events.push('finally')}},()=>events.push('active-release'))
 fifo.enqueue(function*(){events.push('queued-never')},()=>events.push('queued-release'));clockFails=true;frames.shift()!()
 expect(events).toEqual(['queued-release','finally','active-release','primary']);expect(fifo.pending).toBe(false)
})
it('keeps reentrant fresh jobs scheduled even when failure notification itself throws',()=>{
 const primary=new Error('body'),notice=new Error('notice'),frames:Array<()=>void>=[],events:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{expect(e).toBe(primary);throw notice}},4,1)
 expect(()=>fifo.enqueue(function*(){throw primary},()=>{events.push('release');fifo.enqueue(function*(){events.push('fresh')},()=>events.push('fresh-release'))})).toThrow(notice)
 while(frames.length)frames.shift()!()
 expect(events).toEqual(['release','fresh','fresh-release']);expect(fifo.pending).toBe(false)
})
it('releases normally completed work and scheduling failures exactly once',()=>{
 const events:string[]=[],primary=new Error('schedule'),errors:unknown[]=[]
 const fifo=new AuthorInputFIFO({schedule:()=>{throw primary},unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)},4,1)
 fifo.enqueue(function*(){events.push('done')},()=>events.push('done-release'))
 fifo.enqueue(function*(){try{yield}finally{events.push('finally')}},()=>events.push('yield-release'))
 fifo.cancel();expect(events).toEqual(['done','done-release','finally','yield-release']);expect(errors).toEqual([primary]);expect(fifo.pending).toBe(false)
})

function deferred(){let resolve!:()=>void,reject!:(error:unknown)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function waiting(promise:Promise<unknown>,deadline=5000):AuthorInputWait{return {kind:'author-input-wait',promise,deadline,timeoutError:new Error('deadline')}}
it('parks the SAME head without runnable callbacks and resumes MOVE/UP in order through one scheduled wake',async()=>{
 vi.useFakeTimers();const service=deferred(),frames:Array<()=>void>=[],events:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 fifo.enqueue(function*(){events.push('begin');yield waiting(service.promise);events.push('ready')})
 fifo.enqueue(function*(){events.push('move')});fifo.enqueue(function*(){events.push('up')})
 expect(fifo.pending).toBe(true);expect(frames).toHaveLength(0);expect(vi.getTimerCount()).toBe(1)
 service.resolve();await Promise.resolve();expect(events).toEqual(['begin']);expect(frames).toHaveLength(1)
 while(frames.length)frames.shift()!()
 expect(events).toEqual(['begin','ready','move','up']);expect(fifo.pending).toBe(false);expect(vi.getTimerCount()).toBe(0)
})
it('throws the exact service rejection into the suspended generator before releasing captured inputs',async()=>{
 vi.useFakeTimers();const service=deferred(),frames:Array<()=>void>=[],events:unknown[]=[],failure=Error('service')
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>events.push(e)})
 fifo.enqueue(function*(){try{yield waiting(service.promise)}catch(error){events.push(error)}finally{events.push('finally')}},()=>events.push('release'))
 service.reject(failure);await Promise.resolve();expect(events).toEqual([]);frames.shift()!()
 expect(events).toEqual([failure,'finally','release']);expect(vi.getTimerCount()).toBe(0)
})
it('owns one fixed deadline even when the real service never settles and later inputs arrive',()=>{
 vi.useFakeTimers();const service=deferred(),frames:Array<()=>void>=[],errors:unknown[]=[],token=waiting(service.promise,20);let released=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)})
 fifo.enqueue(function*(){yield token},()=>released++)
 fifo.enqueue(function*(){throw Error('must not run')},()=>released++)
 vi.advanceTimersByTime(20);expect(frames).toHaveLength(1);expect(released).toBe(0);frames.shift()!()
 expect(errors).toEqual([token.timeoutError]);expect(released).toBe(2);expect(fifo.pending).toBe(false)
})
it('detaches a canceled parked owner and ignores its late rejection in a new epoch',async()=>{
 vi.useFakeTimers();const service=deferred(),frames:Array<()=>void>=[],events:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 fifo.enqueue(function*(){try{yield waiting(service.promise);events.push('stale')}finally{events.push('finally')}},()=>{events.push('release');fifo.enqueue(function*(){events.push('fresh')})})
 fifo.cancel();expect(vi.getTimerCount()).toBe(0);service.reject(Error('late'));await Promise.resolve()
 while(frames.length)frames.shift()!()
 expect(events).toEqual(['finally','release','fresh']);expect(fifo.pending).toBe(false)
})
it('does not invoke accessor fields on a malformed wait token',()=>{
 let reads=0;const errors:unknown[]=[]
 const fifo=new AuthorInputFIFO({schedule:()=>1,unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)})
 const token={kind:'author-input-wait' as const,promise:Promise.resolve(),get deadline(){reads++;return 1},timeoutError:Error('timeout')}
 fifo.enqueue(function*(){yield token})
 expect(reads).toBe(0);expect(errors[0]).toBeInstanceOf(TypeError);expect(fifo.pending).toBe(false)
})
it('cancels the accepted wake and cannot resume a settled old head from a stale callback',async()=>{
 vi.useFakeTimers();const service=deferred(),frames:Array<()=>void>=[],events:string[]=[],unscheduled:number[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:id=>{unscheduled.push(id)},now:()=>0,failed:e=>{throw e}})
 fifo.enqueue(function*(){try{yield waiting(service.promise);events.push('stale')}finally{events.push('closed')}},()=>events.push('released'))
 service.resolve();await Promise.resolve();fifo.cancel();fifo.enqueue(function*(){events.push('fresh')})
 frames.shift()!();expect(unscheduled).toEqual([1]);expect(events).toEqual(['closed','released','fresh'])
})
it('attempts generator and queued releases when clearing the parked deadline throws',()=>{
 vi.useFakeTimers();const service=deferred(),events:string[]=[],primary=Error('clear')
 const fifo=new AuthorInputFIFO({schedule:()=>1,unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 fifo.enqueue(function*(){try{yield waiting(service.promise)}finally{events.push('finally');throw Error('return')}},()=>{events.push('release');throw Error('release')})
 fifo.enqueue(function*(){},()=>events.push('queued'))
 const clear=vi.spyOn(globalThis,'clearTimeout').mockImplementation(()=>{throw primary})
 expect(()=>fifo.cancel()).toThrow(primary);clear.mockRestore()
 expect(events).toEqual(['queued','finally','release']);expect(fifo.pending).toBe(false)
})
it('clears a just-created old timer when timer setup reentrantly cancels and starts a new epoch',()=>{
 vi.useFakeTimers();const original=setTimeout,events:string[]=[],service=deferred()
 const fifo=new AuthorInputFIFO({schedule:()=>1,unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 const timer=vi.spyOn(globalThis,'setTimeout').mockImplementation((...args)=>{
  const handle=original(...args);fifo.cancel();fifo.enqueue(function*(){events.push('fresh')});return handle
 })
 fifo.enqueue(function*(){try{yield waiting(service.promise)}finally{events.push('finally')}},()=>events.push('release'))
 timer.mockRestore();expect(vi.getTimerCount()).toBe(0)
 expect(events).toEqual(['finally','release']);expect(fifo.pending).toBe(true)
 fifo.cancel()
})

it('contains async observer exceptions after attempting cleanup and preserving freshly owned work',async()=>{
 vi.useFakeTimers();const service=deferred(),events:string[]=[],frames:Array<()=>void>=[],primary=Error('schedule');let schedules=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{if(++schedules===1)throw primary;frames.push(cb);return schedules},unschedule:()=>{},now:()=>0,failed:error=>{expect(error).toBe(primary);events.push('notified');throw Error('observer')}})
 fifo.enqueue(function*(){yield waiting(service.promise)},()=>{events.push('release');fifo.enqueue(function*(){events.push('fresh');yield;events.push('done')})})
 service.resolve();await Promise.resolve();await Promise.resolve()
 while(frames.length)frames.shift()!()
 expect(events).toEqual(['release','fresh','done','notified']);expect(fifo.pending).toBe(false);expect(vi.getTimerCount()).toBe(0)
})

it('cuts the same pending producer before its next pump without taking a third source step',()=>{
 const frames:Array<()=>void>=[],events:string[]=[],pending:number[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,2)
 const flush=function*(){events.push('cut:'+pending.splice(0).join(','))}
 fifo.enqueue(function*(){for(let i=0;i<5;i++){pending.push(i);events.push('source:'+i);yield{kind:'author-input-checkpoint' as const,flush}}})
 expect(events).toEqual(['source:0','source:1'])
 frames.shift()!();expect(events).toEqual(['source:0','source:1','cut:0,1','source:2','source:3'])
 while(frames.length)frames.shift()!()
 expect(events).toEqual(['source:0','source:1','cut:0,1','source:2','source:3','cut:2,3','source:4','cut:4']);expect(fifo.pending).toBe(false)
})
it('charges cut CPU to the same deadline and never advances source while a cut is blocked',()=>{
 const frames:Array<()=>void>=[],events:string[]=[];let now=0,blocked=2
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>now,failed:e=>{throw e}},4,2)
 const flush=function*(){while(blocked--){events.push('wait');yield}events.push('cut');now+=5}
 fifo.enqueue(function*(){events.push('source:0');now+=5;yield{kind:'author-input-checkpoint' as const,flush};events.push('source:1')})
 expect(events).toEqual(['source:0']);frames.shift()!();expect(events).toEqual(['source:0','wait','wait'])
 frames.shift()!();expect(events).toEqual(['source:0','wait','wait','cut']);expect(fifo.pending).toBe(true)
 frames.shift()!();expect(events.at(-1)).toBe('source:1');expect(fifo.pending).toBe(false)
})
it('closes cut and source once before releasing a reentrantly cancelled job',()=>{
 const frames:Array<()=>void>=[],events:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,1)
 const flush=function*(){try{events.push('cut-next');fifo.cancel();yield}finally{events.push('cut-return')}}
 fifo.enqueue(function*(){try{yield{kind:'author-input-checkpoint' as const,flush}}finally{events.push('source-return')}},()=>events.push('release'))
 frames.shift()!();expect(events).toEqual(['cut-next','cut-return','source-return','release']);fifo.cancel();expect(events).toHaveLength(4);expect(fifo.pending).toBe(false)
})
it('flushes pending data before parking an unresolved wait without resuming the producer',async()=>{
 const frames:Array<()=>void>=[],events:string[]=[];let resolve!:()=>void
 const promise=new Promise<void>(done=>{resolve=done}),fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,2)
 const flush=function*(){events.push('cut')}
 fifo.enqueue(function*(){yield{kind:'author-input-checkpoint' as const,flush};yield{kind:'author-input-wait' as const,promise,deadline:1000,timeoutError:Error('late')};events.push('resumed')})
 expect(events).toEqual(['cut']);expect(frames).toHaveLength(0);resolve();await Promise.resolve();await Promise.resolve();frames.shift()!();expect(events).toEqual(['cut','resumed'])
})
it('does not invoke checkpoint accessors or strand captured ownership on malformed tokens',()=>{
 const errors:unknown[]=[],get=vi.fn(),release=vi.fn(),fifo=new AuthorInputFIFO({schedule:()=>1,unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)})
 fifo.enqueue(function*(){yield Object.defineProperty({kind:'author-input-checkpoint' as const},'flush',{get}) as {kind:'author-input-checkpoint';flush:()=>Generator<void,void,void>}},release)
 expect(get).not.toHaveBeenCalled();expect(errors).toHaveLength(1);expect(release).toHaveBeenCalledOnce();expect(fifo.pending).toBe(false)
})

it('honours an immediate input cut before continuing the source or the next input',()=>{
 const events:string[]=[],fifo=new AuthorInputFIFO({schedule:()=>{throw Error('unneeded wake')},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,2)
 const flush=function*(){events.push('cut')}
 fifo.enqueue(function*(){events.push('input');yield{kind:'author-input-checkpoint' as const,flush,immediate:true as const};events.push('after-cut')})
 fifo.enqueue(function*(){events.push('next-input')})
 expect(events).toEqual(['input','cut','after-cut','next-input']);expect(fifo.pending).toBe(false)
})
it('attempts cut/source/captured cleanup after a cut failure without replacing its primary error',()=>{
 const frames:Array<()=>void>=[],events:string[]=[],errors:unknown[]=[],primary=Error('cut-next')
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)},4,1)
 const flush=function*(){try{throw primary}finally{events.push('cut-finally')}}
 fifo.enqueue(function*(){try{yield{kind:'author-input-checkpoint' as const,flush}}finally{events.push('source-finally');throw Error('source-return')}},()=>{events.push('release');throw Error('release')})
 frames.shift()!();expect(errors).toEqual([primary]);expect(events).toEqual(['cut-finally','source-finally','release']);expect(fifo.pending).toBe(false)
})
it('tries all three cleanup owners when a suspended cut return throws',()=>{
 const frames:Array<()=>void>=[],events:string[]=[],primary=Error('cut-return'),fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,1)
 const flush=function*(){try{yield}finally{events.push('cut');throw primary}}
 fifo.enqueue(function*(){try{yield{kind:'author-input-checkpoint' as const,flush}}finally{events.push('source');throw Error('source')}},()=>{events.push('release');throw Error('release')})
 frames.shift()!();expect(()=>fifo.cancel()).toThrow(primary);expect(events).toEqual(['cut','source','release']);expect(fifo.pending).toBe(false);expect(()=>fifo.cancel()).not.toThrow()
})
it('keeps next-epoch work behind both old cleanup owners after cancellation inside a cut',()=>{
 const frames:Array<()=>void>=[],events:string[]=[],fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,1)
 const flush=function*(){try{fifo.cancel();fifo.enqueue(function*(){events.push('fresh')});yield}finally{events.push('cut-return')}}
 fifo.enqueue(function*(){try{yield{kind:'author-input-checkpoint' as const,flush}}finally{events.push('source-return')}},()=>events.push('release'))
 frames.shift()!();expect(events).toEqual(['cut-return','source-return','release']);frames.shift()!();expect(events).toEqual(['cut-return','source-return','release','fresh'])
})
it('observes a late wait rejection after cancelling its pending cut without resuming either owner',async()=>{
 const frames:Array<()=>void>=[],events:string[]=[],failed=vi.fn();let reject!:(error:unknown)=>void
 const promise=new Promise<void>((_resolve,no)=>{reject=no}),fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed},4,2)
 const flush=function*(){try{yield}finally{events.push('cut-return')}}
 fifo.enqueue(function*(){try{yield{kind:'author-input-checkpoint' as const,flush};yield{kind:'author-input-wait' as const,promise,deadline:1000,timeoutError:Error('timeout')};events.push('stale-resume')}finally{events.push('source-return')}})
 fifo.cancel();reject(Error('late'));await Promise.resolve();await Promise.resolve();while(frames.length)frames.shift()!();expect(events).toEqual(['cut-return','source-return']);expect(failed).not.toHaveBeenCalled();expect(fifo.pending).toBe(false)
})
it('does not cut newer pending data ahead of an older in-flight producer handoff',()=>{
 const frames:Array<()=>void>=[],events:string[]=[],pending:number[]=[],fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,2)
 const flush=function*(){events.push('cut:'+pending.splice(0).join(','))}
 fifo.enqueue(function*(){pending.push(0);yield{kind:'author-input-checkpoint' as const,flush};const older=pending.splice(0);pending.push(1);yield;events.push('admit:'+older.join(','));yield{kind:'author-input-checkpoint' as const,flush}})
 expect(events).toEqual([]);while(frames.length)frames.shift()!();expect(events).toEqual(['admit:0','cut:1'])
})
it('retires the cancelled source when checkpoint descriptor capture reenters a new epoch',()=>{
 const frames:Array<()=>void>=[],events:string[]=[],flush=vi.fn(function*(){events.push('stale-cut')}),fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 const token=new Proxy({kind:'author-input-checkpoint' as const,flush},{ownKeys(target){fifo.cancel();fifo.enqueue(function*(){events.push('fresh')});return Reflect.ownKeys(target)}})
 fifo.enqueue(function*(){try{yield token}finally{events.push('source-return')}},()=>events.push('release'))
 expect(events).toEqual(['source-return','release']);while(frames.length)frames.shift()!();expect(events).toEqual(['source-return','release','fresh']);expect(flush).not.toHaveBeenCalled();expect(fifo.pending).toBe(false)
})
