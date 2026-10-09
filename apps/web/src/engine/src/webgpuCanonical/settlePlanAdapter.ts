/// <reference types="@webgpu/types" />
import type { SettlePlanPasses, SettlePlanUploads, SettlePlanField, SettlePlanFieldOptions, SettlePlanRect } from '../watercolor/SettlePlanContracts'
import { WET_DIFFUSE_D, WET_DIFFUSE_B } from '../watercolor/wetDiffusion'
import type { CanonicalWatercolorWebGpu } from './backend'
import type { CanonicalFieldBuffer } from './fieldBuffer'
import type { CanonicalGpuContext, CanonicalGpuField, CanonicalPassResources } from './types'
import { CanonicalSettleCommands } from './passes/commands'
import { CanonicalCarryOracle } from './pairedCarryOracle'
import { CanonicalPairedCarry } from './passes/pairedCarry'
import { CanonicalBrushContact } from './brush'

/** Mutable upload slot, corresponding to one legacy texture identity. Bind
 * groups retain the actual field selected at encoding time. */
export interface CanonicalUploadSlot { field: CanonicalGpuField | null; destroyed: boolean }
type BufferField = Pick<SettlePlanField<CanonicalFieldBuffer>, 'w' | 'h' | 'coverage'>

/** Executes the ORIGINAL planner's GPU calls. Own resource operations and
 * uploads join the same encoder, preserving their position between passes. */
