/// <reference types="@webgpu/types" />
import { CANONICAL_NOISE_WGSL } from './noise'
import type { CanonicalGpuField, CanonicalRasterPhase, CanonicalRibbonBatch } from './types'

/** Literal RIBBON_VERT/FRAG port. Production uniforms and 11-float vertices
 * enter unchanged. Each target remains RGBA8; coverage and ink are separate
 * passes so ink can read the completed solvent record without feedback. */
export const CANONICAL_RIBBON_WGSL = `
struct U { resolution:vec2f, worldOrigin:vec2f, seed:vec2f, aa:f32, wash:f32,
 retain:f32, combs:f32, bristle:f32, cloud:f32, gran:f32, blot:f32, available:f32, pad:f32, tau:vec4f }
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var availableTex:texture_2d<f32>;
@group(0) @binding(2) var noiseTex:texture_2d<f32>;
${CANONICAL_NOISE_WGSL}
struct VIn { @location(0) position:vec2f,@location(1) edge:f32,@location(2) ink:f32,
 @location(3) water:f32,@location(4) across:f32,@location(5) wet:f32,
 @location(6) strength:f32,@location(7) contact:vec3f }
struct VOut { @builtin(position) position:vec4f,@location(0) edge:f32,@location(1) ink:f32,
 @location(2) water:f32,@location(3) across:f32,@location(4) wet:f32,
 @location(5) strength:f32,@location(6) contact:vec3f }
@vertex fn vs(v:VIn)->VOut {
 var o:VOut;let p=floor(v.position*64.0+0.5)/64.0;
 o.position=vec4f(p/u.resolution*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),0,1);
 o.edge=v.edge;o.ink=v.ink;o.water=v.water;o.across=v.across;o.wet=v.wet;
 o.strength=v.strength;o.contact=v.contact;return o;
}
fn canonicalWp(v:VOut)->vec2f { return vec2f(v.position.x,u.resolution.y-v.position.y)+u.worldOrigin; }
fn availableWet(v:VOut)->f32 {
 let dims=vec2i(textureDimensions(availableTex));
 let a=textureLoad(availableTex,clamp(vec2i(v.position.xy),vec2i(0),dims-1),0);
 if(u.available>0.5){return clamp(a.b/max(a.a,0.002),0,1);}
 if(v.ink>5e-7){return v.wet/v.ink;}return 0;
}
@fragment fn coverage(v:VOut)->@location(0) vec4f {
 let cov=clamp(v.edge/u.aa,0,1);if(cov<=0){discard;}
 let wp=canonicalWp(v);let wet=clamp(availableWet(v),0,1);
 var water=0.0;if(v.ink>5e-7){water=clamp(v.water/v.ink,0,1);}
 let amount=cov*wcTipContact(v.across,u.combs,wp,v.contact.y);
 let standing=max(wet,u.wash*mix(u.retain,1.0,wet)*wcStandingGate(water,u.wash));
 return vec4f((v.across*.5+.5)*amount,amount*wcPoolness(v.contact.x,wet,u.blot)*step(0.0,v.strength),amount*standing,amount);
}
struct InkOut { @location(0) pigment:vec4f,@location(1) color:vec4f }
fn paint(v:VOut)->InkOut {
 let cov=clamp(v.edge/u.aa,0,1);if(cov<=0){discard;}
 let wp=canonicalWp(v);let wet=clamp(availableWet(v),0,1);
 var water=0.0;if(v.ink>5e-7){water=clamp(v.water/v.ink,0,1);}
 let mottle=wcCloud(wp,u.seed,u.cloud)*wcSettling(wp,u.seed,u.gran)*wcFilmBlot(wp,u.seed,v.contact.z,wet,u.blot,water,step(5e-7,abs(v.strength)));
 var amount=cov*v.ink*mottle*wcTipContact(v.across,u.combs,wp,v.contact.y);
 if(u.bristle>0){amount*=wcHairComb(wcHairField(v.across,u.combs,wp),wcHairAmp(u.bristle,water));}
 let strength=abs(v.strength)/max(v.ink,5e-7);var o:InkOut;
 o.pigment=vec4f(amount*water,amount*wet,amount*strength,amount);
 o.color=vec4f(amount*strength*u.tau.xyz/4.0,amount*strength);return o;
}
@fragment fn ink(v:VOut)->InkOut{return paint(v);}
@fragment fn pigmentOnly(v:VOut)->@location(0) vec4f{return paint(v).pigment;}
@fragment fn colorOnly(v:VOut)->@location(0) vec4f{return paint(v).color;}

`;
const layout: GPUVertexBufferLayout = { arrayStride: 44, attributes: [
 { shaderLocation: 0, offset: 0, format: 'float32x2' },
 ...Array.from({ length: 6 }, (_, k): GPUVertexAttribute => ({ shaderLocation: k + 1, offset: 8 + k * 4, format: 'float32' })),
 { shaderLocation: 7, offset: 32, format: 'float32x3' },
] }
const over: GPUBlendState = { color: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } }
const maximum: GPUBlendState = { color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' } }
const add: GPUBlendState = { color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' } }
export class CanonicalRibbonDeposit {
 readonly coverage: GPURenderPipeline
 readonly ink: GPURenderPipeline
 readonly inkMax: GPURenderPipeline
 private readonly single: Record<string,GPURenderPipeline>
 private readonly device: GPUDevice
 private readonly noise: CanonicalGpuField
 constructor(device: GPUDevice, noise: CanonicalGpuField) {
  this.device=device;this.noise=noise
  const module = device.createShaderModule({ label: 'production ribbon deposit', code: CANONICAL_RIBBON_WGSL })
  const vertex = { module, entryPoint: 'vs', buffers: [layout] }
  this.coverage = device.createRenderPipeline({ label: 'production coverage Q8 over', layout: 'auto', vertex, fragment: { module, entryPoint: 'coverage', targets: [{ format: 'rgba8unorm', blend: over }] }, primitive: { topology: 'triangle-list' } })
  this.inkMax = device.createRenderPipeline({ label: 'production ink/depth Q8 MAX film', layout: 'auto', vertex, fragment: { module, entryPoint: 'ink', targets: [{ format: 'rgba8unorm', blend: maximum }, { format: 'rgba8unorm', blend: maximum }] }, primitive: { topology: 'triangle-list' } })
  this.ink = device.createRenderPipeline({ label: 'production ink/depth Q8 add', layout: 'auto', vertex, fragment: { module, entryPoint: 'ink', targets: [{ format: 'rgba8unorm', blend: add }, { format: 'rgba8unorm', blend: add }] }, primitive: { topology: 'triangle-list' } })
  this.single = Object.fromEntries((['pigmentOnly','colorOnly'] as const).flatMap(entryPoint => (['max','add'] as const).map(mode => [entryPoint+mode,device.createRenderPipeline({layout:'auto',vertex,fragment:{module,entryPoint,targets:[{format:'rgba8unorm',blend:mode==='max'?maximum:add}]},primitive:{topology:'triangle-list'}})])))
 }
 encode(encoder: GPUCommandEncoder, batch: CanonicalRibbonBatch, coverage: CanonicalGpuField, previousWater: CanonicalGpuField, pigment: CanonicalGpuField, color: CanonicalGpuField, phase:CanonicalRasterPhase='all'): GPUBuffer[] {
  if (batch.vertices.length % 33 !== 0) throw new Error('Canonical ribbon requires production 11-float triangle vertices')
  const v = batch.uniforms
  const uniform = this.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  this.device.queue.writeBuffer(uniform, 0, new Float32Array([coverage.width, coverage.height, ...v.worldOrigin, ...v.mottleSeed, v.aaPx, v.washWater, v.waterRetain, v.bristleCombs, v.bristleInk, v.cloudDeposit, v.granDeposit, v.poolBlot, +v.useAvailableWater, 0, ...v.tau, 0]))
  const vertices = this.device.createBuffer({ size: Math.max(batch.vertices.byteLength, 4), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST })
  this.device.queue.writeBuffer(vertices, 0, batch.vertices as Float32Array<ArrayBuffer>)
  const encode = (pipeline: GPURenderPipeline, read: CanonicalGpuField, writes: CanonicalGpuField[]) => {
   const group = this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: read.view }, { binding: 2, resource: this.noise.view }] })
   const pass = encoder.beginRenderPass({ colorAttachments: writes.map(field => ({ view: field.view, loadOp: 'load', storeOp: 'store' })) })
   pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.setVertexBuffer(0, vertices); pass.draw(batch.vertices.length / 11); pass.end()
  }
  if(phase==='all'||phase==='coverage')encode(this.coverage, previousWater, [coverage])
  if(phase==='all')encode(batch.inkBlend === 'max' ? this.inkMax : this.ink, coverage, [pigment,color])
  if(phase==='pigment')encode(this.single['pigmentOnly'+batch.inkBlend],coverage,[pigment])
  if(phase==='color')encode(this.single['colorOnly'+batch.inkBlend],coverage,[color])
  return [uniform, vertices]
 }
}
