import {describe,it,expect,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_MATERIAL_PROFILE,packCanonicalMaterial,type CanonicalStrokeOperation,type CanonicalStrokeCloseOperation,type StrokeOperation,type SendResult} from '@grafetto/shared'
import {Outbox} from './outbox'
import {createInMemoryOutboxStorage,type OutboxEntry} from './outboxStorage'
const ROOM='canonical-room'
const asset={id:'asset:'+'a'.repeat(64),size:1,x:0,y:0,width:1,height:1}
const materialPacked=packCanonicalMaterial({profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'between'},definitions:[],draws:[],fences:[]},{assets:[asset],primaryAsset:asset.id,budget:{workUnits:100,outputBytes:100,drawPixels:100},preflightDefinition:()=>({workUnits:1,outputBytes:4})})
const frame=(id:string,ordinal:number,strokeId='gesture',userId='author',layerId='layer'):CanonicalStrokeOperation=>({id,userId,layerId,type:'canonical_stroke',timestamp:0,frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:'brush:test@1',strokeId,frameOrdinal:ordinal,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked}})
const legacy=(id:string):StrokeOperation=>({type:'stroke',id,userId:'author',timestamp:0,layerId:'layer',tool:'pencil',preset:'HB',color:[0,0,0],dabs:[]})
const close=(id='close'):CanonicalStrokeCloseOperation=>({type:'canonical_stroke_close',id,userId:'teacher',targetUserId:'author',layerId:'layer',strokeId:'gesture',timestamp:0,disposition:'commitPartial',recordedNext:2,firstFrameOpId:'f0',lastFrameOpId:'f1'})
const stored=(op:OutboxEntry['op']):OutboxEntry=>({op,roomId:ROOM,attempts:0,nextRetryAt:0})
const deferred=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{promise,resolve}}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()}

