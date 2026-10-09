/// <reference types="@webgpu/types" />
/** Diagnostic feature negotiation only. OFF retains the exact empty descriptor. */
export async function requestCanonicalDevice(adapter:GPUAdapter,enabled:boolean|undefined,dev:boolean):Promise<GPUDevice>{
 if(enabled!==undefined&&typeof enabled!=='boolean')throw new Error('Timestamp diagnostic option must be boolean')
 if(!enabled)return adapter.requestDevice()
 if(!dev)throw new Error('Timestamp diagnostic is DEV only')
 if(!adapter.features.has('timestamp-query'))throw new Error('Timestamp query unavailable on adapter')
 const device=await adapter.requestDevice({requiredFeatures:['timestamp-query']})
 if(!device.features.has('timestamp-query')){device.destroy();throw new Error('Timestamp query unavailable on requested device')}
 return device
}
