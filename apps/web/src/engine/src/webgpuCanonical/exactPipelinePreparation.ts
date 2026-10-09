/// <reference types="@webgpu/types" />
export type ExactPipelineRecipe={key:string;code:string;moduleLabel?:string}&({kind:'render';descriptor:(module:GPUShaderModule)=>GPURenderPipelineDescriptor}|{kind:'compute';descriptor:(module:GPUShaderModule)=>GPUComputePipelineDescriptor})
type Pipeline=GPURenderPipeline|GPUComputePipeline
interface Proof{key:string;kind:'render'|'compute';completed:true;compilerWallMs:number;shaderBytes:number;shaderSHA:string;descriptorSHA:string}
interface Entry{identity:string;code:string;pipeline:Pipeline|null;promise:Promise<Proof>;hits:number;kind:'render'|'compute'}
interface Slot{entries:Map<string,Entry>;retired:boolean}
const devices=new WeakMap<GPUDevice,Slot>()
export function exactPipelineRecipeIdentity(recipe:ExactPipelineRecipe){
 const d=recipe.descriptor({} as GPUShaderModule)
 if(d.layout!=='auto')throw Error('Exact preparation requires baseline auto layout')
 const clean=recipe.kind==='compute'?{...d,compute:{...(d as GPUComputePipelineDescriptor).compute,module:'WGSL'}}:{...d,vertex:{...(d as GPURenderPipelineDescriptor).vertex,module:'WGSL'},fragment:{...(d as GPURenderPipelineDescriptor).fragment,module:'WGSL'}}
 return JSON.stringify({kind:recipe.kind,moduleLabel:recipe.moduleLabel,descriptor:clean})
}
export async function prepareExactPipeline(device:GPUDevice,recipe:ExactPipelineRecipe):Promise<Proof>{
 const identity=exactPipelineRecipeIdentity(recipe);let slot=devices.get(device)
 if(!slot){slot={entries:new Map(),retired:false};devices.set(device,slot)}
 if(slot.retired)throw Error('Exact preparation retired')
 const existing=slot.entries.get(recipe.key)
 if(existing){if(existing.identity!==identity||existing.code!==recipe.code)throw Error('Exact pipeline identity changed: '+recipe.key);return existing.promise}
 const start=performance.now(),entry:Entry={identity,code:recipe.code,pipeline:null,promise:null as unknown as Promise<Proof>,hits:0,kind:recipe.kind}
 // Start through a microtask so the entry is installed before any synchronous failure.
 entry.promise=Promise.resolve().then(async()=>{
  if(slot.retired)throw Error('Exact preparation retired')
  const module=device.createShaderModule({...recipe.moduleLabel===undefined?{}:{label:recipe.moduleLabel},code:recipe.code})
  const pipeline=recipe.kind==='render'?await device.createRenderPipelineAsync(recipe.descriptor(module)):await device.createComputePipelineAsync(recipe.descriptor(module))
  if(slot.retired||slot.entries.get(recipe.key)!==entry)throw Error('Exact preparation retired')
  const compilerWallMs=performance.now()-start
  const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('')
  const [shaderSHA,descriptorSHA]=await Promise.all([sha(recipe.code),sha(identity)])
  if(slot.retired||slot.entries.get(recipe.key)!==entry)throw Error('Exact preparation retired')
  entry.pipeline=pipeline
  return{key:recipe.key,kind:recipe.kind,completed:true,compilerWallMs,shaderBytes:new TextEncoder().encode(recipe.code).byteLength,shaderSHA,descriptorSHA}
 });slot.entries.set(recipe.key,entry)
 try{return await entry.promise}catch(error){if(slot.entries.get(recipe.key)===entry)slot.entries.delete(recipe.key);throw error}
}
export function preparedExactPipeline(device:GPUDevice,recipe:ExactPipelineRecipe):Pipeline|undefined{
 const entry=devices.get(device)?.entries.get(recipe.key);if(!entry)return undefined
 if(entry.identity!==exactPipelineRecipeIdentity(recipe)||entry.code!==recipe.code||!entry.pipeline)throw Error('Exact pipeline not prepared with matching identity: '+recipe.key)
 entry.hits++;return entry.pipeline
}
export function exactPipelinePreparationDiagnostics(device:GPUDevice){return [...(devices.get(device)?.entries??[])].map(([key,e])=>({key,kind:e.kind,completed:!!e.pipeline,hits:e.hits,shaderBytes:new TextEncoder().encode(e.code).byteLength}))}
export function retireExactPipelinePreparation(device:GPUDevice){const slot=devices.get(device);if(slot){slot.retired=true;slot.entries.clear()}}
