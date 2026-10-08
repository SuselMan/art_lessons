/// <reference types="@webgpu/types" />
import { CANONICAL_FIELD_OPS_WGSL, type CanonicalFieldOptions } from './fieldOps'
import { canonicalDispatchRect } from '../dispatchRect'
import type { CanonicalGpuContext, CanonicalGpuField } from '../types'
const start=CANONICAL_FIELD_OPS_WGSL.indexOf('fn carry('),end=CANONICAL_FIELD_OPS_WGSL.indexOf('fn evaluate(',start)
if(start<0||end<0)throw new Error('Canonical paired carry shader anchor missing')
const carry=CANONICAL_FIELD_OPS_WGSL.slice(start,end)
/** Each expression remains the original carry expression. Both old records
 * are sampled before either distinct Q8 destination is written. No iteration
 * fusion and no change to sampling, uniforms or donor transfer equations. */
export const CANONICAL_PAIRED_CARRY_WGSL=CANONICAL_FIELD_OPS_WGSL.slice(0,start)+
 '@group(0) @binding(9) var colorOut:texture_storage_2d<rgba8unorm,write>;\n'+
 carry.replace('fn carry(', 'fn carryP(')+
 carry.replace('fn carry(', 'fn carryC(').replaceAll('sampleA(', 'sampleOldColor(').replaceAll('sampleC(', 'sampleA(').replaceAll('sampleOldColor(', 'sampleC(')+`
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u){
 if(any(tid.xy>=u.dispatch.zw)){return;}let q=tid.xy+u.dispatch.xy;let dims=u.dimsDir.xy;if(any(q>=vec2u(dims))){return;}
 let px=vec2f(f32(q.x)+.5,dims.y-f32(q.y)-.5);if(any(px<u.scissor.xy)||any(px>=u.scissor.xy+u.scissor.zw)){return;}
 let uv=px/dims;
 let pigment=carryP(uv,sampleA(uv),false);
 let color=carryC(uv,sampleC(uv),true);
 textureStore(outTex,vec2i(q),pigment);textureStore(colorOut,vec2i(q),color);
}`
export interface PairedCarryFields {pigment:CanonicalGpuField;color:CanonicalGpuField;fixed:CanonicalGpuField;outPigment:CanonicalGpuField;outColor:CanonicalGpuField}
/** Diagnostic only: no production caller selects this class by default. */
export class CanonicalPairedCarry {
 private readonly device:GPUDevice
 private pipeline:GPUComputePipeline|null=null
 private hardwarePipeline:GPUComputePipeline|null=null
 private hardwareSampler:GPUSampler|null=null
 private pipelineLayout(hardware=false):GPUPipelineLayout {
  const entries:GPUBindGroupLayoutEntry[]=[...Array.from({length:7},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'float' as const,viewDimension:'2d' as const}})),{binding:7,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:'write-only',format:'rgba8unorm'}},{binding:8,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:128}},{binding:9,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:'write-only',format:'rgba8unorm'}}]
  if(hardware)entries.push({binding:10,visibility:GPUShaderStage.COMPUTE,sampler:{type:'filtering'}})
  return this.device.createPipelineLayout({bindGroupLayouts:[this.device.createBindGroupLayout({entries})]})
 }
 constructor(device:GPUDevice){this.device=device}
 run(ctx:CanonicalGpuContext,r:PairedCarryFields,k:number,o:CanonicalFieldOptions={}):GPUBuffer {
  if(ctx.device!==this.device)throw new Error('Paired carry owner mismatch')
  const w=r.outPigment.width,h=r.outPigment.height
  if(r.outColor.width!==w||r.outColor.height!==h)throw new Error('Paired carry output dimensions differ')
  const fields=[r.pigment,r.fixed,r.color,o.d??r.fixed,o.e??r.fixed,o.path??r.fixed,o.noise??r.fixed]
  if(r.outColor.texture===r.outPigment.texture||fields.some(f=>f.texture===r.outPigment.texture||f.texture===r.outColor.texture))throw new Error('Paired carry output aliases old input')
  if(o.linearInputMask!==undefined)throw new Error('Paired carry uses field filter metadata, not mode-specific override')
  const mask=fields.slice(0,6).reduce((m,f,i)=>m|(f.filter==='linear'?1<<i:0),0),values=new Float32Array(32)
  values.set([w,h,(o.dir?.[0]??0)/w,(o.dir?.[1]??0)/h,...(o.tau??[0,0,0]),0,k,15,o.path?(o.pathPacked?2:1):0,o.gradientFibres?1:0,...(o.scissor??[0,0,w,h]),...(o.origin??[0,0]),...(o.size??[w,h]),...(o.band??[0,0]),o.world?.[0]??0,o.world?.[1]??0,o.world?.[2]??0,o.additiveZeroFaces?1:0,mask,0])
  const rect=canonicalDispatchRect(w,h,o.scissor);new Uint32Array(values.buffer).set(rect,28)
  if(values.slice(0,28).some(v=>!Number.isFinite(v)))throw new Error('Paired carry uniforms must be finite')
  if(!this.pipeline)this.pipeline=this.device.createComputePipeline({label:'Diagnostic canonical paired carry',layout:this.pipelineLayout(),compute:{module:this.device.createShaderModule({code:CANONICAL_PAIRED_CARRY_WGSL}),entryPoint:'main'}})
  if(o.diagnosticHardwareLinearInputs&&!this.hardwarePipeline){const code=CANONICAL_PAIRED_CARRY_WGSL.replace('@group(0) @binding(9) var colorOut:texture_storage_2d<rgba8unorm,write>;','@group(0) @binding(9) var colorOut:texture_storage_2d<rgba8unorm,write>;\n@group(0) @binding(10) var diagnosticLinear:sampler;').replace('return mix(mix(texel(t,i),texel(t,i+vec2i(1,0)),f.x),mix(texel(t,i+vec2i(0,1)),texel(t,i+vec2i(1,1)),f.x),f.y);','return textureSampleLevel(t,diagnosticLinear,vec2f(uv.x,1.0-uv.y),0.0);');this.hardwarePipeline=this.device.createComputePipeline({label:'Diagnostic paired carry hardware LINEAR',layout:this.pipelineLayout(true),compute:{module:this.device.createShaderModule({code}),entryPoint:'main'}})}
  const pipeline=o.diagnosticHardwareLinearInputs?this.hardwarePipeline!:this.pipeline
  const uniform=this.device.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(uniform,0,values)
  const entries:GPUBindGroupEntry[]=fields.map((f,binding)=>({binding,resource:f.view}));entries.push({binding:7,resource:r.outPigment.view},{binding:8,resource:{buffer:uniform}},{binding:9,resource:r.outColor.view})
  if(o.diagnosticHardwareLinearInputs){this.hardwareSampler??=this.device.createSampler({minFilter:'linear',magFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});entries.push({binding:10,resource:this.hardwareSampler})}
  const pass=ctx.encoder.beginComputePass({label:'Diagnostic paired carry'});pass.setPipeline(pipeline);pass.setBindGroup(0,this.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries}));pass.dispatchWorkgroups(Math.ceil(rect[2]/8),Math.ceil(rect[3]/8));pass.end();return uniform
 }
}
