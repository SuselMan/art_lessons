import { afterEach, expect, it, vi } from 'vitest'
import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { WatercolorSettleQueue, type WatercolorSettleJob } from './WatercolorSettleQueue'
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
function setup(enabled=true) {
 let clock=100,drawing=false,live=true;const frames=new Map<number,FrameRequestCallback>();let serial=0
 vi.spyOn(performance,'now').mockImplementation(()=>clock)
 vi.stubGlobal('requestAnimationFrame',(f:FrameRequestCallback)=>{frames.set(++serial,f);return serial})
 vi.stubGlobal('cancelAnimationFrame',(n:number)=>frames.delete(n))
 const events:number[]=[],abort=vi.fn(),sync=vi.fn(()=>{clock+=1})
 let job: WatercolorSettleJob
 const q: WatercolorSettleQueue=new WatercolorSettleQueue({beforeStart(){},perf:()=>({settleStart:0,settleOps:0,settleMs:0}),isDrawing:()=>drawing,backlogSize:()=>0,backlogMax:()=>4,syncGpu:sync,noteActivity(){},scheduleFieldRelease(){},joinedSuccessorBudget:j=>j===job?{isAlive:()=>live,abort}:null})
 q.joinedSuccessorBudgetEnabled=enabled
 const scratch={live:true} as RibbonStrokeScratch
 q.start(scratch,Array.from({length:12},(_,i)=>()=>events.push(i)),()=>events.push(99));job=q.current!
 return{q,job,events,abort,sync,frames,setDrawing:(x:boolean)=>drawing=x,setLive:(x:boolean)=>live=x,addTime:(x:number)=>clock+=x}
}
it('default OFF and unknown job keep one original unit without GPU sync',()=>{
 for(const enabled of [false,true]){const f=setup(enabled);if(enabled)f.setLive(false);f.q['tick']();expect(f.events).toEqual([0,1]);expect(f.sync).not.toHaveBeenCalled()}
 expect(new WatercolorSettleQueue({beforeStart(){},perf:()=>({settleStart:0,settleOps:0,settleMs:0}),isDrawing:()=>false,backlogSize:()=>0,backlogMax:()=>4,noteActivity(){},scheduleFieldRelease(){}}).joinedSuccessorBudgetEnabled).toBe(false)
})
it('advances at most four old units in exact order with synchronized 4 ms accounting',()=>{
 const f=setup();f.q['tick']();expect(f.events).toEqual([0,1,2,3,4]);expect(f.sync).toHaveBeenCalledTimes(4);expect(f.job.next).toBe(5)
})
it('stops after one indivisible expensive synced unit, without pretending a hard budget',()=>{
 const f=setup();f.sync.mockImplementation(()=>f.addTime(9));f.q['tick']();expect(f.events).toEqual([0,1]);expect(f.sync).toHaveBeenCalledOnce()
})
it('never accelerates active input or a late tick and stops when input starts between units',()=>{
 const f=setup();f.setDrawing(true);f.q['tick']();expect(f.sync).not.toHaveBeenCalled();f.setDrawing(false);f.addTime(30);f.q['tick']();expect(f.sync).not.toHaveBeenCalled()
 const g=setup();g.sync.mockImplementation(()=>g.setDrawing(true));g.q['tick']();expect(g.events).toEqual([0,1]);expect(g.sync).toHaveBeenCalledOnce()
})
it('does not advance natural successor beyond its existing initial start operation',()=>{
 const f=setup();f.job.next=11;f.job.complete=()=>{f.q.start(f.job.scratch,[()=>f.events.push(100),()=>f.events.push(101)],()=>{})};f.q['tick']();expect(f.events).toEqual([0,11,100]);expect(f.sync).toHaveBeenCalledOnce();expect(f.q.current).not.toBe(f.job);expect(f.q.current?.next).toBe(1)
})
it('rechecks owner epoch between units without touching the normal canonical model',()=>{
 const f=setup();f.sync.mockImplementation(()=>f.setLive(false));f.q['tick']();expect(f.events).toEqual([0,1]);expect(f.sync).toHaveBeenCalledOnce();expect(f.q.current).toBe(f.job)
})
it('routes even thrown null sync error through owned failure guard and preserves the thrown value',()=>{
 const f=setup();f.sync.mockImplementation(()=>{throw null});let caught=false;try{f.q['tick']()}catch(e){caught=true;expect(e).toBeNull()}expect(caught).toBe(true);expect(f.abort).toHaveBeenCalledExactlyOnceWith(null)
})
it('has no callback or sync activity with no current job',()=>{const f=setup();f.q.cancel();f.q['tick']();expect(f.sync).not.toHaveBeenCalled();expect(f.abort).not.toHaveBeenCalled()})
