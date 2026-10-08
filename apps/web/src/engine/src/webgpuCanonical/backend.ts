/// <reference types="@webgpu/types" />
import noiseAsset from '../raster/watercolorNoise.txt?raw'
import { CanonicalRibbonDeposit } from './deposit'
import { CanonicalStampDeposit } from './stamp'
import { CanonicalComposite } from './render'
import { CanonicalBrushContact } from './brush'
import type { CanonicalCompositeUniforms, CanonicalGpuField, CanonicalGpuSnapshot, CanonicalPaper, CanonicalRasterPhase, CanonicalRasterTargets, CanonicalRibbonBatch, CanonicalSupport, CanonicalStamp, CanonicalWatercolorFields } from './types'

export interface CanonicalWebGpuOptions {
 canvas: HTMLCanvasElement
 width: number
 height: number
 /** OFF diagnostic: exact full zero clears through compute, including constructor. */
 diagnosticComputeFullClear?:boolean
 viewportWidth?: number
 viewportHeight?: number
 paper: { bytes: Uint8Array; width: number; height: number; origin: readonly [number, number]; texSize: readonly [number, number]; scale: number }
}
const names = ['pigment', 'color', 'coverage', 'water', 'flow'] as const
/** Experimental native resource owner. Contains no alternative watercolor
 * physics and never creates a WebGL fallback. Missing canonical stages fail. */
