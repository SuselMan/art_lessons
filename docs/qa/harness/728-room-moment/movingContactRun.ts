/// <reference types="@webgpu/types" />
import{CanonicalWatercolorWebGpu}from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import{CanonicalFieldBuffer,CanonicalScratchPool}from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import{CanonicalTileScratch}from '../../../../apps/web/src/engine/src/webgpuCanonical/tileScratch'
import{CanonicalSourcePhaseExecutor}from '../../../../apps/web/src/engine/src/webgpuCanonical/sourcePhaseExecutor'
import{CanonicalPlanAdapter}from '../../../../apps/web/src/engine/src/webgpuCanonical/settlePlanAdapter'
import{movingContactSegments,commandFingerprint}from './movingContactFixture'
import{tipVariantShader,type TipVariant}from './heldStampVariants'
export async function runMovingContactVariant(variant:TipVariant){
 if(variant!=='literal'&&variant!=='A')throw Error('Only literal/A controlled moving arms')
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU adapter unavailable')
 const device=await adapter.requestDevice(),errors:string[]=[],patches:string[]=[]
 device.addEventListener('uncapturederror',e=>errors.push(e.error.message))
 // Context-owned facade; global GPU prototypes and other pages are untouched.
 const scoped=new Proxy(device,{get(target,key){if(key==='createShaderModule')return(desc:GPUShaderModuleDescriptor)=>{const code=desc.code.includes('fn paint(')&&desc.code.includes('fn wcTipContact')?tipVariantShader(desc.code,variant):desc.code;if(code!==desc.code)patches.push(desc.label??'source module');return target.createShaderModule({...desc,code})};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 const backend=Reflect.construct(CanonicalWatercolorWebGpu,[scoped,{roomOwnedResources:true,canvas:document.createElement('canvas'),width:1024,height:1024,paper:{bytes:new Uint8Array([255,255,255,255]),width:1,height:1,origin:[0,0],texSize:[1024,1024],scale:1}}]) as CanonicalWatercolorWebGpu
 const pool=new CanonicalScratchPool(backend),scratch=new CanonicalTileScratch(pool),tile=new CanonicalFieldBuffer(backend,1024,1024),target={buffer:tile,originX:0,originY:0,contentRect:null},plan=new CanonicalPlanAdapter(backend)
 device.pushErrorScope('validation')
 try{
  tile.clear();const source=new CanonicalSourcePhaseExecutor(backend,scratch,[target],{fieldOp:(out,a,b,mode,k,scissor)=>plan.fieldOp(out,a,b,mode,k,{scissor:scissor?[...scissor]:undefined})}),segments=movingContactSegments()
  for(const commands of segments)if(commands.length)plan.runQuantum(ctx=>plan.retain(source.execute(ctx.encoder,{commands,rect:[0,0,1024,1024],film:true,waterOnly:false},1)))
  await device.queue.onSubmittedWorkDone()
  const fields=scratch.peek(tile);if(!fields?.inkLoad||!fields.inkColor)throw Error('Missing actual source P/C')
  const groups=[];for(const [name,field]of[['coverage',fields.coverage],['P',fields.inkLoad],['C',fields.inkColor]]as const){
   const staging=device.createBuffer({size:1536*192,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})
   try{const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture:field.texture,origin:[272,352]},{buffer:staging,bytesPerRow:1536},[384,192]);device.queue.submit([encoder.finish()]);await staging.mapAsync(GPUMapMode.READ);const bytes=new Uint8Array(staging.getMappedRange().slice(0));staging.unmap();let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer)),x=>x.toString(16).padStart(2,'0')).join('');groups.push({name,byteLength:bytes.length,sha256:hash,base64:btoa(binary)})}finally{staging.destroy()}
  }
  const error=await device.popErrorScope();if(error)errors.push(error.message)
  return{variant,groups,errors,patches,roi:{x:272,yTop:352,w:384,h:192},segments:segments.map(c=>c.map(v=>({kind:v.kind,phase:v.phase}))),commandSha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(commandFingerprint(segments.flat())))),x=>x.toString(16).padStart(2,'0')).join(''),scope:'Actual canonical CPU/source GPU phases, controlled fixed-radius8dab fixture; no settle/presentation/Room/live-input/quality claim. Flat paper unused by this source-only comparison.'}
 }finally{scratch.destroy();pool.destroy();tile.destroy();backend.destroy()}
}
