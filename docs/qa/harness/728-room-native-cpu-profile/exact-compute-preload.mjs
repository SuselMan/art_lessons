/** OFF compile-only cache: explicit observed shader descriptors, no dispatch/resources/history. */
export async function prepareExactComputePipelines(device,recipes,record){
 if(typeof device.createComputePipelineAsync!=='function')throw Error('Real async pipeline API required')
 const allowed=['DIAGNOSTIC canonical hardware LINEAR fields','Canonical waterFront','Canonical diffuse']
 if(!Array.isArray(recipes)||!recipes.length||recipes.length>3||new Set(recipes.map(r=>r.label)).size!==recipes.length||recipes.some(r=>!allowed.includes(r.label)||typeof r.code!=='string'||!r.code.includes('@compute')||r.label==='Canonical waterFront'&&JSON.stringify(r.constants)!=='{"DIAGNOSTIC_LAZY_CLIMB":0}'||r.label!=='Canonical waterFront'&&r.constants!==undefined))throw Error('Explicit observed baseline descriptor set required')
 const createModule=device.createShaderModule,createPipeline=device.createComputePipeline,modules=new WeakMap(),pipelines=new Map(),hits={}
 await Promise.all(recipes.map(async recipe=>{record('compute.preload:start',{label:recipe.label});const module=createModule.call(device,{label:recipe.moduleLabel,code:recipe.code}),pipeline=await device.createComputePipelineAsync({label:recipe.label,layout:'auto',compute:{module,entryPoint:'main',constants:recipe.constants}});pipelines.set(recipe.label,{recipe,pipeline});hits[recipe.label]=0;record('compute.preload:completed',{label:recipe.label,scope:'Compile only, zero fields/dispatch/history'})}))
 let alive=true
 device.createShaderModule=function(d){const module=createModule.call(this,d);modules.set(module,d.code);return module}
 device.createComputePipeline=function(d){const cached=pipelines.get(d.label);if(!cached)return createPipeline.call(this,d);if(!alive||this!==device||d.layout!=='auto'||d.compute?.entryPoint!=='main'||modules.get(d.compute.module)!==cached.recipe.code||JSON.stringify(d.compute.constants)!==JSON.stringify(cached.recipe.constants))throw Error('Observed exact preload descriptor differs before substitution');hits[d.label]++;record('compute.preload:hit',{label:d.label,hits:hits[d.label]});return cached.pipeline}
 return{get hits(){return{...hits}},restore(){if(!alive)return;alive=false;device.createShaderModule=createModule;device.createComputePipeline=createPipeline}}
}