describe('SAME Outbox canonical gesture heads',()=>{
 it('does not overtake a lower frame whose initial persist resolves later',async()=>{
  const memory=createInMemoryOutboxStorage(),put0=deferred<void>(),send0=deferred<SendResult>(),sent:string[]=[]
  const box=new Outbox({roomId:ROOM,storage:{...memory,put:async e=>{await memory.put(e);if(e.op.id==='f0')await put0.promise}},send:async op=>{sent.push(op.id);return op.id==='f0'?send0.promise:{ok:true,seq:2}}})
  const zero=box.enqueue(frame('f0',0));await box.enqueue(frame('f1',1));await flush();expect(sent).toEqual([])
  put0.resolve();await zero;await flush();expect(sent).toEqual(['f0'])
  send0.resolve({ok:true,seq:1});await flush();expect(sent).toEqual(['f0','f1']);box.dispose()
 })
 it('selects lowest ordinal from reverse storage order and close waits for target author frames',async()=>{
  const storage=createInMemoryOutboxStorage(),sent:string[]=[]
  for(const op of [close(),frame('f1',1),frame('f0',0)])await storage.put(stored(op))
  const box=new Outbox({roomId:ROOM,storage,send:async op=>{sent.push(op.id);return{ok:true,seq:sent.length}}})
  await box.hydrate();await box.resendAll();await flush();expect(sent).toEqual(['f0','f1','close']);box.dispose()
 })
 it('keeps higher frames behind a transient head backoff without blocking legacy or another gesture',async()=>{
  const storage=createInMemoryOutboxStorage(),scheduled:(()=>void)[]=[],sent:string[]=[];let first=true
  const box=new Outbox({roomId:ROOM,storage,schedule:fn=>scheduled.push(fn),send:async op=>{sent.push(op.id);if(op.id==='f0'&&first){first=false;return{ok:false,reason:'server_error'}}return{ok:true,seq:sent.length}}})
  await box.enqueue(frame('f0',0));await flush();await box.enqueue(frame('f1',1));await box.enqueue(legacy('legacy'));await box.enqueue(frame('other',0,'other'));await flush()
  expect(sent).toEqual(['f0','legacy','other']);scheduled.shift()!();await flush();expect(sent).toEqual(['f0','legacy','other','f0','f1']);box.dispose()
 })
 it('never sends a higher ordinal while its head is stalled',async()=>{
  const scheduled:(()=>void)[]=[],sent:string[]=[],stalled=vi.fn(),box=new Outbox({roomId:ROOM,storage:createInMemoryOutboxStorage(),schedule:fn=>scheduled.push(fn),onStalled:stalled,send:async op=>{sent.push(op.id);if(op.id==='f0')throw Error('offline');return{ok:true,seq:1}}})
  await box.enqueue(frame('f0',0));await box.enqueue(frame('f1',1));await flush()
  for(let i=0;i<11;i++){scheduled.shift()!();await flush()}
  expect(stalled).toHaveBeenCalledTimes(1);await box.enqueue(legacy('legacy'));await flush();expect(sent.filter(id=>id==='f1')).toHaveLength(0);expect(sent.at(-1)).toBe('legacy');expect(box.pendingCount).toBe(2);box.dispose()
 })
 it('preserves MAX2 capacity for independent gestures while serializing each gesture',async()=>{
  const replies=new Map<string,ReturnType<typeof deferred<SendResult>>>(),sent:string[]=[]
  const box=new Outbox({roomId:ROOM,storage:createInMemoryOutboxStorage(),send:op=>{sent.push(op.id);const d=deferred<SendResult>();replies.set(op.id,d);return d.promise}})
  for(const op of [frame('a0',0,'a'),frame('a1',1,'a'),frame('b0',0,'b'),legacy('legacy')])await box.enqueue(op)
  expect(sent).toEqual(['a0','b0']);replies.get('a0')!.resolve({ok:true,seq:1});await flush();expect(sent).toEqual(['a0','b0','a1']);box.dispose()
 })
 it('prunes expired retry IDs from SAME waiting array after an accepted resend',async()=>{
  const scheduled:(()=>void)[]=[],box=new Outbox({roomId:ROOM,storage:createInMemoryOutboxStorage(),schedule:fn=>scheduled.push(fn),send:vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({ok:true,seq:1})})
  await box.enqueue(frame('head',0));await flush();expect(scheduled).toHaveLength(1)
  await box.resendAll();await flush();expect(box.pendingCount).toBe(0)
  for(let i=0;i<20;i++)scheduled[0]()
  expect(Reflect.get(box,'waiting')).toEqual([]);box.dispose()
 })
 it('namespaces identical stroke IDs by author and layer',async()=>{
  const sent:string[]=[],never=deferred<SendResult>(),box=new Outbox({roomId:ROOM,storage:createInMemoryOutboxStorage(),send:op=>{sent.push(op.id);return never.promise}})
  await box.enqueue(frame('author-a',0,'same','author-a'));await box.enqueue(frame('author-b',0,'same','author-b'))
  expect(sent).toEqual(['author-a','author-b']);box.dispose()
  const sentLayers:string[]=[],layers=new Outbox({roomId:ROOM,storage:createInMemoryOutboxStorage(),send:op=>{sentLayers.push(op.id);return never.promise}})
  await layers.enqueue(frame('layer-a',0,'same','author','layer-a'));await layers.enqueue(frame('layer-b',0,'same','author','layer-b'))
  expect(sentLayers).toEqual(['layer-a','layer-b']);layers.dispose()
 })
 it('removes a settled in-flight head from visible stalled counts after a newly discovered conflict',async()=>{
  const answer=deferred<SendResult>(),sent:string[]=[],stalled=vi.fn(),box=new Outbox({roomId:ROOM,storage:createInMemoryOutboxStorage(),onStalled:stalled,send:op=>{sent.push(op.id);return answer.promise}})
  await box.enqueue(frame('head',0));await box.enqueue(frame('duplicate',0));await flush()
  expect(sent).toEqual(['head']);expect(box.stalledCount).toBe(2)
  answer.resolve({ok:true,seq:1});await flush()
  expect(box.pendingCount).toBe(1);expect(box.stalledCount).toBe(1);expect(stalled).toHaveBeenCalledTimes(2);await box.whenIdle(100);box.dispose()
 })
 it('stalls ambiguous duplicate close metadata visibly instead of choosing a winner',async()=>{
  const storage=createInMemoryOutboxStorage(),send=vi.fn(async()=>({ok:true as const,seq:1})),stalled=vi.fn()
  await storage.put(stored(close('close-a')));await storage.put(stored(close('close-b')))
  const box=new Outbox({roomId:ROOM,storage,send,onStalled:stalled});await box.resendAll();await flush()
  expect(send).not.toHaveBeenCalled();expect(stalled).toHaveBeenCalledTimes(2);expect(box.stalledCount).toBe(2);expect(box.pendingCount).toBe(2);await box.whenIdle(100);box.dispose()
 })
 it('visibly stalls duplicate ordinals once, retains them, and still drains unrelated legacy',async()=>{
  const storage=createInMemoryOutboxStorage(),sent:string[]=[],stalled=vi.fn()
  for(const op of [frame('dup-a',0),frame('dup-b',0),frame('higher',1),legacy('legacy')])await storage.put(stored(op))
  const box=new Outbox({roomId:ROOM,storage,onStalled:stalled,send:async op=>{sent.push(op.id);return{ok:true,seq:1}}})
  await box.resendAll();await flush();expect(sent).toEqual(['legacy']);expect(box.pendingCount).toBe(3);expect(box.stalledCount).toBe(3);expect(stalled).toHaveBeenCalledTimes(3)
  await box.whenIdle(100);expect(await storage.getAll(ROOM)).toHaveLength(3);box.dispose()
 })
 it('parks malformed canonical order metadata without legacy fallback or accessor invocation',async()=>{
  const storage=createInMemoryOutboxStorage(),sent:string[]=[],stalled=vi.fn(),get=vi.fn(()=>0),bad=frame('bad',0)
  Object.defineProperty(bad.frame,'frameOrdinal',{get})
  const box=new Outbox({roomId:ROOM,storage,onStalled:stalled,send:async op=>{sent.push(op.id);return{ok:true,seq:1}}})
  await box.enqueue(bad);await box.enqueue(frame('higher',1));await box.enqueue(legacy('legacy'));await flush()
  expect(get).not.toHaveBeenCalled();expect(sent).toEqual(['legacy']);expect(stalled).toHaveBeenCalledTimes(2);expect(box.stalledCount).toBe(2);box.dispose()
 })
})
