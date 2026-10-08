/// <reference types="@webgpu/types" />
import{CANONICAL_STAMP_WGSL}from '../../../../apps/web/src/engine/src/webgpuCanonical/stamp'
import{CANONICAL_RIBBON_WGSL}from '../../../../apps/web/src/engine/src/webgpuCanonical/deposit'
import{tipVariantShader}from './heldStampVariants'
export async function compileMovingContact(){
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No adapter');const device=await adapter.requestDevice(),records=[];device.pushErrorScope('validation')
 try{for(const variant of ['literal','A']as const)for(const [kind,source]of[['stamp',CANONICAL_STAMP_WGSL],['ribbon',CANONICAL_RIBBON_WGSL]]as const){
  const module=device.createShaderModule({code:tipVariantShader(source,variant)}),info=await module.getCompilationInfo();const messages=info.messages.filter(m=>m.type==='error').map(m=>m.message)
  const formats:GPUVertexFormat[]=['float32x2','float32','float32','float32','float32','float32','float32','float32x3'],offsets=[0,8,12,16,20,24,28,32]
  for(const entryPoint of ['coverage','pigmentOnly','colorOnly'])await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs',buffers:kind==='ribbon'?[{arrayStride:44,attributes:formats.map((format,i)=>({format,offset:offsets[i]!,shaderLocation:i}))}]:[]},fragment:{module,entryPoint,targets:[{format:'rgba8unorm'}]}})
  records.push({variant,kind,messages})
 }const error=await device.popErrorScope();return{records,errors:error?[error.message]:[],scope:'Software compile/pipeline smoke only; no fields/draws/source orchestration/quality or hardware claim.'}}finally{device.destroy()}
}
