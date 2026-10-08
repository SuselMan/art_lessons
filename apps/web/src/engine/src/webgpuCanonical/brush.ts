import { canonicalDispatchRect } from './dispatchRect'
import { withTransientGpuBuffers } from './transientBuffers'
/// <reference types="@webgpu/types" />
import type { CanonicalGpuContext, CanonicalGpuField } from './types'
/** Literal WC_BRUSH_DRAG_BASELINE_FRAG with both P/C written from one old
 * contact state. Q8 floor/capacity limits remain per pulse, not per gesture.
 * Hardware transcendental/raster parity is measured, never assumed. */
export const CANONICAL_TEXTURE_BRUSH_WGSL = `
struct U { step:vec2f,texel:vec2f,flowRect:vec4f,control:vec4f,scissor:vec4f,dispatch:vec4u }
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var pigment:texture_2d<f32>;
@group(0) @binding(2) var color:texture_2d<f32>;
@group(0) @binding(3) var flow:texture_2d<f32>;
@group(0) @binding(4) var water:texture_2d<f32>;
@group(0) @binding(5) var linearClamp:sampler;
@group(0) @binding(6) var outPigment:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(7) var outColor:texture_storage_2d<rgba8unorm,write>;
fn sampled(tex:texture_2d<f32>,uv:vec2f,useLinear:bool)->vec4f{
 if(useLinear){return textureSampleLevel(tex,linearClamp,vec2f(uv.x,1.0-uv.y),0);}
 let dims=textureDimensions(tex);let glCell=vec2i(floor(uv*vec2f(dims)));let cell=clamp(vec2i(glCell.x,i32(dims.y)-1-glCell.y),vec2i(0),vec2i(dims)-1);return textureLoad(tex,cell,0);
}
fn pigmentAt(uv:vec2f)->vec4f{return sampled(pigment,uv,u.control.y>.5);}
fn colorAt(uv:vec2f)->vec4f{return sampled(color,uv,u.control.z>.5);}
fn waterAt(uv:vec2f)->vec4f{return sampled(water,uv,u.control.w>.5);}
fn flowAt(uv:vec2f)->vec3f {
 let local=(uv-u.flowRect.xy)/u.flowRect.zw;
 if(min(min(local.x,local.y),min(1.0-local.x,1.0-local.y))<0.0){return vec3f(.5,.5,0);}
 return sampled(flow,local,true).rgb;
}
fn axis(k:u32)->vec2f {if(k==0u){return vec2f(1,0);}if(k==1u){return vec2f(-1,0);}if(k==2u){return vec2f(0,1);}return vec2f(0,-1);}
fn snap(uv:vec2f)->vec2f{return(floor(uv/u.texel)+.5)*u.texel;}
fn raw(startUv:vec2f,endUv:vec2f,direction:vec2f)->f32 {
 let a=snap(startUv);let b=snap(endUv);
 if(min(min(b.x,b.y),min(1.0-b.x,1.0-b.y))<0.0||min(min(a.x,a.y),min(1.0-a.x,1.0-a.y))<0.0){return 0;}
 let f=flowAt(a);let velocity=f.rg*2.0-1.0;
 var contact=smoothstep(.015,.15,min(waterAt(a).a,waterAt(b).a));
 contact*=step(.015,waterAt((a+b)*.5).a);
 let donor=pigmentAt(a).a;let neighbour=pigmentAt(b).a;
 let mixFraction=.02*max(donor-neighbour,0.0)/max(donor,5e-5);
 let dose=min(f.b,flowAt(b).b);let clock=-log(max(1.0-clamp(dose,0,1),1.0/255.0));
 return(.3535533905932738*u.control.x*abs(dot(.5*(velocity+(flowAt(b).rg*2.0-1.0)),direction))*clock+mixFraction*dose)*contact;
}
fn channelLimit(q:f32,cap:f32,amount:f32)->f32 {if(q<.5||amount<=0){return 1;}return min(1.0,cap/(q*amount));}
fn fraction(startUv:vec2f,endUv:vec2f,direction:vec2f)->f32 {
 let a=snap(startUv);let b=snap(endUv);let amount=raw(a,b,direction);if(amount<=0){return 0;}
 let P=floor(pigmentAt(a)*255.0+.5);let C=floor(colorAt(a)*255.0+.5);
 let roomP=floor((255.0-floor(pigmentAt(b)*255.0+.5))/4.0);
 let roomC=floor((255.0-floor(colorAt(b)*255.0+.5))/4.0);
 var limit=1.0;
 for(var k=0u;k<4u;k++){limit=min(limit,channelLimit(P[k],roomP[k],amount));}
 for(var k=0u;k<4u;k++){limit=min(limit,channelLimit(C[k],roomC[k],amount));}
 return amount*limit;
}
@compute @workgroup_size(8,8) fn brush(@builtin(global_invocation_id) tid:vec3u) {
 if(any(tid.xy>=u.dispatch.zw)){return;}let q=tid.xy+u.dispatch.xy;
 let dims=textureDimensions(outPigment);if(any(q>=dims)){return;}
 let glPixel=vec2f(f32(q.x)+.5,f32(dims.y)-f32(q.y)-.5);if(any(glPixel<u.scissor.xy)||any(glPixel>=u.scissor.xy+u.scissor.zw)){return;}
 let center=snap(vec2f(f32(q.x)+.5,f32(dims.y)-f32(q.y)-.5)/vec2f(dims));
 let ownP=floor(pigmentAt(center)*255.0+.5);let ownC=floor(colorAt(center)*255.0+.5);
 var P=ownP;var C=ownC;
 for(var k=0u;k<4u;k++){
  let dir=axis(k);let neighbour=snap(center+dir*u.step);let give=fraction(center,neighbour,dir);let take=fraction(neighbour,center,-dir);
  P-=floor(ownP*give);C-=floor(ownC*give);
  P+=floor(floor(pigmentAt(neighbour)*255.0+.5)*take);C+=floor(floor(colorAt(neighbour)*255.0+.5)*take);
 }
 textureStore(outPigment,vec2i(q),clamp(P/255.0,vec4f(0),vec4f(1)));
 textureStore(outColor,vec2i(q),clamp(C/255.0,vec4f(0),vec4f(1)));
}
`;
/** One storage target, derived from exactly the same donor/capacity body.
 * Output selection changes only the final store, never the old P/C reads. */
