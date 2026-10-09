/** OFF QA compile-only control. Actual descriptor/code unchanged, zero textures/draws/history. */
export async function prepareHardwareLinearPipeline(device,shaderCode,record){
 if(typeof device.createComputePipelineAsync!=='function')throw Error('Actual asynchronous pipeline API required, no synchronous fallback')
 if(typeof shaderCode!=='string'||!shaderCode.includes('@compute'))throw Error('Exact frozen hardware LINEAR WGSL required')
 const label='DIAGNOSTIC canonical hardware LINEAR fields',modules=new WeakMap(),createModule=device.createShaderModule,createPipeline=device.createComputePipeline
 const descriptor=module=>({label,layout:'auto',compute:{module,entryPoint:'main'}})
 const module=createModule.call(device,{code:shaderCode});record('pressure.async-compile:start',{shaderBytes:shaderCode.length})
 const pipeline=await device.createComputePipelineAsync(descriptor(module));record('pressure.async-compile:completed',{scope:'Exact shader descriptor compile only; no dispatch, fields, source, material, history or GL publication'})
 let alive=true,hits=0
 device.createShaderModule=function(d){const result=createModule.call(this,d);modules.set(result,d.code);return result}
 device.createComputePipeline=function(d){if(d.label!==label)return createPipeline.call(this,d);if(!alive)throw Error('Retired pressure precompiled pipeline');if(this!==device||d.layout!=='auto'||d.compute?.entryPoint!=='main'||d.compute.constants||modules.get(d.compute.module)!==shaderCode)throw Error('Frozen hardware LINEAR descriptor differs before substitution');hits++;record('pressure.async-compile:hit',{hits});return pipeline}
 return{get hits(){return hits},restore(){if(!alive)return;alive=false;device.createShaderModule=createModule;device.createComputePipeline=createPipeline}}
}
