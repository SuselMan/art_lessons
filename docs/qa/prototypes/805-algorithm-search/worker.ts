import {definitions as gpuDefinitions,glDefinitions as backendGL} from './webgpu'
import {createFixture,fixtureInfo,fixtureIds,type FixtureId} from './fixtures'
import {definitions as alternatives} from './alternatives'
import {reference} from './reference'
import type {AlgorithmConfig,AlgorithmInput,GLResult} from './protocol'
const definitions=[reference,...alternatives,...backendGL]
let busy=false
const send=(r:unknown)=>self.postMessage(r)
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('')
function metrics(input:AlgorithmInput,output:Uint8Array){let inputMass=0,outputMass=0,lost=0,added=0,spread=0,invalidPremul=0,changed=0;for(let i=0;i<input.size*input.size;i++){const p=i*4,a=output[p+3],before=input.rgba[p+3];inputMass+=before;outputMass+=a;if(before&&!a)lost++;if(!before&&a>1)added++;if(a&&input.water[i]<5)spread++;if(output[p]>a+1||output[p+1]>a+1||output[p+2]>a+1)invalidPremul++;if(a!==before||output[p]!==input.rgba[p]||output[p+1]!==input.rgba[p+1]||output[p+2]!==input.rgba[p+2])changed++}
return{quantity:'Sum of alpha as a pigment-mass proxy; not a physical mass measurement',inputMass,outputMass,massRatio:inputMass?outputMass/inputMass:outputMass===0?1:null,lostPixels:lost,addedPixels:added,outsideWetPixels:spread,invalidPremul,changedPixels:changed}}
function read(gl:WebGLRenderingContext,result:GLResult,full=false){gl.bindFramebuffer(gl.FRAMEBUFFER,result.framebuffer);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Output framebuffer incomplete');const out=new Uint8Array(full?result.width*result.height*4:4);gl.readPixels(full?0:result.width>>1,full?0:result.height>>1,full?result.width:1,full?result.height:1,gl.RGBA,gl.UNSIGNED_BYTE,out);const error=gl.getError();if(error)throw Error('Output GLerror '+error);return out}
async function runGL(algorithm:string,input:AlgorithmInput,config:AlgorithmConfig,repeats:number){const definition=definitions.find(x=>x.id===algorithm);if(!definition)throw Error('Unknown algorithm '+algorithm)
 const canvas=new OffscreenCanvas(input.size,input.size),gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true})!;if(!gl)throw Error('WebGL1 unavailable');gl.disable(gl.DITHER)
 const renderer=gl.getExtension('WEBGL_debug_renderer_info'),hardware=renderer?gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),createStart=performance.now();let candidate:ReturnType<typeof definition.create>|null=null
 try{candidate=definition.create(gl,input.size,config);const createMs=performance.now()-createStart,samples=[];let output:Uint8Array|null=null;const hashes:string[]=[]
  for(let n=0;n<repeats;n++){const start=performance.now();candidate.upload(input);const uploaded=performance.now();const result=candidate.run();const submitted=performance.now();read(gl,result);const ready=performance.now();samples.push({uploadJsMs:uploaded-start,submitJsMs:submitted-uploaded,runToDependentMs:ready-uploaded,totalReadyMs:ready-start})
   // Full readback/hashing is deliberately outside the timed interval.
   output=read(gl,result,true);hashes.push(await digest(output))
  }
  // GL fixtures' first byte is y=0, written directly into bottom row. Their
  // output readback has the same numerical row order, so keep it top-left
  // for fixture comparisons; the display canvas is populated from these bytes.
  return{backend:'webgl1',hardware,createMs,samples,hashes,repeatExact:hashes.every(x=>x===hashes[0]),metadata:candidate.metadata??{},metrics:metrics(input,output!),output:output!,orientation:'fixture-row-order'}
 }finally{try{candidate?.destroy()}finally{gl.getExtension('WEBGL_lose_context')?.loseContext()}}
}
declare const __QA_WGPU_ENABLED__:boolean
let webgpuModule:Promise<any>|null=__QA_WGPU_ENABLED__?Promise.resolve({definitions:gpuDefinitions}):null
async function runGPU(algorithm:string,input:AlgorithmInput,config:AlgorithmConfig,repeats:number){
 // The WebGPU registry is loaded by the build only once this direction is ready.
 if(!webgpuModule)throw Error('WebGPU candidate build is not enabled')
 const registry=await webgpuModule,definition=registry.definitions.find((x:any)=>x.id===algorithm);if(!definition)throw Error('Unknown WebGPU algorithm')
 const gpu=(self.navigator as any).gpu;if(!gpu)throw Error('WebGPU unavailable');const adapter=await gpu.requestAdapter();if(!adapter)throw Error('WebGPU adapter unavailable');const device=await adapter.requestDevice();let candidate:any=null
 try{const errors:string[]=[];device.addEventListener('uncapturederror',(e:any)=>errors.push(String(e.error.message)));const startCreate=performance.now();candidate=await definition.create(device,input.size,config);const createMs=performance.now()-startCreate,samples=[],hashes:string[]=[];let output:Uint8Array|null=null
  for(let n=0;n<repeats;n++){const start=performance.now();await candidate.upload(input);const uploaded=performance.now();candidate.run();const submitted=performance.now();await device.queue.onSubmittedWorkDone();const ready=performance.now();samples.push({uploadJsMs:uploaded-start,submitJsMs:submitted-uploaded,runToDependentMs:ready-uploaded,totalReadyMs:ready-start});output=await candidate.readback();hashes.push(await digest(output!));if(errors.length)throw Error(errors.join('\n'))}
  return{backend:'webgpu',hardware:{vendor:adapter.info?.vendor??'',architecture:adapter.info?.architecture??'',device:adapter.info?.device??'',description:adapter.info?.description??''},createMs,samples,hashes,repeatExact:hashes.every(x=>x===hashes[0]),metadata:candidate.metadata??{},metrics:metrics(input,output!),output:output!,orientation:'fixture-row-order'}
 }finally{try{candidate?.destroy()}finally{device.destroy()}}
}
self.onmessage=async({data})=>{if(busy){send({requestId:data.requestId,error:'Algorithm worker busy'});return}busy=true;try{
 if(data.type==='list'){const gpuDefinitions=webgpuModule?(await webgpuModule).definitions:[];send({requestId:data.requestId,algorithms:[...definitions.map(d=>({id:d.id,label:d.label,configs:d.configs??[{}],backend:'webgl1'})),...gpuDefinitions.map((d:any)=>({id:d.id,label:d.label,configs:d.configs??[{}],backend:'webgpu'}))],fixtures:fixtureIds.map(id=>({id,...fixtureInfo[id]}))});return}
 if(data.type!=='run')throw Error('Unknown request');const encoding=data.encoding??'premultiplied-rgb',input=createFixture(data.fixture as FixtureId,1024,encoding),fixtureSHA={rgba:await digest(input.rgba),water:await digest(input.water),paper:await digest(input.paper)},repeats=Math.max(1,Math.min(5,Math.floor(data.repeats??3)))
 const result=data.algorithm.startsWith('wgsl-')?await runGPU(data.algorithm,input,data.config??{},repeats):await runGL(data.algorithm,input,data.config??{},repeats)
 const {output,...report}=result;(self as any).postMessage({requestId:data.requestId,result:{algorithm:data.algorithm,fixture:data.fixture,encoding,config:data.config??{},fixtureSHA,...report},output},[output.buffer])
 }catch(e){send({requestId:data.requestId,error:String((e as Error).stack??e)})}finally{busy=false}}
