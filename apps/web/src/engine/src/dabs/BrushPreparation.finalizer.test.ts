import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {BrushPreparation,type BrushPreparationResult,type BrushPreparationOutcome} from './BrushPreparation'
let frames:Map<number,FrameRequestCallback>,ordinal:number
const tick=()=>{const jobs=[...frames.values()];frames.clear();for(const job of jobs)job(0)}
beforeEach(()=>{frames=new Map();ordinal=0;vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++ordinal,cb);return ordinal});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))})
afterEach(()=>vi.unstubAllGlobals())

it('lets one subscriber abort without finalizing shared candidate work and commits before the survivor settles',async()=>{
 const worker=new BrushPreparation(),a=new AbortController(),events:string[]=[],lateHook=vi.fn();let candidate=false
 const finish=vi.fn((outcome:BrushPreparationOutcome)=>{expect(candidate).toBe(true);expect(Object.isFrozen(outcome)).toBe(true);events.push('commit')})
 const first=worker.run([()=>{candidate=true},()=>events.push('job')],{signal:a.signal},()=>true,'bank',finish)
 tick();const second=worker.run([()=>{throw Error('late jobs')}],{},()=>true,'bank',lateHook).then(result=>{events.push('settled');return result})
 a.abort();await expect(first).resolves.toEqual({status:'cancelled'});expect(finish).not.toHaveBeenCalled();tick()
 await expect(second).resolves.toEqual({status:'ready'});expect(events).toEqual(['job','commit','settled']);expect(finish).toHaveBeenCalledOnce();expect(lateHook).not.toHaveBeenCalled();expect(frames.size).toBe(0)
})
it('rolls back exactly once when all subscribers abort after allocation',async()=>{
 const worker=new BrushPreparation(),a=new AbortController(),b=new AbortController(),finish=vi.fn(),allocate=vi.fn()
 const first=worker.run([allocate,vi.fn()],{signal:a.signal},()=>true,'bank',finish),second=worker.run([], {signal:b.signal},()=>true,'bank',vi.fn())
 tick();a.abort();expect(finish).not.toHaveBeenCalled();b.abort();worker.cancel();tick()
 await expect(first).resolves.toEqual({status:'cancelled'});await expect(second).resolves.toEqual({status:'cancelled'});expect(finish).toHaveBeenCalledOnce();expect(finish).toHaveBeenCalledWith({result:{status:'cancelled'}});expect(allocate).toHaveBeenCalledOnce();expect(frames.size).toBe(0)
})
it('does not allocate or finalize on early abort, unavailable or throwing availability before a run exists',async()=>{
 const worker=new BrushPreparation(),a=new AbortController(),job=vi.fn(),finish=vi.fn(),error=Error('unavailable');a.abort()
 await expect(worker.run([job],{signal:a.signal},()=>true,'x',finish)).resolves.toEqual({status:'cancelled'})
 await expect(worker.run([job],{},()=>false,'x',finish)).resolves.toEqual({status:'cancelled'})
 await expect(worker.run([job],{},()=>{throw error},'x',finish)).rejects.toBe(error)
 expect(job).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();expect(frames.size).toBe(0)
})
it('finalizes a created run cancelled before job zero without allocating a candidate',async()=>{
 const worker=new BrushPreparation(),job=vi.fn(),finish=vi.fn(),pending=worker.run([job],{},()=>true,'x',finish)
 worker.cancel();worker.cancel();tick();await expect(pending).resolves.toEqual({status:'cancelled'});expect(job).not.toHaveBeenCalled();expect(finish).toHaveBeenCalledOnce();expect(frames.size).toBe(0)
})
it('finalizes job-zero readiness before its subscriber observes success',async()=>{
 const events:string[]=[],worker=new BrushPreparation(),finish=vi.fn(()=>{events.push('finalize')})
 const pending=worker.run([],{},()=>true,'x',finish).then(value=>{events.push('settled');return value})
 expect(events).toEqual(['finalize']);await expect(pending).resolves.toEqual({status:'ready'});expect(events).toEqual(['finalize','settled']);expect(frames.size).toBe(0)
})
it('settles every terminal subscriber with a ready finalizer error and permits a fresh run',async()=>{
 const worker=new BrushPreparation(),error=Error('commit failed'),finish=vi.fn(()=>{throw error})
 const first=worker.run([vi.fn()],{},()=>true,'x',finish),second=worker.run([],{},()=>true,'x',vi.fn())
 tick();await expect(first).rejects.toBe(error);await expect(second).rejects.toBe(error);expect(finish).toHaveBeenCalledOnce()
 const next=worker.run([vi.fn()],{},()=>true,'next');tick();await expect(next).resolves.toEqual({status:'ready'})
})
it.each([Error('job failed'),undefined])('preserves the original job error over cleanup failure (%s)',async error=>{
 const worker=new BrushPreparation(),cleanup=Error('rollback failed'),finish=vi.fn(()=>{throw cleanup})
 const first=worker.run([()=>{throw error}],{},()=>true,'x',finish),second=worker.run([],{},()=>true,'x')
 tick();await expect(first).rejects.toBe(error);await expect(second).rejects.toBe(error);expect(finish).toHaveBeenCalledWith({error});expect(frames.size).toBe(0)
})
it('rechecks availability after final progress and rolls back instead of publishing ready',async()=>{
 const worker=new BrushPreparation(),finish=vi.fn();let available=true
 const pending=worker.run([vi.fn()],{onProgress:()=>{available=false}},()=>available,'x',finish)
 tick();await expect(pending).resolves.toEqual({status:'cancelled'});expect(finish).toHaveBeenCalledWith({result:{status:'cancelled'}})
})
it('keeps observer errors local while another subscriber still owns the work',async()=>{
 const worker=new BrushPreparation(),finish=vi.fn(),error=Error('observer')
 const bad=worker.run([vi.fn(),vi.fn()],{onProgress:()=>{throw error}},()=>true,'x',finish),good=worker.run([],{},()=>true,'x')
 tick();await expect(bad).rejects.toBe(error);expect(finish).not.toHaveBeenCalled();tick();await expect(good).resolves.toEqual({status:'ready'});expect(finish).toHaveBeenCalledOnce()
})
it.each(['different','new']as const)('does not overwrite a newer run started by the cancelled finalizer (%s)',async key=>{
 const worker=new BrushPreparation(),newJob=vi.fn(),outerJob=vi.fn();let newer:Promise<BrushPreparationResult>|undefined
 const old=worker.run([vi.fn()],{},()=>true,'old',()=>{newer=worker.run([newJob],{},()=>true,'new')})
 const outer=worker.run([outerJob],{},()=>true,key,()=>{throw Error('outer hook must not be installed')})
 await expect(old).resolves.toEqual({status:'cancelled'});tick();await expect(newer).resolves.toEqual({status:'ready'})
 await expect(outer).resolves.toEqual({status:key==='new'?'ready':'cancelled'});expect(newJob).toHaveBeenCalledOnce();expect(outerJob).not.toHaveBeenCalled();expect(frames.size).toBe(0)
})
it('preserves a newer active run started reentrantly by initial availability',async()=>{
 const worker=new BrushPreparation(),oldJob=vi.fn(),newJob=vi.fn(),finish=vi.fn();let newer:Promise<BrushPreparationResult>|undefined
 const outer=worker.run([oldJob],{},()=>{newer=worker.run([newJob],{},()=>true,'new');return true},'outer',finish)
 tick();await expect(outer).resolves.toEqual({status:'cancelled'});await expect(newer).resolves.toEqual({status:'ready'});expect(oldJob).not.toHaveBeenCalled();expect(newJob).toHaveBeenCalledOnce();expect(finish).not.toHaveBeenCalled()
})
it('does not run an old job when its frame availability starts a newer run',async()=>{
 const worker=new BrushPreparation(),oldJob=vi.fn(),newJob=vi.fn(),finish=vi.fn();let calls=0,newer:Promise<BrushPreparationResult>|undefined
 const old=worker.run([oldJob],{},()=>{if(++calls===2)newer=worker.run([newJob],{},()=>true,'new');return true},'old',finish)
 tick();await expect(old).resolves.toEqual({status:'cancelled'});tick();await expect(newer).resolves.toEqual({status:'ready'});expect(oldJob).not.toHaveBeenCalled();expect(finish).toHaveBeenCalledOnce()
})
it('leaves a new run alive when the ready finalizer starts it and aborts an old subscriber',async()=>{
 const worker=new BrushPreparation(),controller=new AbortController(),newJob=vi.fn();let newer:Promise<BrushPreparationResult>|undefined
 const first=worker.run([vi.fn()],{signal:controller.signal},()=>true,'old',()=>{newer=worker.run([newJob],{},()=>true,'new');controller.abort()}),second=worker.run([],{},()=>true,'old')
 tick();await expect(first).resolves.toEqual({status:'ready'});await expect(second).resolves.toEqual({status:'ready'});tick();await expect(newer).resolves.toEqual({status:'ready'});expect(newJob).toHaveBeenCalledOnce()
})
it('rejects a nonundefined finalizer result without accessing then',async()=>{
 const worker=new BrushPreparation(),get=vi.fn(()=>{throw Error('must not read then')}),result=Object.defineProperty({},'then',{get})
 const pending=worker.run([vi.fn()],{},()=>true,'x',()=>result);tick();await expect(pending).rejects.toThrow('finalizer');expect(get).not.toHaveBeenCalled()
})
it('finalizes an initial RAF scheduling error and a cancellation error without stranding subscribers',async()=>{
 const worker=new BrushPreparation(),scheduleError=Error('RAF failed'),finish=vi.fn()
 vi.stubGlobal('requestAnimationFrame',()=>{throw scheduleError})
 await expect(worker.run([vi.fn()],{},()=>true,'x',finish)).rejects.toBe(scheduleError);expect(finish).toHaveBeenCalledWith({error:scheduleError})
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++ordinal,cb);return ordinal})
 const cancelError=Error('cancel failed'),cleanupError=Error('cleanup failed'),job=vi.fn(),cleanup=vi.fn(()=>{throw cleanupError})
 const first=worker.run([job],{},()=>true,'next',cleanup),second=worker.run([],{},()=>true,'next')
 vi.stubGlobal('cancelAnimationFrame',()=>{throw cancelError});expect(()=>worker.cancel()).not.toThrow();tick()
 await expect(first).rejects.toBe(cancelError);await expect(second).rejects.toBe(cancelError);expect(cleanup).toHaveBeenCalledOnce();expect(job).not.toHaveBeenCalled()
})
it('runs rollback before the final abort result and does not throw cleanup failure out of AbortEvent',async()=>{
 const worker=new BrushPreparation(),controller=new AbortController(),error=Error('rollback failed'),finish=vi.fn(()=>{throw error})
 const pending=worker.run([vi.fn()],{signal:controller.signal},()=>true,'x',finish)
 expect(()=>controller.abort()).not.toThrow();await expect(pending).rejects.toBe(error);expect(finish).toHaveBeenCalledOnce();expect(frames.size).toBe(0)
})

