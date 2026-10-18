import {installAnatomyCapture} from './capture'
import {createAnatomyTrace} from './event-model'
import {runNativeTimedGoal} from '../mini-worker/native-component-timed-goal'
import type {NativeMergeMapping} from '../mini-worker/native-component-merge'
/** Owned diagnostic only. No snapshot reads; same full-output algorithm and source guards. */
export async function runNativeAnatomyTrace(engine:any,controller:any,withPaper:<T>(work:()=>T)=>T,base:Uint8Array,mapping:NativeMergeMapping){
 const trace=createAnatomyTrace(),events:unknown[]=[],original=controller.diagnosticRunCore;let component=-1,callbackMs=0,coreStart=0;const coreWindows:{component:number;hostWallMs:number}[]=[]
 const hook=installAnatomyCapture(engine.gl,{select:()=>false,maxReadBytes:0,onSnapshot:()=>{},onEvent(e,ordinal){const t=performance.now();events.push({component,coreElapsedHostMs:t-coreStart,actualPerformanceNow:t,...trace.event(e,ordinal)});callbackMs+=performance.now()-t}})
 controller.diagnosticRunCore=function(...args:unknown[]){component++;coreStart=performance.now();try{return original.apply(this,args)}finally{coreWindows.push({component,hostWallMs:performance.now()-coreStart})}}
 try{const result=await runNativeTimedGoal(engine,controller,withPaper,base,mapping);return{...result,anatomyTrace:{events,coreWindows,callbackMs,readBytes:hook.readBytes,qualification:'Observer trace, no event snapshots. Full-output wall measurement includes callback overhead; separate observer-free baseline required.'}}}
 finally{controller.diagnosticRunCore=original;hook.dispose()}
}
