import {expect,it,vi} from 'vitest'
import type {CanonicalStrokeOperation,SendResult} from '@grafetto/shared'
import {Outbox} from './outbox'
import {createInMemoryOutboxStorage,type OutboxEntry} from './outboxStorage'
const frame=(n:number):CanonicalStrokeOperation=>({id:'f'+n,userId:'author',layerId:'layer',type:'canonical_stroke',timestamp:0,frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:'brush:test@1',strokeId:'stroke',frameOrdinal:n,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'not decoded by scheduling'}})
const defer=<T,>()=>{let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
const scope=()=>({socket:{},connectionId:'connection',boardId:'room',originalRead:{}})
it('pipelines only two actually emitted contiguous frames before ACK',async()=>{
 const lineage=scope(),sent:number[]=[],answers=[defer<SendResult>(),defer<SendResult>(),defer<SendResult>()]
 const box=new Outbox({roomId:'room',storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);emitted?.();return answers[n].promise}})
 for(let n=0;n<3;n++)await box.enqueue(frame(n))
 expect(sent).toEqual([0,1]);answers[0].resolve({ok:true,seq:1});await flush();expect(sent).toEqual([0,1,2]);answers[1].resolve({ok:true,seq:2});answers[2].resolve({ok:true,seq:3});await flush();expect(box.pendingCount).toBe(0);box.dispose()
})
it('does not use a reserved slot as emission proof or skip a missing ordinal',async()=>{
 const lineage=scope(),sent:number[]=[],emit0=defer<void>(),answers=defer<SendResult>()
 const box=new Outbox({roomId:'room',storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,send:async(op,emitted)=>{const n=Number(op.id.slice(1));if(n===0)await emit0.promise;sent.push(n);emitted?.();return answers.promise}})
 await box.enqueue(frame(0));await box.enqueue(frame(2));await box.enqueue(frame(1));expect(sent).toEqual([])
 emit0.resolve();await flush();expect(sent).toEqual([0,1]);box.dispose();answers.resolve({ok:true,seq:1})
})
it('demotes a permanently rejected gesture to real serial verdict drain without stalled deadlock or persisted flags',async()=>{
 const lineage=scope(),sent:number[]=[],answers=[defer<SendResult>(),defer<SendResult>(),defer<SendResult>(),defer<SendResult>()],puts:OutboxEntry[]=[],memory=createInMemoryOutboxStorage(),settled=vi.fn()
 const box=new Outbox({roomId:'room',storage:{...memory,put:async e=>{puts.push(structuredClone(e));await memory.put(e)}},getCanonicalSendLineage:()=>lineage,onSettled:settled,send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);emitted?.();return answers[n].promise}})
 for(let n=0;n<4;n++)await box.enqueue(frame(n))
 answers[0].resolve({ok:false,reason:'invalid_operation'});await flush();expect(sent).toEqual([0,1]);expect(box.stalledCount).toBe(0)
 answers[1].resolve({ok:false,reason:'invalid_operation'});await flush();expect(sent).toEqual([0,1,2])
 answers[2].resolve({ok:false,reason:'invalid_operation'});await flush();expect(sent).toEqual([0,1,2,3]);answers[3].resolve({ok:false,reason:'invalid_operation'});await flush()
 expect(box.pendingCount).toBe(0);expect(settled).toHaveBeenCalledTimes(4);expect(puts.every(e=>Object.keys(e).sort().join(',')==='attempts,nextRetryAt,op,roomId')).toBe(true);box.dispose()
})
it('does not pipeline hydrated higher heads or carry proof into a different connection',async()=>{
 let lineage=scope();const sent:number[]=[],answer=defer<SendResult>(),storage=createInMemoryOutboxStorage()
 for(const n of [4,5])await storage.put({op:frame(n),roomId:'room',attempts:0,nextRetryAt:0})
 const box=new Outbox({roomId:'room',storage,getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{sent.push(Number(op.id.slice(1)));emitted?.();return answer.promise}})
 await box.resendAll();expect(sent).toEqual([4]);box.dispose();answer.resolve({ok:true,seq:1})
 const hold=defer<SendResult>(),fresh=new Outbox({roomId:'room',storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{sent.push(Number(op.id.slice(1)));emitted?.();return hold.promise}})
 await fresh.enqueue(frame(0));lineage={...lineage,connectionId:'reconnected'};await fresh.enqueue(frame(1));expect(sent).toEqual([4,0]);fresh.dispose();hold.resolve({ok:true,seq:2})
})
it('retains timeout/transient work and blocks new suffix until actual serial retry',async()=>{
 const lineage=scope(),scheduled:(()=>void)[]=[],sent:number[]=[],a0=defer<SendResult>(),a1=defer<SendResult>();let retry=false
 const box=new Outbox({roomId:'room',storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,schedule:fn=>scheduled.push(fn),send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);emitted?.();if(n===0&&!retry)return a0.promise;if(n===1)return a1.promise;return Promise.resolve({ok:true,seq:n+1})}})
 for(let n=0;n<3;n++)await box.enqueue(frame(n));a0.reject(Error('lost ACK'));await flush();a1.resolve({ok:true,seq:2});await flush();expect(sent).toEqual([0,1]);expect(box.pendingCount).toBe(2)
 retry=true;scheduled.shift()!();await flush();expect(sent).toEqual([0,1,0,2]);expect(box.pendingCount).toBe(0);box.dispose()
})