it('does not notify stale progress subscribers or run more jobs after progress starts a new run',async()=>{
 const worker=new BrushPreparation(),newJob=vi.fn(),oldSecondJob=vi.fn(),oldHook=vi.fn(),oldPeerProgress=vi.fn();let newer:Promise<BrushPreparationResult>|undefined
 const first=worker.run([vi.fn(),oldSecondJob],{onProgress:()=>{newer=worker.run([newJob],{},()=>true,'new')}},()=>true,'old',oldHook)
 const peer=worker.run([], {onProgress:oldPeerProgress},()=>true,'old')
 tick();await expect(first).resolves.toEqual({status:'cancelled'});await expect(peer).resolves.toEqual({status:'cancelled'});expect(oldPeerProgress).not.toHaveBeenCalled();expect(oldSecondJob).not.toHaveBeenCalled();expect(oldHook).toHaveBeenCalledOnce()
 tick();await expect(newer).resolves.toEqual({status:'ready'});expect(newJob).toHaveBeenCalledOnce()
})
it('preserves final availability error over rollback failure after all jobs have run',async()=>{
 const worker=new BrushPreparation(),error=Error('epoch changed'),cleanup=Error('cleanup'),finish=vi.fn(()=>{throw cleanup});let checks=0
 const pending=worker.run([vi.fn()],{},()=>{if(++checks===3)throw error;return true},'x',finish)
 tick();await expect(pending).rejects.toBe(error);expect(finish).toHaveBeenCalledWith({error});expect(frames.size).toBe(0)
})
it('keeps the remaining shared owner alive when a late progress observer throws',async()=>{
 const worker=new BrushPreparation(),creator=vi.fn(),late=vi.fn(),error=Error('late observer')
 const first=worker.run([vi.fn(),vi.fn()],{},()=>true,'x',creator);tick()
 const second=worker.run([()=>{throw Error('late job')}],{onProgress:()=>{throw error}},()=>true,'x',late)
 await expect(second).rejects.toBe(error);expect(creator).not.toHaveBeenCalled();expect(late).not.toHaveBeenCalled();tick();await expect(first).resolves.toEqual({status:'ready'});expect(creator).toHaveBeenCalledOnce()
})

