import {it,expect,vi} from 'vitest'
import {createBoundedSchedulingObserver} from './boundedSchedulingObserver'
import {RoomNativeCentralAdapter} from './roomNativeCentralAdapter'
import {WatercolorCanonicalFIFO} from '../watercolor/WatercolorCanonicalFIFO'
import {CanonicalPlanAdapter} from './settlePlanAdapter'
it('immutable request/encoded owner passport retains late cancelled ACK without waking',async()=>{
 const frames=new Map<number,()=>void>();let handle=0,ack!:()=>void,pending=0,queuedCalls=0
 const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{queuedCalls++;frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed(){},failed(e){throw e}}),central=new RoomNativeCentralAdapter(fifo,()=>{}),observer=createBoundedSchedulingObserver(16,()=>1)
 central.diagnosticScheduling=observer
 const owner={device:{createCommandEncoder:()=>({finish:()=>({})}),queue:{submit(){},onSubmittedWorkDone:()=>new Promise<void>(r=>{ack=r})}},nearest:{},linear:{},diagnosticSchedulingBindRelease:(id:number,epoch:number)=>central.bindDiagnosticScope(id,epoch),get diagnosticScopeState(){return{pending,live:true}},encodeOwnerCommands(_e:unknown,task:()=>unknown){pending++;return{value:task(),release(){pending--}}}}
 const adapter=Object.create(CanonicalPlanAdapter.prototype) as CanonicalPlanAdapter;Object.assign(adapter,{owner,context:null,transient:[],diagnosticQuantumOrdinal:0,diagnosticOwnerEpoch:7})
 central.enqueueSource(()=>{expect(adapter.runQuantum(()=>42)).toBe(42)},async()=>{})
 const frame=frames.entries().next().value!;frames.delete(frame[0]);frame[1]()
 expect(observer.snapshot().rows.find(x=>x.kind==='schedulerResume')).toMatchObject({kind:'schedulerResume',fifoEpoch:0,requestId:0,ownerEpoch:null})
 await central.cancel('clear');const scheduled=queuedCalls;adapter.diagnosticOwnerEpoch=99;ack();await Promise.resolve()
 expect(observer.snapshot().rows.at(-1)).toMatchObject({kind:'scopeRelease',fifoEpoch:0,requestId:0,ownerEpoch:7,cancelled:true,outcome:'fulfilled',pendingBefore:1,pendingAfter:0})
 expect(queuedCalls).toBe(scheduled);expect(pending).toBe(0)
})
it('bounded observer clock failures and closure never escape owner cleanup',()=>{const observer=createBoundedSchedulingObserver(1,()=>1),request=observer.bindRequest({fifoEpoch:0,requestId:1,ownerEpoch:null,requestKind:'material'});request.resume(1);request.resume(2);expect(observer.snapshot().dropped).toBe(2);observer.close();request.bindRelease(0,8)('rejected',1,0,false);expect(observer.snapshot().rows).toHaveLength(1);const broken=createBoundedSchedulingObserver(1,()=>{throw Error('clock')});expect(()=>broken.bindRequest({fifoEpoch:0,requestId:0,ownerEpoch:null,requestKind:'source'}).resume(1)).not.toThrow();expect(broken.snapshot().observerErrors).toBe(2)})
it('OFF leaves original ACK handler identity and no diagnostic calls; encode failure reports separately',async()=>{
 for(const enabled of [false,true]){let pending=0;const observer=createBoundedSchedulingObserver(),request=observer.bindRequest({fifoEpoch:2,requestId:3,ownerEpoch:null,requestKind:'material'}),then=vi.fn(),bind=vi.fn((id:number,epoch:number)=>request.bindRelease(id,epoch)),destroy=vi.fn(),owner={device:{createCommandEncoder:()=>({finish:()=>({})}),queue:{submit(){},onSubmittedWorkDone:()=>({then})}},nearest:{},linear:{},diagnosticSchedulingBindRelease:enabled?bind:null,get diagnosticScopeState(){return{pending,live:true}},encodeOwnerCommands(_e:unknown,task:()=>unknown){const value=task();pending++;return{value,release(){pending--}}}},adapter=Object.create(CanonicalPlanAdapter.prototype) as CanonicalPlanAdapter;Object.assign(adapter,{owner,context:null,transient:[],diagnosticQuantumOrdinal:0,diagnosticOwnerEpoch:4})
 adapter.runQuantum(()=>adapter.retain([{destroy} as unknown as GPUBuffer]));const [fulfilled,rejected]=then.mock.calls[0];if(!enabled){expect(bind).not.toHaveBeenCalled();expect(fulfilled).toBe(rejected)}rejected();expect(destroy).toHaveBeenCalledTimes(1);if(enabled)expect(observer.snapshot().rows.at(-1)).toMatchObject({outcome:'rejected',ownerEpoch:4})
 expect(()=>adapter.runQuantum(()=>{throw Error('encode failed')})).toThrow('encode failed');if(enabled)expect(observer.snapshot().rows.at(-1)).toMatchObject({outcome:'encode-error'})
 const cleanupError=Error('original cleanup failed');adapter.runQuantum(()=>adapter.retain([{destroy(){throw cleanupError}} as unknown as GPUBuffer]));const releases=observer.snapshot().rows.filter(r=>r.kind==='scopeRelease').length;expect(()=>then.mock.calls.at(-1)![0]()).toThrow(cleanupError);expect(observer.snapshot().rows.filter(r=>r.kind==='scopeRelease')).toHaveLength(releases)
 }
})

it('binding errors preserve original admission/execution and record diagnostic failure',async()=>{
 const frames=new Map<number,()=>void>();let id=0
 const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++id,cb);return id},unschedule:h=>frames.delete(h),changed(){},failed(e){throw e}}),central=new RoomNativeCentralAdapter(fifo,()=>{}),observer=createBoundedSchedulingObserver(),emit=vi.fn()
 vi.spyOn(observer,'bindRequest').mockImplementation(()=>{throw Error('diagnostic setup failed')});central.diagnosticScheduling=observer
 expect(()=>central.enqueueSource(emit,async()=>{})).not.toThrow()
 for(let n=0;n<10&&fifo.pending;n++){await Promise.resolve();const next=frames.entries().next().value;if(next){frames.delete(next[0]);next[1]()}}
 expect(emit).toHaveBeenCalledTimes(1);expect(observer.snapshot().observerErrors).toBe(1);expect(fifo.pending).toBe(false)
})
