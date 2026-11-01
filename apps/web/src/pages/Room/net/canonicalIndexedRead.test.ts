import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G} from '@grafetto/shared'
import {expect,it,vi} from 'vitest'
import {indexedFrame,indexedSocketFixture} from '../../../engine/testing/canonicalIndexedReadFixture'
it('issues original inputs only after the actual open and keeps their parent alive after page release',async()=>{
 const f=indexedSocketFixture(),read=await f.open()
 expect(f.requests.map(r=>r.event)).toEqual(['canonical_history_stream_open'])
 const page=await read.nextPage(),input=page.inputs()[0]
 const proof=await read.rootEvidence(input)
 expect(proof.assertCurrent(proof,input).first.operation.id).toBe(input.operation.id)
 page.release();expect(()=>page.inputs()).toThrow()
 expect(()=>input.delivery.assertCurrent(input)).not.toThrow()
 proof.release();expect(()=>proof.assertCurrent(proof,input)).toThrow()
 const terminal=await read.nextPage(),cut=read.finish(terminal)
 terminal.release();expect(()=>cut.assertCurrent(cut)).not.toThrow()
 const reopened=await read.lifetime.reopen(cut)
 expect(reopened.lifetime).toBe(read.lifetime)
 expect(()=>read.assertCurrent(read)).toThrow()
 expect(()=>cut.assertCurrent(cut)).not.toThrow()
 expect(()=>input.delivery.assertCurrent(input)).not.toThrow()
 read.cancel();expect(()=>reopened.assertCurrent(reopened)).not.toThrow()
 reopened.cancel()
})
it('rejects copies of page, delivery, terminal and accepted cut proofs',async()=>{
 const f=indexedSocketFixture(),read=await f.open(),page=await read.nextPage(),input=page.inputs()[0]
 expect(()=>page.inputs.call({...page})).toThrow()
 expect(()=>input.delivery.assertCurrent({...input})).toThrow()
 expect(()=>input.delivery.assertCurrent.call({...input.delivery},input)).toThrow()
 page.release();const terminal=await read.nextPage()
 expect(()=>read.finish({...terminal})).toThrow()
 const cut=read.finish(terminal);terminal.release()
 await expect(read.lifetime.reopen({...cut})).rejects.toThrow()
 expect(()=>cut.assertCurrent.call({...cut},cut)).toThrow()
})
it('requires an actual empty terminal query even for an empty room',async()=>{
 const f=indexedSocketFixture([]),read=await f.open()
 expect(f.requests).toHaveLength(1)
 const terminal=await read.nextPage()
 expect(terminal.inputs()).toEqual([])
 expect(read.finish(terminal).throughSeq).toBe(0)
 expect(f.requests.map(r=>r.event)).toEqual(['canonical_history_stream_open','canonical_history_stream_next'])
 terminal.release()
})
it('does not treat a page boundary as END or keep an old cursor current after reopen',async()=>{
 const f=indexedSocketFixture([indexedFrame(1,'stroke',false),indexedFrame(2,'stroke',true,1)]),read=await f.open()
 const first=await read.nextPage(),input=first.inputs()[0],proof=await read.rootEvidence(input)
 expect(proof.assertCurrent(proof,input).terminal?.operation.id).toBe('frame2')
 proof.release();first.release()
 const second=await read.nextPage();expect(second.inputs()[0].operation).toMatchObject({frame:{frameOrdinal:1}});second.release()
 const terminal=await read.nextPage(),cut=read.finish(terminal);terminal.release()
 const reopened=await read.lifetime.reopen(cut);expect(reopened.throughSeq).toBe(2)
 reopened.cancel();expect(()=>cut.assertCurrent(cut)).not.toThrow()
})
it('has one outstanding request and no queued second page',async()=>{
 const f=indexedSocketFixture(),read=await f.open(),previous=f.handlers.canonical_history_stream_next
 let resolve:(value:unknown)=>void=()=>{}
 f.handlers.canonical_history_stream_next=body=>new Promise(r=>{resolve=()=>r(previous(body))})
 const pending=read.nextPage()
 await expect(read.nextPage()).rejects.toThrow()
 expect(f.requests.filter(r=>r.event==='canonical_history_stream_next')).toHaveLength(1)
 resolve(undefined);const page=await pending;page.release();read.cancel()
})
it('rejects a response after the actual connection lifetime changes',async()=>{
 const f=indexedSocketFixture(),read=await f.open(),page=await read.nextPage(),input=page.inputs()[0]
 page.release();f.setCurrent(false)
 expect(()=>input.delivery.assertCurrent(input)).toThrow()
 await expect(read.nextPage()).rejects.toThrow()
 expect(f.requests.filter(r=>r.event==='canonical_history_stream_next')).toHaveLength(1)
})
it('does not mint an origin from a copied policy or mismatched open response',async()=>{
 const f=indexedSocketFixture(),old=f.handlers.canonical_history_stream_open
 f.handlers.canonical_history_stream_open=async body=>{
  const result=await old(body) as {value:Record<string,unknown>}
  return {ok:true,value:{...result.value,offerId:'foreign'}}
 }
 await expect(f.open()).rejects.toThrow()
 expect(f.requests).toHaveLength(1)
})