it('rechecks caller availability before joining a matching run created during cancellation',async()=>{
 const worker=new BrushPreparation(),newJob=vi.fn();let current=true,newer:Promise<BrushPreparationResult>|undefined
 const old=worker.run([vi.fn()],{},()=>true,'old',()=>{current=false;newer=worker.run([newJob],{},()=>true,'new')})
 const outer=worker.run([()=>{throw Error('outer job')}],{},()=>current,'new')
 await expect(old).resolves.toEqual({status:'cancelled'});tick();await expect(outer).resolves.toEqual({status:'cancelled'});await expect(newer).resolves.toEqual({status:'ready'});expect(newJob).toHaveBeenCalledOnce()
})

it('reports replacement safety from only the existing active key without running work or observers',async()=>{
 const worker=new BrushPreparation(),job=vi.fn(),progress=vi.fn(),finish=vi.fn()
 expect(worker.canRunWithoutReplacing()).toBe(true);expect(worker.canRunWithoutReplacing('a')).toBe(true)
 const anonymous=worker.run([job],{onProgress:progress},()=>true,undefined,finish)
 for(let n=0;n<3;n++){expect(worker.canRunWithoutReplacing()).toBe(false);expect(worker.canRunWithoutReplacing('a')).toBe(false)}
 expect(job).not.toHaveBeenCalled();expect(progress).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();expect(frames.size).toBe(1)
 worker.cancel();await expect(anonymous).resolves.toEqual({status:'cancelled'});expect(worker.canRunWithoutReplacing()).toBe(true)
 const keyed=worker.run([job],{onProgress:progress},()=>true,'a',finish)
 expect(worker.canRunWithoutReplacing('a')).toBe(true);expect(worker.canRunWithoutReplacing('b')).toBe(false);expect(worker.canRunWithoutReplacing()).toBe(false)
 expect(job).not.toHaveBeenCalled();expect(progress).not.toHaveBeenCalled();expect(finish).toHaveBeenCalledOnce();tick();await expect(keyed).resolves.toEqual({status:'ready'})
 expect(worker.canRunWithoutReplacing()).toBe(true);expect(worker.canRunWithoutReplacing('b')).toBe(true);expect(job).toHaveBeenCalledOnce();expect(progress).toHaveBeenCalledOnce();expect(finish).toHaveBeenCalledTimes(2)
})