export class CanonicalPlanAdapter implements SettlePlanPasses<CanonicalFieldBuffer, CanonicalUploadSlot> {
 get diagnosticBrushMrt(){return import.meta.env.DEV&&this.diagnosticNativeBrushPair}
 diagnosticNativeBrushPair=false
 pairedBrushCalls=0
 /** Diagnostic-only hardware sampling arm for existing LINEAR non-paper field inputs. */
 diagnosticFrontSourceFilter?:import('./passes/frontSampling').CanonicalFrontSourceSampling
 diagnosticHardwareLinearInputs=false
 /** OFF-default paired carry, no planner cadence/presentation changes. */
 diagnosticStaticDiffuseHeight=false
 diagnosticStaticFrontCache=false
 diagnosticFrontFilmHoist=false
 diagnosticLazyFrontClimb=false
 diagnosticPairedCarry=false
 retireStaticFrontCache(){this.commands.retireStaticCache(cleanup=>this.owner.retireAfterOwnerScopes(cleanup))}
 get filmVariantDiagnostics(){return this.commands.filmVariantDiagnostics}
 get staticFrontCacheCounters(){return this.commands.staticFrontCacheCounters}
 pairedCarryCalls=0
 diagnosticCarryOracleIndex:number|undefined
 private carryOracle:CanonicalCarryOracle|null=null
 async readCarryOracle(){return this.carryOracle?{pairIndex:this.diagnosticCarryOracleIndex,hardwareLinear:this.diagnosticHardwareLinearInputs,...await this.carryOracle.read()}:null}
 disposeCarryOracle(){this.carryOracle?.destroy();this.carryOracle=null}
 private pairedCarry:CanonicalPairedCarry|null=null
 readonly uploads: SettlePlanUploads<CanonicalUploadSlot>
 private readonly owner: CanonicalWatercolorWebGpu
 private readonly commands: CanonicalSettleCommands
 private readonly brush: CanonicalBrushContact
 /** Diagnostic CPU submission count only; not total backend draws or GPU time. */
 diagnosticCountSubmissions=false
 private diagnosticSubmittedQuanta=0
 get submissionCounters(){return {submittedQuanta:this.diagnosticSubmittedQuanta}}
 private context: CanonicalGpuContext | null = null
 private transient: GPUBuffer[] = []
 diagnosticOwnerEpoch=0
 private diagnosticQuantumOrdinal=0
 constructor(owner: CanonicalWatercolorWebGpu) {
  this.owner = owner
  this.commands = new CanonicalSettleCommands(owner.device)
  this.brush = new CanonicalBrushContact(owner.device)
  this.uploads = {
   create: () => ({ field: null, destroyed: false }),
   bindFlow: slot => { if (!slot || slot.destroyed) throw new Error('Native flow slot is unavailable') },
   uploadFlow: (slot, width, height, pixels) => this.upload(slot, width, height, pixels, false),
   uploadForeign: (slot, width, height, pixels) => this.upload(slot, width, height, pixels, true),
   destroy: slot => { if (!slot || slot.destroyed) return; slot.destroyed = true; if (slot.field) this.owner.destroyField(slot.field); slot.field = null },
  }
 }
 /** The synchronous callback is one original ordered planner quantum. No
  * shader, copy or upload is allowed outside this explicit command scope. */
 runQuantum<T>(task: (context: CanonicalGpuContext) => T): T {
  if (this.context) throw new Error('Nested native planner quantum')
  const originalEncoder = this.owner.device.createCommandEncoder({ label: 'canonical planner quantum' })
  const timing=this.owner.diagnosticTimestampQuantum?.(originalEncoder)
  const encoder = timing?.encoder??originalEncoder
  this.context = { device: this.owner.device, encoder, nearest: this.owner.nearest, linear: this.owner.linear }
  this.transient = []
  let observedRelease:ReturnType<NonNullable<CanonicalWatercolorWebGpu['diagnosticSchedulingBindRelease']>>
  try{observedRelease=this.owner.diagnosticSchedulingBindRelease?.(++this.diagnosticQuantumOrdinal,this.diagnosticOwnerEpoch)}catch{/* Observer must not affect original scope. */}
  let releaseOwner: (() => void) | undefined
  try {
   const owned = this.owner.encodeOwnerCommands(encoder, () => task(this.ctx()))
   releaseOwner = owned.release
   const transient = this.transient
   this.owner.device.queue.submit([encoder.finish()])
   try{observedRelease?.submitted()}catch{}
   timing?.commit()
   if(this.diagnosticCountSubmissions)this.diagnosticSubmittedQuanta++
   const release = () => { owned.release(); transient.forEach(buffer => buffer.destroy()) }
   if(observedRelease){const observeRelease=(outcome:'fulfilled'|'rejected')=>{let before:number|null=null;try{before=this.owner.diagnosticScopeState.pending}catch{};release();try{if(before===null)return;const after=this.owner.diagnosticScopeState;observedRelease!(outcome,before,after.pending,after.live)}catch{}};void this.owner.device.queue.onSubmittedWorkDone().then(()=>observeRelease('fulfilled'),()=>observeRelease('rejected'))}
   else void this.owner.device.queue.onSubmittedWorkDone().then(release,release)
   return owned.value
  } catch (error) {
   timing?.abort()
   let before:number|null=null
   if(observedRelease){try{before=this.owner.diagnosticScopeState.pending}catch{}}
   releaseOwner?.()
   this.transient.forEach(buffer => buffer.destroy())
   if(observedRelease&&before!==null){try{const after=this.owner.diagnosticScopeState;observedRelease('encode-error',before,after.pending,after.live)}catch{}}
   throw error
  } finally { this.context = null; this.transient = [] }
 }
 /** Retain external source/composite pass uniforms in this same quantum. */
 retain(buffers: readonly GPUBuffer[]) { this.ctx(); this.transient.push(...buffers) }
 private ctx(): CanonicalGpuContext {
  if (!this.context) throw new Error('Canonical planner pass requires an active quantum')
  return this.context
 }
 private upload(slot: CanonicalUploadSlot | null, width: number, height: number, pixels: Uint8Array, luminance: boolean) {
  const ctx = this.ctx()
  if (!slot || slot.destroyed) throw new Error('Native upload slot is unavailable')
  if (!slot.field || slot.field.width !== width || slot.field.height !== height) {
   if (slot.field) this.owner.destroyField(slot.field)
   slot.field = this.owner.createField(luminance ? 'canonical foreign water' : 'canonical contact flow', width, height)
  }
  this.transient.push(...(luminance
   ? this.owner.encodeUploadGlLuminance(ctx.encoder, slot.field, pixels)
   : this.owner.encodeUploadRgba(ctx.encoder, slot.field, pixels, true)))
 }
 private resources(out: CanonicalFieldBuffer, a: CanonicalFieldBuffer, b = a, coverage = a): CanonicalPassResources {
  return { out: out.field, a: a.field, b: b.field, coverage: coverage.field, paper: this.owner.paper, world: { x: 0, y: 0, width: out.width, height: out.height } }
 }
 fieldOp(out: CanonicalFieldBuffer, a: CanonicalFieldBuffer, b: CanonicalFieldBuffer, mode: Parameters<SettlePlanPasses<CanonicalFieldBuffer, CanonicalUploadSlot>['fieldOp']>[3], k: number, options: SettlePlanFieldOptions<CanonicalFieldBuffer> = {}) {
  const { c, d, e, path, ...scalars } = options
  this.transient.push(this.commands.encode(this.ctx(), { kind: 'fieldOp', resources: this.resources(out, a, b), mode, k, options: { ...scalars, diagnosticHardwareLinearInputs:this.diagnosticHardwareLinearInputs, c: c?.field, d: d?.field, e: e?.field, path: path?.field, noise: this.owner.noise } }))
 }
 carryPair(outPigment:CanonicalFieldBuffer,pigment:CanonicalFieldBuffer,outColor:CanonicalFieldBuffer,color:CanonicalFieldBuffer,fixed:CanonicalFieldBuffer,k:number,options:SettlePlanFieldOptions<CanonicalFieldBuffer>):boolean {
  if(!this.diagnosticPairedCarry)return false
  const {c,d,e,path,...scalars}=options
  if(c)throw new Error('Paired carry receives OLD pigment explicitly')
  for(const b of [outPigment,pigment,outColor,color,fixed,d,e,path])if(b&&b.owner!==this.owner)throw new Error('Paired carry crosses field owners')
  const pairedCarry=this.pairedCarry??=new CanonicalPairedCarry(this.owner.device)
  const draw=()=>{
  this.transient.push(pairedCarry.run(this.ctx(),{pigment:pigment.field,color:color.field,fixed:fixed.field,outPigment:outPigment.field,outColor:outColor.field},k,{...scalars,diagnosticHardwareLinearInputs:this.diagnosticHardwareLinearInputs,d:d?.field,e:e?.field,path:path?.field,noise:this.owner.noise}))
  }
  if(this.pairedCarryCalls===this.diagnosticCarryOracleIndex){if(this.carryOracle)throw new Error('Only one actual carry oracle allowed');this.carryOracle=new CanonicalCarryOracle(this.ctx(),this.owner,{p:pigment,c:color,fixed,outP:outPigment,outC:outColor},k,options,draw,(p,c)=>{this.fieldOp(c,color,fixed,16,k,{...options,c:pigment});this.fieldOp(p,pigment,fixed,15,k,options)})}else draw()
  this.pairedCarryCalls++;return true
 }
 pigmentColor(out: CanonicalFieldBuffer, deposit: CanonicalFieldBuffer, tau: readonly number[]) {
  if (tau.length < 3) throw new Error('Canonical absorption requires three channels')
  this.transient.push(this.commands.encode(this.ctx(), { kind: 'pigmentColor', resources: this.resources(out, deposit), tau: [tau[0], tau[1], tau[2]] }))
 }
 costDomainStep(out: CanonicalFieldBuffer, source: CanonicalFieldBuffer, rect: SettlePlanRect, band: number, stride: number, packed = false) {
  this.transient.push(this.commands.encode(this.ctx(), { kind: 'costDomain', out: out.field, source: source.field, rect, band, stride, packed }))
 }
 diffuseStep(field: BufferField, x0: number, y0: number, scale: number, paperWidth: number, paperHeight: number, source: CanonicalFieldBuffer, out: CanonicalFieldBuffer, radius: number, knight: boolean, gate: CanonicalFieldBuffer) {
  const resources = this.resources(out, source, source, gate)
  const paper = { ...resources.paper, staticInputEpoch:this.owner.staticInputEpoch, origin: [x0 / scale, -(y0 / scale + field.h)] as const, texSize: [paperWidth / scale, paperHeight / scale] as const }
  this.transient.push(this.commands.encode(this.ctx(), { kind: 'diffuse', resources: { ...resources, paper }, radius: Math.max(1, Math.round(radius / scale)), knight, d: WET_DIFFUSE_D, b: WET_DIFFUSE_B,options:{diagnosticStaticHeightCache:this.diagnosticStaticDiffuseHeight,noise:this.owner.noise} }))
 }
 waterFrontStep(field: BufferField, x0: number, y0: number, dryCost: number, source: CanonicalFieldBuffer, out: CanonicalFieldBuffer, max: number, climb: number, floor: number, stride = 1, scale = 1, foreignWater: CanonicalUploadSlot | null = null) {
  const resources = this.resources(out, source, source, field.coverage)
  const size = this.owner.paper.texSize
  const paper = { ...resources.paper, staticInputEpoch:this.owner.staticInputEpoch, origin: [x0 / scale, -(y0 / scale + field.h)] as const, texSize: [size[0] / scale, size[1] / scale] as const }
  if (foreignWater && (!foreignWater.field || foreignWater.destroyed)) throw new Error('Foreign water slot has not been uploaded')
  this.transient.push(this.commands.encode(this.ctx(), { kind: 'waterFront', resources: { ...resources, paper }, noise: this.owner.noise, params: { diagnosticSourceFilter:this.diagnosticFrontSourceFilter,diagnosticStaticCache:this.diagnosticStaticFrontCache,diagnosticFilmHoist:this.diagnosticFrontFilmHoist,diagnosticLazyClimb:this.diagnosticLazyFrontClimb,dryCost, costMax: max, climb, floor, stride, foreignFilm: foreignWater?.field ?? undefined } }))
 }
 wcResample(out: CanonicalFieldBuffer, dx: number, dy: number, width: number, height: number, source: CanonicalFieldBuffer, sx: number, sy: number, ratio: number, mode: 0 | 1 | 2, old: CanonicalFieldBuffer | null = null, base: CanonicalFieldBuffer | null = null, clamp: SettlePlanRect | null = null) {
  if (width <= 0 || height <= 0) return
  this.transient.push(this.commands.encode(this.ctx(), { kind: 'resample', out: out.field, source: source.field, old: (old ?? source).field, base: (base ?? source).field, params: { baseSize: base ? [base.width, base.height] : [out.width, out.height], dstOrigin: [dx, dy], srcOrigin: [sx, sy], ratio, mode, clamp: clamp ?? [0, 0, source.width, source.height], scissor: [dx, dy, width, height] } }))
 }
 brushPair(field: BufferField, flow: CanonicalUploadSlot, radius: number, scale: number, pigment: CanonicalFieldBuffer, outPigment: CanonicalFieldBuffer, color: CanonicalFieldBuffer, outColor: CanonicalFieldBuffer, rect: SettlePlanRect, scissor: SettlePlanRect, gain: number): boolean {
  if(!this.diagnosticBrushMrt)return false
  if(!Number.isInteger(field.w)||field.w<1||!Number.isInteger(field.h)||field.h<1)throw Error('Native paired brush invalid field extent')
  const buffers=[pigment,color,field.coverage,outPigment,outColor]
  for(const b of buffers){if(b.owner!==this.owner||b.destroyed||!this.owner.ownsLiveField(b.field)||b.width!==field.w||b.height!==field.h||b.field.width!==b.width||b.field.height!==b.height||b.field.format!=='rgba8unorm'||b.filter!==b.field.filter)throw Error('Native paired brush requires live same-owner Q8 dimensions')}
  if(!flow.field||flow.destroyed||!this.owner.ownsLiveField(flow.field)||flow.field.format!=='rgba8unorm')throw Error('Native paired brush requires owned uploaded flow')
  if([pigment.field,color.field,field.coverage.field,flow.field].some(f=>f.texture===outPigment.texture||f.texture===outColor.texture)||outPigment.texture===outColor.texture)throw Error('Native paired brush aliases pre-pulse inputs')
  if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(scale)||scale<=0||!Number.isFinite(gain)||gain<0||rect.length!==4||scissor.length!==4||rect.some(v=>!Number.isFinite(v))||rect[2]<=0||rect[3]<=0||scissor.some(v=>!Number.isInteger(v)||v<0)||scissor[0]+scissor[2]>field.w||scissor[1]+scissor[3]>field.h)throw Error('Native paired brush invalid original pulse geometry')
  const step=Math.max(1,Math.round(radius*.25/scale))
  this.transient.push(...this.brush.encode(this.ctx(),{pigment:pigment.field,color:color.field,flow:flow.field,water:field.coverage.field,outPigment:outPigment.field,outColor:outColor.field},[step/field.w,step/field.h],gain,rect,scissor))
  this.pairedBrushCalls++;return true
 }
 brushPass(field: BufferField, flow: CanonicalUploadSlot, radius: number, scale: number, source: CanonicalFieldBuffer, out: CanonicalFieldBuffer, pigment: CanonicalFieldBuffer, rect: SettlePlanRect, scissor: SettlePlanRect, color: CanonicalFieldBuffer, gain: number) {
  if (!flow.field || flow.destroyed) throw new Error('Native contact flow is unavailable')
  const colorPass = source === color
  if (!colorPass && source !== pigment) throw new Error('Unexpected canonical contact source')
  const step = Math.max(1, Math.round(radius * .25 / scale))
  this.transient.push(...this.brush.encodeSingle(this.ctx(), { pigment: pigment.field, color: color.field, flow: flow.field, water: field.coverage.field, out: out.field }, colorPass ? 'color' : 'pigment', [step / field.w, step / field.h], gain, rect, scissor))
 }
}