it('keeps global capacity during slow/throwing delete and preserves actual ACK callback order',async()=>{
 const lineage=scope(),sent:number[]=[],answers=[defer<SendResult>(),defer<SendResult>(),defer<SendResult>()],deleted=defer<void>(),memory=createInMemoryOutboxStorage(),settled=vi.fn(),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 const box=new Outbox({roomId:'room',storage:{...memory,delete:async id=>{if(id==='f0')await deleted.promise;await memory.delete(id)}},getCanonicalSendLineage:()=>lineage,onSettled:settled,send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);emitted?.();return answers[n].promise}})
 try{
  for(let n=0;n<3;n++)await box.enqueue(frame(n));answers[0].resolve({ok:true,seq:1});await flush();expect(sent).toEqual([0,1]);expect(settled).not.toHaveBeenCalled()
  deleted.reject(Error('delete failed'));await flush();expect(sent).toEqual([0,1,2]);expect(settled).toHaveBeenCalledWith(frame(0),{ok:true,seq:1})
  answers[1].resolve({ok:true,seq:2});answers[2].resolve({ok:true,seq:3});await flush();expect(box.pendingCount).toBe(0)
 }finally{box.dispose();log.mockRestore()}
})
it('classifies a permanent fault before reentrant callbacks enqueue the same gesture',async()=>{
 const lineage=scope(),sent:number[]=[],answers=[defer<SendResult>(),defer<SendResult>(),defer<SendResult>()];let box:Outbox
 box=new Outbox({roomId:'room',storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,onSettled:op=>{if(op.id==='f0')void box.enqueue(frame(2))},send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);emitted?.();return answers[n].promise}})
 await box.enqueue(frame(0));await box.enqueue(frame(1));answers[0].resolve({ok:false,reason:'invalid_operation'});await flush();expect(sent).toEqual([0,1]);expect(box.stalledCount).toBe(0)
 answers[1].resolve({ok:false,reason:'invalid_operation'});await flush();expect(sent).toEqual([0,1,2]);answers[2].resolve({ok:false,reason:'invalid_operation'});await flush();expect(box.pendingCount).toBe(0);box.dispose()
})

