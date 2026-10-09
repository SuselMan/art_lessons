import {finalizeController} from './controller-finalize.mjs'
import fs from 'node:fs'
import {collectSchedulingPostInput} from './scheduling-post-input.mjs'
import {assertFactorInteractiveObserved} from './factor-interactive-proof.mjs'
export async function runSchedulingControllerFixture(file){
 const spec=JSON.parse(fs.readFileSync(file,'utf8')),out=spec.out,sha='a'.repeat(64),events=[]
 const report={actualObserved:{},final:{actualObservedEnabled:true,observedFields:[{kind:'waterFront',completed:true,hits:0},{kind:'diffuse',completed:true,hits:1}]},events}
 const row={cache:{prep:2,hits:478,fallbacks:0,retainedBytes:0,cleanupFailures:0},paired:true,pairedCalls:210,film:false,filmVariants:[],factor:true,factorVariants:[{staticCache:true,encoded:480,shaderBytes:4500,shaderSHA:sha}]}
 if(spec.invalid)row.factorVariants[0].encoded=1
 const save=()=>fs.writeFileSync(out,JSON.stringify(report))
 const descriptors={installed:true}
 const pending=new Map(spec.pending?[['owned',{timer:null,reject:error=>{events.push('pendingReject');report.pendingError=String(error)}}]]:[])
 const send=async(method)=>{events.push(method);if(spec.readerError)throw Error('mock CDP failure');return{result:{type:'string',value:JSON.stringify(row)}}}
 try{
  events.push('installed')
  if(spec.legacyOrder)assertFactorInteractiveObserved(report.final,report.combinedConsumption,sha)
  await collectSchedulingPostInput({report,combinedInteractive:true,factorInteractive:true,expectedShaderSHA:sha,idle:async()=>events.push('idle'),backendIdle:async()=>events.push('existingACK'),readMetadata:()=>send('Runtime.evaluate'),snapshot:async()=>({rows:[]}),inputSnapshot:async()=>({rows:[]}),save})
  report.complete=true
 }catch(error){report.error=String(error);process.exitCode=1}
 finally{await finalizeController({closeOwn:async()=>{descriptors.installed=false;events.push('restore');report.restored=!descriptors.installed;save()},ws:{close:()=>events.push('close')},pending});report.pendingCleared=pending.size===0;save()}
}