it('cancels a finite in-flight job after it settles without queuing another read',async()=>{
 const f=indexedSocketFixture(),read=await f.open(),previous=f.handlers.canonical_history_stream_next
 let resolve:()=>void=()=>{}
 f.handlers.canonical_history_stream_next=body=>new Promise(r=>{resolve=()=>r(previous(body))})
 const pending=read.nextPage();read.cancel()
 expect(f.requests.filter(r=>r.event==='canonical_history_stream_cancel')).toHaveLength(0)
 resolve();await expect(pending).rejects.toThrow()
 expect(f.requests.filter(r=>r.event==='canonical_history_stream_cancel')).toHaveLength(1)
 expect(f.requests.filter(r=>r.event==='canonical_history_stream_next')).toHaveLength(1)
})
it('follows bounded originals after the actual completed parent while keeping its adopted input current',async()=>{
 const operations=[indexedFrame()],f=indexedSocketFixture(operations,64),read=await f.open(),page=await read.nextPage(),first=page.inputs()[0]
 page.release();const terminal=await read.nextPage(),cut=read.finish(terminal);terminal.release()
 operations.push(...Array.from({length:100},(_,i)=>indexedFrame(i+2,'later'+i)))
 const follow=await read.lifetime.follow(cut)
 expect(follow.kind).toBe('follow');expect(follow.floor).toBe(1);expect(follow.throughSeq).toBe(65);expect(follow.latestObservedSeq).toBe(101)
 const batch=await follow.nextPage();expect(batch.inputs()).toHaveLength(64);batch.release()
 const end=await follow.nextPage(),next=follow.finish(end);end.release()
 expect(next.operationCount).toBe(65)
 expect(()=>first.delivery.assertCurrent(first)).not.toThrow()
 expect(()=>cut.assertCurrent(cut)).not.toThrow()
 const rest=await follow.lifetime.follow(next)
 expect(rest.floor).toBe(65);expect(rest.throughSeq).toBe(101);rest.cancel()
})

it('retries a cancelled follow from the same actually completed parent without replaying its history',async()=>{
 const operations=[indexedFrame()],f=indexedSocketFixture(operations),read=await f.open()
 const page=await read.nextPage(),first=page.inputs()[0];page.release()
 const terminal=await read.nextPage(),cut=read.finish(terminal);terminal.release()
 operations.push(indexedFrame(2,'second'))
 const cancelled=await read.lifetime.follow(cut)
 await cancelled.cancel()
 const retry=await read.lifetime.follow(cut)
 expect(retry.floor).toBe(1);expect(retry.throughSeq).toBe(2)
 const requests=f.requests.filter(request=>request.event==='canonical_history_stream_reopen')
 expect(requests.map(request=>request.body.streamId)).toEqual(['read0','read0'])
 const next=await retry.nextPage();expect(next.inputs().map(input=>input.operation.id)).toEqual(['frame2']);next.release()
 const end=await retry.nextPage(),accepted=retry.finish(end);end.release()
 expect(accepted.throughSeq).toBe(2)
 expect(()=>first.delivery.assertCurrent(first)).not.toThrow()
 expect(()=>cut.assertCurrent(cut)).not.toThrow()
})

