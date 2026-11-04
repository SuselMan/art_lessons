import {setGlClearColor,setGlColorMask} from '../raster/GlClearState'
import {canonicalPatternResourceLifetime,assertCanonicalPatternResourceCurrent,type CanonicalTipGradientResource} from './CanonicalMaskSourceBank'
import {SourceSpatialColorPass,fillSourceSpatialNoise} from './SourceSpatialColorPass'
import {canonicalSourceColorFieldDraw,type CanonicalSourceSpatialColor,type CanonicalSourceColorFieldDraw} from '@grafetto/shared'
import type {CanonicalMaterialParameters} from '@grafetto/shared'
import { MAX_SOURCE_DENSITY_GESTURE_ID } from '../presets/sourceDefaultAutoDensitySeed'
import {assertBrushGlMutationIdle,borrowBrushGlBatchAutoUploadRestore,withBrushGlTurnAutoUploadRestore,type BrushGlTurn,type BrushGlBatchFrame,type BrushGlBatchInfo,type BrushGlBatchParticipant} from './BrushGlBatch';
import { canonicalSoftAutoSourcePin, canonicalSoftAutoStatic, sourcePngPyramid } from '@grafetto/shared';
import { saveBrushGlState,restoreBrushAutoUploadState,type BrushGlContextOwner } from './BrushGlState';
import type { SourceDabMaterialSpec } from '../presets/sourceDabCache';
import { buildRgba64FactorLut } from '../raster/sourceRgba64StraightShader';
import { SOURCE_TRANSFORMED_MASK_VERT, sourceTransformedMaskFragment } from '../raster/sourceTransformedMaskShader';
import { BrushMipCache } from './BrushMipCache';
import { BrushTextureCache, allocateOwnedBrushTexture, allocateOwnedBrushBuffer, combineOwnedBrushResources, releaseUnpublishedBrushResource, type OwnedBrushResource, type OwnedBrushBuffer } from './BrushTextureCache';
import { reserveContextStorage, releaseStorageReservation, type StorageReservation } from '../buffers/ContextStorageOwner';
import { resolvedTransformedMaskPlan, writeTransformedMaskVertices, type TransformedMaskPlan, type TransformedMaskMaterial, type CanonicalMaskSourceBinding, canonicalTransformedMaskMetadata, canonicalTransformedMaskPlan, canonicalMaskRevision, canonicalAutoMaskRevision, prepareCanonicalAutoMask, isCanonicalSoftAutoMaterial, type CanonicalAutoMaskMaterial } from './TransformedMaskPlan';
const noMetadataRelease=()=>{};
/** Conservative lease object, method closures/environment and one Set entry; not a JS heap cap. */
export const CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES=2048;
export interface TransformedMaskLimits {
  readonly width: number;
  readonly height: number;
  readonly slots: number;
  readonly spatialColors?:true;
  readonly tipGradient?:true;
}
/** Metadata-only, same admitted workspace formulas used by prepare. */
export function transformedMaskPrepassBudget(limits: TransformedMaskLimits): {
  gpuBytes: number; cpuBytes: number; vertexBytes: number;
} {
  if (!Number.isSafeInteger(limits.width) || !Number.isSafeInteger(limits.height)
    || !Number.isSafeInteger(limits.slots) || limits.width < 1 || limits.height < 1
    || limits.width > 4096 || limits.height > 4096 || limits.width * limits.height > 1048576
    || limits.slots < 1 || limits.slots > 8) throw new RangeError('Invalid prepass capacity');
  if(limits.spatialColors!==undefined&&limits.spatialColors!==true||limits.spatialColors&&limits.slots<3)throw new RangeError('Spatial prepass needs three declared slots')
  if(limits.tipGradient!==undefined&&limits.tipGradient!==true||limits.tipGradient&&limits.slots<2)throw new RangeError('Gradient tip needs two declared slots')
  const vertexBytes = limits.height * FLOATS_PER_ROW * 4;
  // Existing fixed CPU owner covers retained identity per slot and one bounded
  // UTF16 JSON hashing temporary (worst escaped input), not a heap cap proof.
  const densityMetadataBytes=limits.slots*(2*MAX_SOURCE_DENSITY_GESTURE_ID+512)+12*MAX_SOURCE_DENSITY_GESTURE_ID+1024;
  return { vertexBytes, cpuBytes: (limits.spatialColors||limits.tipGradient?8192:0) + vertexBytes + limits.height * PLAN_BYTES_PER_ROW * limits.slots * 2 + FACTOR_BYTES + densityMetadataBytes + 1024 + limits.slots*192,
    gpuBytes: FACTOR_BYTES + vertexBytes + limits.width * limits.height * 4 * limits.slots };
}
export interface TransformedMaskSource {
  readonly key: string;
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
}
export interface TransformedMaskPreparedSource {
  readonly key: string;
  readonly bytes: number;
  /** Trusted cold bank binding, copied before drawing. Legacy callers omit it. */
  readonly canonical?: CanonicalMaskSourceBinding;
}
function savedMaterial(m: TransformedMaskMaterial): SourceDabMaterialSpec {
  if ('kind' in m) {
    if (m.kind === 'savedSource') return m.source;
    throw new RangeError('Canonical material is not a saved source request');
  }
  return m;
}
function canonicalMaterial(m: TransformedMaskMaterial): m is Extract<TransformedMaskMaterial, { kind: 'canonical' }> {
  return !!m && 'kind' in m && m.kind === 'canonical';
}
function checkedBinding(b: CanonicalMaskSourceBinding, bytes: number): CanonicalMaskSourceBinding {
  if(b.sourceSlot!==undefined&&b.sourceSlot!==0&&b.sourceSlot!==1)throw new RangeError('Invalid source role binding');
  const a = b?.asset;
  if (!a || !/^asset:[0-9a-f]{64}$/.test(a.id) || ![a.size, a.width, a.height].every(n => Number.isSafeInteger(n) && n > 0)
    || a.size > 4096 || ![a.x, a.y].every(n => Number.isSafeInteger(n) && n >= 0)
    || a.x + a.width > a.size || a.y + a.height > a.size || !Number.isSafeInteger(b.index) || b.index < 0)
    throw new RangeError('Invalid canonical prepared source binding');
  const level = sourcePngPyramid(a.width, a.height).levels[b.index];
  if (!level || b.baseScale !== level.scale || b.nativeWidth !== level.width || b.nativeHeight !== level.height
    || bytes !== (level.width + 2) * (level.height + 2) * 4) throw new RangeError('Invalid canonical prepared level binding');
  if(b.frameIndex!==undefined&&(!Number.isInteger(b.frameIndex)||b.frameIndex<0||b.frameIndex>255||Object.is(b.frameIndex,-0)))throw new RangeError('Invalid original frame binding')
  if(b.imageMaterial?.frameIndex!==undefined&&(!Number.isInteger(b.imageMaterial.frameIndex)||b.imageMaterial.frameIndex<0||b.imageMaterial.frameIndex>255||Object.is(b.imageMaterial.frameIndex,-0)))throw new RangeError('Invalid image material frame binding')
  if(b.imageMaterial&&(!['lightness-map-v1','color-stamp-v1','gradient-map-v1'].includes(b.imageMaterial.kind)||b.imageMaterial.channels.length!==(b.imageMaterial.kind==='color-stamp-v1'?3:1)||b.imageMaterial.channels.some(c=>!/^asset:[a-f0-9]{64}$/.test(c.id)||c.size!==a.size||c.x!==a.x||c.y!==a.y||c.width!==a.width||c.height!==a.height)))throw new RangeError('Invalid image material binding')
  return Object.freeze({ ...b,...b.imageMaterial?{imageMaterial:Object.freeze({...b.imageMaterial,channels:Object.freeze(b.imageMaterial.channels.map(c=>Object.freeze({...c})))})}:{}, asset: Object.freeze({ ...a }) });
}
export interface TransformedMaskRequest {
  readonly owner: object;
  readonly role: string;
  readonly material: TransformedMaskMaterial;
  readonly source: TransformedMaskSource;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly profile: 'wide8-separate-wordsize64' | 'neon4-summed-wordsize64';
}
export type CanonicalAutoMaskRequest = Omit<TransformedMaskRequest, 'material' | 'source'> & {
  readonly material: CanonicalAutoMaskMaterial;
  readonly source?: never;
};
export type AnyTransformedMaskRequest = TransformedMaskRequest | CanonicalAutoMaskRequest;
/** Borrowed output: its owning prepass retains immutable NEAREST/CLAMP sampler
 * configuration. Consumers/owner callbacks must not call texParameteri on it.
 * Sampling/view geometry is valid only while the returned group is leased. */
