import type { CanonicalDrawCommand } from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import { CanonicalWatercolorWebGpu } from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import { CanonicalFieldBuffer } from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import { ribbonGlOracle,stampGlOracle } from '../../../../apps/web/src/engine/src/webgpuCanonical/ribbonOracle'
import { compareStages } from './stages'
/** Each real captured primitive starts from blank coverage/availability in both backends. */
export async function coveragePrimitiveOracle(commands:readonly CanonicalDrawCommand[],paper:Uint8Array,side:number){
 const owner=await CanonicalWatercolorWebGpu.create({canvas:document.createElement('canvas'),width:1024,height:1024,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}})
 const out=new CanonicalFieldBuffer(owner,1024,1024,'nearest','primitive coverage'),empty=new CanonicalFieldBuffer(owner,1024,1024,'nearest','primitive empty')
 const errors:string[]=[];owner.device.addEventListener('uncapturederror',e=>errors.push(e.error.message))
 const rows=[]
 try{for(const command of commands){
  owner.device.pushErrorScope('validation');const encoder=owner.device.createCommandEncoder();let buffers:GPUBuffer[]=[]
  const targets={coverage:out.field,pigment:out.field,color:out.field,availableWater:empty.field}
  const owned=owner.encodeOwnerCommands(encoder,()=>{out.clear();empty.clear();buffers=command.kind==='ribbon'?owner.encodePreparedRibbon(encoder,command.batch,'coverage',targets):owner.encodePreparedStamp(encoder,command.stamp,'coverage',targets)})
  owner.device.queue.submit([encoder.finish()]);const bytes=await out.readBytes();owned.release();buffers.forEach(b=>b.destroy())
  const comparisons=[]
  for(const dither of [true,false]){const gl=command.kind==='ribbon'?ribbonGlOracle(command.batch,1024,1024,dither):stampGlOracle(command.stamp,1024,1024,dither);const channels=[0,0,0,0],pixels=[];for(let i=0;i<bytes.length;i+=4){let changed=false;for(let c=0;c<4;c++)if(bytes[i+c]!==gl.coverage[i+c]){channels[c]++;changed=true}if(changed&&pixels.length<16)pixels.push({x:i/4%1024,yTop:Math.floor(i/4/1024),native:Array.from(bytes.subarray(i,i+4)),gl:Array.from(gl.coverage.subarray(i,i+4))})}
   comparisons.push({dither,channels,pixels,comparison:compareStages([{key:'coverage',w:1024,h:1024,bytes}],[{key:'coverage',w:1024,h:1024,bytes:gl.coverage}])})}
  rows.push({kind:command.kind,phase:command.phase,vertexCount:command.kind==='ribbon'?command.batch.vertices.length/11:null,vertexBytesSha256:command.kind==='ribbon'?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',command.batch.vertices.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join(''):null,uniforms:command.kind==='ribbon'?command.batch.uniforms:command.stamp,comparisons,validation:(await owner.device.popErrorScope())?.message??null})
 }}finally{out.destroy();empty.destroy();owner.destroy()}
 return{rows,errors,scope:'Actual captured coverage primitive; identical Float32 vertices/uniforms; isolated blank coverage/available-water inputs; native unchanged, GL DITHER ON/OFF. Does not establish accumulated whole-source equivalence.'}
}

/** Ordered Q8 blend oracle; no changes to production source state or draw grouping. */
export async function coverageSequenceOracle(commands:readonly CanonicalDrawCommand[],paper:Uint8Array,side:number){
 if(!commands.length||commands.length>200)throw new Error('Coverage sequence must contain 1..200 complete commands')
 for(const command of commands){const u=command.kind==='ribbon'?command.batch.uniforms:command.stamp.uniforms;if(u.useAvailableWater)throw new Error('Coverage sequence requires captured availability for this command; blank substitution refused')}
 const owner=await CanonicalWatercolorWebGpu.create({canvas:document.createElement('canvas'),width:1024,height:1024,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}})
 const out=new CanonicalFieldBuffer(owner,1024,1024,'nearest','sequence coverage'),empty=new CanonicalFieldBuffer(owner,1024,1024,'nearest','sequence availability')
 const errors:string[]=[];owner.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));const rows=[]
 try{for(const dither of [true,false]){
 let expected:Uint8Array=new Uint8Array(1024*1024*4),index=0
 for(const command of commands){
  owner.device.pushErrorScope('validation');const encoder=owner.device.createCommandEncoder();let buffers:GPUBuffer[]=[]
  const targets={coverage:out.field,pigment:out.field,color:out.field,availableWater:empty.field}
  const owned=owner.encodeOwnerCommands(encoder,()=>{if(index===0){out.clear();empty.clear()}buffers=command.kind==='ribbon'?owner.encodePreparedRibbon(encoder,command.batch,'coverage',targets):owner.encodePreparedStamp(encoder,command.stamp,'coverage',targets)})
  owner.device.queue.submit([encoder.finish()]);const bytes=await out.readBytes();owned.release();buffers.forEach(b=>b.destroy())
  expected=command.kind==='ribbon'?ribbonGlOracle(command.batch,1024,1024,dither,expected,true).coverage:stampGlOracle(command.stamp,1024,1024,dither,expected,true).coverage
  const comparison=compareStages([{key:'coverage',w:1024,h:1024,bytes}],[{key:'coverage',w:1024,h:1024,bytes:expected}])[0]
  rows.push({index:index++,kind:command.kind,dither,vertexCount:command.kind==='ribbon'?command.batch.vertices.length/11:null,vertexBytesSha256:command.kind==='ribbon'?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',command.batch.vertices.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join(''):null,comparison,validation:(await owner.device.popErrorScope())?.message??null})
 }}}finally{out.destroy();empty.destroy();owner.destroy()}
 return{commands:commands.length,rows,firstDifferenceOn:rows.find(r=>r.dither&&(!('exact' in r.comparison)||!r.comparison.exact))??null,firstDifferenceOff:rows.find(r=>!r.dither&&(!('exact' in r.comparison)||!r.comparison.exact))??null,errors,scope:'All captured coverage commands in original order; independent native/GL accumulation starting from identical zero Q8. Availability-consuming commands explicitly refused. GL context recreated between commands with lossless Q8 upload, no resample; not full compound source executor parity.'}
}