it('keeps finite cancellation pending until the actual delayed cancel ACK frees the issuer',async()=>{
 const operations=[indexedFrame()],f=indexedSocketFixture(operations),read=await f.open()
 const page=await read.nextPage();page.release()
 const terminal=await read.nextPage(),cut=read.finish(terminal);terminal.release()
 operations.push(indexedFrame(2,'second'))
 const candidate=await read.lifetime.follow(cut),previous=f.handlers.canonical_history_stream_cancel
 let complete:()=>void=()=>{},settled=false
 f.handlers.canonical_history_stream_cancel=body=>new Promise(resolve=>{complete=()=>resolve(previous(body))})
 const cleanup=Promise.resolve(candidate.cancel()).then(()=>{settled=true})
 await Promise.resolve()
 expect(settled).toBe(false)
 expect(f.requests.filter(request=>request.event==='canonical_history_stream_cancel')).toHaveLength(1)
 complete();await cleanup
 expect(settled).toBe(true)
 const retry=await read.lifetime.follow(cut)
 expect(retry.floor).toBe(1)
 f.handlers.canonical_history_stream_cancel=previous
 await retry.cancel()
})

it('selects the completed parent after a cancelled recovery export even without newer hints',async()=>{
 const f=indexedSocketFixture(),read=await f.open(),page=await read.nextPage();page.release()
 const terminal=await read.nextPage(),cut=read.finish(terminal);terminal.release()
 const exportRead=await read.lifetime.reopen(cut)
 await exportRead.cancel()
 expect(await read.lifetime.selectHistory(cut,'undo')).toBeNull()
 const selects=f.requests.filter(request=>request.event==='canonical_history_stream_select')
 expect(selects).toHaveLength(1);expect(selects[0].body.streamId).toBe('read0')
 expect(f.requests.filter(request=>request.event==='canonical_history_stream_reopen')).toHaveLength(1)
 expect(()=>cut.assertCurrent(cut)).not.toThrow()
})

// Actual controlled socket ACKs mint the origin; no direct read/grant factory.
function texturePolicyFixture(){
 const f=indexedSocketFixture([])
 Object.assign(f.offer,{authorRasterProfile:G,authorPrimaryTextureSource:'pressure-identity-subtract-v3'});Reflect.set(f.offer.scope,'allowedRasterProfiles',[G])
 for(const event of ['canonical_history_stream_open','canonical_history_stream_reopen']){
  const previous=f.handlers[event]
  f.handlers[event]=async body=>{const response=await previous(body) as {ok:true;value:object};return {...response,value:{...response.value,authorPrimaryTextureSource:'pressure-identity-subtract-v3'}}}
 }
 return f
}
it('captures author policy on actual original/read/cut and keeps it stable through recovery and FOLLOW',async()=>{
 const f=texturePolicyFixture(),read=await f.open(),terminal=await read.nextPage(),cut=read.finish(terminal);terminal.release()
 expect(read.authorPrimaryTextureSource).toBe('pressure-identity-subtract-v3');expect(read.lifetime.authorPrimaryTextureSource).toBe(read.authorPrimaryTextureSource);expect(cut.authorPrimaryTextureSource).toBe(read.authorPrimaryTextureSource)
 const recovered=await read.lifetime.reopen(cut),end=await recovered.nextPage(),next=recovered.finish(end);end.release()
 expect(recovered.authorPrimaryTextureSource).toBe(read.authorPrimaryTextureSource)
 const follow=await read.lifetime.follow(next);expect(follow.authorPrimaryTextureSource).toBe(read.authorPrimaryTextureSource);await follow.cancel()
 f.setCurrent(false);expect(()=>read.lifetime.assertCurrent()).toThrow()
 const fresh=indexedSocketFixture([]),off=await fresh.open();expect(off.lifetime.authorPrimaryTextureSource).toBeUndefined();await off.cancel()
})
it.each(['open','recovery','follow']as const)('rejects author policy mismatch during actual %s',async mode=>{
 const f=texturePolicyFixture(),event=mode==='open'?'canonical_history_stream_open':'canonical_history_stream_reopen'
 const mismatch=()=>{const previous=f.handlers[event];f.handlers[event]=async body=>{const response=await previous(body)as {ok:true;value:Record<string,unknown>};const value={...response.value};delete value.authorPrimaryTextureSource;return{...response,value}}}
 if(mode==='open'){mismatch();await expect(f.open()).rejects.toThrow();return}
 const read=await f.open(),end=await read.nextPage(),cut=read.finish(end);end.release();mismatch()
 await expect(mode==='follow'?read.lifetime.follow(cut):read.lifetime.reopen(cut)).rejects.toThrow()
 expect(()=>cut.assertCurrent(cut)).not.toThrow()
})