it('waits for lower persistence before emitting either frame and keeps close behind both real ACKs',async()=>{
 const lineage=scope(),sent:string[]=[],put0=defer<void>(),answers=[defer<SendResult>(),defer<SendResult>()],memory=createInMemoryOutboxStorage()
 const close:import('@grafetto/shared').CanonicalStrokeCloseOperation={type:'canonical_stroke_close',id:'close',userId:'author',targetUserId:'author',timestamp:0,layerId:'layer',strokeId:'stroke',disposition:'commitPartial',recordedNext:2,firstFrameOpId:'f0',lastFrameOpId:'f1'}
 const box=new Outbox({roomId:'room',storage:{...memory,put:async e=>{await memory.put(e);if(e.op.id==='f0')await put0.promise}},getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{sent.push(op.id);emitted?.();return op.id==='close'?Promise.resolve({ok:true,seq:3}):answers[Number(op.id.slice(1))].promise}})
 const zero=box.enqueue(frame(0));await box.enqueue(frame(1));await box.enqueue(close);expect(sent).toEqual([])
 put0.resolve();await zero;await flush();expect(sent).toEqual(['f0','f1']);answers[0].resolve({ok:true,seq:1});await flush();expect(sent).toEqual(['f0','f1'])
 answers[1].resolve({ok:true,seq:2});await flush();expect(sent).toEqual(['f0','f1','close']);expect(box.pendingCount).toBe(0);box.dispose()
})

it('retains predecessor emission provenance when both ACKed attempts wait for deletion',async()=>{
 const lineage=scope(),sent:number[]=[],answers=Array.from({length:4},()=>defer<SendResult>()),deletes=[defer<void>(),defer<void>()],memory=createInMemoryOutboxStorage()
 const box=new Outbox({roomId:'room',storage:{...memory,delete:async id=>{const n=Number(id.slice(1));if(n<2)await deletes[n].promise;await memory.delete(id)}},getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);emitted?.();return answers[n].promise}})
 for(let n=0;n<4;n++)await box.enqueue(frame(n));expect(sent).toEqual([0,1])
 answers[0].resolve({ok:true,seq:1});answers[1].resolve({ok:true,seq:2});await flush();expect(box.pendingCount).toBe(2)
 deletes[0].resolve();deletes[1].resolve();await flush();expect(sent).toEqual([0,1,2,3])
 answers[2].resolve({ok:true,seq:3});answers[3].resolve({ok:true,seq:4});await flush();expect(box.pendingCount).toBe(0);box.dispose()
})
it.each(['connection','mutable','fault']as const)('never revives retained predecessor proof after %s change',async change=>{
 let lineage=scope();const sent:number[]=[],answers=Array.from({length:4},()=>defer<SendResult>()),deletes=[defer<void>(),defer<void>()],memory=createInMemoryOutboxStorage()
 const box=new Outbox({roomId:'room',storage:{...memory,delete:async id=>{const n=Number(id.slice(1));if(n<2)await deletes[n].promise;await memory.delete(id)}},getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);emitted?.();return answers[n].promise}})
 for(let n=0;n<4;n++)await box.enqueue(frame(n))
 answers[0].resolve(change==='fault'?{ok:false,reason:'invalid_operation'}:{ok:true,seq:1});answers[1].resolve({ok:true,seq:2});await flush()
 if(change==='connection')lineage={...lineage,connectionId:'next-connection'}
 if(change==='mutable')lineage.connectionId='mutated-connection'
 deletes[0].resolve();deletes[1].resolve();await flush();expect(sent).toEqual([0,1,2])
 answers[2].resolve({ok:true,seq:3});await flush();expect(sent).toEqual([0,1,2,3]);answers[3].resolve({ok:true,seq:4});await flush();box.dispose()
})

it('does not restore successor provenance from a late emit notification after a permanent fault',async()=>{
 const lineage=scope(),sent:number[]=[],answers=Array.from({length:4},()=>defer<SendResult>());let emitOne:(()=>void)|undefined
 const box=new Outbox({roomId:'room',storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);if(n===1)emitOne=emitted;else emitted?.();return answers[n].promise}})
 for(let n=0;n<4;n++)await box.enqueue(frame(n));answers[0].resolve({ok:false,reason:'invalid_operation'});await flush();emitOne?.();answers[1].resolve({ok:true,seq:2});await flush()
 expect(sent).toEqual([0,1,2]);answers[2].resolve({ok:true,seq:3});await flush();expect(sent).toEqual([0,1,2,3]);answers[3].resolve({ok:true,seq:4});await flush();box.dispose()
})
