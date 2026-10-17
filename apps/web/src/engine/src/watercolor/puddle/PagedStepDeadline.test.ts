import {it,expect,vi} from 'vitest'
import {createPagedPuddleTarget} from './PagedPuddleTarget'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {MockGL} from '../../../testing/mockGL'
for(const budget of [undefined,0,-1,NaN,Infinity,8])it('checks optional deadline after each unpreemptible generator next (budget='+budget+')',()=>{
 let time=0,steps=0;const clock=vi.spyOn(performance,'now').mockImplementation(()=>time),gl=new MockGL() as unknown as WebGLRenderingContext,owned:AccumulationBuffer[]=[],make=(w:number,h:number,f:any='nearest')=>{const b=new AccumulationBuffer(gl,w,h,f);owned.push(b);return b}
 const original=make(8,8),entry={original,coverage:make(8,8),inkLoad:make(8,8),inkColor:make(8,8),solventLoad:make(8,8)},source={gesture:'g',finishContext:{},foreignSources:null,peek:()=>entry},target={allResident:()=>[{originX:0,originY:0,buffer:original}]},barrier=vi.fn(()=>({defer:true} as const))
 const solver=createPagedPuddleTarget({gl,pool:{},passes:{}} as any,{width:8,height:8},make,{cooperativeCapture:true,stepBudgetMs:budget,sourceCaptured:barrier,captureStep:()=>{steps++;time+=9}})
 try{solver.resetFromScratch(source as any,target as any,1);solver.step(4);expect(steps).toBe(budget===8?1:4);expect(barrier).not.toHaveBeenCalled();expect(solver.state.done).toBe(false);solver.cancel();expect(solver.state.done).toBe(true)}finally{solver.destroy();for(const b of owned)b.destroy();clock.mockRestore()}
})
