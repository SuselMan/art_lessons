/// <reference types="@webgpu/types" />
import { CANONICAL_COMPOSITE_WGSL } from './compositeShader'
import type { CanonicalCompositeUniforms, CanonicalGpuField, CanonicalWatercolorFields } from './types'
/** Full production watercolor composite with migrate=0 (the production
 * profile's invariant). Nonzero migration is explicitly unsupported. */
export class CanonicalComposite {
 private readonly device: GPUDevice
 private readonly pipeline: GPURenderPipeline
 private readonly clamp: GPUSampler
 private readonly repeat: GPUSampler
 constructor(device: GPUDevice) {
  this.device=device
  const module=device.createShaderModule({label:'canonical production watercolor composite',code:CANONICAL_COMPOSITE_WGSL})
  this.pipeline=device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm'}]}})
  this.clamp=device.createSampler({minFilter:'linear',magFilter:'linear'})
  this.repeat=device.createSampler({minFilter:'linear',magFilter:'linear',addressModeU:'repeat',addressModeV:'repeat'})
 }
 encode(encoder:GPUCommandEncoder,fields:CanonicalWatercolorFields,original:CanonicalGpuField,paper:CanonicalGpuField,noise:CanonicalGpuField,out:CanonicalGpuField,v:CanonicalCompositeUniforms):GPUBuffer[] {
  if(v.migrate!==0)throw new Error('Canonical composite migration is unsupported; production profile requires migrate=0')
  if([original,fields.coverage,fields.pigment,fields.color,paper,noise].some(field=>field.texture===out.texture))throw new Error('Canonical composite requires a distinct output texture')
  const uniform=this.device.createBuffer({size:112,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})
  this.device.queue.writeBuffer(uniform,0,new Float32Array([out.width,out.height,...v.paperOrigin,...v.paperTexSize,...v.paperScale,...v.fieldOffset,v.inkSmoothPx,v.water,v.inkStrength,v.spreadPx,v.edgeWander,v.edgeSoft,v.bristleCombs,v.dryContact,v.granulation,v.wetEdge,v.wetEdgeRadiusPx,v.tideLo,v.tideHi,v.paperRim,v.opacity,v.pigmentOpacity,v.debugView,+v.rectComposite]))
  const group=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},...[original,fields.coverage,fields.pigment,fields.color,paper,noise].map((field,index)=>({binding:index+1,resource:field.view})),{binding:7,resource:this.clamp},{binding:8,resource:this.repeat}]})
  const pass=encoder.beginRenderPass({colorAttachments:[{view:out.view,loadOp:'load',storeOp:'store'}]});pass.setPipeline(this.pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();return[uniform]
 }
}
