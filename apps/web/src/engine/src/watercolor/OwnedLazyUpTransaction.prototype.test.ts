import {expect,it,vi} from 'vitest'
import {WatercolorCanonicalFIFO} from './WatercolorCanonicalFIFO'
import {enqueueOwnedLazyUp,enqueueAfterOwnedUp} from '../../../../../../docs/qa/harness/728-gl-timing/OwnedLazyUpTransaction'
import {CanonicalWatercolorSettlePlan} from '../raster/CanonicalWatercolorSettlePlan'
import {traceFixture} from '../raster/CanonicalWatercolorSettlePlan.fixture'
function scheduler(){let id=0;const frames=new Map<number,()=>void>(),failed=vi.fn();const queue=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++id,cb);return id},unschedule:h=>{frames.delete(h)},changed:()=>{},failed});return{queue,failed,frames,tick(){const [id,cb]=frames.entries().next().value!;frames.delete(id);cb()},drain(){let limit=10000;while(frames.size&&limit--)this.tick();expect(limit).toBeGreaterThan(0)}}}
it('real FIFO preserves full ordered actual planner trace and queued nextsource/Undo/Dry until publication',async()=>{
 function run(queued:boolean){
  const f=traceFixture(false,true,true,true,true),plan=new CanonicalWatercolorSettlePlan(f.context);plan.lazyContacts=true
  let job:ReturnType<typeof plan.prepare>=null
  const capture=()=>{job=plan.prepare(f.scratch,[{buffer:f.tile,originX:0,originY:0,contentRect:null}],{minX:20,minY:20,maxX:44,maxY:44},.2,8,1,1,1,1,0,undefined,false,undefined,true)!;job.ops[0]()}
  const prepare=function*(){for(let i=1;i<job!.ops.length;i++){job!.ops[i]();yield 0}}
  const publish=()=>job!.finish(),release=()=>job!.dispose(),actions:string[]=[]
  if(!queued){capture();for(const _ of prepare())void _;publish();release();return {events:f.events,actions}}
  const beforeQueue=[...f.events]
  const s=scheduler(),status=enqueueOwnedLazyUp(s.queue,{generation:1,valid:g=>g===1,retain:()=>{},capture,prepare,publish,release})
  for(const name of ['next-source','Undo','Dry'])enqueueAfterOwnedUp(s.queue,()=>{expect(status.status).toBe('published');actions.push(name)},()=>actions.push('cancel'))
  expect(f.events).toEqual(beforeQueue);expect(actions).toEqual([])
  s.drain();expect(status.status).toBe('published');expect(s.failed).not.toHaveBeenCalled();return {events:f.events,actions}
 }
 const direct=run(false),queued=run(true);expect(queued.events).toEqual(direct.events);expect(queued.actions).toEqual(['next-source','Undo','Dry'])
})
it('retains exact generation and cancels stale/reentrant work without publish or duplicate release',()=>{
 for(const reentrant of [false,true]){const s=scheduler(),release=vi.fn(),publish=vi.fn();let generation=1
  const status=enqueueOwnedLazyUp(s.queue,{generation,retain:()=>{},valid:g=>g===generation,capture:()=>{if(reentrant)s.queue.cancel(true)},prepare:function*(){yield 0},publish,release})
  if(!reentrant)generation++
  s.drain();expect(publish).not.toHaveBeenCalled();expect(release).toHaveBeenCalledTimes(1);expect(status.status).not.toBe('published');expect(s.frames.size).toBe(0)
 }
})
it('preparation failure cancels retained successors and reports failure without a RAF loop',()=>{
 const s=scheduler(),release=vi.fn(),publish=vi.fn(),source=vi.fn(),cancel=vi.fn()
 const status=enqueueOwnedLazyUp(s.queue,{generation:1,retain:()=>{},valid:()=>true,capture:()=>{},prepare:function*(){yield 0;throw Error('prepare sentinel')},publish,release})
 enqueueAfterOwnedUp(s.queue,source,cancel);s.drain();expect(status.status).toBe('failed');expect(s.failed).toHaveBeenCalledOnce();expect(source).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();expect(publish).not.toHaveBeenCalled()
})
it('closes a paused owned generator on loss and handles cancellation during actual next reentrantly',()=>{
 for(const insideNext of [false,true]){
  const s=scheduler(),closed=vi.fn(),release=vi.fn(),publish=vi.fn()
  const status=enqueueOwnedLazyUp(s.queue,{generation:1,retain:()=>{},valid:()=>true,capture:()=>{},prepare:function*(){try{if(insideNext)s.queue.cancel(true);yield 0}finally{closed()}},publish,release})
  s.tick();if(!insideNext)s.queue.cancel(true)
  expect(closed).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();expect(publish).not.toHaveBeenCalled();expect(status.status).not.toBe('published');expect(s.frames.size).toBe(0)
 }
})
it('preserves material failure over teardown error and never admits successor after failed release',()=>{
 for(const materialFailure of [false,true]){
  const s=scheduler(),source=vi.fn(),cancel=vi.fn(),primary=Error('material'),teardown=Error('release')
  const status=enqueueOwnedLazyUp(s.queue,{generation:1,retain:()=>{},valid:()=>true,capture:()=>{},prepare:function*(){},publish:()=>{if(materialFailure)throw primary},release:()=>{throw teardown}})
  enqueueAfterOwnedUp(s.queue,source,cancel);s.drain();expect(status.status).toBe('failed');expect(status.error).toBe(materialFailure?primary:teardown);expect(status.releaseError).toBe(teardown);expect(source).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();expect(s.failed).toHaveBeenCalledOnce()
 }
})
it('schedule failure after push removes only its new retained admission, preserving the executing predecessor',()=>{
 let id=0,fail=false;const frames=new Map<number,()=>void>(),release=vi.fn(),capture=vi.fn(),events:string[]=[],failure=Error('schedule')
 const queue=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{if(fail){fail=false;throw failure}frames.set(++id,cb);return id},unschedule:h=>{frames.delete(h)},changed:()=>{},failed:()=>{throw Error('unexpected work error')}})
 queue.enqueue({execute:function*(){events.push('prior-start');fail=true;expect(()=>enqueueOwnedLazyUp(queue,{generation:1,retain:()=>events.push('retain-new'),valid:()=>true,capture,prepare:function*(){},publish:()=>{},release})).toThrow(failure);yield 0;events.push('prior-end')},cancel:()=>events.push('cancel-prior')})
 while(frames.size){const [h,cb]=frames.entries().next().value!;frames.delete(h);cb()}
 expect(events).toEqual(['prior-start','retain-new','prior-end']);expect(release).toHaveBeenCalledOnce();expect(capture).not.toHaveBeenCalled();expect(queue.pending).toBe(false)
})
it('exact cancellation refuses an executing request and never removes unrelated queued identity',()=>{
 const s=scheduler(),cancel=vi.fn();const request={execute:function*(){yield 0},cancel}
 s.queue.enqueue(request);s.tick();expect(s.queue.cancelUnstarted(request)).toBe(false);expect(s.queue.cancelUnstarted({execute:function*(){},cancel})).toBe(false);expect(cancel).not.toHaveBeenCalled();s.drain();expect(s.queue.pending).toBe(false)
})
it('synchronously started scheduling error preserves actual published outcome and does not double release',()=>{
 const error=Error('after-callback'),release=vi.fn(),publish=vi.fn()
 const queue=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{cb();throw error},unschedule:()=>{},changed:()=>{},failed:()=>{}})
 const result=enqueueOwnedLazyUp(queue,{generation:1,retain:()=>{},valid:()=>true,capture:()=>{},prepare:function*(){},publish,release})
 expect(result.status).toBe('published');expect(result.admissionError).toBe(error);expect(publish).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();expect(queue.pending).toBe(false)
})
