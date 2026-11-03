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
 expect(events).toEqual(['source:0']);frames.shift()!();expect(events).toEqual(['source:0','wait'])
 frames.shift()!();expect(events).toEqual(['source:0','wait','wait'])
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

it('keeps K8 remainder across cheap turns, with immediate first input and unchanged source order',()=>{
 const frames:Array<()=>void>=[],events:string[]=[],cuts:number[][]=[],pending:number[]=[];let now=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>now,failed:e=>{throw e}},4,2)
 const flush=function*(){cuts.push(pending.splice(0));events.push('cut')}
 fifo.enqueue(function*(){for(let i=0;i<18;i++){pending.push(i);events.push('source:'+i);yield{kind:'author-input-checkpoint' as const,flush,deadline:32,...i===0||pending.length>=8?{immediate:true as const}:{}}}})
 while(frames.length){now+=3;frames.shift()!()}
 expect(cuts).toEqual([[0],[1,2,3,4,5,6,7,8],[9,10,11,12,13,14,15,16],[17]])
 expect(events.filter(e=>e.startsWith('source:'))).toEqual(Array.from({length:18},(_,i)=>'source:'+i));expect(fifo.pending).toBe(false)
})
it('never extends earliest remainder deadline through query-only checkpoints or GPU interleaves',()=>{
 const frames:Array<()=>void>=[],cuts:number[][]=[],pending:number[]=[];let now=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>now,failed:e=>{throw e}},4,2)
 const flush=function*(){cuts.push(pending.splice(0))}
 fifo.enqueue(function*(){for(let i=0;i<12;i++){pending.push(i);yield{kind:'author-input-checkpoint' as const,flush,deadline:now+32}}})
 for(let i=0;i<3;i++){now+=6;frames.shift()!();expect(cuts).toEqual([])}
 now=33;frames.shift()!();expect(cuts[0]).toEqual([0,1,2,3,4,5,6,7]);while(frames.length){now+=6;frames.shift()!()}
 expect(cuts.flat()).toEqual(Array.from({length:12},(_,i)=>i));expect(fifo.pending).toBe(false)
})
it('honours a material count cut even with a frozen clock and a slow atomic source step',()=>{
 const frames:Array<()=>void>=[],cuts:number[][]=[],pending:number[]=[];let now=0,steps=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>now,failed:e=>{throw e}},4,2)
 const flush=function*(){cuts.push(pending.splice(0))}
 fifo.enqueue(function*(){for(let i=0;i<10;i++){pending.push(i);steps++;if(i===0)now+=5;yield{kind:'author-input-checkpoint' as const,flush,deadline:now+32,...pending.length>=8?{immediate:true as const}:{}}}})
 expect(steps).toBe(1);while(frames.length)frames.shift()!();expect(cuts.map(c=>c.length)).toEqual([8,2]);expect(cuts.flat()).toEqual(Array.from({length:10},(_,i)=>i))
})
it('discards deferred remainder on revocation without executing its flush or stale producer',()=>{
 const frames:Array<()=>void>=[],flush=vi.fn(function*(){}),release=vi.fn(),events:string[]=[],fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,2)
 fifo.enqueue(function*(){try{for(let i=0;i<9;i++){events.push('source:'+i);yield{kind:'author-input-checkpoint' as const,flush,deadline:32}}}finally{events.push('closed')}},release)
 fifo.cancel();while(frames.length)frames.shift()!();expect(events).toEqual(['source:0','source:1','closed']);expect(flush).not.toHaveBeenCalled();expect(release).toHaveBeenCalledOnce();expect(fifo.pending).toBe(false)
})
it('does not flush a revoked deferred owner when its deadline clock reenters cancellation',()=>{
 const frames:Array<()=>void>=[],flush=vi.fn(function*(){}),errors:unknown[]=[],release=vi.fn();let armed=false,calls=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>{if(armed&&++calls===2){fifo.cancel();return 33}return 0},failed:e=>errors.push(e)},4,2)
 fifo.enqueue(function*(){for(let i=0;i<9;i++)yield{kind:'author-input-checkpoint' as const,flush,deadline:32}},release)
 armed=true;frames.shift()!();while(frames.length)frames.shift()!();expect(flush).not.toHaveBeenCalled();expect(errors).toEqual([]);expect(release).toHaveBeenCalledOnce();expect(fifo.pending).toBe(false)
})
it('captures only finite own DATA checkpoint deadlines without calling accessors',()=>{
 const get=vi.fn(),bad=[-1,Infinity,NaN,undefined]
 for(const deadline of bad){const errors:unknown[]=[],release=vi.fn(),fifo=new AuthorInputFIFO({schedule:()=>1,unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)});fifo.enqueue(function*(){yield{kind:'author-input-checkpoint' as const,flush:function*(){},deadline}},release);expect(errors).toHaveLength(1);expect(release).toHaveBeenCalledOnce()}
 for(const inherited of [false,true]){const errors:unknown[]=[],fields={kind:'author-input-checkpoint' as const,flush:function*(){}},token=inherited?Object.assign(Object.create({deadline:32}),fields):Object.defineProperty(fields,'deadline',{get}),fifo=new AuthorInputFIFO({schedule:()=>1,unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)});fifo.enqueue(function*(){yield token});expect(errors).toHaveLength(1)}expect(get).not.toHaveBeenCalled()
})

