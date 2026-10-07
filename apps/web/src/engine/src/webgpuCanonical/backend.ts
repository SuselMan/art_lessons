/// <reference types="@webgpu/types" />
import noiseAsset from '../raster/watercolorNoise.txt?raw'
import { CanonicalRibbonDeposit } from './deposit'
import { CanonicalStampDeposit } from './stamp'
import { CanonicalComposite } from './render'
import type { CanonicalCompositeUniforms, CanonicalGpuField, CanonicalGpuSnapshot, CanonicalPaper, CanonicalRibbonBatch, CanonicalSupport, CanonicalStamp, CanonicalWatercolorFields } from './types'

export interface CanonicalWebGpuOptions {
 canvas: HTMLCanvasElement
 width: number
 height: number
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
 private readonly context: GPUCanvasContext
 private readonly format: GPUTextureFormat
 private readonly preview: GPURenderPipeline
 private destroyed = false
 readonly device: GPUDevice
 readonly options: CanonicalWebGpuOptions
 private constructor(device: GPUDevice, options: CanonicalWebGpuOptions) {
  this.device=device;this.options=options
  const context = options.canvas.getContext('webgpu'); if (!context) throw new Error('WebGPU canvas unavailable')
  this.context = context; this.format = navigator.gpu.getPreferredCanvasFormat()
  options.canvas.width = options.viewportWidth ?? options.width; options.canvas.height = options.viewportHeight ?? options.height
  context.configure({ device, format: this.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC })
  this.nearest = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' })
  this.linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
  this.fields = Object.fromEntries(names.map(name => [name, this.createField(name, options.width, options.height)])) as unknown as CanonicalWatercolorFields
  this.paper = { field: this.createField('production baked paper', options.paper.width, options.paper.height), origin: options.paper.origin, texSize: options.paper.texSize, scale: options.paper.scale }
  this.upload(this.paper.field, options.paper.bytes)
  const lattice = Uint8Array.from(atob(noiseAsset), c => c.charCodeAt(0)), rgba = new Uint8Array(lattice.length * 4)
  for (let k = 0; k < lattice.length; k++) rgba.set([lattice[k], lattice[k], lattice[k], 255], k * 4)
  this.noise = this.createField('production 251x251 watercolor lattice', 251, 251); this.upload(this.noise, rgba)
  this.deposit = new CanonicalRibbonDeposit(device, this.noise)
  this.stamps = new CanonicalStampDeposit(device, this.noise)
  this.composite = new CanonicalComposite(device)
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
 createField(label: string, width: number, height: number): CanonicalGpuField {
  const texture = this.device.createTexture({ label, size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT })
  return { width, height, label, format: 'rgba8unorm', texture, view: texture.createView() }
 }
 upload(field: CanonicalGpuField, bytes: Uint8Array) {
  if (bytes.byteLength !== field.width * field.height * 4) throw new Error(`Canonical RGBA8 upload size mismatch: ${field.label}`)
  this.device.queue.writeTexture({ texture: field.texture }, bytes as Uint8Array<ArrayBuffer>, { bytesPerRow: field.width * 4 }, { width: field.width, height: field.height })
 }
 appendPreparedRibbon(batch: CanonicalRibbonBatch) {
  if (this.destroyed) throw new Error('Canonical WebGPU backend destroyed')
  if (!batch.vertices.length) return
  const encoder = this.device.createCommandEncoder({ label: 'canonical prepared ribbon' })
  const transient = this.deposit.encode(encoder, batch, this.fields.coverage, this.fields.water, this.fields.pigment, this.fields.color)
  this.device.queue.submit([encoder.finish()]); void this.device.queue.onSubmittedWorkDone().finally(() => transient.forEach(buffer => buffer.destroy()))
 }
 appendPreparedStamp(stamp: CanonicalStamp) {
  if (this.destroyed) throw new Error('Canonical WebGPU backend destroyed')
  const encoder=this.device.createCommandEncoder({label:'canonical prepared nib stamp'})
  const transient=this.stamps.encode(encoder,stamp,this.fields.coverage,this.fields.water,this.fields.pigment,this.fields.color)
  this.device.queue.submit([encoder.finish()]);void this.device.queue.onSubmittedWorkDone().finally(()=>transient.forEach(buffer=>buffer.destroy()))
 }
 clear() {
  const encoder = this.device.createCommandEncoder()
  for (const field of Object.values(this.fields)) { const pass = encoder.beginRenderPass({ colorAttachments: [{ view: field.view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] }); pass.end() }
  this.device.queue.submit([encoder.finish()])
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
  this.device.queue.submit([encoder.finish()]);void this.device.queue.onSubmittedWorkDone().finally(()=>transient.forEach(buffer=>buffer.destroy()))
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
 destroy() { if (this.destroyed) return; this.destroyed = true; for (const field of [...Object.values(this.fields), this.paper.field, this.noise]) field.texture.destroy(); this.context.unconfigure(); this.device.destroy() }
}
