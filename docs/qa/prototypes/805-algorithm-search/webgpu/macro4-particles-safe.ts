import type {Candidate,Input} from './contract'
import {integerOption,validateInput} from './contract'
import {create as compact,MACRO3_COMPACT_WALK} from './macro3-particles-compact'
import type {ParticleConfig} from './macro2-particles'
const OLD_PATH='fn pathWet(a:vec2f,b:vec2f)->bool{let count=max(1u,u32(ceil(distance(a,b))));for(var t=1u;t<=count;t++){let q=vec2i(floor(mix(a,b,f32(t)/f32(count))+vec2f(0.5)));if(!wet(q)){return false;}}return true;}'
const SAFE_PATH='fn pathWet(a:vec2f,b:vec2f)->bool{let count=max(1u,u32(ceil(distance(a,b))));var previousCell=vec2i(floor(a+vec2f(0.5)));for(var t=1u;t<=count;t++){let q=vec2i(floor(mix(a,b,f32(t)/f32(count))+vec2f(0.5)));if(!wet(q)){return false;}if(q.x!=previousCell.x&&q.y!=previousCell.y){if(!wet(vec2i(q.x,previousCell.y))||!wet(vec2i(previousCell.x,q.y))){return false;}}previousCell=q;}return true;}'
if(MACRO3_COMPACT_WALK.split(OLD_PATH).length!==2)throw Error('Safe particle path unique-anchor mismatch')
export const MACRO4_SAFE_PARTICLES=MACRO3_COMPACT_WALK.replace(OLD_PATH,SAFE_PATH)
export function safeParticlePathWet(water:Uint8Array,size:number,x:number,y:number,nx:number,ny:number){
 const wet=(xx:number,yy:number)=>xx>=0&&yy>=0&&xx<size&&yy<size&&water[yy*size+xx]>0
 const count=Math.max(1,Math.ceil(Math.hypot(nx-x,ny-y)));let px=Math.floor(x+.5),py=Math.floor(y+.5)
 for(let k=1;k<=count;k++){const qx=Math.floor(x+(nx-x)*k/count+.5),qy=Math.floor(y+(ny-y)*k/count+.5);if(!wet(qx,qy))return false;if(qx!==px&&qy!==py&&(!wet(qx,py)||!wet(px,qy)))return false;px=qx;py=qy}return true
}
export function safeParticleWork(size:number,occupied:number,samples:number,steps:number,pixels:number){return{occupiedWetPixels:occupied,estimatedEnvironmentReads:occupied*(1+samples*(steps*(16+3*(pixels+1))+4)),unconditionalSourceReads:size*size,estimatedWalks:occupied*samples,pathGuard:'supercover: diagonal transitions inspect both orthogonal cells'}}
/** All objects are created by the actual device. The adapter changes ONE uniquely matched shader source only. */
export async function create(device:GPUDevice,size:number,config:ParticleConfig={}):Promise<Candidate>{
 const samples=config.samples??8,steps=config.steps??32,pixels=config.stepPixels??12,maxReads=integerOption(config.maxEstimatedReads??128000000,1,500000000,'maxEstimatedReads');let installed=0
 const adapter={limits:device.limits,queue:device.queue,
  createShaderModule(descriptor:GPUShaderModuleDescriptor){if(descriptor.code===MACRO3_COMPACT_WALK){installed++;return device.createShaderModule({...descriptor,code:MACRO4_SAFE_PARTICLES,label:'805-macro4-safe-particle-walk'})}return device.createShaderModule(descriptor)},
  createComputePipelineAsync:device.createComputePipelineAsync.bind(device),createBuffer:device.createBuffer.bind(device),createBindGroup:device.createBindGroup.bind(device),createCommandEncoder:device.createCommandEncoder.bind(device)
 } as unknown as GPUDevice
 const candidate=await compact(adapter,size,config);if(installed!==1){candidate.destroy();throw Error('Safe shader was not installed exactly once')}
 let estimatedWork=safeParticleWork(size,0,samples,steps,pixels)
 const metadata:Record<string,unknown>={};for(const key of Object.keys(candidate.metadata))Object.defineProperty(metadata,key,{enumerable:true,get:()=>candidate.metadata[key]})
 // Redefine our overridden getters on a separate object; do not freeze or mutate the base candidate metadata.
 const own={...Object.getOwnPropertyDescriptors(metadata)};delete own.algorithm;delete own.estimatedWork;delete own.limitations
 const resultMetadata=Object.defineProperties({algorithm:'safe-supercover-compact-paper-particles',get estimatedWork(){return {...estimatedWork}},limitations:'Same particle model/sampling as compact baseline, with conservative no-corner-cut raster path; may reject diagonal-only wet necks; quantization/saturation still measured separately',shaderVariant:'single actual shader source replacement; real GPU device methods bound unchanged'},own)
 return{metadata:Object.freeze(resultMetadata),async upload(input:Input){validateInput(input,size);let count=0;for(let i=0;i<input.water.length;i++)if(input.rgba[i*4+3]>0&&input.water[i]>0)count++;estimatedWork=safeParticleWork(size,count,samples,steps,pixels);if(estimatedWork.estimatedEnvironmentReads>maxReads)throw Error('Safe particle work budget exceeded: '+estimatedWork.estimatedEnvironmentReads+' > '+maxReads);await candidate.upload(input)},run:()=>candidate.run(),readback:()=>candidate.readback(),destroy:()=>candidate.destroy()}
}
export const safeParticleDefinitions=[{id:'wgsl-macro-paper-particles-safe',label:'Частицы: безопасная траектория без срезания углов',create,configs:[
 {samples:8,steps:32,stepPixels:12,paperGain:4,persistence:2},
 {samples:8,steps:32,stepPixels:16,paperGain:8,persistence:4}
]}]
