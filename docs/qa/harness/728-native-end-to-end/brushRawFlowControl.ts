/// <reference types="@webgpu/types" />
import {CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/brush'
import type {CanonicalGpuContext,CanonicalGpuField} from '../../../../apps/web/src/engine/src/webgpuCanonical/types'
import {canonicalDispatchRect} from '../../../../apps/web/src/engine/src/webgpuCanonical/dispatchRect'
/** QA ONLY equivalent physical sampling: GL-raw flow rows + direct localUV.
 * Baseline uses flipped rows + (local.x,1-local.y); no raw/fraction/floor changes.
 * These coordinates can round differently in F32, so equivalence is measured. */
export function rawFlowControlShader(){const old='return sampled(flow,local,true).rgb;';if(CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.split(old).length!==2)throw Error('Exact flow-only shader seam changed');return CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.replace(old,'return textureSampleLevel(flow,linearClamp,local,0).rgb;')}
export function encodeRawFlowBrush(ctx:CanonicalGpuContext,fields:{pigment:CanonicalGpuField;color:CanonicalGpuField;water:CanonicalGpuField;flow:CanonicalGpuField;out:CanonicalGpuField},output:'pigment'|'color',gain:number,flowRect:readonly[number,number,number,number],scissor:readonly[number,number,number,number]){
 const {device,encoder}=ctx,f=fields;if([f.pigment,f.color,f.water,f.flow].some(v=>v.texture===f.out.texture)||[f.pigment,f.color,f.water,f.out].some(v=>v.width!==1536||v.height!==1536||v.filter!=='nearest'))throw Error('Exact original contact resources required')
 const module=device.createShaderModule({label:'QA original GL-raw flow brush',code:rawFlowControlShader()}),pipeline=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'brush'}}),rect=canonicalDispatchRect(1536,1536,scissor)
 const values=new Float32Array(24);values.set([1/1536,1/1536,1/1536,1/1536,...flowRect,gain,0,0,0,...scissor]);new Uint32Array(values.buffer).set(rect,16);values.set([+(output==='color'),0,0,0],20)
 const u=device.createBuffer({size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});try{device.queue.writeBuffer(u,0,values);const entries:GPUBindGroupEntry[]=[{binding:0,resource:{buffer:u}},...[f.pigment,f.color,f.flow,f.water].map((field,k)=>({binding:k+1,resource:field.view})),{binding:5,resource:ctx.linear},{binding:6,resource:f.out.view}],group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries}),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(rect[2]/8),Math.ceil(rect[3]/8));pass.end();return[u]}catch(e){u.destroy();throw e}
}
