import {expect,it} from 'vitest'
import type {CanonicalStrokeOperation,Operation,SendResult} from '@grafetto/shared'
import {Outbox} from './outbox'
import {createInMemoryOutboxStorage} from './outboxStorage'
const frame=(n:number):CanonicalStrokeOperation=>({id:'f'+n,userId:'author',layerId:'layer',type:'canonical_stroke',timestamp:0,frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:'brush:test@1',strokeId:'stroke',frameOrdinal:n,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'not decoded by scheduling'}})
const defer=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve}}
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve()}
const scope=()=>({socket:{},connectionId:'connection',boardId:'room',originalRead:{}})

it('opts one contiguous live gesture into four actual emits and keeps its close behind all ACKs',async()=>{
 const lineage=scope(),sent:string[]=[],answers=Array.from({length:6},()=>defer<SendResult>())
 const close:Operation={type:'canonical_stroke_close',id:'close',userId:'author',targetUserId:'author',timestamp:0,layerId:'layer',strokeId:'stroke',disposition:'commitPartial',recordedNext:6,firstFrameOpId:'f0',lastFrameOpId:'f5'}
 const box=new Outbox({roomId:'room',canonicalPipelineWindow:4,storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{sent.push(op.id);emitted?.();return op.id==='close'?Promise.resolve({ok:true,seq:7}):answers[Number(op.id.slice(1))].promise}})
 try{
  for(let n=0;n<6;n++)await box.enqueue(frame(n));await box.enqueue(close)
  expect(sent).toEqual(['f0','f1','f2','f3'])
  answers[0].resolve({ok:true,seq:1});await flush();expect(sent).toEqual(['f0','f1','f2','f3','f4'])
  answers[1].resolve({ok:true,seq:2});await flush();expect(sent).toEqual(['f0','f1','f2','f3','f4','f5'])
  for(let n=2;n<6;n++)answers[n].resolve({ok:true,seq:n+1})
  await flush();expect(sent.at(-1)).toBe('close');expect(box.pendingCount).toBe(0)
 }finally{box.dispose()}
})

it('never treats a reserved slot or missing ordinal as proof for the expanded window',async()=>{
 const lineage=scope(),sent:number[]=[],first=defer<void>(),answer=defer<SendResult>()
 const box=new Outbox({roomId:'room',canonicalPipelineWindow:4,storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,send:async(op,emitted)=>{const n=Number(op.id.slice(1));if(n===0)await first.promise;sent.push(n);emitted?.();return answer.promise}})
 try{
  for(const n of[0,2,3,4])await box.enqueue(frame(n));expect(sent).toEqual([])
  first.resolve();await flush();expect(sent).toEqual([0])
  await box.enqueue(frame(1));await flush();expect(sent).toEqual([0,1,2,3])
 }finally{box.dispose();answer.resolve({ok:true,seq:1});await flush()}
})

it('retains two slots for legacy operations and mixed canonical gestures',async()=>{
 for(const kind of ['legacy','mixed'] as const){
  const lineage=scope(),sent:string[]=[],answer=defer<SendResult>()
  const box=new Outbox({roomId:'room',canonicalPipelineWindow:4,storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{sent.push(op.id);emitted?.();return answer.promise}})
  try{
   const ops:Operation[]=kind==='legacy'?Array.from({length:4},(_,n)=>({type:'layer_clear',id:'l'+n,userId:'author',timestamp:0,layerId:'layer'})):[0,1,2,3].map(n=>{const op=frame(Math.floor(n/2));return{...op,id:'m'+n,frame:{...op.frame,strokeId:n%2?'other':'stroke'}}})
   for(const op of ops)await box.enqueue(op);expect(sent).toEqual(kind==='legacy'?['l0','l1']:['m0','m1'])
  }finally{box.dispose();answer.resolve({ok:true,seq:1});await flush()}
 }
})

it('demotes the full gesture on a permanent fault before draining its unsent suffix serially',async()=>{
 const lineage=scope(),sent:number[]=[],answers=Array.from({length:6},()=>defer<SendResult>())
 const box=new Outbox({roomId:'room',canonicalPipelineWindow:4,storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);emitted?.();return answers[n].promise}})
 try{
  for(let n=0;n<6;n++)await box.enqueue(frame(n));expect(sent).toEqual([0,1,2,3])
  for(let n=0;n<3;n++){answers[n].resolve({ok:false,reason:'invalid_operation'});await flush();expect(sent).toEqual([0,1,2,3])}
  answers[3].resolve({ok:false,reason:'invalid_operation'});await flush();expect(sent).toEqual([0,1,2,3,4])
  answers[4].resolve({ok:false,reason:'invalid_operation'});await flush();expect(sent).toEqual([0,1,2,3,4,5])
  answers[5].resolve({ok:false,reason:'invalid_operation'});await flush();expect(box.pendingCount).toBe(0)
 }finally{box.dispose()}
})

it('does not reuse predecessor emission evidence after the connection changes',async()=>{
 let lineage=scope();const sent:number[]=[],answers=Array.from({length:6},()=>defer<SendResult>())
 const box=new Outbox({roomId:'room',canonicalPipelineWindow:4,storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>lineage,send:(op,emitted)=>{const n=Number(op.id.slice(1));sent.push(n);emitted?.();return answers[n].promise}})
 try{
  for(let n=0;n<6;n++)await box.enqueue(frame(n));expect(sent).toEqual([0,1,2,3]);lineage=scope()
  for(let n=0;n<3;n++){answers[n].resolve({ok:true,seq:n+1});await flush();expect(sent).toEqual([0,1,2,3])}
  answers[3].resolve({ok:true,seq:4});await flush();expect(sent).toEqual([0,1,2,3,4])
  answers[4].resolve({ok:true,seq:5});await flush();expect(sent).toEqual([0,1,2,3,4,5]);answers[5].resolve({ok:true,seq:6});await flush()
 }finally{box.dispose()}
})

it.each(['dispose','lineage'] as const)('revalidates ownership after a reentrant %s getter before reserving a third slot',async kind=>{
 let lineage=scope(),probes=0;const sent:number[]=[],answer=defer<SendResult>();let box:Outbox
 box=new Outbox({roomId:'room',canonicalPipelineWindow:4,storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>{
  if(sent.length===2&&++probes===2){if(kind==='dispose')box.dispose();else lineage=scope()}
  return lineage
 },send:(op,emitted)=>{sent.push(Number(op.id.slice(1)));emitted?.();return answer.promise}})
 try{
  for(let n=0;n<5;n++)await box.enqueue(frame(n))
  expect(sent).toEqual([0,1]);expect(probes).toBeGreaterThanOrEqual(2)
 }finally{box.dispose();answer.resolve({ok:true,seq:1});await flush()}
})
