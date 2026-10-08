import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { CanonicalGpuField } from './types'

/** Preserve all RGBA codes, including nonzero RGB at alpha0. */
export function canonicalTopRowsToGlRows(bytes:Uint8Array,width:number,height:number):Uint8Array {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||bytes.length!==width*height*4)throw new Error('Room tile bridge RGBA dimensions mismatch')
 const out=new Uint8Array(bytes.length),row=width*4
 for(let y=0;y<height;y++)out.set(bytes.subarray(y*row,(y+1)*row),(height-y-1)*row)
 return out
}

const shader=`
@group(0) @binding(0) var layer:texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position)vec4f {
 let positions=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(positions[i],0,1);
}
@fragment fn fs(@builtin(position)p:vec4f)->@location(0)vec4f {
 return textureLoad(layer,vec2i(p.xy),0);
}`

/** Primitive DEV seam into the REAL AccumulationBuffer used by Room layers.
 * It owns no oplog, paper state, undo or renderer selection. Calls must happen
 * at owner-controlled stage boundaries, with exclusive ownership of the tile.
 * Canvas copy is an experiment; never claim zero-copy or Q8 equality before
 * actual GPU comparison. No paper/wet shader is included. */
export class CanonicalRoomTileBridge {
 readonly canvas:HTMLCanvasElement
 private readonly context:GPUCanvasContext
 private readonly pipeline:GPURenderPipeline
 private readonly device:GPUDevice
 private disposed=false
 constructor(device:GPUDevice,canvas:HTMLCanvasElement,width:number,height:number) {
  this.device=device;this.canvas=canvas;canvas.width=width;canvas.height=height
  const context=canvas.getContext('webgpu');if(!context)throw new Error('Room tile bridge WebGPU canvas unsupported')
  this.context=context;context.configure({device,format:'rgba8unorm',alphaMode:'premultiplied',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC})
  const module=device.createShaderModule({label:'DEV raw Q8 Room tile bridge',code:shader})
  this.pipeline=device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}})
 }
 async copyByReadback(field:CanonicalGpuField,target:AccumulationBuffer,read:(field:CanonicalGpuField)=>Promise<Uint8Array>):Promise<void> {
  this.guard(field,target)
  const bytes=await read(field);this.guard(field,target)
  target.restorePixels(canonicalTopRowsToGlRows(bytes,field.width,field.height))
 }
 async copyByCanvas(field:CanonicalGpuField,target:AccumulationBuffer):Promise<void> {
  this.guard(field,target)
  const encoder=this.device.createCommandEncoder({label:'DEV raw tile to Room bridge'})
  const pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]})
  pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:field.view}]}));pass.draw(3);pass.end()
  this.device.queue.submit([encoder.finish()]);await this.device.queue.onSubmittedWorkDone()
  this.guard(field,target);target.restoreCanvasPixels(this.canvas)
 }
 private guard(field:CanonicalGpuField,target:AccumulationBuffer) {
  if(this.disposed)throw new Error('Room tile bridge disposed')
  if(field.width!==target.width||field.height!==target.height||field.width!==this.canvas.width||field.height!==this.canvas.height)throw new Error('Room tile bridge equal tile dimensions required')
 }
 destroy(){if(this.disposed)return;this.disposed=true;this.context.unconfigure()}
}
