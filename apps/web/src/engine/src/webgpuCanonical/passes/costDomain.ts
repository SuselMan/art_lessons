/// <reference types="@webgpu/types" />
import type { CanonicalGpuContext, CanonicalGpuField } from '../types'
export const CANONICAL_COST_DOMAIN_WGSL = `
struct Params{dims:vec2f,pad:vec2f,rect:vec4f,scalars:vec4f}
@group(0) @binding(0) var source:texture_2d<f32>;
@group(0) @binding(1) var output:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(2) var<uniform> u:Params;
fn channel(value:vec4f,direction:vec2f)->f32{
 if(direction.x>0){return value.r;}if(direction.x<0){return value.g;}if(direction.y>0){return value.b;}return value.a;
}
fn inside(pixel:vec2f)->bool{return all(pixel>=u.rect.xy)&&all(pixel<u.rect.zw);}
fn at(pixel:vec2f)->vec4f{
 let dims=vec2i(textureDimensions(source));let glq=clamp(vec2i(floor((pixel+.5)/u.dims*vec2f(dims))),vec2i(0),dims-vec2i(1));return textureLoad(source,vec2i(glq.x,dims.y-1-glq.y),0);
}
fn path(pixel:vec2f,direction:vec2f)->f32{
 let stride=u.scalars.y;let packed=u.scalars.z>.5;let other=pixel+direction*max(stride,1.0);if(!inside(pixel)){return 0;}
 let previous=at(pixel);let code=floor(channel(previous,direction)*255.0+.5);
 if(!inside(other)){if(packed&&stride>=.5){return code/255.0;}return 0;}
 let a=at(pixel);let b=at(other);
 if(stride<.5){if(a.r<=u.scalars.x&&b.r<=u.scalars.x){if(packed){return 1.0/255.0;}return 1;}return 0;}
 if(packed){let neighbour=floor(channel(b,direction)*255.0+.5);let c=floor(code/stride);let n=floor(neighbour/stride);let connected=(c-2.0*floor(c/2.0))*(n-2.0*floor(n/2.0));return (code+2.0*stride*connected)/255.0;}
 return min(channel(a,direction),channel(b,direction));
}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u){
 let q=tid.xy;if(any(q>=vec2u(u.dims))){return;}
 let pixel=vec2f(f32(q.x),u.dims.y-1.0-f32(q.y));
 textureStore(output,vec2i(q),vec4f(path(pixel,vec2f(1,0)),path(pixel,vec2f(-1,0)),path(pixel,vec2f(0,1)),path(pixel,vec2f(0,-1))));
}
`;
export class CanonicalCostDomainPass{
 private pipeline:GPUComputePipeline|null=null
 private readonly device:GPUDevice
 constructor(device:GPUDevice){this.device=device}
 run(ctx:CanonicalGpuContext,out:CanonicalGpuField,source:CanonicalGpuField,rect:readonly[number,number,number,number],band:number,stride:number,packed=false){
  if(ctx.device!==this.device)throw new Error('Canonical device mismatch')
  if(out.texture===source.texture)throw new Error('Canonical costDomain aliases input')
  const values=new Float32Array([out.width,out.height,0,0,...rect,band,stride,packed?1:0,0]);if(values.some(v=>!Number.isFinite(v)))throw new Error('Canonical uniforms must be finite')
  if(!this.pipeline)this.pipeline=this.device.createComputePipeline({layout:'auto',compute:{module:this.device.createShaderModule({code:CANONICAL_COST_DOMAIN_WGSL}),entryPoint:'main'}})
  const uniform=this.device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(uniform,0,values)
  const bind=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:source.view},{binding:1,resource:out.view},{binding:2,resource:{buffer:uniform}}]})
  const pass=ctx.encoder.beginComputePass({label:'Canonical costDomain'});pass.setPipeline(this.pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(out.width/8),Math.ceil(out.height/8));pass.end();return uniform
 }
}
