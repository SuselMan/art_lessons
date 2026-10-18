import {installNativeExpansion805,expansionRadius805} from './expansion'
import {runNativeDirectTimed} from '../native-mini-optimized805/native-direct-timed'
import {runNativeGpuTimedGoal805} from '../native-anatomy-805/gpu-group-goal'
export async function runExpansionCase805(engine:any,controller:any,withPaper:<T>(work:()=>T)=>T,arm:string,radius=24){
 if(!['original','smooth','noisy'].includes(arm))throw Error('Unknown expansion arm')
 const radiusPx=expansionRadius805(radius),entry=controller.diagnosticSource().entry
 // Audits are outside both the GPU query and the direct full-result wall interval.
 const before:Uint8Array=entry.inkColor.readPixels(),water:Uint8Array=entry.solventLoad?.readPixels()??new Uint8Array(before.length),foreign:Uint8Array=entry.foreignSolventLoad?.readPixels()??new Uint8Array(before.length)
 const candidate=arm==='original'?null:installNativeExpansion805(engine,controller,{noise:arm==='noisy',allWetMobile:false,radiusPx})
 try{
  const result=await runNativeGpuTimedGoal805({gl:engine.gl,controller,runDirect:()=>runNativeDirectTimed(engine,controller,withPaper),mode:'whole'})
  const inputSum=[0,0,0,0],outputSum=[0,0,0,0];let dryChangedPixels=0,wetChangedPixels=0,newPaintPixels=0
  for(let i=0;i<before.length;i+=4){let changed=false;for(let c=0;c<4;c++){inputSum[c]+=before[i+c]!;outputSum[c]+=result.output[i+c]!;if(before[i+c]!==result.output[i+c])changed=true}
   const wet=water[i+3]!+foreign[i+3]!>0;if(changed){if(wet)wetChangedPixels++;else dryChangedPixels++}
   if(wet&&before[i+3]===0&&result.output[i+3]!>0)newPaintPixels++
  }
  if(dryChangedPixels)throw Error('Expansion changed pixels outside initial water: '+dryChangedPixels)
  if(candidate&&(!candidate.stats.coreCalls||!candidate.stats.frontDraws))throw Error('Expansion candidate did not execute')
  return{...result,arm,config:candidate?.metadata??{id:'original',model:'front8-detail-flow-v4'},stats:candidate?{...candidate.stats}:null,audit:{dryChangedPixels,wetChangedPixels,newPaintPixels,inputSum,outputSum,channelRatios:inputSum.map((n,i)=>n?outputSum[i]!/n:null),qualification:'Native C channel sums are diagnostic, not an exact conserved-pigment ledger. New painted pixels use native C.a>0 within immutable initial solvent mask. All source readback and audit loops excluded from timings.'}}
 }finally{candidate?.restore()}
}
