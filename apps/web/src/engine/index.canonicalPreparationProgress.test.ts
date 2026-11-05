import {expect,it,vi} from 'vitest'
import {PencilEngine} from './index'
import {CanonicalWorkspaceBusyError,type CanonicalPreparationProgress} from './src/dabs/CanonicalPreparationProgress'
import type {BrushPreparationOptions,BrushPreparationResult} from './src/dabs/BrushPreparation'
type Owner={generation:number;failed?:boolean;retiring?:boolean;preparationProgress?:CanonicalPreparationProgress}
type Preparation=(preset:string,options:BrushPreparationOptions)=>Promise<BrushPreparationResult>
function fixture(idle=false){
 const owner:Owner={generation:1},state={idle},core=vi.fn<Preparation>()
 const engine=Object.create(PencilEngine.prototype) as {
  _canonicalLayerOwner:Owner;_opts:{pencilType:string;size:number};_sourcePattern:undefined;_authorCameraAngle:number;_physicalGeneration:number;
  _canonicalSourceLifetimeHolds?:number;_destroyed:boolean;_contextLost:boolean;_canonicalWorkspaceIdle:()=>boolean;_prepareCanonicalAuthorBrushCore:Preparation;
  _brushPreparation:{canRunWithoutReplacing:()=>boolean;whenIdle:()=>Promise<void>};
  _prepareCanonicalAuthorBrushWhenAvailable:Preparation;_wakeCanonicalPreparation:(owner:Owner,retired?:boolean)=>void;
 }
 Object.assign(engine,{_canonicalLayerOwner:owner,_opts:{pencilType:'selected',size:24},_sourcePattern:undefined,_authorCameraAngle:0,_physicalGeneration:1,_destroyed:false,_contextLost:false,_canonicalWorkspaceIdle:()=>state.idle,_prepareCanonicalAuthorBrushCore:core,_brushPreparation:{canRunWithoutReplacing:()=>true,whenIdle:()=>Promise.resolve()}})
 return{engine,owner,state,core,prepare:(options:BrushPreparationOptions={})=>engine._prepareCanonicalAuthorBrushWhenAvailable('selected',options)}
}
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return{promise,resolve}}