export class CanonicalWatercolorWebGpu {
 readonly fields: CanonicalWatercolorFields
 readonly paper: CanonicalPaper
 readonly noise: CanonicalGpuField
 readonly nearest: GPUSampler
 readonly linear: GPUSampler
 private readonly deposit: CanonicalRibbonDeposit
 private readonly stamps: CanonicalStampDeposit
 private readonly composite: CanonicalComposite
 private readonly brush:CanonicalBrushContact
 private readonly brushOut:readonly[CanonicalGpuField,CanonicalGpuField]
 private readonly ownedFields=new Set<CanonicalGpuField>()
 private readonly clearPipeline:GPUComputePipeline
 private readonly context: GPUCanvasContext
 private readonly format: GPUTextureFormat
 private readonly preview: GPURenderPipeline
 private pendingScopes=0
 private readonly pendingRetired=new Set<CanonicalGpuField>()
 private activeEncoder:GPUCommandEncoder|null=null
 private activeBuffers:GPUBuffer[]=[]
 private activeRetired:CanonicalGpuField[]=[]
 private destroyed = false
 readonly device: GPUDevice
 diagnosticComputeFullClearCalls=0
 readonly options: CanonicalWebGpuOptions
 private constructor(device: GPUDevice, options: CanonicalWebGpuOptions) {
  this.device=device;this.options=options
  const context = options.canvas.getContext('webgpu'); if (!context) throw new Error('WebGPU canvas unavailable')
  this.context = context; this.format = navigator.gpu.getPreferredCanvasFormat()
  options.canvas.width = options.viewportWidth ?? options.width; options.canvas.height = options.viewportHeight ?? options.height
  context.configure({ device, format: this.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC })
  const clearModule=device.createShaderModule({label:'exact canonical rectangular clear',code:`
struct U { rect:vec4u }
@group(0) @binding(0) var clearOut:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(1) var<uniform> u:U;
@compute @workgroup_size(8,8) fn clear(@builtin(global_invocation_id) t:vec3u){if(any(t.xy>=u.rect.zw)){return;}let q=t.xy+u.rect.xy;if(any(q>=textureDimensions(clearOut))){return;}textureStore(clearOut,vec2i(q),vec4f(0));}`})
  this.clearPipeline=device.createComputePipeline({layout:'auto',compute:{module:clearModule,entryPoint:'clear'}})
  this.nearest = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' })
  this.linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
  this.fields = Object.fromEntries(names.map(name => [name, this.createField(name, options.width, options.height,name==='flow'?'linear':'nearest')])) as unknown as CanonicalWatercolorFields
  this.paper = { field: this.createField('production baked paper', options.paper.width, options.paper.height,'linear'), origin: options.paper.origin, texSize: options.paper.texSize, scale: options.paper.scale }
  this.upload(this.paper.field, options.paper.bytes)
  const lattice = Uint8Array.from(atob(noiseAsset), c => c.charCodeAt(0)), rgba = new Uint8Array(lattice.length * 4)
  for (let k = 0; k < lattice.length; k++) rgba.set([lattice[k], lattice[k], lattice[k], 255], k * 4)
  this.noise = this.createField('production 251x251 watercolor lattice', 251, 251); this.upload(this.noise, rgba)
  this.deposit = new CanonicalRibbonDeposit(device, this.noise)
  this.stamps = new CanonicalStampDeposit(device, this.noise)
  this.composite = new CanonicalComposite(device)
  this.brush = new CanonicalBrushContact(device)
  this.brushOut=[this.createField('brush next pigment',options.width,options.height),this.createField('brush next color',options.width,options.height)]
  const module = device.createShaderModule({ label: 'diagnostic exact field presentation', code: `
@group(0) @binding(0) var field:texture_2d<f32>;
struct V { @builtin(position) p:vec4f,@location(0) uv:vec2f }
@vertex fn vs(@builtin(vertex_index) n:u32)->V { let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:V;o.p=vec4f(p[n],0,1);o.uv=p[n]*vec2f(.5,-.5)+.5;return o; }
@fragment fn fs(v:V)->@location(0) vec4f {let dims=vec2i(textureDimensions(field));return textureLoad(field,clamp(vec2i(v.uv*vec2f(dims)),vec2i(0),dims-1),0);}` })
  this.preview = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] } })
  this.clear()
 }
 static async support(): Promise<CanonicalSupport> {
  if (!isSecureContext) return { supported: false, reason: 'Native WebGPU requires a secure HTTPS context' }
  if (!navigator.gpu) return { supported: false, reason: 'Native WebGPU is unavailable in this browser' }
  const adapter = await navigator.gpu.requestAdapter(); return adapter ? { supported: true, adapter } : { supported: false, reason: 'No WebGPU adapter available' }
 }
 static async create(options: CanonicalWebGpuOptions) {
  const support = await this.support(); if (!support.supported) throw new Error(support.reason)
  const device = await support.adapter.requestDevice()
  device.pushErrorScope('validation')
  try {
   const backend = new CanonicalWatercolorWebGpu(device, options)
   const error = await device.popErrorScope(); if (error) { backend.destroy(); throw new Error(error.message) }
   return backend
  } catch (error) { device.destroy(); throw error }
 }
 createField(label: string, width: number, height: number, filter:'nearest'|'linear'='nearest'): CanonicalGpuField {
  const texture = this.device.createTexture({ label, size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT })
  const field:CanonicalGpuField={ width, height, label, filter, format: 'rgba8unorm', texture, view: texture.createView() };this.ownedFields.add(field);return field
 }
 destroyField(field:CanonicalGpuField) {
  if(this.ownedFields.delete(field)){if(this.activeEncoder)this.activeRetired.push(field);else if(this.pendingScopes)this.pendingRetired.add(field);else field.texture.destroy()}
 }
 /** Synchronous planner quantum: owner operations join the caller's encoder.
  * Caller submits it, then invokes release after queue completion. */
 encodeOwnerCommands<T>(encoder:GPUCommandEncoder,task:()=>T):{value:T;release:()=>void} {
  if(this.activeEncoder)throw new Error('Nested canonical owner command scope')
  this.activeEncoder=encoder;this.activeBuffers=[];this.activeRetired=[]
  try {
   const value=task(),buffers=this.activeBuffers,retired=this.activeRetired
   this.pendingScopes++;let released=false
   return{value,release:()=>{if(released)return;released=true;buffers.forEach(b=>b.destroy());for(const f of retired)this.pendingRetired.add(f);this.pendingScopes--;if(!this.pendingScopes){for(const f of this.pendingRetired)f.texture.destroy();this.pendingRetired.clear()}}}
  } catch(error) {this.activeBuffers.forEach(b=>b.destroy());this.activeRetired.forEach(f=>{if(this.pendingScopes)this.pendingRetired.add(f);else f.texture.destroy()});throw error}
  finally {this.activeEncoder=null;this.activeBuffers=[];this.activeRetired=[]}
 }
 /** Immutable staging payload is recorded in the same command stream as its
  * consumers. A later contact upload cannot overwrite an earlier contact. */
 encodeUploadRgba(encoder:GPUCommandEncoder,field:CanonicalGpuField,bytes:Uint8Array,rawGlRows=false):GPUBuffer[] {
  if(bytes.length!==field.width*field.height*4)throw new Error('Canonical staging upload dimensions mismatch')
  const pitch=Math.ceil(field.width*4/256)*256,stagingBytes=new Uint8Array(pitch*field.height)
  for(let row=0;row<field.height;row++){const sourceRow=rawGlRows?field.height-row-1:row;stagingBytes.set(bytes.subarray(sourceRow*field.width*4,(sourceRow+1)*field.width*4),row*pitch)}
  const buffer=this.device.createBuffer({size:stagingBytes.length,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(buffer,0,stagingBytes)
  encoder.copyBufferToTexture({buffer,bytesPerRow:pitch},{texture:field.texture},[field.width,field.height]);return[buffer]
 }
 encodeUploadGlLuminance(encoder:GPUCommandEncoder,field:CanonicalGpuField,bytes:Uint8Array):GPUBuffer[] {
  if(bytes.length!==field.width*field.height)throw new Error('Canonical luminance upload dimensions mismatch')
  const rgba=new Uint8Array(bytes.length*4);for(let k=0;k<bytes.length;k++)rgba.set([bytes[k],bytes[k],bytes[k],255],k*4)
  return this.encodeUploadRgba(encoder,field,rgba,true)
 }
 upload(field: CanonicalGpuField, bytes: Uint8Array) {
  if (bytes.byteLength !== field.width * field.height * 4) throw new Error(`Canonical RGBA8 upload size mismatch: ${field.label}`)
  if(this.activeEncoder){this.activeBuffers.push(...this.encodeUploadRgba(this.activeEncoder,field,bytes));return}
  this.device.queue.writeTexture({ texture: field.texture }, bytes as Uint8Array<ArrayBuffer>, { bytesPerRow: field.width * 4 }, { width: field.width, height: field.height })
 }
 encodePreparedRibbon(encoder:GPUCommandEncoder,batch:CanonicalRibbonBatch,phase:CanonicalRasterPhase,targets:CanonicalRasterTargets):GPUBuffer[] {
  if(this.destroyed)throw new Error('Canonical WebGPU backend destroyed')
  if(!batch.vertices.length)return[]
  return this.deposit.encode(encoder,batch,targets.coverage,targets.availableWater??this.fields.water,targets.pigment,targets.color,phase)
 }
 encodePreparedStamp(encoder:GPUCommandEncoder,stamp:CanonicalStamp,phase:CanonicalRasterPhase,targets:CanonicalRasterTargets):GPUBuffer[] {
  if(this.destroyed)throw new Error('Canonical WebGPU backend destroyed')
  return this.stamps.encode(encoder,stamp,targets.coverage,targets.availableWater??this.fields.water,targets.pigment,targets.color,phase)
 }
 appendPreparedRibbon(batch: CanonicalRibbonBatch, phase:CanonicalRasterPhase='all') {
  if (this.destroyed) throw new Error('Canonical WebGPU backend destroyed')
  if (!batch.vertices.length) return
  const encoder = this.device.createCommandEncoder({ label: 'canonical prepared ribbon' })
  const transient = this.deposit.encode(encoder, batch, this.fields.coverage, this.fields.water, this.fields.pigment, this.fields.color,phase)
  this.device.queue.submit([encoder.finish()]); void this.device.queue.onSubmittedWorkDone().then(() => transient.forEach(buffer => buffer.destroy()), () => transient.forEach(buffer => buffer.destroy()))
 }
 appendPreparedStamp(stamp: CanonicalStamp,phase:CanonicalRasterPhase='all') {
  if (this.destroyed) throw new Error('Canonical WebGPU backend destroyed')
  const encoder=this.device.createCommandEncoder({label:'canonical prepared nib stamp'})
  const transient=this.stamps.encode(encoder,stamp,this.fields.coverage,this.fields.water,this.fields.pigment,this.fields.color,phase)
  this.device.queue.submit([encoder.finish()]);void this.device.queue.onSubmittedWorkDone().then(()=>transient.forEach(buffer=>buffer.destroy()),()=>transient.forEach(buffer=>buffer.destroy()))
 }
 brushContact(step:readonly[number,number],gain:number,flowRect:readonly[number,number,number,number]) {
  const encoder=this.device.createCommandEncoder({label:'canonical Q8 brush pulse'})
  const ctx={device:this.device,encoder,nearest:this.nearest,linear:this.linear}
  const transient=this.brush.encode(ctx,{pigment:this.fields.pigment,color:this.fields.color,flow:this.fields.flow,water:this.fields.water,outPigment:this.brushOut[0],outColor:this.brushOut[1]},step,gain,flowRect)
  for(const [out,into] of [[this.brushOut[0],this.fields.pigment],[this.brushOut[1],this.fields.color]])encoder.copyTextureToTexture({texture:out.texture},{texture:into.texture},[into.width,into.height])
  this.device.queue.submit([encoder.finish()]);void this.device.queue.onSubmittedWorkDone().then(()=>transient.forEach(buffer=>buffer.destroy()),()=>transient.forEach(buffer=>buffer.destroy()))
 }
 copyRegion(src:CanonicalGpuField,dst:CanonicalGpuField,srcOrigin:readonly[number,number],dstOrigin:readonly[number,number],size:readonly[number,number],encoder?:GPUCommandEncoder) {
  const values=[...srcOrigin,...dstOrigin,...size];if(values.some(v=>!Number.isInteger(v)||v<0))throw new Error('Canonical copy requires nonnegative integer pixel coordinates')
  if(srcOrigin[0]+size[0]>src.width||srcOrigin[1]+size[1]>src.height||dstOrigin[0]+size[0]>dst.width||dstOrigin[1]+size[1]>dst.height)throw new Error('Canonical copy region out of bounds')
  if(src.texture===dst.texture)throw new Error('Canonical texture self-copy unsupported')
  if(!size[0]||!size[1])return
  const selected=encoder??this.activeEncoder;const commands=selected??this.device.createCommandEncoder();commands.copyTextureToTexture({texture:src.texture,origin:[...srcOrigin]},{texture:dst.texture,origin:[...dstOrigin]},[...size]);if(!selected)this.device.queue.submit([commands.finish()])
 }
 copyField(src:CanonicalGpuField,dst:CanonicalGpuField,encoder?:GPUCommandEncoder) {
  if(src.width!==dst.width||src.height!==dst.height)throw new Error('Canonical field copy dimensions mismatch')
  this.copyRegion(src,dst,[0,0],[0,0],[src.width,src.height],encoder)
 }
 encodeClearField(encoder:GPUCommandEncoder,field:CanonicalGpuField,rect?:readonly[number,number,number,number]):GPUBuffer[] {
  if(!rect&&this.options.diagnosticComputeFullClear){this.diagnosticComputeFullClearCalls++;rect=[0,0,field.width,field.height]}
  if(!rect){const pass=encoder.beginRenderPass({colorAttachments:[{view:field.view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});pass.end();return[]}
  if(rect.some(v=>!Number.isInteger(v))||rect[2]<0||rect[3]<0)throw new Error('Canonical clear rectangle requires integer coordinates and nonnegative size')
  const x=Math.max(0,Math.min(field.width,rect[0])),y=Math.max(0,Math.min(field.height,rect[1])),right=Math.max(x,Math.min(field.width,rect[0]+rect[2])),bottom=Math.max(y,Math.min(field.height,rect[1]+rect[3]))
  if(right===x||bottom===y)return[]
  const buffer=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(buffer,0,new Uint32Array([x,y,right-x,bottom-y]))
  const group=this.device.createBindGroup({layout:this.clearPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:field.view},{binding:1,resource:{buffer}}]}),pass=encoder.beginComputePass();pass.setPipeline(this.clearPipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil((right-x)/8),Math.ceil((bottom-y)/8));pass.end();return[buffer]
 }
 clearField(field:CanonicalGpuField,rect?:readonly[number,number,number,number]) {
  if(this.activeEncoder){this.activeBuffers.push(...this.encodeClearField(this.activeEncoder,field,rect));return}
  const encoder=this.device.createCommandEncoder(),transient=this.encodeClearField(encoder,field,rect);this.device.queue.submit([encoder.finish()]);void this.device.queue.onSubmittedWorkDone().then(()=>transient.forEach(buffer=>buffer.destroy()),()=>transient.forEach(buffer=>buffer.destroy()))
 }
 clear() {
  const encoder = this.device.createCommandEncoder()
  const transient:GPUBuffer[]=[]
  for (const field of Object.values(this.fields)) transient.push(...this.encodeClearField(encoder,field))
  this.device.queue.submit([encoder.finish()]);void this.device.queue.onSubmittedWorkDone().then(()=>transient.forEach(b=>b.destroy()),()=>transient.forEach(b=>b.destroy()))
 }
 /** Exact field view for stage tests. This is deliberately NOT a substitute
  * for production DAB_FRAG watercolor composite. Room must supply that pass. */
 resizeViewport(width:number,height:number) {
  this.options.canvas.width=Math.max(1,Math.floor(width));this.options.canvas.height=Math.max(1,Math.floor(height))
 }
 presentField(field: CanonicalGpuField) {
  const encoder = this.device.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' }] })
  pass.setPipeline(this.preview); pass.setBindGroup(0, this.device.createBindGroup({ layout: this.preview.getBindGroupLayout(0), entries: [{ binding: 0, resource: field.view }] })); pass.draw(3); pass.end(); this.device.queue.submit([encoder.finish()])
 }
 compositeInto(original: CanonicalGpuField, out: CanonicalGpuField, uniforms: CanonicalCompositeUniforms) {
  const encoder=this.device.createCommandEncoder({label:'canonical watercolor composite'})
  const transient=this.composite.encode(encoder,this.fields,original,this.paper.field,this.noise,out,uniforms)
  this.device.queue.submit([encoder.finish()]);void this.device.queue.onSubmittedWorkDone().then(()=>transient.forEach(buffer=>buffer.destroy()),()=>transient.forEach(buffer=>buffer.destroy()))
 }
 present(out?: CanonicalGpuField) { if (!out) throw new Error('Canonical presentation requires the composited layer field');this.presentField(out) }
 settle(): never { throw new Error('Canonical watercolor settle schedule is not ported yet') }
 async readField(field: CanonicalGpuField): Promise<Uint8Array> {
  const pitch = Math.ceil(field.width * 4 / 256) * 256, buffer = this.device.createBuffer({ size: pitch * field.height, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  try {
   const encoder = this.device.createCommandEncoder(); encoder.copyTextureToBuffer({ texture: field.texture }, { buffer, bytesPerRow: pitch }, [field.width, field.height]); this.device.queue.submit([encoder.finish()]); await buffer.mapAsync(GPUMapMode.READ)
   const source = new Uint8Array(buffer.getMappedRange()), bytes = new Uint8Array(field.width * field.height * 4)
   for (let row = 0; row < field.height; row++) bytes.set(source.subarray(row * pitch, row * pitch + field.width * 4), row * field.width * 4)
   buffer.unmap(); return bytes
  } finally { buffer.destroy() }
 }
 async readSnapshot(): Promise<CanonicalGpuSnapshot> {
  const fields = {} as Record<keyof CanonicalWatercolorFields, Uint8Array>
  for (const name of names) fields[name] = await this.readField(this.fields[name])
  return { width: this.options.width, height: this.options.height, fields }
 }
 restoreSnapshot(snapshot: CanonicalGpuSnapshot) {
  if (snapshot.width !== this.options.width || snapshot.height !== this.options.height) throw new Error('Canonical snapshot dimensions mismatch')
  for (const name of names) this.upload(this.fields[name], snapshot.fields[name])
 }
 whenIdle() { return this.device.queue.onSubmittedWorkDone() }
 destroy() { if (this.destroyed) return; this.destroyed = true; for (const field of this.ownedFields) field.texture.destroy(); this.ownedFields.clear(); for(const field of this.pendingRetired)field.texture.destroy(); this.pendingRetired.clear(); this.activeRetired.forEach(field=>field.texture.destroy()); this.activeRetired=[]; this.activeBuffers.forEach(buffer=>buffer.destroy()); this.activeBuffers=[]; this.context.unconfigure(); this.device.destroy() }
}