export interface TransformedMaskView {
  readonly key: string;
  readonly texture: WebGLTexture;
  readonly rect: TransformedMaskRequest['rect'];
  /** Allocation UVs, no original-tip transform must be applied again. */
  readonly bounds: {
    readonly x: 0;
    readonly y: 0;
    readonly width: number;
    readonly height: number;
  };
  readonly mirror: {
    readonly horizontal: boolean;
    readonly vertical: boolean;
  };
  readonly channel: 'r';
  readonly spatialRGBA?:true;
  readonly materialRGBA?:true;
  readonly imageMaterial?:'lightness-map-v1'|'color-stamp-v1'|'gradient-map-v1';
  readonly materialParams?:CanonicalMaterialParameters;
}
export interface CanonicalSpatialColorRequest {readonly provider:CanonicalSourceSpatialColor;readonly draw:CanonicalSourceColorFieldDraw;readonly field?:TransformedMaskSource;readonly material?:Readonly<{kind:'lightness-map-v1'|'color-stamp-v1'|'gradient-map-v1';strength:number;foregroundAlpha:number}>}
interface Slot {
  key: string;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  owner?: object;
  role?: string;
  revision?: string;
  material?: TransformedMaskMaterial;
  plan?: TransformedMaskPlan;
  profile?: string;
  sourceKey?: string;
  used: number;
}
interface Workspace {
  low: WebGLTexture;
  high: WebGLTexture;
  buffer: WebGLBuffer;
  vao?: WebGLVertexArrayObjectOES;
}
const FACTOR_BYTES = 524288, FLOATS_PER_ROW = 72, PLAN_BYTES_PER_ROW = 256;
const safe = (v: number, low: number, high: number) => Number.isSafeInteger(v) && v >= low && v <= high;
/** Internal opt-in service, not connected to painters or a wire descriptor.
* Its texture cache is the existing painter's cache, NEVER a new independent
* memory allowance. Call prepare after assets and before input unlock.
*/
export interface CanonicalPreparedResourceUpdate {
  readonly status:'pending'|'published'|'cancelled'
  assertCurrent():void
  publish():undefined
  finalizeCleanup():undefined
  cancel():undefined
}
export interface CanonicalPreparedCapacityUpdate extends CanonicalPreparedResourceUpdate {
  preparedResources():readonly Readonly<{key:string;bytes:number}>[]
  /** Owner-only assert; safe before all staged resources exist. */
  assertCurrent():void
  /** Final ready-resource check; call immediately before pure publication. */
  assertPreparedPublication():void
}
interface CapacityRecord {
 readonly limits:TransformedMaskLimits;readonly workspace:Workspace;readonly key:string;readonly slots:(Slot|undefined)[];staging:Float32Array
 sources:Map<string,number>;bindings:Map<string,CanonicalMaskSourceBinding>
 readonly leases:Set<()=>void>;releaseMetadata:()=>void;releaseResidency:()=>void
 releaseStorageCpu?:()=>void;alive:boolean;isDefault:boolean;work:number;pinned:boolean
}
export interface CanonicalMaskCapacityLease extends BrushGlBatchParticipant {
 /** Internal pure metadata barrier, not a mutation or execution grant. */
 assertMutationIdle():void
 isReady():boolean
 supportsTipGradient():boolean
 preparedCapacity():Readonly<{width:number;height:number;epoch:object}>
 preparedResources():readonly {key:string;bytes:number}[]
 materializeTipGradient(view:TransformedMaskView,gradient:CanonicalTipGradientResource,frame:BrushGlBatchFrame):TransformedMaskView
 materializeSpatial(view:TransformedMaskView,request:CanonicalSpatialColorRequest,frame:BrushGlBatchFrame):TransformedMaskView
 resolveGroup(requests:readonly AnyTransformedMaskRequest[],frame?:BrushGlBatchFrame):{views:TransformedMaskView[];release:()=>void}
 hasReadyAutoGeneration(request:AnyTransformedMaskRequest):boolean
 canContinueSingleStripeAuto(request:AnyTransformedMaskRequest):boolean
 beginAutoGeneration(request:AnyTransformedMaskRequest):boolean
 advanceAutoGeneration(maxSamples:number,options?:{readonly deferFinalUpload?:true}):{done:boolean;consumed:number;uploadedBytes:number;finalUploadPending?:true}
 finalAutoUploadPending(request:AnyTransformedMaskRequest):boolean
 flushFinalAutoGeneration(request:AnyTransformedMaskRequest,turn:BrushGlTurn):{done:true;consumed:0;uploadedBytes:number}
 cancelAutoGeneration():void
 releaseOwner(owner:object):void
 release():void
}
export class TransformedMaskPrepass {
  private pendingAuto?: {
    readonly owner: object; readonly role: string; readonly revision: string; readonly slot: Slot;
    readonly record:CapacityRecord;readonly participant:BrushGlBatchParticipant; readonly epoch: Workspace; readonly evaluator: ReturnType<typeof prepareCanonicalAutoMask>['evaluator'];
    readonly material: CanonicalAutoMaskMaterial; readonly width: number; readonly height: number;
    readonly a8: Uint8Array; readonly rgba: Uint8Array; readonly release: () => void;
    filled: number; uploadedRows: number; computedFinal:boolean; flushing:boolean;
  };
  private readonly records=new Set<CapacityRecord>();
  private defaultRecord?:CapacityRecord;
  private turnDepth=0;
  private capacityCapture=false;
  private batch?: BrushGlBatchFrame;
  private limits?: TransformedMaskLimits;
  private sourceUpdate?:CanonicalPreparedResourceUpdate;
  private releaseSourceMetadata?:()=>void;
  private sources = new Map<string, number>();
  private sourceBindings = new Map<string, CanonicalMaskSourceBinding>();
  private workspace?: Workspace;
  private slots: (Slot | undefined)[] = [];
  private staging?: Float32Array;
  private program?: WebGLProgram;
  private attributes: number[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private releaseCpu?: () => void;
  private reservedCpuBytes = 0;
  private clock = 0;
  private activeGroup?: symbol;
  private instancing: ANGLE_instanced_arrays | null = null;
  private vertexArrays: OES_vertex_array_object | null = null;
  private workspaceKey: string;
  private capacityUpdate?:CanonicalPreparedCapacityUpdate;
  private capacitySerial=0;
  private capacityResetLost=false;
  private readonly gl: WebGLRenderingContext;
  private readonly cache: BrushTextureCache;
  private readonly cpu: BrushMipCache;
  private readonly prefix: string;
  private readonly contextOwner?:BrushGlContextOwner;
  constructor(gl: WebGLRenderingContext, cache: BrushTextureCache, cpu: BrushMipCache, prefix: string,contextOwner?:BrushGlContextOwner) {
    this.contextOwner=contextOwner;
    this.gl = gl;
    this.cache = cache;
    this.cpu = cpu;
    this.prefix = prefix;
    if (!prefix || prefix.includes('\0'))
      throw new RangeError('Missing prepass resource scope');
    this.workspaceKey = `${prefix}:workspace`;
  }
  private defaultCapacityRecord(capturing=false):CapacityRecord {
    if(this.capacityCapture&&!capturing)throw new Error('Capacity transition is active')
    const previous=this.capacityCapture;this.capacityCapture=true;try{return this.captureDefaultCapacityRecord()}finally{this.capacityCapture=previous}
  }
  private captureDefaultCapacityRecord():CapacityRecord {
    if(this.defaultRecord)return this.defaultRecord
    if(!this.isReady()||!this.limits||!this.workspace||!this.staging)throw new Error('Prepass is not prepared')
    const workspace=this.workspace,limits=this.limits,slots=this.slots,staging=this.staging,sources=this.sources,bindings=this.sourceBindings,key=this.workspaceKey,program=this.program
    const current=()=>{if(this.workspace!==workspace||this.limits!==limits||this.slots!==slots||this.staging!==staging||this.sources!==sources||this.sourceBindings!==bindings||this.workspaceKey!==key||this.program!==program||!this.isReady())throw new Error('Capacity capture changed')}
    const releaseMetadata=noMetadataRelease
    let releaseResidency=noMetadataRelease
    try{
      current()
      const record:CapacityRecord={limits,workspace,key,slots,staging,sources,bindings,leases:new Set(),releaseMetadata,releaseResidency,alive:true,isDefault:true,work:0,pinned:false}
      this.records.add(record);this.defaultRecord=record;return record
    }catch(error){try{releaseResidency()}catch{}try{releaseMetadata()}catch{}throw error}
  }
  private pinRecord(record:CapacityRecord):void{
    if(record.pinned)return
    const metadata=this.cpu.reserve(record.sources.size*512)
    let release=noMetadataRelease
    try{release=this.cache.leaseRequired([...this.recordResources(record),...[...record.sources].map(([key,bytes])=>({key,bytes}))]);if(!this.recordReady(record))throw new Error('Capacity residency changed');record.releaseResidency=release;record.releaseMetadata=metadata;record.pinned=true}
    catch(error){try{release()}catch{}try{metadata()}catch{}throw error}
  }
  private unpinRecord(record:CapacityRecord):void{
    if(!record.pinned)return
    const residency=record.releaseResidency,metadata=record.releaseMetadata;record.pinned=false;record.releaseResidency=noMetadataRelease;record.releaseMetadata=noMetadataRelease
    let failed=false,first:unknown;for(const cleanup of [residency,metadata])try{cleanup()}catch(e){if(!failed){failed=true;first=e}}if(failed)throw first
  }
  private recordReady(record:CapacityRecord):boolean{return (!(record.limits.spatialColors||record.limits.tipGradient)||!!this.spatialPass)&&record.alive&&this.records.has(record)&&(!record.isDefault||this.defaultRecord===record&&this.workspace===record.workspace&&this.limits===record.limits&&this.slots===record.slots&&this.staging===record.staging)&&!!this.program&&this.cache.get(record.key)===record.workspace.low&&record.slots.length===record.limits.slots&&record.slots.every(slot=>!!slot&&this.cache.get(slot.key)===slot.texture)}
  private recordResources(record:CapacityRecord):readonly {key:string;bytes:number}[]{return[{key:record.key,bytes:FACTOR_BYTES+record.staging.byteLength},...record.slots.map(slot=>({key:slot!.key,bytes:record.limits.width*record.limits.height*4}))]}
  private defaultResources():readonly {key:string;bytes:number}[]{return[this.workspaceKey,...this.slots.map(slot=>slot!.key)].map(key=>({key,bytes:this.cache.resourceBytes(key)!}))}
  private capacityCleanup(action:()=>undefined):undefined{const previous=this.capacityCapture;this.capacityCapture=true;try{return action()}finally{this.capacityCapture=previous}}
  private retireRecord(record:CapacityRecord,lost=false,force=false):void{
    if(!record.alive||!force&&(record.isDefault||record.leases.size||record.work))return
    this.capacityCleanup(()=>{this.retireRecordStorage(record,lost);return undefined})
  }
  private retireRecordStorage(record:CapacityRecord,lost:boolean):void{
    record.alive=false;this.records.delete(record);if(this.defaultRecord===record)this.defaultRecord=undefined
    let failed=false,first:unknown;const attempt=(f:()=>void)=>{try{f()}catch(e){if(!failed){failed=true;first=e}}}
    for(const release of record.leases)attempt(release)
    record.leases.clear()
    for(const slot of record.slots)if(slot)attempt(()=>this.cache.discard(slot.key,lost))
    attempt(()=>this.cache.discard(record.key,lost));const storageCpu=record.releaseStorageCpu,residency=record.releaseResidency,metadata=record.releaseMetadata;record.releaseStorageCpu=undefined;record.releaseResidency=noMetadataRelease;record.releaseMetadata=noMetadataRelease;record.slots.length=0;record.sources.clear();record.bindings.clear();record.staging=new Float32Array(0);attempt(()=>storageCpu?.());attempt(residency);attempt(metadata)
    if(failed)throw first
  }
  /** Existing resource-owner flags only; never acquire a dummy GL turn. */
  assertMutationIdle():void {
    if(this.capacityCapture||this.turnDepth||this.batch||this.activeGroup||this.capacityUpdate||this.sourceUpdate)
      throw new Error('Prepass mutation scope is active')
    assertBrushGlMutationIdle(this.gl)
  }
  enterBrushGlTurn():()=>void{return this.enterRecordTurn(this.defaultCapacityRecord())}
  private enterRecordTurn(record:CapacityRecord):()=>void{
    if(this.capacityCapture||this.turnDepth||this.batch||this.activeGroup||!this.recordReady(record))throw new Error('Prepass turn already active or stale')
    this.turnDepth++;record.work++;let released=false;return()=>{if(released)return;released=true;this.turnDepth--;record.work--;this.retireRecord(record)}
  }
  retainPreparedCapacity():CanonicalMaskCapacityLease{
    if(this.capacityCapture||this.turnDepth||this.batch||this.activeGroup||this.capacityUpdate||this.sourceUpdate)throw new Error('Cannot borrow capacity during a resource transition')
    this.capacityCapture=true
    const priorRecord=this.defaultRecord;let record:CapacityRecord|undefined,releaseCpu=noMetadataRelease,wasPinned=false
    try{
    record=this.defaultCapacityRecord(true);wasPinned=record.pinned;this.pinRecord(record);releaseCpu=this.cpu.reserve(CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
    if(!this.recordReady(record)||this.defaultRecord!==record||this.capacityUpdate||this.sourceUpdate)throw new Error('Capacity lease capture changed')
    const captured=record;let closed=false
    const assert=(receiver:unknown)=>{if(receiver!==lease||closed||!this.recordReady(captured))throw new Error('Closed, foreign or stale capacity lease')}
    const releaseMetadata=()=>{if(closed)return;closed=true;captured.leases.delete(releaseMetadata);releaseCpu()}
    const lease:CanonicalMaskCapacityLease=Object.freeze({
      assertMutationIdle(){assert(this);owner.pass.assertMutationIdle()},
      isReady(){assert(this);return true},
      supportsTipGradient(){assert(this);return !!captured.limits.tipGradient&&!!owner.pass.spatialPass},
      preparedCapacity(){assert(this);return Object.freeze({width:captured.limits.width,height:captured.limits.height,epoch:captured.workspace})},
      preparedResources(){assert(this);return owner.pass.recordResources(captured)},
      brushGlBatchInfo(){assert(this);return owner.pass.recordInfo(captured)},
      enterBrushGlTurn(){assert(this);return owner.pass.enterRecordTurn(captured)},
      enterBrushGlBatch(frame:BrushGlBatchFrame){assert(this);return owner.pass.enterRecordBatch(lease,frame)},
      materializeTipGradient(view:TransformedMaskView,gradient:CanonicalTipGradientResource,frame:BrushGlBatchFrame){assert(this);return owner.pass.materializeRecordTipGradient(captured,lease,view,gradient,frame)},
      materializeSpatial(view:TransformedMaskView,request:CanonicalSpatialColorRequest,frame:BrushGlBatchFrame){assert(this);return owner.pass.materializeRecordSpatial(captured,lease,view,request,frame)},
      resolveGroup(requests:readonly AnyTransformedMaskRequest[],frame?:BrushGlBatchFrame){assert(this);return owner.pass.resolveRecordGroup(captured,lease,requests,frame)},
      hasReadyAutoGeneration(request:AnyTransformedMaskRequest){assert(this);return owner.pass.readyRecordAuto(captured,request)},
      canContinueSingleStripeAuto(request:AnyTransformedMaskRequest){assert(this);return owner.pass.singleStripeAutoReady(captured,lease,request)},
      beginAutoGeneration(request:AnyTransformedMaskRequest){assert(this);return owner.pass.beginRecordAuto(captured,lease,request)},
      advanceAutoGeneration(maxSamples:number,options?:{readonly deferFinalUpload?:true}){assert(this);owner.pass.assertPendingParticipant(lease);return owner.pass.advanceAutoGeneration(maxSamples,options)},
      finalAutoUploadPending(request:AnyTransformedMaskRequest){assert(this);owner.pass.assertPendingParticipant(lease);return owner.pass.finalAutoUploadPending(request)},
      flushFinalAutoGeneration(request:AnyTransformedMaskRequest,turn:BrushGlTurn){if(this!==lease||closed)throw new Error('Closed or foreign capacity lease');return owner.pass.flushParticipantFinalAutoGeneration(lease,request,turn)},
      cancelAutoGeneration(){assert(this);owner.pass.assertPendingParticipant(lease);owner.pass.cancelAutoGeneration()},
      releaseOwner(resourceOwner:object){assert(this);owner.pass.releaseRecordOwner(captured,resourceOwner,lease)},
      release(){if(this!==lease)throw new Error('Foreign capacity lease receiver');if(closed)return;if(owner.pass.turnDepth||owner.pass.batch||owner.pass.activeGroup)throw new Error('Cannot release capacity inside GL scope');let failed=false,first:unknown;try{if(owner.pass.pendingAuto?.participant===lease)owner.pass.cancelAutoGeneration()}catch(e){failed=true;first=e}try{releaseMetadata()}catch(e){if(!failed){failed=true;first=e}}try{owner.pass.retireRecord(captured)}catch(e){if(!failed){failed=true;first=e}}if(failed)throw first},
    })
    const owner={pass:this};assert(lease);if(this.defaultRecord!==captured)throw new Error('Capacity lease capture changed');captured.leases.add(releaseMetadata);return lease
    }catch(error){try{releaseCpu()}catch{}if(record&&!wasPinned&&record.alive&&record.isDefault&&this.defaultRecord===record)try{this.unpinRecord(record)}catch{}if(!priorRecord&&record&&this.defaultRecord===record&&!record.leases.size&&!record.work){record.alive=false;this.records.delete(record);this.defaultRecord=undefined}throw error}
    finally{this.capacityCapture=false}
  }
  private assertPendingParticipant(participant:BrushGlBatchParticipant):void{if(this.pendingAuto&&this.pendingAuto.participant!==participant)throw new Error('Foreign capacity pending auto owner')}
  private checkedSources(sourceResources:readonly TransformedMaskPreparedSource[]){
    if(!Array.isArray(sourceResources)||sourceResources.length>4096)throw new RangeError('Invalid prepared source count')
    const sourceMap = new Map<string, number>();
    const bindings = new Map<string, CanonicalMaskSourceBinding>();
    for (const source of sourceResources) {
      if (!source.key || source.key.startsWith(this.prefix + ':') || !safe(source.bytes, 1, Number.MAX_SAFE_INTEGER))
        throw new RangeError('Invalid prepared source budget');
      if (sourceMap.has(source.key) && sourceMap.get(source.key) !== source.bytes)
        throw new RangeError('Conflicting source budget');
      if (this.cache.resourceBytes(source.key) !== source.bytes || !this.cache.get(source.key))
        throw new RangeError('Source bank must be prepared before the prepass');
      sourceMap.set(source.key, source.bytes);
      if (source.canonical) {
        const binding = checkedBinding(source.canonical, source.bytes), previous = bindings.get(source.key);
        if (previous && JSON.stringify(previous) !== JSON.stringify(binding)) throw new RangeError('Conflicting canonical prepared binding');
        bindings.set(source.key, binding);
      }
    }
    return {sourceMap,bindings}
  }
  /** Candidate maps only. Nondefault records retain their original sources. */
  prepareSourceUpdate(sourceResources:readonly TransformedMaskPreparedSource[],options?:{readonly additive:true}):CanonicalPreparedResourceUpdate {
    if(options!==undefined&&(!options||options.additive!==true||Reflect.ownKeys(options).some(key=>key!=='additive')))throw new TypeError('Invalid additive source update')
    const additive=options?.additive===true
    let blocked=false
    for(const record of this.records)if(!additive&&(!record.isDefault||record.leases.size))blocked=true
    if(this.capacityCapture||this.turnDepth||blocked||this.capacityUpdate||this.sourceUpdate||!this.workspace||!this.limits||this.batch||this.activeGroup||this.pendingAuto&&(!additive||this.pendingAuto.flushing))throw new Error('Prepass source update unavailable')
    if(!Array.isArray(sourceResources)||sourceResources.length>4096)throw new RangeError('Invalid prepared source count')
    this.capacityCapture=true;try{return this.stageSourceUpdate(sourceResources,additive)}finally{this.capacityCapture=false}
  }
  private stageSourceUpdate(sourceResources:readonly TransformedMaskPreparedSource[],additive:boolean):CanonicalPreparedResourceUpdate {
    if(!this.workspace||!this.limits)throw new Error('Prepass source update unavailable')
    const priorRecord=this.defaultCapacityRecord(true),wasPinned=priorRecord.pinned,priorPin=priorRecord.releaseResidency,priorMetadata=priorRecord.releaseMetadata
    let physicalCount=this.slots.length+1,retainedSources=0;for(const record of this.records){physicalCount+=record.slots.length+1;retainedSources+=record.sources.size}
    const owner={pass:this},epoch=this.workspace,limits=this.limits
    let oldSources:Map<string,number>|undefined=this.sources,oldBindings:Map<string,CanonicalMaskSourceBinding>|undefined=this.sourceBindings
    let releaseNew=noMetadataRelease,releaseOld:undefined|(()=>void),releaseRecordNew=noMetadataRelease,releaseRecordOld=noMetadataRelease,releaseRecordMetadataNew=noMetadataRelease,releaseRecordMetadataOld=noMetadataRelease
    let state:'pending'|'published'|'cancelled'='pending',createdUpdate:CanonicalPreparedResourceUpdate|undefined
    // Own all actual stage arrays/union before constructing checked maps. The
    // record map owner is separate from the replaceable default source-map owner.
    const rawPeakRelease=this.cpu.reserve(2048+(physicalCount+retainedSources+sourceResources.length)*192);let peakReleased=false;const releasePeak=()=>{if(peakReleased)return;peakReleased=true;rawPeakRelease()}
    try{
      releaseNew=this.cpu.reserve(sourceResources.length*512)
      if(priorRecord?.pinned)releaseRecordMetadataNew=this.cpu.reserve(sourceResources.length*512)
      let plan:ReturnType<TransformedMaskPrepass['checkedSources']>|undefined=this.checkedSources(sourceResources)
      if(additive&&([...oldSources].some(([key,bytes])=>plan!.sourceMap.get(key)!==bytes)||[...oldBindings].some(([key,binding])=>JSON.stringify(plan!.bindings.get(key))!==JSON.stringify(binding))))throw new Error('Prepass additive source update must preserve every old binding')
      const union=new Map<string,number>()
      const add=(key:string,bytes:number)=>{if(union.has(key)&&union.get(key)!==bytes)throw new RangeError('Conflicting retained source union');if(this.cache.resourceBytes(key)!==bytes||!this.cache.get(key))throw new Error('Retained source resource changed');union.set(key,bytes)}
      for(const item of this.preparedResources())add(item.key,item.bytes)
      for(const [key,bytes]of plan.sourceMap)add(key,bytes)
      for(const record of this.records)if(!record.isDefault){
        for(const [key,bytes]of record.sources){if(plan.sourceMap.get(key)!==bytes)throw new Error('Additive source update must retain old capacity sources');add(key,bytes)}
        for(const [key,binding]of record.bindings)if(JSON.stringify(plan.bindings.get(key))!==JSON.stringify(binding))throw new Error('Retained source binding changed')
      }
      if([...union.values()].reduce((sum,bytes)=>sum+bytes,0)>this.cache.budgetBytes)throw new RangeError('Prepass retained working set exceeds existing brush budgets')
      if(priorRecord?.pinned)releaseRecordNew=this.cache.leaseRequired([...this.recordResources(priorRecord),...[...plan.sourceMap].map(([key,bytes])=>({key,bytes}))])
      const maximum=this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number,precision=this.gl.getShaderPrecisionFormat(this.gl.FRAGMENT_SHADER,this.gl.HIGH_FLOAT)
      if(!precision||precision.precision<23||Math.max(256,limits.width,limits.height)>maximum)throw new RangeError('Unverified prepass GPU capability')
      const scalar=(duringConstruction=false)=>state==='pending'&&owner.pass.sourceUpdate===update&&owner.pass.defaultRecord===priorRecord&&priorRecord.pinned===wasPinned&&priorRecord.releaseResidency===priorPin&&priorRecord.releaseMetadata===priorMetadata&&owner.pass.workspace===epoch&&owner.pass.limits===limits&&owner.pass.sources===oldSources&&owner.pass.sourceBindings===oldBindings&&(duringConstruction||!owner.pass.capacityCapture)&&!owner.pass.turnDepth&&!owner.pass.batch&&!owner.pass.activeGroup&&(!owner.pass.pendingAuto||additive&&!owner.pass.pendingAuto.flushing)
      const assert=(receiver:unknown,duringConstruction=false)=>{if(receiver!==update||!scalar(duringConstruction))throw new Error('Prepass source update changed')}
      const ready=(receiver:unknown,duringConstruction=false)=>{assert(receiver,duringConstruction);if(!owner.pass.isReady()||[...plan!.sourceMap].some(([key,bytes])=>owner.pass.cache.resourceBytes(key)!==bytes||!owner.pass.cache.get(key)))throw new Error('Prepass staged resources changed');assert(receiver,duringConstruction)}
      const all=(tasks:(()=>void)[])=>{let failed=false,first:unknown;for(const task of tasks)try{task()}catch(error){if(!failed){failed=true;first=error}}if(failed)throw first}
      const update:CanonicalPreparedResourceUpdate=Object.freeze({
        get status(){return state},
        assertCurrent(){ready(this)},
        publish(){assert(this);const record=priorRecord;if(record){if(record.pinned){releaseRecordOld=record.releaseResidency;releaseRecordMetadataOld=record.releaseMetadata;record.releaseResidency=releaseRecordNew;record.releaseMetadata=releaseRecordMetadataNew;releaseRecordNew=noMetadataRelease;releaseRecordMetadataNew=noMetadataRelease}record.sources=plan!.sourceMap;record.bindings=plan!.bindings}releaseOld=owner.pass.releaseSourceMetadata;owner.pass.sources=plan!.sourceMap;owner.pass.sourceBindings=plan!.bindings;plan=undefined;owner.pass.releaseSourceMetadata=releaseNew;releaseNew=noMetadataRelease;oldSources=undefined;oldBindings=undefined;state='published';return undefined},
        finalizeCleanup(){if(this!==update)throw new Error('Prepass source update receiver changed');if(state==='pending')throw new Error('Prepass source update is not published');return owner.pass.capacityCleanup(()=>{if(owner.pass.sourceUpdate===update)owner.pass.sourceUpdate=undefined;const release=releaseOld,pin=releaseRecordOld,metadata=releaseRecordMetadataOld;releaseOld=undefined;releaseRecordOld=noMetadataRelease;releaseRecordMetadataOld=noMetadataRelease;all([()=>release?.(),pin,metadata,releasePeak]);return undefined})},
        cancel(){if(this!==update)throw new Error('Prepass source update receiver changed');if(state!=='pending')return undefined;return owner.pass.capacityCleanup(()=>{state='cancelled';plan=undefined;if(owner.pass.sourceUpdate===update)owner.pass.sourceUpdate=undefined;oldSources=undefined;oldBindings=undefined;const release=releaseNew,pin=releaseRecordNew,metadata=releaseRecordMetadataNew;releaseNew=noMetadataRelease;releaseRecordNew=noMetadataRelease;releaseRecordMetadataNew=noMetadataRelease;all([release,pin,metadata,releasePeak]);return undefined})},
      })
      createdUpdate=update
      if(this.sourceUpdate||this.defaultRecord!==priorRecord||this.workspace!==epoch||this.limits!==limits||this.sources!==oldSources||this.sourceBindings!==oldBindings||this.turnDepth||this.batch||this.activeGroup||this.pendingAuto&&(!additive||this.pendingAuto.flushing))throw new Error('Prepass source update changed')
      this.sourceUpdate=update;ready(update,true);return update
    }catch(error){if(createdUpdate?.status==='pending')try{createdUpdate.cancel()}catch{/* Preserve source error. */}for(const release of [releaseNew,releaseRecordNew,releaseRecordMetadataNew,releasePeak])try{release()}catch{/* Preserve source error. */}throw error}
  }

  /** Quiescent growth only: old epoch remains live until pure publication.
   * Caller includes every external companion in the coexistence budget and
   * adopts a final union lease BEFORE finalizeCleanup releases this staging pin.
   */
  prepareCapacityUpdate(limits:TransformedMaskLimits,sourceResources:readonly TransformedMaskPreparedSource[],companions:readonly {key:string;bytes:number}[]=[],companionCpuBytes=0):CanonicalPreparedCapacityUpdate {
    if(this.capacityCapture||this.turnDepth||this.batch||this.activeGroup)throw new Error('Cannot replace capacity inside GL scope')
    if([...this.records].some(r=>r.leases.size||r.work||!r.isDefault))throw new Error('Borrowed capacity cannot be replaced')
    this.capacityCapture=true;try{return this.prepareCapacityTransition(limits,sourceResources,companions,companionCpuBytes,false)}finally{this.capacityCapture=false}
  }
  prepareCapacityAddition(limits:TransformedMaskLimits,sourceResources:readonly TransformedMaskPreparedSource[],companions:readonly {key:string;bytes:number}[]=[],companionCpuBytes=0):CanonicalPreparedCapacityUpdate {
    if(this.capacityCapture||this.turnDepth||this.batch||this.activeGroup||this.capacityUpdate||this.sourceUpdate)throw new Error('Cannot add capacity inside GL scope or transition')
    if(this.pendingAuto?.participant===this)throw new Error('Capacity addition requires a retained cursor participant')
    const prior=this.defaultRecord;let record:CapacityRecord|undefined,wasPinned=false
    this.capacityCapture=true
    try{record=this.defaultCapacityRecord(true);wasPinned=record.pinned;const captured=record,rollbackPin=()=>{if(!wasPinned&&captured.alive&&captured.isDefault&&this.defaultRecord===captured&&!captured.leases.size)this.unpinRecord(captured)};this.pinRecord(captured);return this.prepareCapacityTransition(limits,sourceResources,companions,companionCpuBytes,true,rollbackPin)}catch(error){if(record&&!wasPinned&&record.alive&&record.isDefault&&this.defaultRecord===record&&!record.leases.size)try{this.unpinRecord(record)}catch{}if(!prior&&record&&this.defaultRecord===record&&!record.leases.size&&!record.work){record.alive=false;this.records.delete(record);this.defaultRecord=undefined}throw error}finally{this.capacityCapture=false}
  }

  private prepareCapacityTransition(limits:TransformedMaskLimits,sourceResources:readonly TransformedMaskPreparedSource[],companions:readonly {key:string;bytes:number}[],companionCpuBytes:number,addition:boolean,rollbackPin:()=>void=noMetadataRelease):CanonicalPreparedCapacityUpdate {
    transformedMaskPrepassBudget(limits)
    if(!Array.isArray(sourceResources)||sourceResources.length>4096||!Array.isArray(companions)||companions.length>8192)throw new RangeError('Invalid capacity metadata count')
    let oldCount=this.slots.length+1;for(const record of this.records)oldCount+=record.slots.length+1
    // Own the concrete stage inventory/union before checkedSources, arrays or maps.
    const rawRelease=this.cpu.reserve(2048+sourceResources.length*512+(oldCount+limits.slots+1+companions.length+sourceResources.length)*192)
    let released=false;const releasePeak=()=>{if(released)return;released=true;rawRelease()}
    try{return this.stageCapacityTransition(limits,sourceResources,companions,companionCpuBytes,addition,releasePeak,rollbackPin)}catch(error){try{releasePeak()}catch{/* Preserve stage error. */}throw error}
  }
  private stageCapacityTransition(limits:TransformedMaskLimits,sourceResources:readonly TransformedMaskPreparedSource[],companions:readonly {key:string;bytes:number}[],companionCpuBytes:number,addition:boolean,releasePeak:()=>void,rollbackPin:()=>void):CanonicalPreparedCapacityUpdate {

    if(this.turnDepth||this.capacityUpdate||this.sourceUpdate||!this.workspace||!this.limits||!this.program||this.batch||this.activeGroup||this.pendingAuto&&(!addition||this.pendingAuto.flushing))throw new Error('Prepass capacity update unavailable')
    if(this.limits.tipGradient&&!limits.tipGradient)throw new Error('Gradient tip program inventory cannot shrink')
    if(this.limits.spatialColors&&!limits.spatialColors)throw new Error('Spatial program inventory cannot shrink')
    const nextLimits=Object.freeze({...limits}),budget=transformedMaskPrepassBudget(nextLimits)
    if(nextLimits.width<this.limits.width||nextLimits.height<this.limits.height||nextLimits.slots<this.limits.slots)throw new RangeError('Prepass capacity update cannot shrink')
    if(!Array.isArray(companions)||companions.length>8192||!safe(companionCpuBytes,0,Number.MAX_SAFE_INTEGER))throw new RangeError('Invalid prepass companions')
    const plan=this.checkedSources(sourceResources)
    if([...this.sources].some(([k,v])=>plan.sourceMap.get(k)!==v)||[...this.sourceBindings].some(([k,v])=>JSON.stringify(plan.bindings.get(k))!==JSON.stringify(v)))throw new Error('Capacity update must preserve existing sources')
    const oldRecord=this.defaultRecord;
    const oldWorkspace=this.workspace,oldLimits=this.limits,oldSlots=this.slots,oldStaging=this.staging,oldSources=this.sources,oldBindings=this.sourceBindings,oldKey=this.workspaceKey,oldProgram=this.program,oldSpatialProgram=this.spatialPass
    const nextKey=`${this.prefix}:capacity:${++this.capacitySerial}:workspace`,slotKeys=Array.from({length:nextLimits.slots},(_,i)=>`${nextKey}:slot:${i}`)
    const resources=Object.freeze([{key:nextKey,bytes:FACTOR_BYTES+budget.vertexBytes},...slotKeys.map(key=>({key,bytes:nextLimits.width*nextLimits.height*4}))].map(x=>Object.freeze(x)))
    const union=new Map<string,number>()
    const add=(key:string,bytes:number)=>{if(!key||!safe(bytes,1,Number.MAX_SAFE_INTEGER)||union.has(key)&&union.get(key)!==bytes)throw new RangeError('Conflicting prepass union resource');union.set(key,bytes)}
    for(const x of companions){if(this.cache.resourceBytes(x.key)!==x.bytes||!this.cache.get(x.key))throw new Error('Prepass companion not ready')}
    for(const x of [...this.preparedResources(),...companions,...resources])add(x.key,x.bytes)
    for(const [key,bytes]of plan.sourceMap)add(key,bytes)
    const metadata=sourceResources.length*512+resources.length*192+1024,newCpu=budget.cpuBytes+metadata
    const gpuBytes=[...union.values()].reduce((a,b)=>a+b,0)
    if(!Number.isSafeInteger(gpuBytes)||gpuBytes>this.cache.budgetBytes||!Number.isSafeInteger(newCpu+this.cpu.reservedBytes+companionCpuBytes)||newCpu+this.cpu.reservedBytes+companionCpuBytes>this.cpu.budgetBytes)throw new RangeError('Prepass coexistence exceeds existing brush budgets')
    const precision=this.gl.getShaderPrecisionFormat(this.gl.FRAGMENT_SHADER,this.gl.HIGH_FLOAT),maximum=this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number
    if(!precision||precision.precision<23||Math.max(256,nextLimits.width,nextLimits.height)>maximum)throw new RangeError('Unverified prepass GPU capability')
    let state:'pending'|'published'|'cancelled'='pending',checked=false,cleaned=false,retiredLost=false,workspace:Workspace|undefined,staging:Float32Array|undefined,slots:(Slot|undefined)[]=[],releaseNew= noMetadataRelease,releaseUnion=noMetadataRelease,releaseOld:undefined|(()=>void),releaseOldMetadata:undefined|(()=>void)
    let stagedSpatial:SourceSpatialColorPass|undefined
    const scalar=()=>this.spatialPass===oldSpatialProgram&&this.capacityUpdate===update&&this.workspace===oldWorkspace&&this.workspaceKey===oldKey&&this.limits===oldLimits&&this.slots===oldSlots&&this.staging===oldStaging&&this.sources===oldSources&&this.sourceBindings===oldBindings&&this.program===oldProgram&&!this.turnDepth&&!this.sourceUpdate&&!this.batch&&!this.activeGroup&&(!this.pendingAuto||addition&&!this.pendingAuto.flushing)
    const assert=(receiver:unknown)=>{if(receiver!==update||state!=='pending'||!scalar())throw new Error('Prepass capacity update changed')}
    const all=(tasks:(()=>void)[])=>{let failed=false,error:unknown;for(const task of tasks)try{task()}catch(e){if(!failed){failed=true;error=e}}if(failed)throw error}
    const discard=(keys:readonly string[],lost:boolean)=>all(keys.map(key=>()=>this.cache.discard(key,lost)))
    const update:CanonicalPreparedCapacityUpdate=Object.freeze({
      get status(){return state},
      assertCurrent(){assert(this)},
      preparedResources(){assert(this);if(!workspace||slots.length!==nextLimits.slots||slots.some(x=>!x))throw new Error('Capacity resources incomplete');return resources},
      assertPreparedPublication(){assert(this);checked=false;if(!workspace||!staging||(nextLimits.spatialColors||nextLimits.tipGradient)&&!oldSpatialProgram&&!stagedSpatial||!owner.pass.isReady()||resources.some(x=>owner.pass.cache.resourceBytes(x.key)!==x.bytes||!owner.pass.cache.get(x.key))||[...plan.sourceMap].some(([key,bytes])=>owner.pass.cache.resourceBytes(key)!==bytes||!owner.pass.cache.get(key)))throw new Error('Prepass staged resources changed');assert(this);checked=true},
      publish(){assert(this);if(!checked||!workspace||!staging||(nextLimits.spatialColors||nextLimits.tipGradient)&&!oldSpatialProgram&&!stagedSpatial)throw new Error('Capacity publication not checked');releaseOld=owner.pass.releaseCpu;releaseOldMetadata=owner.pass.releaseSourceMetadata;if(oldRecord){oldRecord.isDefault=false;oldRecord.releaseStorageCpu=releaseOld;releaseOld=undefined}owner.pass.defaultRecord=undefined;owner.pass.workspace=workspace;owner.pass.workspaceKey=nextKey;owner.pass.slots=slots;owner.pass.staging=staging;owner.pass.limits=nextLimits;if(stagedSpatial){owner.pass.spatialPass=stagedSpatial;stagedSpatial=undefined}owner.pass.sources=plan.sourceMap;owner.pass.sourceBindings=plan.bindings;owner.pass.releaseSourceMetadata=undefined;owner.pass.releaseCpu=releaseNew;owner.pass.reservedCpuBytes=newCpu;releaseNew=noMetadataRelease;state='published';return undefined},
      cancel(){if(this!==update)throw new Error('Capacity update receiver changed');if(state!=='pending')return undefined;return owner.pass.capacityCleanup(()=>{state='cancelled';if(owner.pass.capacityUpdate===update)owner.pass.capacityUpdate=undefined;const cpu=releaseNew,pin=releaseUnion;releaseNew=noMetadataRelease;releaseUnion=noMetadataRelease;all([()=>{retiredLost=owner.pass.capacityResetLost||owner.pass.gl.isContextLost()},()=>discard(resources.map(x=>x.key),retiredLost),()=>{const program=stagedSpatial;stagedSpatial=undefined;program?.destroy(retiredLost)},cpu,pin,releasePeak,rollbackPin]);return undefined})},
      finalizeCleanup(){if(this!==update)throw new Error('Capacity update receiver changed');if(state==='pending')throw new Error('Capacity update not published');return owner.pass.capacityCleanup(()=>{if(owner.pass.capacityUpdate===update)owner.pass.capacityUpdate=undefined;if(cleaned)return undefined;cleaned=true;const cpu=releaseOld,metadataRelease=releaseOldMetadata,pin=releaseUnion;releaseOld=undefined;releaseOldMetadata=undefined;releaseUnion=noMetadataRelease;if(state==='published')all([()=>{if(oldRecord)owner.pass.retireRecord(oldRecord,owner.pass.capacityResetLost);else discard([oldKey,...oldSlots.filter((x):x is Slot=>!!x).map(x=>x.key)],owner.pass.capacityResetLost||owner.pass.gl.isContextLost())},()=>cpu?.(),()=>metadataRelease?.(),pin,releasePeak]);return undefined})},
    })
    const owner=Object.freeze({pass:this})
    this.capacityUpdate=update
    const loose:(OwnedBrushResource|OwnedBrushBuffer)[]=[],standalone:(()=>void)[]=[]
    let preparationFailed=false,preparationFailure:unknown
    let textureStorage:StorageReservation|undefined,bufferStorage:StorageReservation|undefined,restore=noMetadataRelease
    try{
      releaseNew=this.cpu.reserve(newCpu);update.assertCurrent()
      releaseUnion=this.cache.leaseRequired([...union].map(([key,bytes])=>({key,bytes})));update.assertCurrent()
      textureStorage=reserveContextStorage(this.gl,budget.gpuBytes-budget.vertexBytes,'brush-texture-rgba-equivalent')
      bufferStorage=reserveContextStorage(this.gl,budget.vertexBytes,'brush-buffer')
      restore=this.saveState([]);this.cache.protect([...union.keys()]);update.assertCurrent();this.gl.activeTexture(this.gl.TEXTURE0)
      if((nextLimits.spatialColors||nextLimits.tipGradient)&&!oldSpatialProgram){stagedSpatial=new SourceSpatialColorPass(this.gl);update.assertCurrent()}
      staging=new Float32Array(nextLimits.height*FLOATS_PER_ROW)
      const lut=buildRgba64FactorLut(),low=this.texture(256,256,lut.low,textureStorage);loose.push(low);update.assertCurrent()
      const high=this.texture(256,256,lut.high,textureStorage);loose.push(high);update.assertCurrent()
      const buffer=allocateOwnedBrushBuffer(this.gl,budget.vertexBytes,(handle,mark)=>{this.gl.bindBuffer(this.gl.ARRAY_BUFFER,handle);mark(budget.vertexBytes);this.gl.bufferData(this.gl.ARRAY_BUFFER,budget.vertexBytes,this.gl.STREAM_DRAW)},bufferStorage);loose.push(buffer);update.assertCurrent()
      const extension=this.vertexArrays,vao=extension?.createVertexArrayOES()??undefined
      if(extension&&!vao)throw new Error('Prepass VAO allocation failed')
      let vaoMerged=false
      standalone.push(()=>{if(!vaoMerged&&vao&&!retiredLost&&!this.gl.isContextLost())extension!.deleteVertexArrayOES(vao)})
      update.assertCurrent()
      workspace={low:low.texture,high:high.texture,buffer:buffer.buffer,vao}
      const candidateWorkspace=workspace
      const owned=combineOwnedBrushResources(low,[high,buffer],lost=>{if(!lost&&candidateWorkspace.vao)extension!.deleteVertexArrayOES(candidateWorkspace.vao)});vaoMerged=true;loose.push(owned);update.assertCurrent();this.cache.putOwned(nextKey,owned);update.assertCurrent()
      for(let i=0;i<nextLimits.slots;i++){
        const texture=this.texture(nextLimits.width,nextLimits.height,null,textureStorage);loose.push(texture);update.assertCurrent()
        const framebuffer=this.gl.createFramebuffer();if(!framebuffer)throw new Error('Prepass FBO allocation failed')
        let framebufferMerged=false
        standalone.push(()=>{if(!framebufferMerged&&!retiredLost&&!this.gl.isContextLost())this.gl.deleteFramebuffer(framebuffer)})
        update.assertCurrent()
        const slot:Slot={key:slotKeys[i],texture:texture.texture,framebuffer,used:0}
        const ownedSlot=combineOwnedBrushResources(texture,[],lost=>{if(!lost)this.gl.deleteFramebuffer(framebuffer)});framebufferMerged=true;loose.push(ownedSlot)
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,framebuffer);this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER,this.gl.COLOR_ATTACHMENT0,this.gl.TEXTURE_2D,texture.texture,0)
        if(this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER)!==this.gl.FRAMEBUFFER_COMPLETE)throw new Error('Prepass FBO incomplete')
        update.assertCurrent();slots.push(slot);this.cache.putOwned(slot.key,ownedSlot);update.assertCurrent()
      }
      update.assertPreparedPublication();checked=false
    }catch(error){preparationFailed=true;preparationFailure=error;try{update.cancel()}catch{/* Preserve preparation error. */}}
    finally{
      let failed=false,error:unknown;const attempt=(f:()=>void)=>{try{f()}catch(e){if(!failed){failed=true;error=e}}}
      attempt(restore);for(const item of loose)attempt(()=>releaseUnpublishedBrushResource(item,retiredLost));for(const cleanup of standalone)attempt(cleanup);if(textureStorage)attempt(()=>releaseStorageReservation(textureStorage!));if(bufferStorage)attempt(()=>releaseStorageReservation(bufferStorage!))
      if(failed){try{update.cancel()}catch{/* Preserve restoration error. */}if(!preparationFailed){preparationFailed=true;preparationFailure=error}}
    }
    if(preparationFailed)throw preparationFailure
    try{update.assertCurrent()}catch(error){try{update.cancel()}catch{/* Preserve stale error. */}throw error}
    return update
  }

  /** All metadata/budgets are checked before allocation or cache eviction.
  * Source entries must already be prepared straight RGBA8 gray+alpha levels.
  * Caller accounts expansion scratch during source preparation separately.
  */
  prepare(limits: TransformedMaskLimits, sourceResources: readonly TransformedMaskPreparedSource[], signal?: AbortSignal): 'ready' | 'cancelled' {
    if (this.capacityCapture||this.turnDepth||this.batch) throw new Error('Cannot prepare inside an active brush GL turn/batch');
    if (signal?.aborted)
      return 'cancelled';
    const budget = transformedMaskPrepassBudget(limits);
    if(this.limits){
      if(this.limits.width!==limits.width||this.limits.height!==limits.height||this.limits.slots!==limits.slots||!!this.limits.spatialColors!==!!limits.spatialColors||!!this.limits.tipGradient!==!!limits.tipGradient)throw new Error('Reset prepass before changing prepared capacity')
      if(!this.isReady())throw new Error('Reset and prepare evicted prepass resources before input')
      const update=this.prepareSourceUpdate(sourceResources);update.publish();update.finalizeCleanup();return 'ready'
    }
    const {sourceMap,bindings}=this.checkedSources(sourceResources)
    const {vertexBytes,cpuBytes}=budget;
    const gpuBytes = budget.gpuBytes + [...sourceMap.values()].reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(gpuBytes) || gpuBytes > this.cache.budgetBytes || cpuBytes + this.cpu.reservedBytes - this.reservedCpuBytes > this.cpu.budgetBytes)
      throw new RangeError('Prepass working set exceeds existing brush budgets');
    const precision = this.gl.getShaderPrecisionFormat(this.gl.FRAGMENT_SHADER, this.gl.HIGH_FLOAT);
    const maximum = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    if (!precision || precision.precision < 23 || Math.max(256, limits.width, limits.height) > maximum)
      throw new RangeError('Unverified prepass GPU capability');
    this.instancing = this.gl.getExtension('ANGLE_instanced_arrays');
    this.vertexArrays = this.gl.getExtension('OES_vertex_array_object');
    const textureStorage=reserveContextStorage(this.gl,budget.gpuBytes-vertexBytes,'brush-texture-rgba-equivalent');
    let bufferStorage:StorageReservation;
    try{bufferStorage=reserveContextStorage(this.gl,vertexBytes,'brush-buffer')}catch(error){releaseStorageReservation(textureStorage);throw error}
    let release=()=>{},restore=()=>{},retainedCpu=false,failed=false,failure:unknown,cancelled=false;
    const loose:(OwnedBrushResource|OwnedBrushBuffer)[]=[];
    const attempt=(cleanup:()=>void)=>{try{cleanup()}catch(error){if(!failed){failed=true;failure=error}}};
    try {
      release=this.cpu.reserve(cpuBytes);
      restore=this.saveState([]);
      const group=[...sourceMap.keys(),this.workspaceKey,...Array.from({length:limits.slots},(_,i)=>`${this.prefix}:slot:${i}`)];
      this.cache.protect(group);this.gl.activeTexture(this.gl.TEXTURE0);
      this.staging=new Float32Array(limits.height*FLOATS_PER_ROW);this.compile();if(limits.spatialColors||limits.tipGradient)this.spatialPass=new SourceSpatialColorPass(this.gl);
      const lut=buildRgba64FactorLut(),low=this.texture(256,256,lut.low,textureStorage);loose.push(low);
      const high=this.texture(256,256,lut.high,textureStorage);loose.push(high);
      const buffer=allocateOwnedBrushBuffer(this.gl,vertexBytes,(handle,mark)=>{this.gl.bindBuffer(this.gl.ARRAY_BUFFER,handle);mark(vertexBytes);this.gl.bufferData(this.gl.ARRAY_BUFFER,vertexBytes,this.gl.STREAM_DRAW)},bufferStorage);loose.push(buffer);
      const vaoExtension=this.vertexArrays,vao=vaoExtension?.createVertexArrayOES()??undefined;
      if(vaoExtension&&!vao)throw new Error('Prepass VAO allocation failed');
      const workspace:Workspace={low:low.texture,high:high.texture,buffer:buffer.buffer,vao};
      const owned=combineOwnedBrushResources(low,[high,buffer],lost=>{try{if(!lost&&workspace.vao)vaoExtension!.deleteVertexArrayOES(workspace.vao)}finally{if(this.workspace===workspace)this.workspace=undefined}});loose.push(owned);
      this.workspace=workspace;this.cache.putOwned(this.workspaceKey,owned);
      for(let i=0;i<limits.slots;i++){
        const texture=this.texture(limits.width,limits.height,null,textureStorage);loose.push(texture);
        const framebuffer=this.gl.createFramebuffer();if(!framebuffer)throw new Error('Prepass FBO allocation failed');
        const slot:Slot={key:`${this.prefix}:slot:${i}`,texture:texture.texture,framebuffer,used:0};
        const ownedSlot=combineOwnedBrushResources(texture,[],lost=>{try{if(!lost)this.gl.deleteFramebuffer(framebuffer)}finally{if(this.slots[i]===slot)this.slots[i]=undefined}});loose.push(ownedSlot);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,framebuffer);this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER,this.gl.COLOR_ATTACHMENT0,this.gl.TEXTURE_2D,texture.texture,0);
        if(this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER)!==this.gl.FRAMEBUFFER_COMPLETE)throw new Error('Prepass FBO incomplete');
        this.slots[i]=slot;this.cache.putOwned(slot.key,ownedSlot);
      }
      cancelled=!!signal?.aborted;
      if(!cancelled){this.limits={...limits};this.sources=sourceMap;this.sourceBindings=bindings;this.releaseCpu=release;this.reservedCpuBytes=cpuBytes;retainedCpu=true}
    }catch(error){failed=true;failure=error}
    finally{
      attempt(restore);
      if(failed||cancelled)attempt(()=>this.reset(false));
      for(const resource of loose)attempt(()=>releaseUnpublishedBrushResource(resource));
      if(!retainedCpu)attempt(release);
      attempt(()=>releaseStorageReservation(textureStorage));attempt(()=>releaseStorageReservation(bufferStorage));
    }
    if(failed)throw failure;
    return cancelled?'cancelled':'ready';
  }

  isReady(): boolean {
    return !!this.limits && !!this.workspace && this.cache.get(this.workspaceKey) === this.workspace.low && this.slots.length === this.limits.slots && this.slots.every(slot => !!slot && this.cache.get(slot.key) === slot.texture);
  }
  /** Actual prepared storage, independent of the next brush's tiny footprint.
   * Opaque epoch binds queued work to this preparation without GL queries. */
  preparedCapacity(): Readonly<{ width: number; height: number; epoch: object }> {
    if (!this.isReady() || !this.limits || !this.workspace) throw new Error('Prepass is not prepared');
    return Object.freeze({ width:this.limits.width, height:this.limits.height, epoch:this.workspace });
  }
  /** Cold/preflight metadata only. Source-bank resources are reported separately. */
  preparedResources(): readonly { key: string; bytes: number }[] {
    if (!this.isReady()) throw new Error('Prepass is not prepared');
    return [...new Map([...this.defaultResources(),...[...this.records].flatMap(r=>this.recordResources(r))].map(x=>[x.key,x])).values()];
  }
  /** Holds all source/LUT/target entries through the caller's synchronous draw.
  * Caller MUST release in finally. No GL state is touched on a cache hit.
  */
  brushGlBatchInfo(): BrushGlBatchInfo {return this.recordInfo(this.defaultCapacityRecord())}
  private recordInfo(record:CapacityRecord):BrushGlBatchInfo{
    if(!this.recordReady(record))throw new Error('Prepass capacity is not prepared')
    return {gl:this.gl,cache:this.cache,cpu:this.cpu,contextOwner:this.contextOwner,epoch:record.workspace,attributes:[...this.attributes,...this.spatialPass?[this.spatialPass.attribute]:[]],instancing:this.instancing,vertexArrays:this.vertexArrays,
      resources:[...this.recordResources(record),...[...record.sources].map(([key,bytes])=>({key,bytes}))],
      ownedPointSamplers:record.slots.filter((slot):slot is Slot=>!!slot).map(slot=>({key:slot.key,texture:slot.texture,bytes:record.limits.width*record.limits.height*4,epoch:record.workspace}))}
  }
  enterBrushGlBatch(frame: BrushGlBatchFrame): () => void {return this.enterRecordBatch(this,frame)}
  private enterRecordBatch(participant:BrushGlBatchParticipant,frame:BrushGlBatchFrame):()=>void{
    if(this.capacityCapture)throw new Error('Capacity transition is active');
    frame.acceptParticipant(participant);
    if (this.batch || this.activeGroup) throw new Error('Prepass already has an active batch/group');
    this.batch = frame;
    return () => { if (this.batch === frame) this.batch = undefined; };
  }
  resolveGroup(requests: readonly AnyTransformedMaskRequest[], frame?: BrushGlBatchFrame): {
    views: TransformedMaskView[];
    release: () => void;
  } {
    return this.resolveRecordGroup(this.defaultCapacityRecord(),this,requests,frame)
  }
  private resolveRecordGroup(record:CapacityRecord,participant:BrushGlBatchParticipant,requests:readonly AnyTransformedMaskRequest[],frame?:BrushGlBatchFrame):{views:TransformedMaskView[];release:()=>void}{
    if(this.capacityCapture)throw new Error('Capacity transition is active');
    if (this.batch !== frame) throw new Error('Prepass batch identity mismatch');
    if (this.activeGroup)
      throw new Error('Release the previous prepass group before resolving another');
    if (this.pendingAuto) throw new Error('Auto generation is incomplete');
    const batchGroup = frame?.beginGroup();
    if (!this.recordReady(record) || !record.limits || !record.workspace || !this.program || !record.staging)
      throw new Error('Prepass is not prepared');
    if (requests.length > record.limits.slots)
      throw new RangeError('Prepass simultaneous-role capacity exceeded');
    const seen = new Map<object, Set<string>>();
    const prepared = requests.map(request => {
      if (!request.owner || typeof request.owner !== 'object' || !request.role || !['wide8-separate-wordsize64', 'neon4-summed-wordsize64'].includes(request.profile))
        throw new RangeError('Invalid prepass owner/profile');
      let roles = seen.get(request.owner);
      if (!roles) {
        roles = new Set();
        seen.set(request.owner, roles);
      }
      if (roles.has(request.role))
        throw new RangeError('Duplicate prepass role');
      roles.add(request.role);
      const material = request.material, source = request.source, rect = request.rect;
      if (!material || typeof material !== 'object') throw new RangeError('Invalid prepass material');
      if ('kind' in material && material.kind === 'canonicalAuto') {
        const revision = canonicalAutoMaskRevision(material), { recipe } = material;
        const slot = record.slots.find(s => s?.owner === request.owner && s.role === request.role && s.revision === revision);
        if (!slot) throw new Error('Canonical auto generation must complete outside brush GL batch');
        if (source || ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger)
          || rect.width !== recipe.width || rect.height !== recipe.height) throw new RangeError('Invalid canonical auto placement/source');
        return { request, plan: undefined, revision, width: recipe.width, height: recipe.height,
          mirror: { horizontal: recipe.mirrorH, vertical: recipe.mirrorV } };
      }
      if (!source) throw new RangeError('Image mask requires a prepared source');
      let revision: string, plan: TransformedMaskPlan;
      let mirror: { horizontal: boolean; vertical: boolean };
      if (canonicalMaterial(material)) {
        const { recipe, asset } = material, metadata = canonicalTransformedMaskMetadata(recipe, asset), binding = record.bindings.get(source.key);
        if (!binding || ['id', 'size', 'x', 'y', 'width', 'height'].some(k => binding.asset[k as keyof typeof asset] !== asset[k as keyof typeof asset])
          || binding.index !== metadata.index || binding.baseScale !== metadata.baseScale
          || binding.nativeWidth !== metadata.levelWidth || binding.nativeHeight !== metadata.levelHeight)
          throw new RangeError('Canonical mask differs from prepared source binding');
        revision = canonicalMaskRevision(request.profile, source.key, recipe, asset);
        const same = record.slots.find(slot => slot?.owner === request.owner && slot.role === request.role && slot.revision === revision);
        plan = same?.plan ?? canonicalTransformedMaskPlan(recipe, asset);
        mirror = { horizontal: recipe.mirrorH, vertical: recipe.mirrorV };
      } else {
        const saved = savedMaterial(material);
        if(saved?.geometry?.kind==='defaultAuto'||saved?.geometry?.kind==='gaussianAuto')throw new RangeError('Default auto requires a typed procedural material resolver');
        if (!saved || !saved.brush || !saved.shape || !saved.key || !saved.mirror || typeof saved.mirror.horizontal !== 'boolean' || typeof saved.mirror.vertical !== 'boolean')
          throw new RangeError('Invalid saved source material');
        const immutable = Object.isFrozen(saved) && Object.isFrozen(saved.brush) && Object.isFrozen(saved.shape) && Object.isFrozen(saved.key);
        const previous = record.slots.find(slot => slot?.owner === request.owner && slot.role === request.role && slot.material === material && slot.sourceKey === source.key && slot.profile === request.profile);
        const k = saved.key;
        revision = immutable && previous?.revision ? previous.revision : JSON.stringify([request.profile, source.key, saved.brushIdentity, saved.width, saved.height, saved.brush.width, saved.brush.height, saved.brush.scale, saved.brush.angle, saved.shape.scale, saved.shape.ratio, saved.shape.rotation, k.subPixelX, k.subPixelY, k.color, k.softness, k.lightness, k.index, k.mirrorH, k.mirrorV].map(v => Object.is(v, -0) ? '-0' : v));
        const same = record.slots.find(slot => slot?.owner === request.owner && slot.role === request.role && slot.revision === revision);
        plan = same?.plan ?? resolvedTransformedMaskPlan(saved);
        mirror = { horizontal: saved.mirror.horizontal, vertical: saved.mirror.vertical };
      }
      if (plan.width > record.limits!.width || plan.height > record.limits!.height || plan.spans.length > record.limits!.height
        || !safe(source.width, 1, 4096) || !safe(source.height, 1, 4096) || source.width !== plan.levelWidth + 2 || source.height !== plan.levelHeight + 2
        || (record.sources.get(source.key) ?? 0) < source.width * source.height * 4 || this.cache.get(source.key) !== source.texture
        || ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) || rect.width !== plan.width || rect.height !== plan.height)
        throw new RangeError('Unprepared material geometry/source');
      // Validate every new native row before any GL ownership side effect.
      if (!record.slots.some(slot => slot?.owner === request.owner && slot.role === request.role && slot.revision === revision))
        writeTransformedMaskVertices(plan, record.staging!);
      return { request, plan, revision, mirror, width: plan.width, height: plan.height };
    });
    const slots = record.slots as Slot[], selected = new Set<Slot>();
    // Reserve all existing hits before choosing an LRU destination for misses.
    const hits = prepared.map(item => {
      const slot = slots.find(s => !selected.has(s) && s.owner === item.request.owner && s.role === item.request.role && s.revision === item.revision);
      if (slot)
        selected.add(slot);
      return slot;
    });
    const assigned = prepared.map((item, index) => {
      const slot = hits[index] ?? slots.filter(s => !selected.has(s)).sort((a, b) => a.used - b.used)[0];
      selected.add(slot);
      return { ...item, slot };
    });
    const resources = [{ key: record.key, bytes: FACTOR_BYTES + record.staging.byteLength }, ...slots.map(s => ({ key: s.key, bytes: record.limits!.width * record.limits!.height * 4 })), ...[...record.sources].map(([key, bytes]) => ({ key, bytes }))];
    frame?.assert(participant, resources);
    this.cache.protect(resources.map(r => r.key));
    const releaseResources = frame ? () => {} : this.cache.lease(resources), token = Symbol('prepass-group');
    this.activeGroup = token;record.work++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      let failed=false,first:unknown;try{releaseResources()}catch(e){failed=true;first=e}
      record.work--;
      try{this.retireRecord(record)}catch(e){if(!failed){failed=true;first=e}}
      if (batchGroup) frame!.endGroup(batchGroup);
      if (this.activeGroup === token){this.activeGroup = undefined;this.activeSpatialSource=undefined;}
      if(failed)throw first;
    };
    frame?.holdGroup(release);
    try {
      const misses = assigned.filter(item => item.slot.revision !== item.revision || item.slot.owner !== item.request.owner || item.slot.role !== item.request.role);
      if (misses.length) {
        const restore = frame ? () => {} : this.saveState(this.attributes);
        try {
          for (const item of misses) {
            item.slot.revision = undefined;
            item.slot.material = undefined;
            item.slot.plan = undefined;
            if (!item.plan) throw new Error('Auto mask cannot be generated inside a GL batch');
            if (!item.request.source) throw new Error('Image source missing');
            this.draw(record,item.slot, item.request as TransformedMaskRequest, item.plan);
            item.slot.revision = item.revision;
            item.slot.owner = item.request.owner;
            item.slot.role = item.request.role;
            item.slot.material = item.request.material;
            item.slot.plan = item.plan;
            item.slot.sourceKey = item.request.source?.key;
            item.slot.profile = item.request.profile;
          }
        }
        finally {
          restore();
        }
      }
      const views = assigned.map(({ slot, request, width, height, mirror }) => {
        slot.material = request.material;
        slot.used = ++this.clock;
        return { key: slot.key, texture: slot.texture, rect: { ...request.rect }, bounds: { x: 0 as const, y: 0 as const, width: width / record.limits!.width, height: height / record.limits!.height },
          mirror, channel: 'r' as const,...'kind'in request.material&&(request.material.kind==='canonicalAuto'||request.material.kind==='canonical')&&request.material.recipe.materialParams?{materialParams:request.material.recipe.materialParams}:{},...request.source&&record.bindings.get(request.source.key)?.imageMaterial?{imageMaterial:record.bindings.get(request.source.key)!.imageMaterial!.kind}:{} };
      });
      this.activeSpatialSource=views.length===1?views[0].texture:undefined;
      return { views, release };
    }
    catch (error) {
      release();
      throw error;
    }
  }
  /** No pixels/GL on a hit. One continuation belongs to the existing executor cursor. */
  beginAutoGeneration(request: AnyTransformedMaskRequest): boolean {return this.beginRecordAuto(this.defaultCapacityRecord(),this,request)}
  /** Pure resident hit only: never starts generation, allocates, reclaims or uploads. */
  private readyRecordAuto(record:CapacityRecord,request:AnyTransformedMaskRequest):boolean{
    if(this.capacityCapture||this.batch||this.activeGroup||this.pendingAuto||!this.recordReady(record))return false
    const material=request.material
    if(!('kind'in material)||material.kind!=='canonicalAuto'||request.source||!request.owner||typeof request.owner!=='object'||!request.role)return false
    if(!isCanonicalSoftAutoMaterial(material)&&material.densityIdentity&&request.role!=='primary')return false
    if(material.recipe.width>record.limits.width||material.recipe.height>record.limits.height)return false
    const revision=canonicalAutoMaskRevision(material)
    return record.slots.some(slot=>slot?.owner===request.owner&&slot.role===request.role&&slot.revision===revision&&this.cache.get(slot.key)===slot.texture)
  }
  /** Pure continuation eligibility; a miss leaves reclaim to the old outer path. */
  canContinueSingleStripeAuto(request:AnyTransformedMaskRequest):boolean{return this.singleStripeAutoReady(this.defaultCapacityRecord(),this,request)}
  private singleStripeAutoReady(record:CapacityRecord,participant:BrushGlBatchParticipant,request:AnyTransformedMaskRequest):boolean {
    if(this.capacityCapture||this.batch||this.activeGroup||!this.recordReady(record))return false
    const material=request.material
    if(!('kind'in material)||material.kind!=='canonicalAuto'||isCanonicalSoftAutoMaterial(material)
      ||material.recipe.kind!=='defaultAuto'||material.densityIdentity||request.source||!request.owner||!request.role)return false
    const {width,height}=material.recipe,pixels=width*height
    if(!Number.isSafeInteger(pixels)||pixels<1||pixels>16384||width>record.limits.width||height>record.limits.height)return false
    const revision=canonicalAutoMaskRevision(material),pending=this.pendingAuto
    if(pending)return pending.record===record&&pending.participant===participant&&pending.owner===request.owner
      &&pending.role===request.role&&pending.revision===revision&&!pending.flushing&&pending.computedFinal
      &&pending.epoch===record.workspace&&this.cache.get(pending.slot.key)===pending.slot.texture
    if(this.readyRecordAuto(record,request))return true
    return this.cpu.reservedBytes+pixels*5+512<=this.cpu.budgetBytes
  }
  private beginRecordAuto(record:CapacityRecord,participant:BrushGlBatchParticipant,request:AnyTransformedMaskRequest):boolean{
    if (this.capacityCapture||this.batch || this.activeGroup) throw new Error('Auto generation requires an idle prepass outside GL batch');
    if (!this.recordReady(record) || !record.limits || !record.workspace) throw new Error('Prepass is not prepared');
    const material = request.material;
    if (!('kind' in material) || material.kind !== 'canonicalAuto' || request.source
      || !request.owner || typeof request.owner !== 'object' || !request.role) throw new RangeError('Invalid auto generation request');
    if(!isCanonicalSoftAutoMaterial(material)&&material.densityIdentity&&request.role!=='primary')throw new TypeError('Density request requires primary role');
    const revision = canonicalAutoMaskRevision(material), { width, height } = material.recipe;
    if (width > record.limits.width || height > record.limits.height) throw new RangeError('Auto mask exceeds prepared capacity');
    if (this.pendingAuto) {
      if (this.pendingAuto.participant!==participant||this.pendingAuto.record!==record||this.pendingAuto.owner !== request.owner || this.pendingAuto.role !== request.role || this.pendingAuto.revision !== revision)
        throw new Error('Another auto generation is pending');
      return false;
    }
    if (this.readyRecordAuto(record,request)) return true;
    const prepared = prepareCanonicalAutoMask(material);
    let releaseStripe: (() => void) | undefined;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      let failed = false, primary: unknown;
      for (const cleanup of [releaseStripe, prepared.releaseProgram]) try { cleanup?.(); }
      catch (error) { if (!failed) { failed = true; primary = error; } }
      if (failed) throw primary;
    };
    try {
      const rows = Math.min(height, Math.max(1, Math.floor(16384 / width))), pixels = rows * width;
      // The fixed table owner has already reserved its resident metadata/table.
      releaseStripe = this.cpu.reserve(pixels * 5 + 512 + (!isCanonicalSoftAutoMaterial(material)&&material.densityIdentity?512:0));
      const a8 = new Uint8Array(pixels), rgba = new Uint8Array(pixels * 4);
      const slot = (record.slots as Slot[]).slice().sort((a,b) => a.used-b.used)[0];
      const captured: CanonicalAutoMaskMaterial = isCanonicalSoftAutoMaterial(material)
        ? Object.freeze({ ...material, recipe: Object.freeze({ ...material.recipe,
          ...canonicalSoftAutoStatic(material.recipe.source, material.recipe.brushScale, material.recipe.brushAngle,material.recipe.coverageProfile) }),
          trustedSource: canonicalSoftAutoSourcePin(material.trustedSource) })
        : Object.freeze({ ...material, recipe: Object.freeze({ ...material.recipe, source: Object.freeze({ ...material.recipe.source }) }),
          ...(material.densityIdentity?{densityIdentity:Object.freeze({...material.densityIdentity})}:{}),
          trustedSource: Object.freeze({ ...material.trustedSource, source: Object.freeze({ ...material.trustedSource.source }) }) }) as CanonicalAutoMaskMaterial;
      slot.revision = undefined; slot.plan = undefined; slot.material = undefined;
      record.work++;
      this.pendingAuto = { record,participant,owner: request.owner, role: request.role, revision, slot, epoch: record.workspace,
        evaluator: prepared.evaluator, material: captured, width, height, a8, rgba, release, filled: 0, uploadedRows: 0, computedFinal:false, flushing:false };
      return false;
    } catch (error) {
      try { prepared.evaluator.cancel(); } catch { /* Preserve preparation failure. */ }
      try { release(); } catch { /* Preserve preparation failure. */ }
      throw error;
    }
  }
  /** Advances <=maxSamples; at most one bounded stripe upload. Caller owns the
   * cooperative time budget and yields without holding a GL batch/target lease. */
  advanceAutoGeneration(maxSamples: number,options?:{readonly deferFinalUpload?:true}): { done: boolean; consumed: number; uploadedBytes: number;finalUploadPending?:true } {
    if(options!==undefined&&(!options||options.deferFinalUpload!==undefined&&options.deferFinalUpload!==true||Reflect.ownKeys(options).some(k=>k!=='deferFinalUpload')))
      throw new RangeError('Invalid auto generation policy');
    if (this.capacityCapture||this.batch || this.activeGroup) throw new Error('Cannot advance auto generation inside GL batch/group');
    const p = this.pendingAuto;
    if (!p) throw new Error('No auto generation pending');
    if(p.flushing)throw new Error('Auto upload is already active');
    try {
      if(!Number.isSafeInteger(maxSamples)||maxSamples<=0)throw new RangeError('Invalid coverage continuation range');
      this.assertAutoResidency(p);
      let consumed=0;
      if(!p.computedFinal){
        const result = p.evaluator.advance(p.a8, p.filled, maxSamples);
        const previousFilled = p.filled;
        p.filled += result.written;consumed=result.consumed;p.computedFinal=result.done;
        // Pack only this bounded sample quantum; no full-stripe packing burst.
        for (let i=previousFilled; i<p.filled; i++) p.rgba.fill(p.a8[i], i*4, i*4+4);
      }
      if(p.computedFinal)this.assertFinalAutoGeometry(p);
      if(p.computedFinal&&options?.deferFinalUpload)return {done:false,consumed,uploadedBytes:0,finalUploadPending:true};
      let uploadedBytes=0;
      if(p.filled===p.a8.length||p.computedFinal)uploadedBytes=this.uploadAutoStripe(p,{kind:'standalone'});
      if(p.computedFinal)this.publishAuto(p);
      return {done:p.computedFinal,consumed,uploadedBytes};
    } catch(error) { try { this.cancelAutoGeneration(); } catch { /* Preserve generation failure. */ } throw error; }
  }
  /** SAME pending generation; no separate readiness cache or GL observation. */
  finalAutoUploadPending(request:AnyTransformedMaskRequest):boolean {
    const p=this.pendingAuto;if(!p)return false;
    this.assertAutoRequest(p,request);
    try{this.assertAutoResidency(p);if(p.flushing)throw new Error('Auto upload is already active');if(p.computedFinal)this.assertFinalAutoGeometry(p);return p.computedFinal}
    catch(primary){try{this.cancelAutoGeneration()}catch{/* Preserve residency failure. */}throw primary}
  }
  flushFinalAutoGeneration(request:AnyTransformedMaskRequest,turn:BrushGlTurn):{done:true;consumed:0;uploadedBytes:number} {
    return this.flushParticipantFinalAutoGeneration(this.pendingAuto?.participant??this,request,turn)
  }
  private flushParticipantFinalAutoGeneration(participant:BrushGlBatchParticipant,request:AnyTransformedMaskRequest,turn:BrushGlTurn):{done:true;consumed:0;uploadedBytes:number} {
    return withBrushGlTurnAutoUploadRestore(turn,participant,borrow=>{
      // A recognized real child owns the entire operation, including prelude.
      // Invalid requests still never cancel another participant's pending mask.
      if(this.batch||this.activeGroup)throw new Error('Final auto upload requires an idle prepass');
      const p=this.pendingAuto;if(!p||!p.computedFinal||p.flushing)throw new Error('No final auto upload pending');
      if(p.participant!==participant)throw new Error('Foreign capacity pending auto owner');
      this.assertAutoRequest(p,request);this.assertFinalAutoGeometry(p);
      const restore=borrow();
      try{
        this.assertAutoResidency(p);
        const uploadedBytes=this.uploadAutoStripe(p,{kind:'owned',restore});
        this.assertAutoResidency(p);
        if(this.gl.isContextLost())throw new Error('Auto upload context lost');
        this.publishAuto(p,true);
        return {done:true,consumed:0,uploadedBytes};
      }catch(primary){try{this.cancelAutoGeneration()}catch{/* Preserve upload failure. */}throw primary}
    });
  }
  private assertFinalAutoGeometry(p:NonNullable<TransformedMaskPrepass['pendingAuto']>):void {
    if(!p.computedFinal||p.filled<1||!Number.isSafeInteger(p.filled/p.width)||p.uploadedRows+p.filled/p.width!==p.height)
      throw new Error('Invalid final auto stripe geometry');
  }
  private assertAutoRequest(p:NonNullable<TransformedMaskPrepass['pendingAuto']>,request:AnyTransformedMaskRequest):void {
    const material=request.material;
    if(p.owner!==request.owner||p.role!==request.role||!('kind'in material)||material.kind!=='canonicalAuto'||request.source||p.revision!==canonicalAutoMaskRevision(material))
      throw new Error('Foreign auto generation owner/revision');
  }
  private assertAutoResidency(p:NonNullable<TransformedMaskPrepass['pendingAuto']>):void {
    if(this.pendingAuto!==p||!this.recordReady(p.record)||p.record.workspace!==p.epoch||this.cache.get(p.slot.key)!==p.slot.texture)
      throw new Error('Auto generation residency changed');
  }
  private uploadAutoStripe(p:NonNullable<TransformedMaskPrepass['pendingAuto']>,guard:{kind:'standalone'}|{kind:'owned';restore:()=>void}):number {
    const rows=p.filled/p.width;
    if(!Number.isSafeInteger(rows)||rows<1||p.uploadedRows+rows>p.height)throw new Error('Auto stripe ended between rows');
    const release=this.cache.lease([{key:p.slot.key,bytes:p.record.limits.width*p.record.limits.height*4}]);
    const gl=this.gl;let restore:(()=>void)|undefined,failed=false,failure:unknown;
    p.flushing=true;
    try{
      restore=guard.kind==='owned'?guard.restore:this.saveAutoUploadState();
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,p.slot.texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,p.uploadedRows,p.width,rows,gl.RGBA,gl.UNSIGNED_BYTE,p.rgba.subarray(0,p.filled*4));
    }catch(error){failed=true;failure=error}
    finally{
      try{restore?.()}catch(error){if(!failed){failed=true;failure=error}}
      try{release()}catch(error){if(!failed){failed=true;failure=error}}
      p.flushing=false;
    }
    if(failed)throw failure;
    const uploadedBytes=p.filled*4;p.uploadedRows+=rows;p.filled=0;return uploadedBytes;
  }
  private publishAuto(p:NonNullable<TransformedMaskPrepass['pendingAuto']>,releaseBeforePublish=false):void {
    // Owned uploads must finish retirement before exposing readiness.
    if(releaseBeforePublish){
      p.release();
      this.assertAutoResidency(p);
      if(this.gl.isContextLost())throw new Error('Auto upload context lost');
    }
    p.slot.owner=p.owner;p.slot.role=p.role;p.slot.revision=p.revision;p.slot.material=p.material;
    p.slot.sourceKey=undefined;p.slot.profile=undefined;p.slot.used=++this.clock;
    this.pendingAuto=undefined;p.record.work--;let failed=false,first:unknown;try{if(!releaseBeforePublish)p.release()}catch(e){failed=true;first=e}try{this.retireRecord(p.record)}catch(e){if(!failed){failed=true;first=e}}if(failed)throw first;
  }
  cancelAutoGeneration(): void {
    if(this.pendingAuto?.flushing)throw new Error('Cannot cancel inside auto upload');
    const p=this.pendingAuto; this.pendingAuto=undefined;
    if(p) {
      let failed=false, primary:unknown;
      p.record.work--;
      for(const cleanup of [()=>p.evaluator.cancel(),p.release,()=>this.retireRecord(p.record)]) try { cleanup(); }
      catch(error) { if(!failed){failed=true;primary=error} }
      if(failed)throw primary;
    }
  }
  releaseOwner(owner:object):void{
    let failed=false,first:unknown
    for(const record of [...this.records])try{this.releaseRecordOwner(record,owner)}catch(e){if(!failed){failed=true;first=e}}
    if(failed)throw first
  }
  private releaseRecordOwner(record:CapacityRecord,owner:object,participant?:BrushGlBatchParticipant):void{
    if (this.batch) throw new Error('Cannot release owner inside active brush GL batch');
    let failed=false, primary:unknown;
    if (this.pendingAuto?.record===record&&this.pendingAuto.owner===owner&&(!participant||this.pendingAuto.participant===participant)) try { this.cancelAutoGeneration(); } catch(error) { failed=true; primary=error; }
    for (const slot of record.slots)
    if (slot?.owner === owner) {
      slot.owner = undefined;
      slot.role = undefined;
      slot.revision = undefined;
      slot.material = undefined;
      slot.plan = undefined;
      slot.sourceKey = undefined;
      slot.profile = undefined;
    }
    if(failed)throw primary;
  }
  reset(lost = false): void {
    if(this.pendingAuto?.flushing)throw new Error('Cannot reset inside auto upload');
    if ((this.turnDepth||this.batch) && !lost) throw new Error('Cannot reset inside an active brush GL turn/batch');
    this.capacityCleanup(()=>{this.resetStorage(lost);return undefined})
  }
  private resetStorage(lost:boolean):void{
    let failed=false,primary:unknown;
    const attempt=(cleanup:()=>void)=>{try{cleanup()}catch(error){if(!failed){failed=true;primary=error}}};
    const capacity=this.capacityUpdate;this.capacityUpdate=undefined
    this.capacityResetLost=lost
    attempt(()=>{if(capacity?.status==='published')capacity.finalizeCleanup();else capacity?.cancel()})
    this.capacityResetLost=false
    const update=this.sourceUpdate;this.sourceUpdate=undefined
    attempt(()=>{if(update?.status==='published')update.finalizeCleanup();else update?.cancel()})
    attempt(()=>this.cancelAutoGeneration());this.activeGroup=undefined;this.activeSpatialSource=undefined;
    const records=[...this.records];if(this.defaultRecord){this.defaultRecord.releaseStorageCpu=this.releaseCpu;this.releaseCpu=undefined}for(const record of records){record.isDefault=false;attempt(()=>this.retireRecord(record,lost,true))}
    for(const slot of [...this.slots])if(slot)attempt(()=>this.cache.discard(slot.key,lost));
    attempt(()=>this.cache.discard(this.workspaceKey,lost));
    if(this.spatialPass)attempt(()=>this.spatialPass!.destroy(lost));this.spatialPass=undefined;
    if(this.program&&!lost)attempt(()=>this.gl.deleteProgram(this.program!));
    this.program=undefined;this.workspace=undefined;this.slots=[];this.staging=undefined;this.limits=undefined;
    this.sources.clear();this.sourceBindings.clear();this.attributes=[];this.uniforms={};this.instancing=null;this.vertexArrays=null;
    const releaseSource=this.releaseSourceMetadata;this.releaseSourceMetadata=undefined;attempt(()=>releaseSource?.());
    const cpuRelease=this.releaseCpu;this.releaseCpu=undefined;this.reservedCpuBytes=0;attempt(()=>cpuRelease?.());
    if(failed)throw primary;
  }
  /** Stripe upload touches only unit0 and unpack state: no draw/program/FBO,
   * vertex or capability state enters this capsule. Five synchronous queries. */
  private saveAutoUploadState(): () => void {
    const gl=this.gl;
    const active=gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    const alignment=gl.getParameter(gl.UNPACK_ALIGNMENT) as number;
    const flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
    const premultiply=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean;
    let texture: WebGLTexture | null;
    try {
      gl.activeTexture(gl.TEXTURE0);
      texture=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    } finally { gl.activeTexture(active); }
    return restoreBrushAutoUploadState(gl,{active,texture,alignment,flip,premultiply});
  }

  private texture(width:number,height:number,data:Uint8Array|null,reservation:StorageReservation):OwnedBrushResource {
    const gl=this.gl;
    return allocateOwnedBrushTexture(gl,width*height*4,(texture,mark)=>{
      gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);mark(width*height*4);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    },reservation);
  }
  private activeSpatialSource?:WebGLTexture
  private spatialPass?:SourceSpatialColorPass
  private compile(): void {
    const gl = this.gl, shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, SOURCE_TRANSFORMED_MASK_VERT], [gl.FRAGMENT_SHADER, sourceTransformedMaskFragment()]] as const) {
        const shader = gl.createShader(type);
        if (!shader)
          throw new Error('Prepass shader allocation failed');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error('Prepass shader compile failed: ' + gl.getShaderInfoLog(shader));
      }
      program = gl.createProgram();
      if (!program)
        throw new Error('Prepass program allocation failed');
      for (const shader of shaders)
        gl.attachShader(program, shader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error('Prepass program link failed');
      this.attributes = ['a_position', 'a_origin', 'a_step', 'a_span'].map(name => gl.getAttribLocation(program!, name));
      if (this.attributes.some(index => index < 0))
        throw new Error('Prepass attribute unavailable');
      for (const name of ['u_targetSize', 'u_source', 'u_sourceSize', 'u_factorLow', 'u_factorHigh', 'u_decode', 'u_summed', 'u_directCopy','u_materialMode'])
        this.uniforms[name] = gl.getUniformLocation(program, name);
      this.program = program;
    }
    catch (error) {
      if (program)
        gl.deleteProgram(program);
      throw error;
    }
    finally {
      for (const shader of shaders)
        gl.deleteShader(shader);
    }
  }
  private draw(record:CapacityRecord,slot: Slot, request: TransformedMaskRequest, plan: TransformedMaskPlan): void {
    const gl = this.gl, u = this.uniforms, workspace = record.workspace, limits = record.limits;
    const count = writeTransformedMaskVertices(plan, record.staging);
    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.framebuffer);
    gl.viewport(0, 0, plan.width, plan.height);
    for (const cap of [gl.BLEND, gl.SCISSOR_TEST, gl.DITHER, gl.CULL_FACE, gl.DEPTH_TEST, gl.STENCIL_TEST])
      gl.disable(cap);
    setGlColorMask(gl,true, true, true, true);
    setGlClearColor(gl,0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program!);
    if (workspace.vao) this.vertexArrays!.bindVertexArrayOES(workspace.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, workspace.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, record.staging.subarray(0, count * 12));
    for (const [i, size, offset] of [[0, 2, 0], [1, 4, 2], [2, 4, 6], [3, 2, 10]]) {
      const location = this.attributes[i];
      gl.enableVertexAttribArray(location);
      this.instancing?.vertexAttribDivisorANGLE(location, 0);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 48, offset * 4);
    }
    for (const [unit, texture, uniform] of [[0, request.source!.texture, u.u_source], [1, workspace.low, u.u_factorLow], [2, workspace.high, u.u_factorHigh]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform, unit);
    }
    gl.uniform2f(u.u_sourceSize, request.source!.width, request.source!.height);
    gl.uniform2f(u.u_targetSize, plan.width, plan.height);
    gl.uniform1f(u.u_decode, request.profile.startsWith('neon4') ? 3 : 0);
    gl.uniform1f(u.u_summed, request.profile.startsWith('neon4') ? 1 : 0);
    gl.uniform1f(u.u_directCopy, plan.directCopy ? 1 : 0);
    const material=record.bindings.get(request.source!.key)?.imageMaterial;gl.uniform1f(u.u_materialMode,material?.kind==='lightness-map-v1'||material?.kind==='gradient-map-v1'?1:material?.kind==='color-stamp-v1'?2:0);
    // Capacity and valid viewport are distinct; only the latter is sampled.
    if (plan.width > limits.width || plan.height > limits.height)
      throw new Error('Prepass capacity changed after preflight');
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }
  supportsTipGradient():boolean{return !!this.limits?.tipGradient&&!!this.spatialPass&&this.isReady()}
  materializeTipGradient(view:TransformedMaskView,gradient:CanonicalTipGradientResource,frame:BrushGlBatchFrame):TransformedMaskView{return this.materializeRecordTipGradient(this.defaultCapacityRecord(),this,view,gradient,frame)}
  private materializeRecordTipGradient(record:CapacityRecord,participant:BrushGlBatchParticipant,view:TransformedMaskView,gradient:CanonicalTipGradientResource,frame:BrushGlBatchFrame):TransformedMaskView{
    if(!this.activeGroup||this.batch!==frame||!record.limits.tipGradient||!this.spatialPass)throw new Error('Tip gradient requires its prepared mask group');
    const input=(record.slots as Slot[]).find(s=>s.key===view.key&&s.texture===view.texture),target=(record.slots as Slot[]).find(s=>s!==input);
    if(!input||!target||!record.work||this.activeSpatialSource!==view.texture||view.imageMaterial!=='gradient-map-v1')throw new Error('Gradient tip mask owner changed');
    const owners={gl:this.gl,cache:this.cache,cpu:this.cpu};assertCanonicalPatternResourceCurrent(gradient,owners);
    const lifetime=canonicalPatternResourceLifetime(gradient,owners),resources=[...this.recordResources(record),...[...record.sources].map(([key,bytes])=>({key,bytes}))];
    frame.assert(participant,resources,[lifetime]);
    target.revision=undefined;target.owner=undefined;
    const restore=frame.pointSampling(gradient.texture);let failed=false,primary:unknown;
    try{
      this.vertexArrays?.bindVertexArrayOES(record.workspace.vao??null);this.instancing?.vertexAttribDivisorANGLE(this.spatialPass.attribute,0);
      this.spatialPass.draw({mask:input.texture,field:gradient.texture,target:target.framebuffer,width:view.rect.width,height:view.rect.height,allocationWidth:record.limits.width,allocationHeight:record.limits.height,fieldWidth:16,fieldHeight:16,periodX:1,periodY:1,offsetX:0,offsetY:0,cropX:0,cropY:0,buffer:record.workspace.buffer,vertices:record.staging,tipMapping:true});
    }catch(error){failed=true;primary=error}
    try{restore()}catch(error){if(!failed){failed=true;primary=error}}if(failed)throw primary;
    this.activeSpatialSource=target.texture;
    return {...view,key:target.key,texture:target.texture,materialRGBA:true};
  }
  materializeSpatial(view:TransformedMaskView,request:CanonicalSpatialColorRequest,frame:BrushGlBatchFrame):TransformedMaskView{return this.materializeRecordSpatial(this.defaultCapacityRecord(),this,view,request,frame)}
  private materializeRecordSpatial(record:CapacityRecord,participant:BrushGlBatchParticipant,view:TransformedMaskView,request:CanonicalSpatialColorRequest,frame:BrushGlBatchFrame):TransformedMaskView{
    if(!this.activeGroup||this.batch!==frame||!record.limits.spatialColors||!this.spatialPass)throw new Error('Spatial field requires its prepared active mask group')
    const input=(record.slots as Slot[]).find(s=>s.key===view.key&&s.texture===view.texture)
    if(!input||!record.work||this.activeSpatialSource!==view.texture)throw new Error('Spatial mask owner changed')
    const draw=canonicalSourceColorFieldDraw(request.draw,request.provider),width=view.rect.width,height=view.rect.height
    const spare=(record.slots as Slot[]).filter(s=>s!==input),target=spare[0],noise=spare[1]
    if(!target||!noise)throw new Error('Spatial field slot inventory insufficient')
    target.revision=undefined;target.owner=undefined;noise.revision=undefined;noise.owner=undefined
    const resources=[...this.recordResources(record),...[...record.sources].map(([key,bytes])=>({key,bytes}))];frame.assert(participant,resources)
    let field=request.field,cropX=1,cropY=1,periodX=0,periodY=0,release:(()=>void)|undefined
    let failed=false,primary:unknown
    try{
      if(request.provider.kind==='total-random-rgb8-hash-v1'){
        release=this.cpu.reserve(width*height*4)
        frame.assert(participant,resources)
        const bytes=new Uint8Array(width*height*4);fillSourceSpatialNoise(bytes,width,height,request.provider,draw)
        const restoreUpload=borrowBrushGlBatchAutoUploadRestore(frame,participant)??this.saveAutoUploadState();let uploadFailed=false,uploadError:unknown
        try{this.gl.activeTexture(this.gl.TEXTURE0);this.gl.bindTexture(this.gl.TEXTURE_2D,noise.texture);this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT,1);this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL,0);this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0);this.gl.texSubImage2D(this.gl.TEXTURE_2D,0,0,0,width,height,this.gl.RGBA,this.gl.UNSIGNED_BYTE,bytes)}catch(error){uploadFailed=true;uploadError=error}
        try{restoreUpload()}catch(error){if(!uploadFailed){uploadFailed=true;uploadError=error}}if(uploadFailed)throw uploadError
        field={key:noise.key,texture:noise.texture,width:record.limits.width,height:record.limits.height};cropX=0;cropY=0;periodX=width;periodY=height
      }else{
        const r=request.provider.resource;periodX=r.periodX;periodY=r.periodY
        if(!field||field.width!==r.width+2||field.height!==r.height+2||record.sources.get(field.key)!==field.width*field.height*4||this.cache.get(field.key)!==field.texture)throw new Error('Spatial original pattern unavailable')
      }
      if(!field)throw new Error('Spatial field missing')
      frame.assert(participant,resources)
      this.vertexArrays?.bindVertexArrayOES(record.workspace.vao??null);this.instancing?.vertexAttribDivisorANGLE(this.spatialPass.attribute,0)
      this.spatialPass.draw({mask:input.texture,field:field.texture,target:target.framebuffer,width,height,allocationWidth:record.limits.width,allocationHeight:record.limits.height,fieldWidth:field.width,fieldHeight:field.height,periodX,periodY,offsetX:draw.offsetX,offsetY:draw.offsetY,cropX,cropY,buffer:record.workspace.buffer,vertices:record.staging,material:request.material,parameters:view.materialParams})
      return {key:target.key,texture:target.texture,rect:view.rect,bounds:view.bounds,mirror:view.mirror,channel:'r',spatialRGBA:true}
    }catch(error){failed=true;primary=error;throw error}finally{try{release?.()}catch(error){if(!failed)throw error}if(failed)void primary}
  }
  private saveState(attributes: readonly number[]): () => void {
    return saveBrushGlState(this.gl, attributes, this.instancing, this.vertexArrays, 3);
  }
}
