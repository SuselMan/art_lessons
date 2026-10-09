/// <reference types="@webgpu/types" />
/** OFF-only compilation of the two observed baseline field descriptors.
 * No texture allocation, dispatch, queue wait, or material/history advance. */
export type ObservedFieldKind='diffuse'|'waterFront'
interface Entry {code:string;pipeline:GPUComputePipeline|null;promise:Promise<{kind:ObservedFieldKind;compilerWallMs:number;shaderBytes:number}>;hits:number}
const devices=new WeakMap<GPUDevice,Map<ObservedFieldKind,Entry>>()
export function observedFieldDescriptor(device:GPUDevice,kind:ObservedFieldKind,code:string):GPUComputePipelineDescriptor{
 return{label:'Canonical '+kind,layout:'auto',compute:{module:device.createShaderModule({label:'Canonical '+kind,code}),entryPoint:'main',constants:kind==='waterFront'?{DIAGNOSTIC_LAZY_CLIMB:0}:undefined}}
}
export async function prepareObservedFieldPipeline(device:GPUDevice,kind:ObservedFieldKind,code:string){
 if(typeof device.createComputePipelineAsync!=='function')throw Error('Observed field preload requires real async compilation')
 let cache=devices.get(device);if(!cache){cache=new Map();devices.set(device,cache)}
 const prior=cache.get(kind);if(prior){if(prior.code!==code)throw Error('Observed field shader identity changed');return prior.promise}
 const start=performance.now(),entry:Entry={code,pipeline:null,hits:0,promise:null as unknown as Entry['promise']}
 entry.promise=(async()=>{entry.pipeline=await device.createComputePipelineAsync(observedFieldDescriptor(device,kind,code));return{kind,compilerWallMs:performance.now()-start,shaderBytes:new TextEncoder().encode(code).byteLength}})();cache.set(kind,entry)
 try{return await entry.promise}catch(error){if(cache.get(kind)===entry)cache.delete(kind);throw error}
}
export function preparedObservedFieldPipeline(device:GPUDevice,kind:ObservedFieldKind,code:string){
 const entry=devices.get(device)?.get(kind);if(!entry)return undefined
 if(entry.code!==code||!entry.pipeline)throw Error('Observed field requested before matching compilation completed')
 entry.hits++;return entry.pipeline
}
export function observedFieldPreparationDiagnostics(device:GPUDevice){return [...(devices.get(device)?.entries()??[])].map(([kind,e])=>({kind,completed:!!e.pipeline,hits:e.hits,shaderBytes:new TextEncoder().encode(e.code).byteLength}))}
