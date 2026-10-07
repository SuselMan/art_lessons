/// <reference types="@webgpu/types" />
import type { CanonicalGpuContext, CanonicalGpuField } from '../types'
export const CANONICAL_RESAMPLE_WGSL = `
struct Params { sizes:vec4f,origins:vec4f,scalars:vec4f,clampRect:vec4f,scissor:vec4f }
@group(0) @binding(0) var src:texture_2d<f32>;
@group(0) @binding(1) var old:texture_2d<f32>;
@group(0) @binding(2) var base:texture_2d<f32>;
@group(0) @binding(3) var outTex:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(4) var<uniform> u:Params;
fn texel(t:texture_2d<f32>,q:vec2f)->vec4f{
 let glq=vec2i(clamp(floor(q),u.clampRect.xy,u.clampRect.zw-1.0));let dims=vec2i(textureDimensions(t));
 return textureLoad(t,vec2i(glq.x,dims.y-1-glq.y),0);
}
fn bilerp(t:texture_2d<f32>,q:vec2f)->vec4f{
 let g=q-.5;let i=floor(g);let f=g-i;let a=texel(t,i);let b=texel(t,i+vec2f(1,0));let c=texel(t,i+vec2f(0,1));let d=texel(t,i+vec2f(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u){
 let dims=textureDimensions(outTex);let pixel=tid.xy;if(any(pixel>=dims)){return;}
 let px=vec2f(f32(pixel.x)+.5,f32(dims.y)-f32(pixel.y)-.5);
 if(any(px<u.scissor.xy)||any(px>=u.scissor.xy+u.scissor.zw)){return;}
 let q=u.origins.zw+(px-u.origins.xy)*u.scalars.x;let mode=u.scalars.y;var value=vec4f(0);
 if(mode<.5){value=.25*(texel(src,q+vec2f(-.5,-.5))+texel(src,q+vec2f(.5,-.5))+texel(src,q+vec2f(-.5,.5))+texel(src,q+vec2f(.5,.5)));}
 else{
  let bd=vec2i(textureDimensions(base));let glq=clamp(vec2i(floor(px/u.sizes.zw*vec2f(bd))),vec2i(0),bd-vec2i(1));let b=textureLoad(base,vec2i(glq.x,bd.y-1-glq.y),0);
  if(mode<1.5){let edge=min(min(q.x-u.clampRect.x,u.clampRect.z-q.x),min(q.y-u.clampRect.y,u.clampRect.w-q.y));let keep=smoothstep(1.0,6.0,edge);value=clamp(b+keep*(bilerp(src,q)-bilerp(old,q)),vec4f(0),vec4f(1));}
  else{value=max(b,bilerp(src,q));}
 }
 textureStore(outTex,vec2i(pixel),value);
}
`;
export class CanonicalResamplePass {
 private pipeline:GPUComputePipeline|null=null
 private readonly device:GPUDevice
 constructor(device:GPUDevice){this.device=device}
 run(ctx:CanonicalGpuContext,out:CanonicalGpuField,src:CanonicalGpuField,old:CanonicalGpuField,base:CanonicalGpuField,params:{dstOrigin:readonly[number,number];srcOrigin:readonly[number,number];ratio:number;mode:0|1|2;clamp:readonly[number,number,number,number];scissor:readonly[number,number,number,number];baseSize?:readonly[number,number]}){
  if(ctx.device!==this.device)throw new Error('Canonical device mismatch')
  if([src,old,base].some(f=>f.texture===out.texture))throw new Error('Canonical resample alias; caller must preserve temporary/copy boundary')
  if(params.clamp[0]<0||params.clamp[1]<0||params.clamp[2]>src.width||params.clamp[3]>src.height||params.clamp[2]<=params.clamp[0]||params.clamp[3]<=params.clamp[1])throw new Error('Canonical source clamp invalid')
  const values=new Float32Array([src.width,src.height,...(params.baseSize??[base.width,base.height]),...params.dstOrigin,...params.srcOrigin,params.ratio,params.mode,0,0,...params.clamp,...params.scissor]);if(values.some(v=>!Number.isFinite(v)))throw new Error('Canonical resample uniforms must be finite')
  if(!this.pipeline)this.pipeline=this.device.createComputePipeline({layout:'auto',compute:{module:this.device.createShaderModule({code:CANONICAL_RESAMPLE_WGSL}),entryPoint:'main'}})
  const uniform=this.device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(uniform,0,values)
  const bind=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:src.view},{binding:1,resource:old.view},{binding:2,resource:base.view},{binding:3,resource:out.view},{binding:4,resource:{buffer:uniform}}]})
  const pass=ctx.encoder.beginComputePass({label:'Canonical resample '+params.mode});pass.setPipeline(this.pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(out.width/8),Math.ceil(out.height/8));pass.end();return uniform
 }
}