it('admits two genuine socket origins after transient validation contention without issuing an early read',async()=>{
 const a=indexedSocketFixture([]),b=indexedSocketFixture([]),openA=a.handlers.canonical_history_stream_open,openB=b.handlers.canonical_history_stream_open
 let release!:()=>void,held=true
 a.handlers.canonical_history_stream_open=async body=>{await new Promise<void>(r=>{release=r});held=false;return openA(body)}
 b.handlers.canonical_history_stream_open=body=>held?{ok:false,reason:'read_busy'}:openB(body)
 const first=a.open(),second=b.open();let admitted=false;void second.then(()=>{admitted=true})
 try{await vi.waitFor(()=>expect(b.requests.length).toBeGreaterThan(1));expect(admitted).toBe(false);expect(b.requests.every(r=>r.event==='canonical_history_stream_open')).toBe(true);const bodies=b.requests.map(r=>r.body);expect(bodies.every(body=>body===bodies[0])).toBe(true);release();const reads=await Promise.all([first,second]);for(const read of reads){const end=await read.nextPage();expect(read.finish(end).throughSeq).toBe(0);end.release();await read.cancel()}expect(b.requests.filter(r=>r.event==='canonical_history_stream_open').every(r=>r.body===bodies[0])).toBe(true)}finally{release?.();a.setCurrent(false);b.setCurrent(false)}
})
it.each(['recovery','follow'] as const)('keeps one immutable %s request and published parent while busy; no queued duplicate',async mode=>{
 const f=indexedSocketFixture([]),read=await f.open(),end=await read.nextPage(),cut=read.finish(end);end.release();const old=f.handlers.canonical_history_stream_reopen;let refused=0
 f.handlers.canonical_history_stream_reopen=body=>refused++<2?{ok:false,reason:'read_busy'}:old(body)
 const pending=mode==='follow'?read.lifetime.follow(cut):read.lifetime.reopen(cut)
 await expect(read.lifetime.follow(cut)).rejects.toThrow();const next=await pending;expect(next.lifetime).toBe(read.lifetime);expect(()=>cut.assertCurrent(cut)).not.toThrow()
 const requests=f.requests.filter(r=>r.event==='canonical_history_stream_reopen');expect(requests).toHaveLength(3);expect(requests.every(r=>r.body===requests[0].body)).toBe(true);if(mode==='follow')expect(typeof requests[0].body.requestId).toBe('string');await next.cancel()
})
it('stops a busy original OPEN after current revocation, without another emit or leaked timer',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{const f=indexedSocketFixture([]);f.handlers.canonical_history_stream_open=()=>({ok:false,reason:'read_busy'});const outcome=f.open().then(()=>null,e=>e);await vi.advanceTimersByTimeAsync(0);expect(f.requests).toHaveLength(1);f.setCurrent(false);await vi.advanceTimersByTimeAsync(25);expect(await outcome).toBeInstanceOf(Error);expect(f.requests).toHaveLength(1);expect(vi.getTimerCount()).toBe(0)}finally{vi.useRealTimers()}
})
it('uses the original150s total deadline including busy waits and shrinking actual ACK timeouts',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{const f=indexedSocketFixture([]),timeout=vi.spyOn(f.socket,'timeout');f.handlers.canonical_history_stream_open=()=>({ok:false,reason:'read_busy'});const outcome=f.open().then(()=>null,e=>e);await vi.advanceTimersByTimeAsync(150000);expect(await outcome).toBeInstanceOf(Error);expect(f.requests.length).toBeGreaterThan(2);expect(f.requests.length).toBeLessThan(700);expect(timeout.mock.calls[0][0]).toBe(150000);expect(timeout.mock.calls.at(-1)![0]).toBeLessThan(250);expect(vi.getTimerCount()).toBe(0)}finally{vi.useRealTimers()}
})
it('refuses a positive OPEN ACK arriving after the same deadline, without minting a read',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{const f=indexedSocketFixture([]),old=f.handlers.canonical_history_stream_open;let respond!:()=>void;f.handlers.canonical_history_stream_open=body=>new Promise(r=>{respond=()=>r(old(body))});const outcome=f.open().then(()=>null,e=>e);await vi.advanceTimersByTimeAsync(150001);respond();expect(await outcome).toBeInstanceOf(Error);expect(f.requests).toHaveLength(1);expect(vi.getTimerCount()).toBe(0)}finally{vi.useRealTimers()}
})
it.each(['stale_read','not_joined','canonical_repair_required','invalid_operation','extra','accessor'] as const)('never reschedules a non-exact busy ACK (%s)',async reason=>{
 const f=indexedSocketFixture([]);let calls=0
 f.handlers.canonical_history_stream_open=()=>reason==='accessor'?Object.defineProperty({ok:false},'reason',{enumerable:true,get(){calls++;return'read_busy'}}):reason==='extra'?{ok:false,reason:'read_busy',extra:true}:{ok:false,reason}
 await expect(f.open()).rejects.toThrow();expect(f.requests).toHaveLength(1);expect(calls).toBe(0)
})
it('never retries a busy nextPage ACK or turns cancellation/selection into an admission queue',async()=>{
 const f=indexedSocketFixture([]),read=await f.open();f.handlers.canonical_history_stream_next=()=>({ok:false,reason:'read_busy'});await expect(read.nextPage()).rejects.toThrow();expect(f.requests.filter(r=>r.event==='canonical_history_stream_next')).toHaveLength(1);await read.cancel()
})