export const CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL=CANONICAL_TEXTURE_BRUSH_WGSL
 .replace('dispatch:vec4u }','dispatch:vec4u,output:vec4f }')
 .replace('@group(0) @binding(7) var outColor:texture_storage_2d<rgba8unorm,write>;','')
 .replace(' textureStore(outPigment,vec2i(q),clamp(P/255.0,vec4f(0),vec4f(1)));\n textureStore(outColor,vec2i(q),clamp(C/255.0,vec4f(0),vec4f(1)));',
  ' textureStore(outPigment,vec2i(q),clamp(select(P,C,u.output.x>.5)/255.0,vec4f(0),vec4f(1)));')
export class CanonicalBrushContact {
 private readonly device: GPUDevice
 private readonly pipeline: GPUComputePipeline
 private readonly singlePipeline:GPUComputePipeline
 constructor(device:GPUDevice) {this.device=device;const module=device.createShaderModule({label:'canonical paired Q8 brush contact',code:CANONICAL_TEXTURE_BRUSH_WGSL});this.pipeline=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'brush'}});const singleModule=device.createShaderModule({label:'canonical single Q8 brush contact',code:CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL});this.singlePipeline=device.createComputePipeline({layout:'auto',compute:{module:singleModule,entryPoint:'brush'}})}
 encode(ctx:CanonicalGpuContext,fields:{pigment:CanonicalGpuField;color:CanonicalGpuField;flow:CanonicalGpuField;water:CanonicalGpuField;outPigment:CanonicalGpuField;outColor:CanonicalGpuField},step:readonly[number,number],gain:number,flowRect:readonly[number,number,number,number],scissor?:readonly[number,number,number,number]):GPUBuffer[] {
  return withTransientGpuBuffers(retain=>{
  const f=fields;if([f.pigment,f.color,f.flow,f.water].some(a=>a.texture===f.outPigment.texture||a.texture===f.outColor.texture)||f.outPigment.texture===f.outColor.texture)throw new Error('Canonical brush requires distinct read/write fields')
  const rect=canonicalDispatchRect(f.outPigment.width,f.outPigment.height,scissor);if(!rect[2]||!rect[3])return[]
  const values=new Float32Array(20);values.set([...step,1/f.pigment.width,1/f.pigment.height,...flowRect,gain,+(f.pigment.filter==='linear'),+(f.color.filter==='linear'),+(f.water.filter==='linear'),...(scissor??[0,0,f.outPigment.width,f.outPigment.height])]);new Uint32Array(values.buffer).set(rect,16)
  const u=retain(this.device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));this.device.queue.writeBuffer(u,0,values)
  const entries:GPUBindGroupEntry[]=[{binding:0,resource:{buffer:u}},...[f.pigment,f.color,f.flow,f.water].map((field,k)=>({binding:k+1,resource:field.view})),{binding:5,resource:ctx.linear},{binding:6,resource:f.outPigment.view},{binding:7,resource:f.outColor.view}]
  const group=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries}),pass=ctx.encoder.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(rect[2]/8),Math.ceil(rect[3]/8));pass.end();return[u]
 
  })
 }
 encodeSingle(ctx:CanonicalGpuContext,fields:{pigment:CanonicalGpuField;color:CanonicalGpuField;flow:CanonicalGpuField;water:CanonicalGpuField;out:CanonicalGpuField},output:'pigment'|'color',step:readonly[number,number],gain:number,flowRect:readonly[number,number,number,number],scissor?:readonly[number,number,number,number]):GPUBuffer[] {
  return withTransientGpuBuffers(retain=>{
  const f=fields;if([f.pigment,f.color,f.flow,f.water].some(a=>a.texture===f.out.texture))throw new Error('Canonical single brush requires distinct read/write fields')
  if(f.out.width!==f.pigment.width||f.out.height!==f.pigment.height||f.color.width!==f.pigment.width||f.color.height!==f.pigment.height)throw new Error('Canonical single brush P/C/output dimensions mismatch')
  const rect=canonicalDispatchRect(f.out.width,f.out.height,scissor);if(!rect[2]||!rect[3])return[]
  const values=new Float32Array(24);values.set([...step,1/f.pigment.width,1/f.pigment.height,...flowRect,gain,+(f.pigment.filter==='linear'),+(f.color.filter==='linear'),+(f.water.filter==='linear'),...(scissor??[0,0,f.out.width,f.out.height])]);new Uint32Array(values.buffer).set(rect,16);values.set([+(output==='color'),0,0,0],20)
  const u=retain(this.device.createBuffer({size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));this.device.queue.writeBuffer(u,0,values)
  const entries:GPUBindGroupEntry[]=[{binding:0,resource:{buffer:u}},...[f.pigment,f.color,f.flow,f.water].map((field,k)=>({binding:k+1,resource:field.view})),{binding:5,resource:ctx.linear},{binding:6,resource:f.out.view}]
  const group=this.device.createBindGroup({layout:this.singlePipeline.getBindGroupLayout(0),entries}),pass=ctx.encoder.beginComputePass();pass.setPipeline(this.singlePipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(rect[2]/8),Math.ceil(rect[3]/8));pass.end();return[u]
 
  })
 }

}
