import {GPU_GROUPS_805,type NativeGpuProof805} from './gpu-group-goal'
/** Diagnostic fallback for devices without timer queries. This deliberately
 * serializes stages; elapsed time is NOT a pure GPU measurement. */
export async function runSynchronizedGoal805<T extends NativeGpuProof805>(gl:WebGLRenderingContext,controller:any,runDirect:()=>Promise<T>,baseline?:NativeGpuProof805){
 const key='__qaNativeAnatomy805',root=globalThis as any,descriptor=Object.getOwnPropertyDescriptor(root,key),original=controller.diagnosticRunCore
 let inCore=false,index=0,background=0,start=0,submitted=0,calls=0,dry=false
 const intervals:any[]=[]
 function finish(outputs:any){submitted=performance.now();const saved=gl.getParameter(gl.FRAMEBUFFER_BINDING),pixel=new Uint8Array(4);try{for(const buffer of new Set<any>(Object.values(outputs).filter((b:any)=>b?.fbo))){gl.bindFramebuffer(gl.FRAMEBUFFER,buffer.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel)}}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,saved)}const end=performance.now();intervals.push({...GPU_GROUPS_805[index],elapsedMs:end-start,submissionAndInternalWaitMs:submitted-start,boundaryWaitMs:end-submitted});start=end}
 const boundaries=['align.rawP','contrast.background','stitch.complete','front.rimPrepared','diffusion.complete','land.complete','background.reconstruct']
 try{
  root[key]=(event:any)=>{if(!inCore)return;if(event.stage==='dry.coverage')dry=true;if(event.stage==='background.reconstruct'&&++background!==2)return;if(event.stage===boundaries[index]){finish(event.outputs);index++}}
  controller.diagnosticRunCore=function(...args:any[]){if(++calls!==1)throw Error('Expected one core');start=performance.now();inCore=true;try{const result=original.apply(this,args);if(index!==7||!dry)throw Error('Missing sync boundary');finish(result);return result}finally{inCore=false}}
  const result=await runDirect();if(!result.sourceUnchanged)throw Error('Source changed');if(baseline)for(const field of ['outputSHA','sourceSHA','sourceSHAAfter','metadataSHA'] as const)if(JSON.stringify(result[field])!==JSON.stringify(baseline[field]))throw Error('Sync proof mismatch '+field)
  return{...result,gpu:{mode:'synchronized',intervals,totalGpuMs:intervals.reduce((n,r)=>n+r.elapsedMs,0),qualification:'Контроль с чтением пикселя из выходных карт после каждого этапа: CPU-команды, внутренние ожидания и ожидание GPU вместе. Это НЕ чистое время GPU. Барьеры меняют производительность; сравнивать с обычным прогоном.'}}
 }finally{controller.diagnosticRunCore=original;if(descriptor)Object.defineProperty(root,key,descriptor);else delete root[key]}
}