it.each(['recovery','follow'] as const)('revokes a pending %s backoff on disconnect or original-room replacement without another RPC',async mode=>{
 for(const disconnect of [false,true]){
  const f=indexedSocketFixture([]),read=await f.open(),end=await read.nextPage(),cut=read.finish(end);end.release()
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
  try{f.handlers.canonical_history_stream_reopen=()=>({ok:false,reason:'read_busy'});const outcome=(mode==='follow'?read.lifetime.follow(cut):read.lifetime.reopen(cut)).then(()=>null,e=>e);await vi.advanceTimersByTimeAsync(0);expect(f.requests.filter(r=>r.event==='canonical_history_stream_reopen')).toHaveLength(1);if(disconnect)Reflect.set(f.socket,'connected',false);else f.setCurrent(false);await vi.advanceTimersByTimeAsync(25);expect(await outcome).toBeInstanceOf(Error);expect(f.requests.filter(r=>r.event==='canonical_history_stream_reopen')).toHaveLength(1);expect(vi.getTimerCount()).toBe(0)}finally{vi.useRealTimers()}
 }
})


function pressurePolicyFixture(){const f=indexedSocketFixture([]);Object.assign(f.offer,{authorRasterProfile:G,authorPressureTexturedSource:'pressure-default-auto-texture-v5'});Reflect.set(f.offer.scope,'allowedRasterProfiles',[G]);for(const event of ['canonical_history_stream_open','canonical_history_stream_reopen']){const old=f.handlers[event];f.handlers[event]=async body=>{const reply=await old(body)as{ok:true;value:object};return{...reply,value:{...reply.value,authorPressureTexturedSource:'pressure-default-auto-texture-v5'}}}}return f}
it('holds exact original author5 through actual OPEN/cut/recovery/FOLLOW without granting4',async()=>{const f=pressurePolicyFixture(),r=await f.open(),p=await r.nextPage(),cut=r.finish(p);p.release();expect(r.authorPressureTexturedSource).toBe('pressure-default-auto-texture-v5');expect(r.lifetime.authorPressureTexturedSource).toBe(r.authorPressureTexturedSource);expect(cut.authorPressureTexturedSource).toBe(r.authorPressureTexturedSource);expect(r.authorTexturedSource).toBeUndefined();const a=await r.lifetime.reopen(cut),end=await a.nextPage(),next=a.finish(end);end.release();const follow=await r.lifetime.follow(next);expect(follow.authorPressureTexturedSource).toBe(r.authorPressureTexturedSource);await follow.cancel();f.setCurrent(false);expect(()=>r.lifetime.assertCurrent()).toThrow()})
it.each(['open','recovery','follow']as const)('rejects changed author5 during %s while old cut remains original',async mode=>{const f=pressurePolicyFixture(),event=mode==='open'?'canonical_history_stream_open':'canonical_history_stream_reopen';const mismatch=()=>{const old=f.handlers[event];f.handlers[event]=async body=>{const reply=await old(body)as{ok:true;value:Record<string,unknown>},value={...reply.value};delete value.authorPressureTexturedSource;return{...reply,value}}};if(mode==='open'){mismatch();await expect(f.open()).rejects.toThrow();return}const r=await f.open(),end=await r.nextPage(),cut=r.finish(end);end.release();mismatch();await expect(mode==='follow'?r.lifetime.follow(cut):r.lifetime.reopen(cut)).rejects.toThrow();expect(()=>cut.assertCurrent(cut)).not.toThrow()})
