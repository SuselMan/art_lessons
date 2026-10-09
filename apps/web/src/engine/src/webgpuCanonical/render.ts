import {preparedExactPipeline,type ExactPipelineRecipe} from './exactPipelinePreparation'
import { withTransientGpuBuffers } from './transientBuffers'
/// <reference types="@webgpu/types" />
import { CANONICAL_COMPOSITE_WGSL } from './compositeShader'
import type { CanonicalCompositeUniforms, CanonicalGpuField, CanonicalWatercolorFields } from './types'
/** Full production watercolor composite with migrate=0 (the production
 * profile's invariant). Nonzero migration is explicitly unsupported. */
export function canonicalCompositeRecipe():ExactPipelineRecipe{return{key:'canonicalCompositeRecipe',kind:'render',code:CANONICAL_COMPOSITE_WGSL,moduleLabel:'canonical production watercolor composite',descriptor(module){return {layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm'}]}}}}}
export class CanonicalComposite {
 private readonly device: GPUDevice
 private readonly pipeline: GPURenderPipeline
 private readonly clamp: GPUSampler
 private readonly repeat: GPUSampler
 constructor(device: GPUDevice) {
  this.device=device
  const module=device.createShaderModule({label:'canonical production watercolor composite',code:CANONICAL_COMPOSITE_WGSL})
  const recipe=canonicalCompositeRecipe()
  this.pipeline=(preparedExactPipeline(device,recipe) as GPURenderPipeline|undefined)??device.createRenderPipeline(recipe.descriptor(module) as GPURenderPipelineDescriptor)
  this.clamp=device.createSampler({minFilter:'nearest',magFilter:'nearest'})
  this.repeat=device.createSampler({minFilter:'linear',magFilter:'linear',addressModeU:'repeat',addressModeV:'repeat'})
 }
 encode(encoder:GPUCommandEncoder,fields:Pick<CanonicalWatercolorFields,'coverage'|'pigment'|'color'>,original:CanonicalGpuField,paper:CanonicalGpuField,noise:CanonicalGpuField,out:CanonicalGpuField,v:CanonicalCompositeUniforms,scissor?:readonly[number,number,number,number]):GPUBuffer[] {
  return withTransientGpuBuffers(retain=>{
  if(v.migrate!==0)throw new Error('Canonical composite migration is unsupported; production profile requires migrate=0')
  if([original,fields.coverage,fields.pigment,fields.color,paper,noise].some(field=>field.texture===out.texture))throw new Error('Canonical composite requires a distinct output texture')
  const uniform=retain(this.device.createBuffer({size:112,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}))
  this.device.queue.writeBuffer(uniform,0,new Float32Array([out.width,out.height,...v.paperOrigin,...v.paperTexSize,...v.paperScale,...v.fieldOffset,v.inkSmoothPx,v.water,v.inkStrength,v.spreadPx,v.edgeWander,v.edgeSoft,v.bristleCombs,v.dryContact,v.granulation,v.wetEdge,v.wetEdgeRadiusPx,v.tideLo,v.tideHi,v.paperRim,v.opacity,v.pigmentOpacity,v.debugView,+v.rectComposite]))
  const group=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},...[original,fields.coverage,fields.pigment,fields.color,paper,noise].map((field,index)=>({binding:index+1,resource:field.view})),{binding:7,resource:this.clamp},{binding:8,resource:this.repeat}]})
  const pass=encoder.beginRenderPass({colorAttachments:[{view:out.view,loadOp:'load',storeOp:'store'}]});if(scissor){const [x,y,w,h]=scissor;if(w<=0||h<=0){pass.end();return[uniform]}pass.setScissorRect(x,out.height-y-h,w,h)}pass.setPipeline(this.pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();return[uniform]
 
  })
 }
}
