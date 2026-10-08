import { stampDebug } from './stampDebug'
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
export async function coverageSequenceOracle(commands:readonly CanonicalDrawCommand[],paper:Uint8Array,side:number,sameInputIndices?:readonly number[],debugStamps=false){
 if(sameInputIndices&&(!sameInputIndices.length||sameInputIndices.some(i=>!Number.isInteger(i)||i<0||i>=commands.length)))throw new Error('Same-input indices must identify actual ordered commands')
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
  const seed=expected,selected=sameInputIndices?.includes(index)??false
  if(selected)owner.device.queue.writeTexture({texture:out.texture},seed.slice(),{bytesPerRow:1024*4},[1024,1024])
  const owned=owner.encodeOwnerCommands(encoder,()=>{if(index===0){out.clear();empty.clear()}buffers=command.kind==='ribbon'?owner.encodePreparedRibbon(encoder,command.batch,'coverage',targets):owner.encodePreparedStamp(encoder,command.stamp,'coverage',targets)})
  owner.device.queue.submit([encoder.finish()]);const bytes=await out.readBytes();owned.release();buffers.forEach(b=>b.destroy())
  expected=command.kind==='ribbon'?ribbonGlOracle(command.batch,1024,1024,dither,expected,true).coverage:stampGlOracle(command.stamp,1024,1024,dither,expected,true).coverage
  const comparison=compareStages([{key:'coverage',w:1024,h:1024,bytes}],[{key:'coverage',w:1024,h:1024,bytes:expected}])[0]
  const pixels=[];if(selected)for(let i=0;i<bytes.length&&pixels.length<64;i+=4)if(bytes.subarray(i,i+4).some((v,c)=>v!==expected[i+c]))pixels.push({x:i/4%1024,yTop:Math.floor(i/4/1024),initialGl:Array.from(seed.subarray(i,i+4)),native:Array.from(bytes.subarray(i,i+4)),gl:Array.from(expected.subarray(i,i+4))})
  const debug=debugStamps&&selected&&dither&&command.kind==='stamp'?await stampDebug(owner,out,command.stamp,[{x:457,yTop:372},...pixels.slice(0,4).map(p=>({x:p.x,yTop:p.yTop}))]):null
  if(debug)owner.device.queue.writeTexture({texture:out.texture},bytes.slice(),{bytesPerRow:1024*4},[1024,1024])
  rows.push({debug,index:index++,kind:command.kind,dither,sameInput:selected,pixels,stamp:selected&&command.kind==='stamp'?command.stamp:null,vertexCount:command.kind==='ribbon'?command.batch.vertices.length/11:null,vertexBytesSha256:command.kind==='ribbon'?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',command.batch.vertices.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join(''):null,comparison,validation:(await owner.device.popErrorScope())?.message??null})
  if(sameInputIndices&&index>Math.max(...sameInputIndices))break
 }}}finally{out.destroy();empty.destroy();owner.destroy()}
 return{sameInputIndices:sameInputIndices??null,commands:commands.length,rows,firstDifferenceOn:rows.find(r=>r.dither&&(!('exact' in r.comparison)||!r.comparison.exact))??null,firstDifferenceOff:rows.find(r=>!r.dither&&(!('exact' in r.comparison)||!r.comparison.exact))??null,errors,selectedGate:sameInputIndices?'Selected commands receive exact same previous GL coverage; nonselected later comparisons are not independent accumulated baseline':null,scope:'All captured coverage commands in original order; independent native/GL accumulation starting from identical zero Q8. Availability-consuming commands explicitly refused. GL context recreated between commands with lossless Q8 upload, no resample; not full compound source executor parity.'}
}
