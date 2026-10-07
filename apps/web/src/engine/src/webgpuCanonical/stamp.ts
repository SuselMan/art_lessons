/// <reference types="@webgpu/types" />
import { CANONICAL_NOISE_WGSL } from './noise'
import type { CanonicalGpuField, CanonicalRasterPhase, CanonicalStamp } from './types'
/** Literal production DAB_VERT and markerNibDistPx/inkMode6+7 branches.
 * Parameters are prepared upstream by the production CPU path. */
export const CANONICAL_STAMP_WGSL = `
struct U { resolution:vec2f, worldOrigin:vec2f, seed:vec2f, aa:f32, wash:f32,
 retain:f32, combs:f32, bristle:f32, cloud:f32, gran:f32, blot:f32, available:f32, pad:f32, tau:vec4f,
 pose:vec4f, shape:vec4f, paint:vec4f, contact:vec4f, clip:vec4f }
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var coverageTex:texture_2d<f32>;
@group(0) @binding(2) var noiseTex:texture_2d<f32>;
${CANONICAL_NOISE_WGSL}
struct V { @builtin(position) position:vec4f,@location(0) local:vec2f }
@vertex fn vs(@builtin(vertex_index) n:u32)->V {
 let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));let uv=corners[n];
 let c=cos(u.shape.x);let s=sin(u.shape.x);let scaled=uv*vec2f(u.pose.w,1.0);
 let p=vec2f(scaled.x*c-scaled.y*s,scaled.x*s+scaled.y*c)*u.pose.z+u.pose.xy;
 var o:V;o.position=vec4f(p/u.resolution*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),0,1);o.local=uv;return o;
}
fn nibDistance(v:V)->f32 {
 let b=max(u.pose.z,1e-4);let a=b*max(u.pose.w,1.0);
 if(u.shape.y>0.5) {
  let lp=v.local*vec2f(a,b);let r=min(u.shape.z,min(a,b));let q=abs(lp)-vec2f(a,b)+r;
  return min(max(q.x,q.y),0.0)+length(max(q,vec2f(0)))-r;
 }
 let f=dot(v.local,v.local);let grad=2.0*v.local/vec2f(a,b);return (f-1.0)/max(length(grad),1e-6);
}
fn across(v:V)->f32 {let b=max(u.pose.z,1e-4);let axes=vec2f(b*max(u.pose.w,1.0),b);return clamp(dot(v.local*axes,u.contact.xy)/max(length(axes*u.contact.xy),1e-4),-1,1);}
fn wp(v:V)->vec2f {return vec2f(v.position.x,u.resolution.y-v.position.y)+u.worldOrigin;}
fn covered(v:V)->vec4f {return textureLoad(coverageTex,clamp(vec2i(v.position.xy),vec2i(0),vec2i(textureDimensions(coverageTex))-1),0);}
@fragment fn coverage(v:V)->@location(0) vec4f {
 var cov=clamp(-nibDistance(v)/u.aa,0,1);if(cov<=0){discard;}
 let a=across(v);cov*=wcTipContact(a,u.combs,wp(v),wcTipPressure(u.contact.z,u.pose.z));
 return vec4f((a*.5+.5)*cov,cov*wcPoolness(u.paint.w,u.paint.y,u.blot),cov*max(u.paint.y,u.wash*mix(u.retain,1.0,u.paint.y)*wcStandingGate(u.paint.x,u.wash)),cov);
}
struct InkOut { @location(0) pigment:vec4f,@location(1) color:vec4f }
fn paint(v:V)->InkOut {
 let distance=nibDistance(v);let cov=clamp(-distance/u.aa,0,1);if(cov<=0){discard;}
 let depth=clamp(-distance/max(u.pose.z,1e-4)*2.0,0,1);
 var amount=cov*mix(u.contact.w,1.0,depth)*u.shape.w;
 let a=across(v);let world=wp(v);
 if(u.bristle>0){amount*=wcHairComb(wcHairField(a,u.combs,world),wcHairAmp(u.bristle,u.paint.x));}
 amount*=wcTipContact(a,u.combs,world,wcTipPressure(u.contact.z,u.pose.z));
 let cv=covered(v);if(u.clip.x>0.5&&u.clip.x<1.5){amount*=cv.a;}
 var wet=u.paint.y;if(u.clip.x>1.5){wet=clamp(cv.b/max(cv.a,0.002),0,1);}
 amount*=wcCloud(world,u.seed,u.cloud)*wcSettling(world,u.seed,u.gran)*wcFilmBlot(world,u.seed,u.clip.y,wet,u.blot,u.paint.x,step(5e-7,abs(u.paint.z)));
 var o:InkOut;o.pigment=vec4f(amount*u.paint.x,amount*wet,amount*u.paint.z,amount);o.color=vec4f(amount*u.paint.z*u.tau.xyz/4.0,amount*u.paint.z);return o;
}
@fragment fn ink(v:V)->InkOut{return paint(v);}
@fragment fn pigmentOnly(v:V)->@location(0) vec4f{return paint(v).pigment;}
@fragment fn colorOnly(v:V)->@location(0) vec4f{return paint(v).color;}

`;
export class CanonicalStampDeposit {
 private readonly device: GPUDevice
 private readonly noise: CanonicalGpuField
 private readonly coverage: GPURenderPipeline
 private readonly ink: Record<'max'|'add', GPURenderPipeline>
 private readonly single: Record<string,GPURenderPipeline>
 constructor(device: GPUDevice, noise: CanonicalGpuField) {
  this.device=device;this.noise=noise
  const module=device.createShaderModule({label:'production watercolor nib deposit',code:CANONICAL_STAMP_WGSL})
  const vertex={module,entryPoint:'vs'}
  const over:GPUBlendState={color:{operation:'add',srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{operation:'add',srcFactor:'one',dstFactor:'one-minus-src-alpha'}}
  this.coverage=device.createRenderPipeline({layout:'auto',vertex,fragment:{module,entryPoint:'coverage',targets:[{format:'rgba8unorm',blend:over}]}})
  this.ink=Object.fromEntries((['max','add'] as const).map(mode=>{const blend:GPUBlendState={color:{operation:mode,srcFactor:'one',dstFactor:'one'},alpha:{operation:mode,srcFactor:'one',dstFactor:'one'}};return[mode,device.createRenderPipeline({layout:'auto',vertex,fragment:{module,entryPoint:'ink',targets:[{format:'rgba8unorm',blend},{format:'rgba8unorm',blend}]}})]})) as Record<'max'|'add',GPURenderPipeline>
  this.single=Object.fromEntries((['pigmentOnly','colorOnly'] as const).flatMap(entryPoint=>(['max','add'] as const).map(mode=>{const blend:GPUBlendState={color:{operation:mode,srcFactor:'one',dstFactor:'one'},alpha:{operation:mode,srcFactor:'one',dstFactor:'one'}};return[entryPoint+mode,device.createRenderPipeline({layout:'auto',vertex,fragment:{module,entryPoint,targets:[{format:'rgba8unorm',blend}]}})]})))
 }
 encode(encoder:GPUCommandEncoder,stamp:CanonicalStamp,coverage:CanonicalGpuField,blank:CanonicalGpuField,pigment:CanonicalGpuField,color:CanonicalGpuField,phase:CanonicalRasterPhase='all'):GPUBuffer[] {
  const v=stamp.uniforms,u=this.device.createBuffer({size:160,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})
  this.device.queue.writeBuffer(u,0,new Float32Array([coverage.width,coverage.height,...v.worldOrigin,...v.mottleSeed,v.aaPx,v.washWater,v.waterRetain,v.bristleCombs,v.bristleInk,v.cloudDeposit,v.granDeposit,v.poolBlot,+v.useAvailableWater,0,...v.tau,0,...stamp.center,stamp.radius,stamp.aspect,stamp.angle,+(stamp.nibShape==='roundedBox'),stamp.cornerRadius,stamp.opacity,stamp.inkWater,stamp.paperWet,stamp.inkStrength,stamp.puddle,...stamp.acrossLocal,stamp.pressure,stamp.inkEdge,stamp.inkClip,stamp.pigmentPool,0,0]))
  const encode=(pipeline:GPURenderPipeline,read:CanonicalGpuField,writes:CanonicalGpuField[])=>{
   // Coverage entry does not statically use binding1; auto layout omits it.
   const entries:GPUBindGroupEntry[]=[{binding:0,resource:{buffer:u}},{binding:2,resource:this.noise.view}]
   if(pipeline!==this.coverage)entries.push({binding:1,resource:read.view})
   const group=this.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries})
   const pass=encoder.beginRenderPass({colorAttachments:writes.map(field=>({view:field.view,loadOp:'load',storeOp:'store'}))});pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(6);pass.end()
  }
  if(phase==='all'||phase==='coverage')encode(this.coverage,blank,[coverage])
  if(phase==='all')encode(this.ink[stamp.inkBlend],coverage,[pigment,color])
  if(phase==='pigment')encode(this.single['pigmentOnly'+stamp.inkBlend],coverage,[pigment])
  if(phase==='color')encode(this.single['colorOnly'+stamp.inkBlend],coverage,[color])
  return[u]
 }
}
