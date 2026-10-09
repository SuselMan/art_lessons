import {captureSmallPairedDriver} from './CaptureSmallPairedDriver.mjs';
import {runCapturedPairedCandidate} from './RunCapturedPairedCandidate.mjs';
/** One synchronous source-owned visual carry snapshot. CPU/hash work starts after current JS stack. */
export function installActualPairedSnapshot(gl,{sourceHead,packedSha,paperSha,origin=[448,448]}={}){
 if(globalThis.__captureOwnedBeforeCarry)throw Error('Capture already owned');let result=null,finished=false,resolve;
 const ready=new Promise(r=>{resolve=r});const callback=r=>{
  if(finished)return;finished=true;delete globalThis.__captureOwnedBeforeCarry;
  const {owner,epoch,passStep,stride,input,pressure,path}=r,o=input.options;
  const p={ownerSequence:owner.token.sequence,epoch,passStep,passStride:stride,packedSha,paperSha,sourceHead,stage:'before-carry'};
  try{
   const packedSource=JSON.stringify(owner.source.chunks);
   const snapshot=captureSmallPairedDriver(gl,{enabled:true,...p,origin,fields:{sourceP:input.source.pigmentLoad,sourceC:input.source.colourLoad,fluid:input.source.solventLoad,pressure,path,oldP:input.targets.oldP},options:{band:(o.budgetPx-1.5)/o.costMax,rate:o.rate,travel:o.travel,pow:o.pow,costMax:o.costMax,effectiveWet:o.effectiveWet,wetLo:o.wetLo,wetHi:o.wetHi,pathMode:1}});
   // Frozen stage identity: no solver state is read asynchronously except owner epoch.
   queueMicrotask(async()=>{try{p.packedSha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packedSource))),v=>v.toString(16).padStart(2,'0')).join('');snapshot.passport.packedSha=p.packedSha;const candidate=await runCapturedPairedCandidate(snapshot,{sourceHead,stage:'before-carry',currentPassport:()=>({...p,epoch:owner.source.epoch})});result={valid:true,snapshot,candidate,packedSource,recipe:JSON.parse(packedSource).at(-1).composite};}catch(error){result={valid:false,error:String(error),passport:p,snapshot};}resolve(result)});
  }catch(error){result={valid:false,error:String(error),passport:p};resolve(result)}
 };
 globalThis.__captureOwnedBeforeCarry=callback;return{ready,get result(){return result},dispose(){if(globalThis.__captureOwnedBeforeCarry===callback)delete globalThis.__captureOwnedBeforeCarry;}};
}
