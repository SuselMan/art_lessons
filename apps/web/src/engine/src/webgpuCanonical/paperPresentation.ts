import { PAPER_TONE_AMPLITUDE } from '../paper/paperTone'
import type { CanonicalWatercolorWebGpu } from './backend'
import type { CanonicalLayerTile } from './tileScratch'
import type { CanonicalGpuField } from './types'

/** Literal dry (wetRect disabled) PAPER_COMPOSE_FRAG algebra. Stored layer
 * stays premultiplied; paper/graphite texture applies only to the screen. */
export const CANONICAL_DRY_PAPER_WGSL=`
struct U { dst:vec2f,src:vec2f,origin:vec2f,period:vec2f,scale:vec2f,pad:vec2f,paperColor:vec4f }
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var accumulation:texture_2d<f32>;
@group(0) @binding(2) var paper:texture_2d<f32>;
@group(0) @binding(3) var linearClamp:sampler;
@group(0) @binding(4) var linearRepeat:sampler;
struct V { @builtin(position) p:vec4f }
@vertex fn vs(@builtin(vertex_index) n:u32)->V {let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:V;o.p=vec4f(p[n],0,1);return o;}
@fragment fn fs(v:V)->@location(0) vec4f {
 let uv=v.p.xy/u.dst;let acc=clamp(textureSampleLevel(accumulation,linearClamp,uv,0),vec4f(0),vec4f(1));let graphite=acc.a;
 var strokeColor=vec3f(0);if(graphite>.001){strokeColor=clamp(acc.rgb/graphite,vec3f(0),vec3f(1));}
 let worldPos=uv*u.src+u.origin;let height=textureSampleLevel(paper,linearRepeat,worldPos/u.period*u.scale,0).r;
 let toneSigned=height*2.0-1.0;let toneCenter=clamp(u.paperColor.rgb,vec3f(${PAPER_TONE_AMPLITUDE.toFixed(3)}),vec3f(${(1-PAPER_TONE_AMPLITUDE).toFixed(3)}));
 let paperTone=toneCenter+${PAPER_TONE_AMPLITUDE.toFixed(3)}*toneSigned;
 let graphiteTexture=mix(1.0,height*.5+.2,graphite*.25);let graphiteTone=mix(paperTone,strokeColor,graphiteTexture);
 return vec4f(mix(paperTone,graphiteTone,graphite),1);
}`
export interface CanonicalDryPaperView {
 paperColor:readonly[number,number,number]
 /** No silent substitution of the product's transient wet display. */
 wetPresentation?:false
 cameraRotation?:0
 sharpResample?:false
}
/** One bounded tile filling the viewport. No camera, desk, multi-layer assembly,
 * wetness/reveal/morphing or Catmull-Rom is claimed by this dry presentation. */
export class CanonicalDryPaperPresentation {
 private readonly backend:CanonicalWatercolorWebGpu
 private readonly pipeline:GPURenderPipeline
 private readonly rgbaPipeline:GPURenderPipeline
 private readonly clamp:GPUSampler
 private readonly repeat:GPUSampler
 constructor(backend:CanonicalWatercolorWebGpu) {
  this.backend=backend
  const module=backend.device.createShaderModule({label:'canonical dry paper presentation',code:CANONICAL_DRY_PAPER_WGSL})
  this.pipeline=backend.device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:navigator.gpu.getPreferredCanvasFormat()}]}})
  this.rgbaPipeline=backend.device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm'}]}})
  this.clamp=backend.device.createSampler({minFilter:'linear',magFilter:'linear'})
  this.repeat=backend.device.createSampler({minFilter:'linear',magFilter:'linear',addressModeU:'repeat',addressModeV:'repeat'})
 }
 encode(encoder:GPUCommandEncoder,tile:CanonicalLayerTile,view:CanonicalDryPaperView,target?:GPUTextureView):GPUBuffer[] {
  if(tile.buffer.owner!==this.backend)throw new Error('Native paper view owner mismatch')
  if(view.wetPresentation||view.cameraRotation||view.sharpResample)throw new Error('Native paper view supports dry, unrotated, bilinear single-tile presentation only')
  const canvas=this.backend.options.canvas;if(!canvas.width||!canvas.height)throw new Error('Native paper view viewport is empty')
  const context=canvas.getContext('webgpu');if(!context)throw new Error('Native paper view has no WebGPU canvas')
  return this.encodeField(encoder,tile.buffer.field,[tile.originX,tile.originY],view.paperColor,target??context.getCurrentTexture().createView(),[canvas.width,canvas.height],navigator.gpu.getPreferredCanvasFormat())
 }
 /** Same algebra into a caller-owned rgba8unorm target, useful for QA/export. */
 encodeField(encoder:GPUCommandEncoder,source:CanonicalGpuField,origin:readonly[number,number],paperColor:readonly[number,number,number],target:GPUTextureView,viewport:readonly[number,number],format:GPUTextureFormat='rgba8unorm'):GPUBuffer[] {
  const backend=this.backend,uniform=backend.device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});backend.device.queue.writeBuffer(uniform,0,new Float32Array([...viewport,source.width,source.height,...origin,...backend.paper.texSize,backend.paper.scale,backend.paper.scale,0,0,...paperColor,0]))
  if(format!=='rgba8unorm'&&format!==navigator.gpu.getPreferredCanvasFormat())throw new Error('Native paper view target format unsupported')
  const pipeline=format==='rgba8unorm'?this.rgbaPipeline:this.pipeline
  const group=backend.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:source.view},{binding:2,resource:backend.paper.field.view},{binding:3,resource:this.clamp},{binding:4,resource:this.repeat}]})
  const pass=encoder.beginRenderPass({colorAttachments:[{view:target,loadOp:'clear',storeOp:'store',clearValue:[1,1,1,1]}]});pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();return[uniform]
 }
 present(tile:CanonicalLayerTile,view:CanonicalDryPaperView):Promise<void> {
  const encoder=this.backend.device.createCommandEncoder({label:'canonical tile on paper'}),buffers=this.encode(encoder,tile,view);this.backend.device.queue.submit([encoder.finish()]);return this.backend.device.queue.onSubmittedWorkDone().finally(()=>buffers.forEach(b=>b.destroy()))
 }
}
