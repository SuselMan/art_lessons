/// <reference types="@webgpu/types" />
/** DEV compile-only cache. No fields, commands, queue submission or model state. */
interface Entry { code:string; pipeline:GPUComputePipeline|null; promise:Promise<HardwarePressureCompileProof>; hits:number }
export interface HardwarePressureCompileProof { completed:true; shaderBytes:number; compilerWallMs:number; scope:'exact pipeline compilation only' }
const prepared=new WeakMap<GPUDevice,Entry>()
export function canonicalHardwareLinearDescriptor(device:GPUDevice,code:string):GPUComputePipelineDescriptor {
 return {label:'DIAGNOSTIC canonical hardware LINEAR fields',layout:'auto',compute:{module:device.createShaderModule({code}),entryPoint:'main'}}
}
export async function prepareCanonicalHardwareLinearPipeline(device:GPUDevice,code:string):Promise<HardwarePressureCompileProof>{
 if(typeof device.createComputePipelineAsync!=='function')throw new Error('Native async pressure requires createComputePipelineAsync; no synchronous fallback')
 const existing=prepared.get(device)
 if(existing){if(existing.code!==code)throw new Error('Prepared pressure shader identity changed');return existing.promise}
 const entry:Entry={code,pipeline:null,hits:0,promise:null as unknown as Promise<HardwarePressureCompileProof>}
 const started=performance.now()
 entry.promise=(async()=>{const pipeline=await device.createComputePipelineAsync(canonicalHardwareLinearDescriptor(device,code));entry.pipeline=pipeline;return{completed:true as const,shaderBytes:new TextEncoder().encode(code).byteLength,compilerWallMs:performance.now()-started,scope:'exact pipeline compilation only' as const}})()
 prepared.set(device,entry)
 try{return await entry.promise}catch(error){if(prepared.get(device)===entry)prepared.delete(device);throw error}
}
export function preparedCanonicalHardwareLinearPipeline(device:GPUDevice,code:string):GPUComputePipeline|undefined {
 const entry=prepared.get(device);if(!entry)return undefined
 if(entry.code!==code||!entry.pipeline)throw new Error('Pressure pipeline requested before matching async preparation completed')
 entry.hits++;return entry.pipeline
}
export function canonicalHardwareLinearPreparationDiagnostics(device:GPUDevice){const entry=prepared.get(device);return entry?{completed:!!entry.pipeline,hits:entry.hits,shaderBytes:new TextEncoder().encode(entry.code).byteLength}:null}