it('waits for actual workspace progress after a busy growth attempt and retries the original selection',async()=>{
 const s=fixture();s.core.mockRejectedValueOnce(new CanonicalWorkspaceBusyError()).mockResolvedValueOnce({status:'ready'})
 const result=s.prepare();await tick();expect(s.core).toHaveBeenCalledOnce();expect(s.owner.preparationProgress?.references).toBe(1)
 s.engine._wakeCanonicalPreparation(s.owner);await tick();expect(s.core).toHaveBeenCalledOnce()
 s.state.idle=true;s.engine._wakeCanonicalPreparation(s.owner)
 expect(await result).toEqual({status:'ready'});expect(s.core).toHaveBeenCalledTimes(2);expect(s.owner.preparationProgress).toBeUndefined()
})
it('does not delay a safe non-growing preparation while another participant paints',async()=>{
 const s=fixture();s.core.mockResolvedValue({status:'ready'})
 expect(await s.prepare()).toEqual({status:'ready'});expect(s.core).toHaveBeenCalledOnce();expect(s.owner.preparationProgress).toBeUndefined()
})
it('cancels one subscriber without removing another subscriber of the same progress notification',async()=>{
 const s=fixture(),abort=new AbortController();s.core.mockImplementation(async()=>{if(!s.state.idle)throw new CanonicalWorkspaceBusyError();return{status:'ready'}})
 const a=s.prepare({signal:abort.signal}),b=s.prepare();await tick();expect(s.owner.preparationProgress?.references).toBe(2)
 abort.abort();expect(await a).toEqual({status:'cancelled'});expect(s.owner.preparationProgress?.references).toBe(1)
 s.state.idle=true;s.engine._wakeCanonicalPreparation(s.owner);expect(await b).toEqual({status:'ready'});expect(s.owner.preparationProgress).toBeUndefined()
})
it.each(['owner','preset','size','pattern','generation','lost'] as const)('does not retry a stale %s after the original progress wakeup',async kind=>{
 const s=fixture();s.core.mockRejectedValue(new CanonicalWorkspaceBusyError());const result=s.prepare();await tick()
 if(kind==='owner')s.engine._canonicalLayerOwner={generation:1}
 if(kind==='preset')s.engine._opts.pencilType='another'
 if(kind==='size')s.engine._opts.size=48
 if(kind==='pattern')Object.assign(s.engine,{_sourcePattern:{}})
 if(kind==='generation')s.engine._physicalGeneration=2
 if(kind==='lost')s.engine._contextLost=true
 s.state.idle=true;s.engine._wakeCanonicalPreparation(s.owner,kind==='owner')
 expect(await result).toEqual({status:'cancelled'});expect(s.core).toHaveBeenCalledOnce();expect(s.owner.preparationProgress).toBeUndefined()
})
it('observes a genuine progress event that finished before a cancelled preparation returned',async()=>{
 const s=fixture(true),first=deferred<BrushPreparationResult>();s.core.mockReturnValueOnce(first.promise).mockResolvedValueOnce({status:'ready'})
 const result=s.prepare();s.engine._wakeCanonicalPreparation(s.owner);first.resolve({status:'cancelled'})
 expect(await result).toEqual({status:'ready'});expect(s.core).toHaveBeenCalledTimes(2)
})
it('joins the existing preparation barrier when recorded preparation replaced its task',async()=>{
 const s=fixture(true),idle=deferred<void>();let busy=true
 s.engine._brushPreparation={canRunWithoutReplacing:()=>!busy,whenIdle:()=>idle.promise}
 s.core.mockResolvedValueOnce({status:'cancelled'}).mockResolvedValueOnce({status:'ready'})
 const result=s.prepare();await tick();expect(s.core).toHaveBeenCalledOnce();busy=false;idle.resolve()
 expect(await result).toEqual({status:'ready'});expect(s.core).toHaveBeenCalledTimes(2)
})
it('aborts while joining existing preparation and detaches from a later settlement',async()=>{
 const s=fixture(true),idle=deferred<void>(),abort=new AbortController()
 s.engine._brushPreparation={canRunWithoutReplacing:()=>false,whenIdle:()=>idle.promise};s.core.mockResolvedValue({status:'cancelled'})
 const result=s.prepare({signal:abort.signal});await tick();abort.abort();expect(await result).toEqual({status:'cancelled'})
 idle.resolve();await tick();expect(s.core).toHaveBeenCalledOnce();expect(s.owner.preparationProgress).toBeUndefined()
})
it('preserves cancellation without progress and propagates ordinary errors without retry',async()=>{
 const s=fixture(true);s.core.mockResolvedValueOnce({status:'cancelled'})
 expect(await s.prepare()).toEqual({status:'cancelled'});expect(s.core).toHaveBeenCalledOnce()
 const error=new Error('Unavailable original source');s.core.mockRejectedValueOnce(error)
 await expect(s.prepare()).rejects.toBe(error);expect(s.core).toHaveBeenCalledTimes(2);expect(s.owner.preparationProgress).toBeUndefined()
})

it('does not prepare a new selection while a captured source tail still owns resources',async()=>{
 const s=fixture();s.engine._canonicalSourceLifetimeHolds=1;s.core.mockResolvedValue({status:'ready'})
 const result=s.prepare();await tick();expect(s.core).not.toHaveBeenCalled()
 s.engine._wakeCanonicalPreparation(s.owner);await tick();expect(s.core).not.toHaveBeenCalled()
 s.engine._canonicalSourceLifetimeHolds=0;s.state.idle=true;s.engine._wakeCanonicalPreparation(s.owner)
 expect(await result).toEqual({status:'ready'});expect(s.core).toHaveBeenCalledOnce()
})
