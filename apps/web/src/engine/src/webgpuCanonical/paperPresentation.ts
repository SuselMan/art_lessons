import { PAPER_TONE_AMPLITUDE } from '../paper/paperTone'
import type { CanonicalWatercolorWebGpu } from './backend'
import type { CanonicalLayerTile } from './tileScratch'
import type { CanonicalGpuField } from './types'

/** Literal PAPER_COMPOSE_FRAG algebra with its current zero bead/relax constants. Stored layer
 * stays premultiplied; paper/graphite texture applies only to the screen. */
export const CANONICAL_DRY_PAPER_WGSL=`
struct U { dst:vec2f,src:vec2f,origin:vec2f,period:vec2f,scale:vec2f,pad:vec2f,paperColor:vec4f,wetRect:vec4f }
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var accumulation:texture_2d<f32>;
@group(0) @binding(2) var paper:texture_2d<f32>;
@group(0) @binding(3) var linearClamp:sampler;
@group(0) @binding(4) var linearRepeat:sampler;
@group(0) @binding(5) var wetMap:texture_2d<f32>;
struct V { @builtin(position) p:vec4f }
@vertex fn vs(@builtin(vertex_index) n:u32)->V {let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:V;o.p=vec4f(p[n],0,1);return o;}
@fragment fn fs(v:V)->@location(0) vec4f {
 let uv=v.p.xy/u.dst;let acc=clamp(textureSampleLevel(accumulation,linearClamp,uv,0),vec4f(0),vec4f(1));let graphite=acc.a;
 var strokeColor=vec3f(0);if(graphite>.001){strokeColor=clamp(acc.rgb/graphite,vec3f(0),vec3f(1));}
 let worldPos=uv*u.src+u.origin;let height=textureSampleLevel(paper,linearRepeat,worldPos/u.period*u.scale,0).r;
 var wet=0.0;var damp=0.0;var fresh=0.0;var pool=0.0;
 if(u.wetRect.z>u.wetRect.x){let span=max(u.wetRect.zw-u.wetRect.xy,vec2f(.0001));let wetUV=(worldPos-u.wetRect.xy)/span;
  if(all(wetUV>=vec2f(0))&&all(wetUV<=vec2f(1))){let overlay=textureSampleLevel(wetMap,linearClamp,wetUV,0);let raw=overlay.r;let body=max(overlay.a,.05);let t=clamp(raw/body,0.0,1.0);let inWater=select(0.0,1.0,t>=.048);
   wet=inWater*smoothstep(.35,.95,raw);damp=inWater*smoothstep(.048,.42,t)*smoothstep(.04,.30,raw);fresh=inWater*smoothstep(.45,1.0,raw);pool=inWater*smoothstep(.08,.45,overlay.g)*smoothstep(.1,.5,raw);wet=max(wet,pool);
  }
 }
 // Production WC_BEAD_ON=0, WC_WET_CAST=0 and WC_WET_RELAX=0:
 // rim/gloss/cast/held are identically zero, not replaced by an approximation.
 let shownHeight=mix(height,.5,wet*.5);
 let toneSigned=shownHeight*2.0-1.0;let toneCenter=clamp(u.paperColor.rgb,vec3f(${PAPER_TONE_AMPLITUDE.toFixed(3)}),vec3f(${(1-PAPER_TONE_AMPLITUDE).toFixed(3)}));
 let paperTone=toneCenter+${PAPER_TONE_AMPLITUDE.toFixed(3)}*toneSigned;
 let graphiteTexture=mix(1.0,shownHeight*.5+.2,graphite*.25);let graphiteTone=mix(paperTone,strokeColor,graphiteTexture);
 var color=mix(paperTone,graphiteTone,graphite);let onPaint=smoothstep(.02,.25,graphite);let toneShare=mix(.50,.12,onPaint);
 color*=1.0-.012*damp*toneShare;
 color*=mix(1.0,1.0-.07,fresh*(1.0-onPaint)*toneShare);
 color=pow(max(color,vec3f(0)),vec3f(1.0+.35*fresh*onPaint*toneShare));
 color*=mix(1.0,1.0-.08,pool*(1.0-onPaint)*toneShare);
 color=pow(max(color,vec3f(0)),vec3f(1.0+.45*pool*onPaint*toneShare));
 return vec4f(color,1);
}`
export interface CanonicalDryPaperView {
 paperColor:readonly[number,number,number]
 /** No silent substitution of the product's transient wet display. */
 wetPresentation?:boolean
 wet?:{field:CanonicalGpuField;rect:readonly[number,number,number,number];kind:'production-overlay'}
 cameraRotation?:0
 sharpResample?:false
}
/** One bounded tile filling the viewport; supports the real prepared wet overlay.
 * Camera, desk, multi-layer assembly, reveal/morphing and Catmull-Rom are unsupported.
 * The historical class name remains compatible with existing dry callers. */
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
  if(view.cameraRotation||view.sharpResample)throw new Error('Native paper view supports unrotated, bilinear single-tile presentation only')
  if(view.wetPresentation&&!view.wet)throw new Error('Wet paper presentation requires the real production overlay map')
  const canvas=this.backend.options.canvas;if(!canvas.width||!canvas.height)throw new Error('Native paper view viewport is empty')
  const context=canvas.getContext('webgpu');if(!context)throw new Error('Native paper view has no WebGPU canvas')
  return this.encodeField(encoder,tile.buffer.field,[tile.originX,tile.originY],view.paperColor,target??context.getCurrentTexture().createView(),[canvas.width,canvas.height],navigator.gpu.getPreferredCanvasFormat(),view.wetPresentation===false?undefined:view.wet)
 }
 /** Same algebra into a caller-owned rgba8unorm target, useful for QA/export. */
 encodeField(encoder:GPUCommandEncoder,source:CanonicalGpuField,origin:readonly[number,number],paperColor:readonly[number,number,number],target:GPUTextureView,viewport:readonly[number,number],format:GPUTextureFormat='rgba8unorm',wet?:CanonicalDryPaperView['wet']):GPUBuffer[] {
  if(wet&&(wet.kind!=='production-overlay'||wet.field.filter!=='linear'))throw new Error('Native wet presentation requires the production LINEAR overlay map')
  const backend=this.backend,uniform=backend.device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});backend.device.queue.writeBuffer(uniform,0,new Float32Array([...viewport,source.width,source.height,...origin,...backend.paper.texSize,backend.paper.scale,backend.paper.scale,0,0,...paperColor,0,...(wet?.rect??[0,0,-1,-1])]))
  if(format!=='rgba8unorm'&&format!==navigator.gpu.getPreferredCanvasFormat())throw new Error('Native paper view target format unsupported')
  const pipeline=format==='rgba8unorm'?this.rgbaPipeline:this.pipeline
  const group=backend.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:source.view},{binding:2,resource:backend.paper.field.view},{binding:3,resource:this.clamp},{binding:4,resource:this.repeat},{binding:5,resource:(wet?.field??backend.fields.water).view}]})
  const pass=encoder.beginRenderPass({colorAttachments:[{view:target,loadOp:'clear',storeOp:'store',clearValue:[1,1,1,1]}]});pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();return[uniform]
 }
 present(tile:CanonicalLayerTile,view:CanonicalDryPaperView):Promise<void> {
  const encoder=this.backend.device.createCommandEncoder({label:'canonical tile on paper'}),buffers=this.encode(encoder,tile,view);this.backend.device.queue.submit([encoder.finish()]);return this.backend.device.queue.onSubmittedWorkDone().finally(()=>buffers.forEach(b=>b.destroy()))
 }
}

/** General name for callers opting into the real wet overlay. */
export { CanonicalDryPaperPresentation as CanonicalPaperPresentation }