it('uses the four-ms budget before the default hard32 ceiling and keeps later inputs FIFO',()=>{
 const tasks:Array<()=>void>=[],events:string[]=[];let now=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{tasks.push(cb);return tasks.length},unschedule:()=>{},now:()=>now,failed:e=>{throw e}})
 fifo.enqueue(function*(){for(let i=0;i<12;i++){events.push('draw:'+i);now+=.75;yield}})
 fifo.enqueue(function*(){events.push('END')});fifo.enqueue(function*(){events.push('nextSTART')})
 expect(events).toEqual(Array.from({length:6},(_,i)=>'draw:'+i));expect(now).toBe(4.5);expect(tasks).toHaveLength(1)
 while(tasks.length)tasks.shift()!()
 expect(events).toEqual([...Array.from({length:12},(_,i)=>'draw:'+i),'END','nextSTART']);expect(fifo.pending).toBe(false)
})
it('bounds a frozen clock at32 next calls including zero-yield job completions',()=>{
 const tasks:Array<()=>void>=[],events:number[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{tasks.push(cb);return tasks.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 fifo.enqueue(function*(){for(let i=0;i<40;i++)fifo.enqueue(function*(){events.push(i)})})
 expect(events).toHaveLength(31);expect(tasks).toHaveLength(1) // The initial completed producer was call1.
 tasks.shift()!();expect(events).toEqual(Array.from({length:40},(_,i)=>i));expect(fifo.pending).toBe(false)
})
it('pauses explicit outer queue pressure once per pump instead of polling32 times',()=>{
 const tasks:Array<()=>void>=[],events:string[]=[];let blocked=true,attempts=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{tasks.push(cb);return tasks.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 fifo.enqueue(function*(){while(blocked){attempts++;yield{kind:'author-input-backpressure' as const}}events.push('same-frame-admitted')})
 fifo.enqueue(function*(){events.push('END')})
 expect(attempts).toBe(1);expect(events).toEqual([]);tasks.shift()!();expect(attempts).toBe(2)
 blocked=false;tasks.shift()!();expect(events).toEqual(['same-frame-admitted','END']);expect(fifo.pending).toBe(false)
})
it('pauses legacy cut void pressure once per pump while retaining cut ownership',()=>{
 const tasks:Array<()=>void>=[],events:string[]=[];let blocked=true,attempts=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{tasks.push(cb);return tasks.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 const flush=function*(){while(blocked){attempts++;yield}events.push('cut')}
 fifo.enqueue(function*(){yield{kind:'author-input-checkpoint' as const,flush,immediate:true as const};events.push('source-resumed')})
 expect(attempts).toBe(1);tasks.shift()!();expect(attempts).toBe(2);expect(events).toEqual([])
 blocked=false;tasks.shift()!();expect(events).toEqual(['cut','source-resumed']);expect(fifo.pending).toBe(false)
})
it('does not flush a suspended newer checkpoint ahead of explicit older handoff pressure',()=>{
 const tasks:Array<()=>void>=[],events:string[]=[],pending:number[]=[];let now=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{tasks.push(cb);return tasks.length},unschedule:()=>{},now:()=>now,failed:e=>{throw e}})
 const flush=function*(){events.push('cut:'+pending.splice(0).join(','))}
 fifo.enqueue(function*(){pending.push(0);yield{kind:'author-input-checkpoint' as const,flush,deadline:32};const older=pending.splice(0);pending.push(1);yield{kind:'author-input-backpressure' as const};events.push('admit:'+older.join(','));yield{kind:'author-input-checkpoint' as const,flush,immediate:true as const}})
 expect(events).toEqual([]);now=40;tasks.shift()!();expect(events).toEqual(['admit:0','cut:1']);expect(fifo.pending).toBe(false)
})
it('cancels a pressure-suspended source once and never resumes stale queued work',()=>{
 const tasks:Array<()=>void>=[],events:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{tasks.push(cb);return tasks.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 fifo.enqueue(function*(){try{yield{kind:'author-input-backpressure' as const};events.push('stale')}finally{events.push('closed')}},()=>events.push('release'))
 fifo.cancel();while(tasks.length)tasks.shift()!();expect(events).toEqual(['closed','release']);expect(fifo.pending).toBe(false)
})
it('rejects malformed pressure data without invoking getters or losing captured ownership',()=>{
 const get=vi.fn(),errors:unknown[]=[],release=vi.fn()
 const fifo=new AuthorInputFIFO({schedule:()=>1,unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)})
 const token=Object.defineProperty({},'kind',{get}) as {kind:'author-input-backpressure'}
 fifo.enqueue(function*(){yield token},release);expect(get).not.toHaveBeenCalled();expect(errors).toHaveLength(1);expect(release).toHaveBeenCalledOnce()
})

it('keeps FIRST, inputComplete and K8 remainder cuts immediate under the default time-first policy',()=>{
 const tasks:Array<()=>void>=[],cuts:number[][]=[],pending:number[]=[],events:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{tasks.push(cb);return tasks.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 const flush=function*(){if(pending.length)cuts.push(pending.splice(0))}
 fifo.enqueue(function*(){for(let i=0;i<18;i++){pending.push(i);events.push('material:'+i);yield{kind:'author-input-checkpoint' as const,flush,deadline:32,...i===0||pending.length>=8?{immediate:true as const}:{}}}events.push('inputComplete');yield{kind:'author-input-checkpoint' as const,flush,immediate:true as const}})
 while(tasks.length)tasks.shift()!()
 expect(cuts).toEqual([[0],[1,2,3,4,5,6,7,8],[9,10,11,12,13,14,15,16],[17]])
 expect(cuts.flat()).toEqual(Array.from({length:18},(_,i)=>i));expect(events.at(-1)).toBe('inputComplete');expect(fifo.pending).toBe(false)
})

it('parks capacity pressure without timers or callbacks and keeps the exact producer before MOVE and END',async()=>{
 vi.useFakeTimers();const capacity=deferred(),frames:Array<()=>void>=[],events:unknown[]=[],operation={ordinal:8}
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 fifo.enqueue(function*(){events.push(operation);yield{kind:'author-input-backpressure',promise:capacity.promise};events.push(operation)})
 fifo.enqueue(function*(){events.push('MOVE')});fifo.enqueue(function*(){events.push('END')})
 expect(frames).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);expect(events).toEqual([operation])
 capacity.resolve();capacity.resolve();await Promise.resolve();expect(events).toEqual([operation]);expect(frames).toHaveLength(1)
 while(frames.length)frames.shift()!()
 expect(events).toEqual([operation,operation,'MOVE','END']);expect(fifo.pending).toBe(false);expect(vi.getTimerCount()).toBe(0)
})
it('parks a suspended checkpoint cut on capacity and detaches both wait and retained cut on cancellation',async()=>{
 const capacity=deferred(),frames:Array<()=>void>=[],events:string[]=[],errors:unknown[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)})
 const flush=function*(){try{events.push('cut');yield{kind:'author-input-backpressure' as const,promise:capacity.promise};events.push('never')}finally{events.push('release-cut')}}
 fifo.enqueue(function*(){try{yield{kind:'author-input-checkpoint',flush,immediate:true};events.push('never-producer')}finally{events.push('release-producer')}})
 expect(events).toEqual(['cut']);expect(frames).toHaveLength(0)
 fifo.cancel();capacity.resolve();await Promise.resolve();expect(events).toEqual(['cut','release-cut','release-producer']);expect(frames).toHaveLength(0);expect(errors).toEqual([]);expect(fifo.pending).toBe(false)
})
it('propagates rejected capacity through the exact suspended cut with undefined kept as primary',async()=>{
 const capacity=deferred(),frames:Array<()=>void>=[],events:unknown[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>events.push(e)})
 const flush=function*(){try{yield{kind:'author-input-backpressure' as const,promise:capacity.promise}}catch(error){events.push(error)}finally{events.push('released')}}
 fifo.enqueue(function*(){yield{kind:'author-input-checkpoint',flush,immediate:true}})
 capacity.reject(undefined);await Promise.resolve();expect(events).toEqual([]);expect(frames).toHaveLength(1);frames.shift()!()
 expect(events).toEqual([undefined,'released']);expect(fifo.pending).toBe(false)
})

it('retires a capacity-parked cut when its concurrent service wait rejects with undefined',async()=>{
 const service=deferred(),capacity=deferred(),frames:Array<()=>void>=[],events:string[]=[],failed=vi.fn()
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed},4,2)
 const flush=function*(){try{yield{kind:'author-input-backpressure' as const,promise:capacity.promise};events.push('stale-cut')}finally{events.push('cut-return')}}
 fifo.enqueue(function*(){try{yield{kind:'author-input-checkpoint' as const,flush};yield{kind:'author-input-wait' as const,promise:service.promise,deadline:1000,timeoutError:Error('timeout')};events.push('stale-source')}finally{events.push('source-return')}},()=>events.push('release'))
 expect(frames).toHaveLength(0);expect(fifo.pending).toBe(true)
 service.reject(undefined);await Promise.resolve();await Promise.resolve();expect(frames).toHaveLength(1);frames.shift()!()
 expect(failed).toHaveBeenCalledExactlyOnceWith(undefined);expect(events).toEqual(['cut-return','source-return','release']);expect(fifo.pending).toBe(false)
 capacity.resolve();await Promise.resolve();await Promise.resolve();expect(frames).toHaveLength(0)
})
