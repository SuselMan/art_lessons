/// <reference types="@webgpu/types" />
/// <reference types="vite/client" />
import{CanonicalWatercolorWebGpu}from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import{CanonicalBoundedSceneRunner}from '../../../../apps/web/src/engine/src/webgpuCanonical/boundedSceneRunner'
import{getPaperBytes}from '../../../../apps/web/src/engine/src/paper/paperLoader'
import{tipVariantShader,type TipVariant}from './heldStampVariants'
import{movingSettleOperation}from './movingContactFixture'
const fetchOriginal=window.fetch.bind(window)
window.fetch=((input:RequestInfo|URL,init?:RequestInit)=>fetchOriginal(typeof input==='string'&&input.startsWith('/paper/')?new URL('./paper/'+input.slice(7),location.href):input,init))as typeof fetch
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b.slice().buffer)),x=>x.toString(16).padStart(2,'0')).join('')
export async function runMovingContactSettle(variant:TipVariant){
 if(variant!=='literal'&&variant!=='A')throw Error('Only paired literal/A')
 const operation=movingSettleOperation()
 const la=await getPaperBytes('fine'),side=Math.sqrt(la.length/2);if(!Number.isInteger(side))throw Error('Paper dimensions')
 const paper=new Uint8Array(side*side*4);for(let i=0;i<la.length/2;i++)paper.set([la[i*2]!,la[i*2]!,la[i*2]!,la[i*2+1]!],i*4)
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No GPU adapter');const device=await adapter.requestDevice(),errors:string[]=[],patches:string[]=[]
 device.addEventListener('uncapturederror',e=>errors.push(e.error.message));let runner:CanonicalBoundedSceneRunner|undefined,backend:CanonicalWatercolorWebGpu|undefined
 try{
  const scoped=new Proxy(device,{get(target,key){if(key==='createShaderModule')return(desc:GPUShaderModuleDescriptor)=>{const code=desc.code.includes('fn paint(')&&desc.code.includes('fn wcTipContact')?tipVariantShader(desc.code,variant):desc.code;if(code!==desc.code)patches.push(desc.label??'source');return target.createShaderModule({...desc,code})};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v}})
  backend=Reflect.construct(CanonicalWatercolorWebGpu,[scoped,{roomOwnedResources:true,canvas:document.createElement('canvas'),width:1024,height:1024,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}}])as CanonicalWatercolorWebGpu
  const sourceOptions={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true}as const
  runner=new CanonicalBoundedSceneRunner(backend,{sourceOptions,now:()=>1000,timestamp:()=>operation.timestamp,operationId:()=>{throw Error('Replay cannot create operation')}})
  device.pushErrorScope('validation');runner.replay(operation);await runner.drain();await device.queue.onSubmittedWorkDone()
  const rgba=await runner.target.buffer.readBytes(),error=await device.popErrorScope();if(error)errors.push(error.message)
  let binary='';for(let i=0;i<rgba.length;i+=8192)binary+=String.fromCharCode(...rgba.subarray(i,i+8192))
  const sums=[0,0,0,0];let nonzeroAlpha=0;for(let i=0;i<rgba.length;i++){sums[i%4]!+=rgba[i]!;if(i%4===3&&rgba[i])nonzeroAlpha++}
  return{variant,patches,errors,paper:{width:side,height:side,LAsha256:await hash(la),RGBAsha256:await hash(paper)},tapeSha256:await hash(new TextEncoder().encode(JSON.stringify(operation))),material:{width:1024,height:1024,byteLength:rgba.length,sha256:await hash(rgba),base64:btoa(binary),sums,nonzeroAlpha},scope:'Bounded canonical replay/source/full1536settle/finalpremultipliedmaterial. One synthetic controlled fixed-radius taper tape, production seeded from QA strokeId; not prior moving fixture seed, Room/live/history/animation proof.'}
 }finally{try{await runner?.retire()}finally{backend?.destroy();device.destroy()}}
}
