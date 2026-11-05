import {expect,it,vi} from 'vitest'
import {CanonicalWashLayerCoordinator} from './CanonicalWashLayerCoordinator'
function fixture(count=12,cost=0,complete=true){
 const entry={id:0},queue=Array.from({length:count},()=>entry),state={now:0}
 const engine=Object.create(CanonicalWashLayerCoordinator.prototype) as {
  queue:{id:number}[];previewLane:{id:number}|undefined;previewBoundaryReady:boolean
  advanceEntry:(entry:{id:number},index:number,start:number)=>boolean;advanceMixedRaw:(start:number)=>void
 }
 engine.queue=queue;engine.previewLane=queue[0];engine.previewBoundaryReady=false
 engine.advanceEntry=vi.fn((entry,index,start)=>{expect(start).toBe(0);expect(queue[index]).toBe(entry);state.now+=cost;if(complete)queue.splice(index,1);return complete})
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>state.now)
 return{engine,state,clock}
}
it('drains at most eight completed frames under one outer budget even when the clock does not advance',()=>{
 const f=fixture();try{f.engine.advanceMixedRaw(0);expect(f.engine.queue).toHaveLength(4);expect(f.engine.advanceEntry).toHaveBeenCalledTimes(8);expect(f.engine.previewLane).toBeUndefined();expect(f.engine.previewBoundaryReady).toBe(true)}finally{f.clock.mockRestore()}
})
it('does not start another frame after the same four millisecond budget expires',()=>{
 const f=fixture(12,2);try{f.engine.advanceMixedRaw(0);expect(f.engine.advanceEntry).toHaveBeenCalledTimes(2);expect(f.engine.queue).toHaveLength(10)}finally{f.clock.mockRestore()}
})
it('retains the exact partial frame and never skips ahead to a later input',()=>{
 const f=fixture(12,0,false);try{const selected=f.engine.previewLane;f.engine.advanceMixedRaw(0);expect(f.engine.advanceEntry).toHaveBeenCalledOnce();expect(f.engine.previewLane).toBe(selected);expect(f.engine.queue).toHaveLength(12)}finally{f.clock.mockRestore()}
})

it('preserves the first-publication boundary between different gestures',()=>{
 const f=fixture();try{f.engine.queue[1]={id:1};f.engine.advanceMixedRaw(0);expect(f.engine.advanceEntry).toHaveBeenCalledOnce();expect(f.engine.queue).toHaveLength(11);expect(f.engine.previewLane).toBeUndefined()}finally{f.clock.mockRestore()}
})
