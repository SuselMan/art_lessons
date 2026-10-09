import type {CanonicalGpuContext,CanonicalPassResources,CanonicalGpuField} from '../types'
import {CANONICAL_FRONT_CACHE_PREP_WGSL} from './kernels'
/** OFF diagnostic: one immutable float cache, bounded per dispatcher/device.
 * Geometry change falls back rather than reallocating during active encoders. */
export class CanonicalStaticFrontCache {
 private unavailable=false
 private readonly device:GPUDevice
 private key:string|null=null
 private heightKey:string|null=null
 private paper:GPUTexture|null=null
 private noise:GPUTexture|null=null
 private texture:GPUTexture|null=null
 private uniform:GPUBuffer|null=null
 cleanupFailures=0
 private disposePair(texture:GPUTexture|null,uniform:GPUBuffer|null){try{texture?.destroy()}catch{this.cleanupFailures++}try{uniform?.destroy()}catch{this.cleanupFailures++}}
 prepCalls=0
 hitCalls=0
 fallbackCalls=0
 constructor(device:GPUDevice){this.device=device;void device.lost.then(()=>this.destroy())}
 getOrEncode(ctx:CanonicalGpuContext,r:CanonicalPassResources,noise:CanonicalGpuField,coeff:readonly[number,number,number,number],uniforms:Float32Array,timestampWrites?:GPUComputePassTimestampWrites,heightOnly=false):GPUTextureView|null{
  if(this.unavailable)throw Error('Static cache unavailable')
  if(ctx.device!==this.device)throw Error('Static cache device mismatch')
  if(r.out.texture===r.paper.field.texture||r.out.texture===noise.texture)throw Error('Static cache output aliases immutable inputs')
  if(!r.paper.staticInputEpoch){this.fallbackCalls++;return null}
  if(!Number.isInteger(r.out.width)||!Number.isInteger(r.out.height)||r.out.width<=0||r.out.height<=0||r.out.width*r.out.height*8>18*1024*1024||!Number.isInteger(coeff[3])||coeff[3]<1||r.out.width>8388608||r.out.height>8388608){this.fallbackCalls++;return null}
  const heightKey=JSON.stringify([r.out.width,r.out.height,...r.paper.origin,...r.paper.texSize,r.paper.scale,r.paper.staticInputEpoch]);const key=heightKey+':'+coeff[0]
  if(this.key!==null){if((heightOnly?heightKey!==this.heightKey:key!==this.key)||this.paper!==r.paper.field.texture||this.noise!==noise.texture){this.fallbackCalls++;return null}this.hitCalls++;return this.texture!.createView()}
  const texture=this.device.createTexture({label:'diagnostic static front height/climb',size:[r.out.width,r.out.height],format:'rg32float',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING});let uniform:GPUBuffer|null=null
  try{
   uniform=this.device.createBuffer({label:'static front cache immutable uniforms',size:uniforms.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})
   this.device.queue.writeBuffer(uniform,0,uniforms)
   const pipeline=this.device.createComputePipeline({layout:'auto',compute:{module:this.device.createShaderModule({code:CANONICAL_FRONT_CACHE_PREP_WGSL}),entryPoint:'main'}})
   const bindings=this.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:2,resource:r.paper.field.view},{binding:4,resource:noise.view},{binding:6,resource:{buffer:uniform}},{binding:7,resource:texture.createView()}]})
   const pass=ctx.encoder.beginComputePass({label:'static front cache prepare',timestampWrites});pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.dispatchWorkgroups(Math.ceil(r.out.width/8),Math.ceil(r.out.height/8));pass.end()
   this.key=key;this.heightKey=heightKey;this.paper=r.paper.field.texture;this.noise=noise.texture;this.texture=texture;this.uniform=uniform;this.prepCalls++;return texture.createView()
  }catch(error){this.disposePair(texture,uniform);throw error}
 }
 /** Call only after submitted work completes, or after device loss. */
 retire(defer:(cleanup:()=>void)=>void){const texture=this.texture,uniform=this.uniform;this.texture=null;this.uniform=null;this.key=null;this.heightKey=null;this.paper=null;this.noise=null;if(texture||uniform)defer(()=>this.disposePair(texture,uniform))}
 destroy(){this.unavailable=true;const texture=this.texture,uniform=this.uniform;this.texture=null;this.uniform=null;this.key=null;this.heightKey=null;this.paper=null;this.noise=null;this.disposePair(texture,uniform)}
}
