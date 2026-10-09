import {it,expect,vi} from 'vitest'
import {CanonicalWatercolorWebGpu} from './backend'
import {CanonicalPlanAdapter} from './settlePlanAdapter'
import {RoomNativeCentralAdapter} from './roomNativeCentralAdapter'
import {WatercolorCanonicalFIFO} from '../watercolor/WatercolorCanonicalFIFO'
function fixture(cap:number){
 const acknowledgements:Array<{resolve:()=>void;reject:(e:unknown)=>void}>=[],submit=vi.fn(),frames=new Map<number,()=>void>();let handle=0
 const device={createCommandEncoder:()=>({finish:()=>({})}),queue:{submit,onSubmittedWorkDone:()=>new Promise<void>((resolve,reject)=>acknowledgements.push({resolve,reject}))}}
 const backend=Object.create(CanonicalWatercolorWebGpu.prototype) as CanonicalWatercolorWebGpu
 Object.assign(backend,{device,pendingScopes:0,activeEncoder:null,activeBuffers:[],activeRetired:[],pendingRetired:new Set(),destroyed:false})
 const adapter=Object.create(CanonicalPlanAdapter.prototype) as CanonicalPlanAdapter;Object.assign(adapter,{owner:backend,context:null,transient:[]})
 const errors:unknown[]=[],fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed:vi.fn(),failed:e=>errors.push(e)})
 const central=new RoomNativeCentralAdapter(fifo,vi.fn());central.setDiagnosticMaterialScopeCap(cap)
 const pump=async()=>{await Promise.resolve();const first=frames.entries().next().value;if(first){frames.delete(first[0]);first[1]()}}
 return{backend,adapter,central,fifo,errors,pump,acknowledgements,submit}
}
it('scope limit yields from existing original callbacks, preserving ordered steps/source without extra queue promises',async()=>{
 for(const cap of [2,4]){
  const f=fixture(cap),events:string[]=[];let steps=0,disposed=0,next=0
  const done=f.central.admitFactory(()=>({canStep:n=>f.backend.diagnosticScopeState.pending<n,step:()=>{events.push('step'+steps);f.adapter.runQuantum(()=>{});return ++steps===5},finish:()=>events.push('finish'),dispose:()=>{disposed++}}))
  f.central.enqueueSource(()=>{next++},()=>Promise.resolve())
  await f.pump();expect(steps).toBe(cap);expect(f.backend.diagnosticScopeState.pending).toBe(cap)
  for(let n=0;n<3;n++)await f.pump();expect(steps).toBe(cap);expect(next).toBe(0)
  for(let n=0;n<30&&f.fifo.pending;n++){for(const ack of f.acknowledgements)ack.resolve();await f.pump()}
  await done;for(const ack of f.acknowledgements)ack.resolve();await Promise.resolve()
  expect(events).toEqual(['step0','step1','step2','step3','step4','finish']);expect(next).toBe(1);expect(disposed).toBe(1)
  expect(f.submit).toHaveBeenCalledTimes(5);expect(f.acknowledgements).toHaveLength(5);expect(f.backend.diagnosticScopeState.pending).toBe(0);expect(f.errors).toEqual([])
 }
})
it('existing rejected completion releases its exact scope; cancel/loss safely dispose and late release remains idempotent',async()=>{
 for(const lost of [false,true]){
  const f=fixture(2);let steps=0,disposed=0,next=0
  const done=f.central.admitFactory(()=>({canStep:n=>f.backend.diagnosticScopeState.pending<n,step:()=>{f.adapter.runQuantum(()=>{});return ++steps===10},finish:()=>{},dispose:()=>{disposed++}}))
  const observed=done.catch(e=>e);f.central.enqueueSource(()=>{next++},()=>Promise.resolve());await f.pump();expect(steps).toBe(2)
  f.acknowledgements[0].reject(Error('original queue rejection'));await Promise.resolve();expect(f.backend.diagnosticScopeState.pending).toBe(1)
  f.fifo.cancel(lost);if(lost)Object.assign(f.backend,{destroyed:true});expect(await observed).toBeInstanceOf(Error)
  for(const ack of f.acknowledgements)ack.resolve();await Promise.resolve();await f.pump()
  expect(disposed).toBe(1);expect(next).toBe(0);expect(f.backend.diagnosticScopeState.pending).toBe(0);expect(f.backend.diagnosticScopeState.live).toBe(!lost);expect(f.submit).toHaveBeenCalledTimes(2)
 }
})
it('invalid caps and missing or destroyed-owner guard fail closed without next source',async()=>{
 const f=fixture(0);for(const cap of [NaN,Infinity,-1,1,3,16])expect(()=>f.central.setDiagnosticMaterialScopeCap(cap)).toThrow()
 f.central.setDiagnosticMaterialScopeCap(2);let next=0,disposed=0
 const done=f.central.admitFactory(()=>({step:()=>true,finish:()=>{},dispose:()=>{disposed++}}));const observed=done.catch(e=>e);f.central.enqueueSource(()=>{next++},()=>Promise.resolve());await f.pump()
 expect(await observed).toBeInstanceOf(Error);expect(disposed).toBe(1);expect(next).toBe(0)
})
it('actual prepared job guard is bound to its original backend and rejects retirement/device destruction',async()=>{
 const {CanonicalRoomWatercolorExecutor}=await import('./roomWatercolorExecutor')
 const f=fixture(2),owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as InstanceType<typeof CanonicalRoomWatercolorExecutor>
 Object.assign(owner,{retired:false,backend:f.backend,central:{isIdle:true},adapter:{runQuantum:(fn:()=>unknown)=>fn()},planner:{prepare:()=>({ops:[],finish(){},dispose(){}})},scratch:{tiles:{},captureMetadata:()=>({})},target:{buffer:{}}})
 const job=owner.prepareSettle({} as never)!
 expect(job.canStep!(2)).toBe(true);Object.assign(f.backend,{pendingScopes:2});expect(job.canStep!(2)).toBe(false)
 Object.assign(f.backend,{destroyed:true});expect(()=>job.canStep!(2)).toThrow('owner destroyed')
 Object.assign(owner,{retired:true});expect(()=>job.canStep!(2)).toThrow('generation retired')
})
