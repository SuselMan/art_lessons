import {CanonicalWatercolorWebGpu} from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import {CanonicalFieldBuffer} from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import type {CanonicalDrawCommand} from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import {createCoverageGlSequence} from './coverageGlSequence'
import {validateCoverageSubstitutions} from './sourceContributionGuards'
import {compareStages} from './stages'
export async function sourceContribution(commands:readonly CanonicalDrawCommand[],paper:Uint8Array,side:number,substitutions:readonly number[]){
 validateCoverageSubstitutions(substitutions,commands.length,false)
 if(substitutions.some(i=>i!==37&&i!==44))throw Error('Only known37/44 substitutions admitted; bounded three checkpoints')
 if(commands.length!==145||commands.some(c=>(c.kind==='ribbon'?c.batch.uniforms:c.stamp.uniforms).useAvailableWater))throw Error('Only original145 dry-landing coverage commands admitted')
 const owner=await CanonicalWatercolorWebGpu.create({canvas:document.createElement('canvas'),width:1024,height:1024,roomOwnedResources:true,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}})
 const out=new CanonicalFieldBuffer(owner,1024,1024,'nearest','contribution coverage'),empty=new CanonicalFieldBuffer(owner,1024,1024,'nearest','contribution availability'),gl=createCoverageGlSequence()
 const errors:string[]=[],rows=[],scopes:{release():void}[]=[],buffers:GPUBuffer[]=[];owner.device.addEventListener('uncapturederror',e=>errors.push(e.error.message))
 const checkpoints=new Set([37,44,144,...substitutions]);let readbackBytes=0,uploadBytes=0
 const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join('')
 try{owner.device.pushErrorScope('validation');for(let index=0;index<commands.length;index++){
  const c=commands[index],encoder=owner.device.createCommandEncoder(),targets={coverage:out.field,availableWater:empty.field,pigment:out.field,color:out.field}
  scopes.push(owner.encodeOwnerCommands(encoder,()=>{if(index===0){out.clear();empty.clear()}buffers.push(...(c.kind==='ribbon'?owner.encodePreparedRibbon(encoder,c.batch,'coverage',targets):owner.encodePreparedStamp(encoder,c.stamp,'coverage',targets)))}))
  owner.device.queue.submit([encoder.finish()]);gl.draw(c)
  if(checkpoints.has(index)){const native=await out.readBytes(),expected=gl.read();readbackBytes+=native.length+expected.length;const substituted=substitutions.includes(index)
   rows.push({index,kind:c.kind,substituted,nativeSha256:await sha(native),glSha256:await sha(expected),comparisonBeforeSubstitution:compareStages([{key:'coverage',w:1024,h:1024,bytes:native}],[{key:'coverage',w:1024,h:1024,bytes:expected}])[0]})
   for(const s of scopes.splice(0))s.release();for(const b of buffers.splice(0))b.destroy()
   if(substituted){owner.device.queue.writeTexture({texture:out.texture},expected,{bytesPerRow:4096},[1024,1024]);uploadBytes+=expected.length}
  }
 }
 const validation=(await owner.device.popErrorScope())?.message??null
 return{rows,errors,validation,commands:commands.length,substitutions,readbackBytes,uploadBytes,limits:'Persistent GL Q8 source only; checkpoints37/44/144. Accumulated substitution removes all prior error, not solely selected-operator error. No P/C/settle/Room/timing claim.'}
 }finally{await owner.device.queue.onSubmittedWorkDone().catch(()=>{});for(const s of scopes)s.release();for(const b of buffers)b.destroy();out.destroy();empty.destroy();gl.destroy();owner.destroy()}
}
