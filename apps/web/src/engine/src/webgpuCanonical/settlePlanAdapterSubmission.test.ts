import {expect,it,vi} from 'vitest'
import {CanonicalPlanAdapter} from './settlePlanAdapter'
function fixture(enabled:boolean){
 const submit=vi.fn(),release=vi.fn(),destroy=vi.fn()
 const adapter=Object.create(CanonicalPlanAdapter.prototype) as CanonicalPlanAdapter
 Object.assign(adapter,{context:null,transient:[],diagnosticCountSubmissions:enabled,diagnosticSubmittedQuanta:0,owner:{nearest:{},linear:{},device:{createCommandEncoder:()=>({finish:()=>({})}),queue:{submit,onSubmittedWorkDone:()=>Promise.resolve()}},encodeOwnerCommands:(_encoder:unknown,task:()=>unknown)=>({value:task(),release})}})
 return{adapter,submit,release,destroy}
}
it('counts successful submissions only and retires buffers after completion',async()=>{
 const {adapter,submit,release,destroy}=fixture(true)
 adapter.runQuantum(()=>adapter.retain([{destroy} as unknown as GPUBuffer]))
 expect(submit).toHaveBeenCalledTimes(1);expect(adapter.submissionCounters.submittedQuanta).toBe(1);expect(destroy).not.toHaveBeenCalled()
 await Promise.resolve();expect(release).toHaveBeenCalledTimes(1);expect(destroy).toHaveBeenCalledTimes(1)
 expect(()=>adapter.runQuantum(()=>{throw Error('failed')})).toThrow('failed');expect(adapter.submissionCounters.submittedQuanta).toBe(1)
})
it('disabled counter leaves result and submission unchanged; snapshots are detached',()=>{
 const {adapter,submit}=fixture(false);expect(adapter.runQuantum(()=>42)).toBe(42);expect(submit).toHaveBeenCalledTimes(1)
 const snapshot=adapter.submissionCounters;snapshot.submittedQuanta=99;expect(adapter.submissionCounters.submittedQuanta).toBe(0)
})
