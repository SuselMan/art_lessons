import { CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,canonicalPixelSourceOuterCompositionLaw} from '@grafetto/shared'
import {canonicalSourceTipGradient,canonicalSourceMaterialTipGradient,type CanonicalSourceTipGradient} from '@grafetto/shared'
import {canonicalSourceAssetStorageCompatible} from '@grafetto/shared'
import {canonicalPixelSourceComposition} from '@grafetto/shared'
import {canonicalSourceRoleTexturesInput,sourceRoleTextureInputsFromPins,canonicalSourceRoleTexturesData,canonicalPixelDualSourceMaterialContext,type CanonicalSourceRoleTexturesInput} from '@grafetto/shared'
import {canonicalSourceColorFieldsForDescriptor,canonicalSourceColorFieldAssets,canonicalSourceMaterialContext,canonicalPrimaryGrainMaterialContext} from '@grafetto/shared'
import {canonicalSourceColorFields,type CanonicalSourceColorFields} from '@grafetto/shared'
import {canonicalTextureGradientRGBA,type CanonicalTextureGradientRGBA} from '@grafetto/shared'
import {canonicalPixelSourceEffectReject} from '@grafetto/shared'
import {canonicalPixelImageSourceBinding,canonicalPixelImageMaterialContext} from '@grafetto/shared'
import {canonicalSourceScale,captureCanonicalSourceScaleOptions,type CanonicalSourceScaleOptions} from '@grafetto/shared'
import {CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE} from '@grafetto/shared'
import {canonicalPixelTextureSourceBinding,canonicalPixelTextureMaterialContext} from '@grafetto/shared'
import {hasActiveSourceMaterialOptions,sourceColorRecording} from '@grafetto/shared'
import {canonicalDynamicAutoSourceBinding} from '@grafetto/shared'
import {canonicalLightnessImageSourceBinding,canonicalLightnessImageMaterialContext,canonicalColorImageSourceBinding,canonicalColorImageMaterialContext} from '@grafetto/shared'
import {extractCanonicalPixelDualSourceData,canonicalPixelDualSourceBinding,canonicalMaskedSourceMaterialContext,canonicalGaussianAutoStatic,canonicalGaussianAutoSourcePin,canonicalSoftAutoSourcePin,type CanonicalMaterialAsset} from '@grafetto/shared'
import {extractCanonicalDynamicAutoGeometryData} from '@grafetto/shared'
import {canonicalPrimaryGrainImageSourceBinding,canonicalPrimaryGrainImageMaterialContext,decodeCanonicalPrimaryGrainStrokeFrame,canonicalStandaloneStrokeSnapshotV8,prepareCanonicalRecordedAttachmentV8,type CanonicalMaterialContextV8,type CanonicalRecordedAttachmentV8,type CanonicalRecordedReadCapabilityV8} from '@grafetto/shared'
import {freezeCanonicalPrimaryGrainPolicies,freezeCanonicalPlainAutoGeometryPolicies,freezeCanonicalPixelMaskedPolicies,freezeCanonicalImageMaterialPolicies} from './canonicalExecutionPolicy.js'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  canonicalDefaultAutoStatic,canonicalDefaultAutoSourcePin,canonicalStrokeCoverageMatches,extractCanonicalPlainAutoTiltGeometryData,canonicalTexturedAutoProgramBinding,assertTexturedAutoProgramContext,decodeCanonicalTexturedAutoStrokeFrame,canonicalStrokeSnapshotV7,type CanonicalMaterialContextV7,type CanonicalResolvedTexturePhase,
  CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE, verifyCanonicalRecordedClose,parseCanonicalStrokeCloseOperation,advanceCanonicalMaterialPrefix,CANONICAL_MATERIAL_PREFIX_START,type CanonicalMaterialPrefixState, CANONICAL_MATERIAL_LIMITS, CANONICAL_STROKE_RASTER_PROFILE, type CanonicalStrokeRasterProfile, STRAIGHT_ROOM_RASTER_VERSION,
  canonicalSoftNativeDefaultTexturedSourceMaterialContext,canonicalStrokeSnapshotV6,canonicalSoftAutoNativeDefaultTextureSourceBinding,extractCanonicalSoftAutoNativeDefaultTextureProgramData,type CanonicalMaterialContextV6,canonicalPressureTexturedSourceMaterialContext,canonicalStrokeSnapshotV5,canonicalDefaultAutoPressureTextureSourceBinding,canonicalPressureCurvePrimaryTexturePin,extractCanonicalDefaultAutoPressureTextureProgramData,type CanonicalMaterialContextV5,canonicalTexturedSourceMaterialContext,canonicalStrokeSnapshotV4,canonicalDefaultAutoFixedTextureSourceBinding,extractCanonicalDefaultAutoFixedTextureCapability,canonicalStrokeRasterContract,type CanonicalMaterialContextV4,canonicalPrimaryTextureMaterialContext,canonicalStrokeSnapshotV3,extractCanonicalPrimaryTextureCapability,type CanonicalMaterialContextV3,canonicalImageSourceBinding,canonicalImagePipeSourceBinding,canonicalSourceEffectReject, canonicalBrushDescriptorJSON, canonicalMaterialGeometryCost, isSourceStampData, extractCanonicalSinglePngCapability, hasCanonicalSourceCurvePrograms, canonicalDefaultAutoSourceBinding, canonicalGaussianAutoSourceBinding, canonicalSoftAutoSourceBinding, canonicalSourceComposition,
  type BrushDescriptor, type BrushLibrary, type CanonicalMaterialContext, type CanonicalStrokeBegin, type CanonicalStrokeOperation, type CanonicalMaterialContextV2, decodeCanonicalStrokeFrame,
  prepareCanonicalRecordedAttachment, CANONICAL_RECORDED_ATTACHMENT_LIMITS, type CanonicalRecordedAttachmentV1, type CanonicalRecordedReadCapability, type Operation,
} from '@grafetto/shared'
import { freezeCanonicalPlainTiltPolicies,freezeCanonicalTexturedAutoPolicies,freezeCanonicalSoftPressureTexturedPolicies,freezeCanonicalPressureTexturedPolicies,freezeCanonicalTexturedPolicies,freezeCanonicalAuthorPrimaryTexturePolicy,freezeCanonicalPrimaryTexturePolicy,freezeCanonicalSeededDefaultAutoPolicies,freezeCanonicalPrimaryImagePolicy,freezeCanonicalImagePipePolicies,type CanonicalImagePipeSource,freezeCanonicalAutoPolicies,freezeCanonicalRasterPolicy,type CanonicalRoomExecutionPolicy, type CanonicalAutoExecutionPolicies } from './canonicalExecutionPolicy.js'
import { BrushStorage, merge } from '../brushLibrary/storage.js'
import { canonicalPaintRejectReason } from './operationGate.js'
import { lessonRecordOf, rooms, type RoomRecord } from './roomRegistry.js'
import { hasSucceededCanonicalWrite } from './operationLog.js'
import { captureCanonicalSavedTexturePhase,verifyCanonicalOperationRow, projectCanonicalIndexedOperation,projectCanonicalIndexedCloseOperation, type CanonicalStoredOperationRow } from './roomPersistence.js'
import type {CanonicalIndexedCloseEvidence} from './snapshotStore.js'
import {assertCanonicalPlainAutoGeometryFrame,assertCanonicalDynamicAutoGeometryFrame} from './CanonicalStrokeAdmission.js'
import type { CanonicalAdmissionIdentity, CanonicalCapabilityResolver, TrustedCanonicalGesture,CanonicalTrustedMaterialContext } from './CanonicalStrokeAdmission.js'

export type CanonicalGestureBegin = CanonicalStrokeBegin
/** Read-only attachment input for a future authoritative delivery seam.
 * Deliberately not TrustedCanonicalGesture: it cannot grant append as a peer. */
export interface CanonicalRecordedCapability {
 readonly roomId:string;readonly originalUserId:string;readonly operationId:string;readonly sequence:number;readonly layerId:string
 readonly boardEpoch:number;readonly descriptorSha256:string;readonly brush:string;readonly strokeId:string
 readonly rasterProfile:CanonicalStrokeRasterProfile
 readonly pigmentRgb8:readonly[number,number,number]
 readonly composition:TrustedCanonicalGesture['composition']
 readonly material:CanonicalMaterialContextV8|CanonicalMaterialContextV7|CanonicalMaterialContextV2|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5|CanonicalMaterialContextV6
}
interface RecordedFoldCheckpoint extends CanonicalMaterialPrefixState {
 readonly recordedNext:number;readonly firstOperationId:string;readonly lastOperationId:string;readonly firstSeq:number;readonly lastSeq:number
 readonly endSeq?:number;readonly closeSeal?:ReturnType<typeof verifyCanonicalRecordedClose>
}
declare const recordedReadBindingScopeBrand:unique symbol
export interface RecordedReadBindingScope {readonly [recordedReadBindingScopeBrand]:true}
type RecordedBound=ReturnType<CanonicalBrushCapabilityResolver['bindDescriptor']>
interface RecordedReadBindingState {readonly roomId:string;readonly boardEpoch:number;readonly board:RoomRecord;readonly current:()=>void;revision?:string;bytes:number;entries:Map<string,{readonly bound:RecordedBound;readonly bytes:number}>}
/** Copies only closed DATA into PRIVATE owned frozen output, never freezes a
 * public library/descriptor or trusts arbitrary Object.isFrozen input. */
function privateRecordedBindingCopy<T>(value:T):T|undefined {
 const ancestors=new Set<object>()
 const clone=(v:unknown):unknown=>{
  if(v===null||typeof v==='string'||typeof v==='boolean'||v===undefined||typeof v==='number'&&Number.isFinite(v))return v
  if(typeof v!=='object'||ancestors.has(v))throw Error('Non-DATA recorded binding')
  const array=Array.isArray(v),prototype=Object.getPrototypeOf(v)
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw Error('Non-DATA recorded binding')
  const keys=Reflect.ownKeys(v),length=array?Object.getOwnPropertyDescriptor(v,'length')?.value:undefined
  if(array&&(!Number.isSafeInteger(length)||length<0||keys.length!==length+1))throw Error('Non-DATA recorded binding')
  const copy:Record<string,unknown>|unknown[]=array?[]:{};ancestors.add(v)
  try{for(const key of keys){if(array&&key==='length')continue;const field=typeof key==='string'?Object.getOwnPropertyDescriptor(v,key):undefined
    if(!field||!Object.hasOwn(field,'value')||field.enumerable!==true||array&&(!Number.isSafeInteger(Number(key))||String(Number(key))!==key||Number(key)<0||Number(key)>=length))throw Error('Non-DATA recorded binding')
    Object.defineProperty(copy,key,{value:clone(field.value),enumerable:true,writable:false,configurable:false})
  }}finally{ancestors.delete(v)}return Object.freeze(copy)
 }
 try{return clone(value) as T}catch{return undefined}
}
interface RecordedSourceFold {
 accept(this:unknown,operation:CanonicalStrokeOperation|import('@grafetto/shared').RecordedCanonicalStrokeCloseOperation,row:CanonicalStoredOperationRow):undefined
 checkpoint(this:unknown):Readonly<RecordedFoldCheckpoint>
 finish(this:unknown):Readonly<RecordedFoldCheckpoint>
 fork(this:unknown):Readonly<RecordedSourceFold>
}
interface RecordedFoldSeed {
 readonly source:CanonicalRecordedCapability;readonly state:CanonicalMaterialPrefixState
 readonly firstOperationId:string;readonly lastOperationId:string;readonly firstSeq:number;readonly lastSeq:number
 readonly endSeq?:number;readonly closeSeal?:ReturnType<typeof verifyCanonicalRecordedClose>
}
interface PinnedGesture { readonly board: RoomRecord; readonly lesson: RoomRecord; readonly grant: TrustedCanonicalGesture; readonly pipeSource?:CanonicalImagePipeSource }
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && !v.includes('\0')
const key = (identity: CanonicalAdmissionIdentity, strokeId: string) => JSON.stringify([identity.roomId, identity.userId, strokeId])
function fail(reason: string): never { throw new Error(`canonical capability: ${reason}`) }


/** Server-owned binder used by CanonicalRoomTransport; auto defaults disabled.
 * Epochs identify resident record lifetimes only. Reconnect/restart must rebuild
 * persisted gesture prefixes before new admission; this is not durable history.
 * Descriptor/CAS semantics are verified here; a sourceStamp/profile claim alone
 * grants nothing. The author option compiler/RNG is never run on the server. */
export class CanonicalBrushCapabilityResolver {
  private readonly storage: BrushStorage
  private readonly operator: () => BrushLibrary
  private readonly variants: ReadonlySet<'creamy' | 'hard'>
  private readonly maxGestures: number
  private readonly authorProfile:CanonicalStrokeRasterProfile
  private readonly recordedProfiles:readonly CanonicalStrokeRasterProfile[]
  private readonly imageMaterialPolicies:ReturnType<typeof freezeCanonicalImageMaterialPolicies>
  private readonly pixelMaskedPolicies:ReturnType<typeof freezeCanonicalPixelMaskedPolicies>
  private readonly plainAutoGeometryPolicies:ReturnType<typeof freezeCanonicalPlainAutoGeometryPolicies>
  private readonly primaryGrainPolicies:ReturnType<typeof freezeCanonicalPrimaryGrainPolicies>
  private readonly plainTiltPolicies:ReturnType<typeof freezeCanonicalPlainTiltPolicies>
  private readonly texturedAutoPolicies:Readonly<Pick<CanonicalRoomExecutionPolicy,'texturedAutoSource'|'authorTexturedAutoSource'>>
  private readonly softPressureTexturedPolicies:Readonly<Pick<CanonicalRoomExecutionPolicy,'softPressureTexturedSource'|'authorSoftPressureTexturedSource'>>
  private readonly pressureTexturedPolicies:Readonly<Pick<CanonicalRoomExecutionPolicy,'pressureTexturedSource'|'authorPressureTexturedSource'>>
  private readonly texturedPolicies:Readonly<Pick<CanonicalRoomExecutionPolicy,'texturedSource'|'authorTexturedSource'>>
  private readonly primaryTextureSource:CanonicalRoomExecutionPolicy['primaryTextureSource']
  private readonly authorPrimaryTextureSource:CanonicalRoomExecutionPolicy['authorPrimaryTextureSource']
  private readonly primaryImageSource:CanonicalRoomExecutionPolicy['primaryImageSource']
  private readonly imagePipePolicies:ReturnType<typeof freezeCanonicalImagePipePolicies>
  private readonly seededPolicies:ReturnType<typeof freezeCanonicalSeededDefaultAutoPolicies>
  private readonly autoSources:Readonly<CanonicalAutoExecutionPolicies>
  private readonly gestures = new Map<string, PinnedGesture>()
  private readonly epochs = new WeakMap<RoomRecord, { readonly lesson: RoomRecord; readonly value: number }>()
  private nextEpoch = 0
  private readonly recordedReadBindings=new WeakMap<RecordedReadBindingScope,RecordedReadBindingState>()
  createRecordedReadBindingScope(input:{readonly roomId:string;readonly boardEpoch:number;readonly assertCurrent:()=>void}):RecordedReadBindingScope {
    input.assertCurrent();const board=rooms.get(input.roomId)
    if(!board||this.captureReadScope(input.roomId).boardEpoch!==input.boardEpoch)fail('recorded read binding scope unavailable')
    const scope=Object.freeze({}) as RecordedReadBindingScope
    this.recordedReadBindings.set(scope,{roomId:input.roomId,boardEpoch:input.boardEpoch,board,current:input.assertCurrent,bytes:0,entries:new Map()})
    return scope
  }
  clearRecordedReadBindings(scope:RecordedReadBindingScope):void {
    const state=this.recordedReadBindings.get(scope);if(!state)fail('foreign recorded read binding scope')
    state.entries.clear();state.bytes=0;state.revision=undefined
  }
  private recordedBindingState(scope:RecordedReadBindingScope,roomId:string,boardEpoch:number):RecordedReadBindingState {
    const state=this.recordedReadBindings.get(scope)
    if(!state||state.roomId!==roomId||state.boardEpoch!==boardEpoch)fail('foreign recorded read binding scope')
    try{state.current();if(rooms.get(roomId)!==state.board||this.captureReadScope(roomId).boardEpoch!==boardEpoch)fail('recorded read binding scope changed')
      const revision=this.storage.roomLibraryRevision(roomId)
      if(state.revision!==revision){state.entries.clear();state.bytes=0;state.revision=revision}
      return state
    }catch(error){state.entries.clear();state.bytes=0;state.revision=undefined;throw error}
  }

  /** Pass directly to CanonicalStrokeAdmission; no ambient mutable identity. */
  readonly resolve: CanonicalCapabilityResolver = (identity, selector) => {
    if (!validIdentity(identity) || !selector || !text(selector.strokeId)) return undefined
    const pinned = this.gestures.get(key(identity, selector.strokeId))
    if (!pinned || pinned.grant.layerId !== selector.layerId || pinned.grant.brush !== selector.brush) return undefined
    const current = this.authorizedBoard(identity, selector.layerId)
    if (!current || current.board !== pinned.board || current.lesson !== pinned.lesson) return undefined
    return pinned.grant
  }

  constructor(options: {
    readonly storage: BrushStorage
    /** The actual startup operator manifest, not its protected personal archive. */
    readonly operator: () => BrushLibrary
    readonly rasterProfile?:CanonicalStrokeRasterProfile
    readonly authorRasterProfile?:CanonicalStrokeRasterProfile
    readonly allowedRecordedRasterProfiles?:CanonicalRoomExecutionPolicy['allowedRecordedRasterProfiles']
    /** Explicit server execution/config policy, never inferred from saved KPP. */
    readonly alphaDarkenVariants: readonly ('creamy' | 'hard')[]
    readonly maxGestures: number
    readonly imageMaterialSource?:CanonicalRoomExecutionPolicy['imageMaterialSource']
    readonly authorImageMaterialSource?:CanonicalRoomExecutionPolicy['authorImageMaterialSource']
    readonly pixelMaskedSource?:CanonicalRoomExecutionPolicy['pixelMaskedSource']
    readonly authorPixelMaskedSource?:CanonicalRoomExecutionPolicy['authorPixelMaskedSource']
    readonly plainAutoGeometrySource?:CanonicalRoomExecutionPolicy['plainAutoGeometrySource']
    readonly authorPlainAutoGeometrySource?:CanonicalRoomExecutionPolicy['authorPlainAutoGeometrySource']
    readonly primaryGrainSource?:CanonicalRoomExecutionPolicy['primaryGrainSource']
    readonly authorPrimaryGrainSource?:CanonicalRoomExecutionPolicy['authorPrimaryGrainSource']
    readonly plainTiltSource?:CanonicalRoomExecutionPolicy['plainTiltSource']
    readonly authorPlainTiltSource?:CanonicalRoomExecutionPolicy['authorPlainTiltSource']
    readonly texturedAutoSource?:CanonicalRoomExecutionPolicy['texturedAutoSource']
    readonly authorTexturedAutoSource?:CanonicalRoomExecutionPolicy['authorTexturedAutoSource']
    readonly softPressureTexturedSource?:CanonicalRoomExecutionPolicy['softPressureTexturedSource']
    readonly authorSoftPressureTexturedSource?:CanonicalRoomExecutionPolicy['authorSoftPressureTexturedSource']
    readonly pressureTexturedSource?:CanonicalRoomExecutionPolicy['pressureTexturedSource']
    readonly authorPressureTexturedSource?:CanonicalRoomExecutionPolicy['authorPressureTexturedSource']
    readonly texturedSource?:CanonicalRoomExecutionPolicy['texturedSource']
    readonly authorTexturedSource?:CanonicalRoomExecutionPolicy['authorTexturedSource']
    readonly primaryTextureSource?:CanonicalRoomExecutionPolicy['primaryTextureSource']
    readonly authorPrimaryTextureSource?:CanonicalRoomExecutionPolicy['authorPrimaryTextureSource']
    readonly primaryImageSource?:CanonicalRoomExecutionPolicy['primaryImageSource']
    readonly allowedRecordedImagePipeSources?:readonly CanonicalImagePipeSource[]
    readonly authorImagePipeSources?:readonly CanonicalImagePipeSource[]
    readonly seededDefaultAuto?:CanonicalRoomExecutionPolicy['seededDefaultAuto']
    readonly recordedSeededDefaultAutoProfile?:CanonicalRoomExecutionPolicy['recordedSeededDefaultAutoProfile']
    readonly fullHistoryFormat?:CanonicalRoomExecutionPolicy['fullHistoryFormat']
    readonly autoSources?:CanonicalAutoExecutionPolicies|false
  }) {
    if (!(options.storage instanceof BrushStorage) || typeof options.operator !== 'function'
      || !Number.isInteger(options.maxGestures) || options.maxGestures < 1 || options.maxGestures > 1024
      || !Array.isArray(options.alphaDarkenVariants) || options.alphaDarkenVariants.length < 1 || options.alphaDarkenVariants.length > 2
      || options.alphaDarkenVariants.some(v => v !== 'creamy' && v !== 'hard')
      || new Set(options.alphaDarkenVariants).size !== options.alphaDarkenVariants.length) fail('invalid explicit execution policy')
    const raster=freezeCanonicalRasterPolicy(options)
    this.authorProfile=raster.authorRasterProfile;this.recordedProfiles=raster.allowedRecordedRasterProfiles
    this.primaryImageSource=freezeCanonicalPrimaryImagePolicy(options.primaryImageSource)
    this.plainTiltPolicies=freezeCanonicalPlainTiltPolicies(options)
    this.texturedAutoPolicies=freezeCanonicalTexturedAutoPolicies(options)
    this.softPressureTexturedPolicies=freezeCanonicalSoftPressureTexturedPolicies(options)
    this.pressureTexturedPolicies=freezeCanonicalPressureTexturedPolicies(options)
    this.texturedPolicies=freezeCanonicalTexturedPolicies(options)
    this.primaryTextureSource=freezeCanonicalPrimaryTexturePolicy(options)
    this.authorPrimaryTextureSource=freezeCanonicalAuthorPrimaryTexturePolicy(options)
    this.imagePipePolicies=freezeCanonicalImagePipePolicies(options)
    this.seededPolicies=freezeCanonicalSeededDefaultAutoPolicies(options)
    this.imageMaterialPolicies=freezeCanonicalImageMaterialPolicies(options)
    this.pixelMaskedPolicies=freezeCanonicalPixelMaskedPolicies(options)
    this.plainAutoGeometryPolicies=freezeCanonicalPlainAutoGeometryPolicies(options)
    this.primaryGrainPolicies=freezeCanonicalPrimaryGrainPolicies(options)
    this.autoSources=freezeCanonicalAutoPolicies(options.autoSources)
    this.storage = options.storage; this.operator = options.operator
    this.maxGestures = options.maxGestures; this.variants = new Set(options.alphaDarkenVariants)
  }

  get size(): number { return this.gestures.size }

  /** Called only after authentication, using that principal, never payload userId.
   * Validates all settings/CAS/permission before changing binder state. No pin,
   * relay, DB write, RNG, geometry execution or descriptor mutation occurs. */
  beginGesture(identity: CanonicalAdmissionIdentity, input: CanonicalGestureBegin): TrustedCanonicalGesture {
    const prepared = this.prepareBeginGesture(identity, input)
    prepared.commit()
    return prepared.grant
  }

  /** Transport pins the verified brush between prepare and commit, synchronously.
   * A failed pin publishes no grant. No await/reentrant binder call is allowed. */
  captureBeginInput(identity:CanonicalAdmissionIdentity,input:CanonicalGestureBegin):CanonicalGestureBegin {
    if(input&&typeof input==='object'&&('texturePhase'in input||'sourceScale'in input||'textureGradient'in input||'sourceColorFields'in input||'sourceRoleTextureInputs'in input||'sourceTipGradient'in input)){
      const names=['layerId','brush','strokeId','pigmentRgb8','outerResourceOpacity','alphaDarken',...'texturePhase'in input?['texturePhase']:[],...'sourceScale'in input?['sourceScale']:[],...'textureGradient'in input?['textureGradient']:[],...'sourceColorFields'in input?['sourceColorFields']:[],...'sourceRoleTextureInputs'in input?['sourceRoleTextureInputs']:[],...'sourceTipGradient'in input?['sourceTipGradient']:[]]
      if(![Object.prototype,null].includes(Object.getPrototypeOf(input))||Reflect.ownKeys(input).length!==names.length)fail('invalid phase gesture fields')
      const own:Record<string,unknown>=Object.create(null)
      for(const name of names){const d=Object.getOwnPropertyDescriptor(input,name);if(!d||!Object.hasOwn(d,'value'))fail('invalid phase gesture accessor');own[name]=d.value}
      const texturePhase='texturePhase'in own?captureCanonicalSavedTexturePhase(own.texturePhase):undefined,sourceScale='sourceScale'in own?canonicalSourceScale(own.sourceScale):undefined,textureGradient='textureGradient'in own?canonicalTextureGradientRGBA(own.textureGradient):undefined,sourceColorFields='sourceColorFields'in own?canonicalSourceColorFields(own.sourceColorFields):undefined,sourceRoleTextureInputs='sourceRoleTextureInputs'in own?canonicalSourceRoleTexturesInput(own.sourceRoleTextureInputs):undefined,sourceTipGradient='sourceTipGradient'in own?canonicalSourceTipGradient(own.sourceTipGradient):undefined,rgb=own.pigmentRgb8
      if(!Array.isArray(rgb)||Object.getPrototypeOf(rgb)!==Array.prototype||Reflect.ownKeys(rgb).length!==4||Object.getOwnPropertyDescriptor(rgb,'length')?.value!==3)fail('invalid phase pigment')
      const channel=(index:number):number=>{const d=Object.getOwnPropertyDescriptor(rgb,String(index));if(!d||!Object.hasOwn(d,'value')||!Number.isInteger(d.value)||d.value<0||d.value>255)fail('invalid phase pigment');return d.value}
      if(!validIdentity(identity)||!text(own.layerId)||!text(own.brush)||!text(own.strokeId)||typeof own.outerResourceOpacity!=='number'||!Number.isFinite(own.outerResourceOpacity)||own.outerResourceOpacity<0||own.outerResourceOpacity>1||own.alphaDarken!=='creamy'&&own.alphaDarken!=='hard'||!this.variants.has(own.alphaDarken))fail('invalid phase gesture resources')
      const pigmentRgb8=Object.freeze([channel(0),channel(1),channel(2)] as const)
      if(!this.authorizedBoard(identity,own.layerId))fail('board or paint permission unavailable')
      return Object.freeze({layerId:own.layerId,brush:own.brush,strokeId:own.strokeId,pigmentRgb8,outerResourceOpacity:own.outerResourceOpacity,alphaDarken:own.alphaDarken,...texturePhase?{texturePhase}:{},...sourceScale!==undefined?{sourceScale}:{},...textureGradient?{textureGradient}:{},...sourceColorFields?{sourceColorFields}:{},...sourceRoleTextureInputs?{sourceRoleTextureInputs}:{},...sourceTipGradient?{sourceTipGradient}:{}})
    }
    if (!validIdentity(identity) || !input || Object.keys(input).length !== 6
      || !['layerId', 'brush', 'strokeId', 'pigmentRgb8', 'outerResourceOpacity', 'alphaDarken'].every(k => Object.hasOwn(input, k))
      || !text(input.layerId) || !text(input.brush) || !text(input.strokeId)
      || !Array.isArray(input.pigmentRgb8) || input.pigmentRgb8.length !== 3 || !input.pigmentRgb8.every(v => Number.isInteger(v) && v >= 0 && v <= 255)
      || !Number.isFinite(input.outerResourceOpacity) || input.outerResourceOpacity < 0 || input.outerResourceOpacity > 1
      || !this.variants.has(input.alphaDarken)) fail('invalid gesture resource settings')
    if (!this.authorizedBoard(identity, input.layerId)) fail('board or paint permission unavailable')
    return Object.freeze({...input,pigmentRgb8:Object.freeze([...input.pigmentRgb8] as [number,number,number])})
  }

  prepareBeginGesture(identity:CanonicalAdmissionIdentity,input:CanonicalGestureBegin):{readonly grant:TrustedCanonicalGesture;readonly commit:()=>void} {
    return this.prepareGesture(identity,this.captureBeginInput(identity,input),this.authorProfile,false)
  }

  /** Caller supplies the bounded actual verified DB prefix, never a socket
   * profile selector. ROOM pin is the sole descriptor authority on resume. */
  prepareResumeGesture(identity:CanonicalAdmissionIdentity,input:CanonicalGestureBegin,prefix:{readonly operations:readonly CanonicalStrokeOperation[];readonly rows:readonly CanonicalStoredOperationRow[]}):{readonly grant:TrustedCanonicalGesture;readonly commit:()=>void} {
    const captured=this.captureBeginInput(identity,input),ops=prefix.operations,rows=prefix.rows
    if(!Array.isArray(ops)||ops.length<1||!Array.isArray(rows)||rows.length!==ops.length)fail('invalid stored resume prefix')
    verifyCanonicalOperationRow(identity.roomId,ops[0],rows[0])
    const profile=ops[0].frame.rasterProfile
    if(!this.recordedProfiles.includes(profile))fail('stored resume profile policy mismatch')
    let lastSeq=0,bytes=0
    for(let i=0;i<ops.length;i++){
      const op:CanonicalStrokeOperation=ops[i]
      if(i>0)verifyCanonicalOperationRow(identity.roomId,op,rows[i])
      if(op.userId!==identity.userId||op.layerId!==captured.layerId||op.seq!<=lastSeq||op.frame.frameOrdinal!==i
        ||op.frame.brush!==captured.brush||op.frame.strokeId!==captured.strokeId||op.frame.rasterProfile!==profile
        ||op.frame.pigmentRgb8.some((v,j)=>v!==captured.pigmentRgb8[j])||op.frame.composition.alphaDarken!==captured.alphaDarken
        ||op.frame.composition.outerResourceOpacity!==captured.outerResourceOpacity||!Object.is(op.frame.sourceScale,captured.sourceScale)||!isDeepStrictEqual(op.frame.textureGradient,captured.textureGradient)||!isDeepStrictEqual(op.frame.sourceTipGradient,captured.sourceTipGradient)||!isDeepStrictEqual(op.frame.sourceColorFields,captured.sourceColorFields)||!isDeepStrictEqual(op.frame.sourceRoleTextures?sourceRoleTextureInputsFromPins(canonicalSourceRoleTexturesData(op.frame.sourceRoleTextures)):undefined,captured.sourceRoleTextureInputs))fail('stored resume resources changed')
      bytes+=Buffer.byteLength(JSON.stringify(op),'utf8')
      if(bytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)fail('stored resume prefix byte budget exceeded')
      lastSeq=op.seq!
    }
    return this.prepareGesture(identity,captured,profile,true,{version:recordedMaterialVersion(ops[0].frame),flags:recordedMaterialFlags(ops[0].frame)})
  }

  /** Streamed resume starts from an ACTUAL first indexed row. The Transport
   * must validate/hydrate every subsequent prefix row before committing this
   * ticket. This helper grants nothing from a caller-provided summary. */
  prepareIndexedResumeGesture(identity:CanonicalAdmissionIdentity,input:CanonicalGestureBegin,first:CanonicalStrokeOperation,row:CanonicalStoredOperationRow):{readonly grant:TrustedCanonicalGesture;readonly commit:()=>void}{
    const captured=this.captureBeginInput(identity,input)
    verifyCanonicalOperationRow(identity.roomId,first,row)
    const profile=first.frame.rasterProfile
    if(!this.recordedProfiles.includes(profile)||first.userId!==identity.userId||first.layerId!==captured.layerId||first.frame.frameOrdinal!==0
      ||first.frame.brush!==captured.brush||first.frame.strokeId!==captured.strokeId
      ||first.frame.pigmentRgb8.some((value,index)=>value!==captured.pigmentRgb8[index])
      ||first.frame.composition.alphaDarken!==captured.alphaDarken||first.frame.composition.outerResourceOpacity!==captured.outerResourceOpacity||!Object.is(first.frame.sourceScale,captured.sourceScale)||!isDeepStrictEqual(first.frame.textureGradient,captured.textureGradient)||!isDeepStrictEqual(first.frame.sourceTipGradient,captured.sourceTipGradient)||!isDeepStrictEqual(first.frame.sourceColorFields,captured.sourceColorFields)||!isDeepStrictEqual(first.frame.sourceRoleTextures?sourceRoleTextureInputsFromPins(canonicalSourceRoleTexturesData(first.frame.sourceRoleTextures)):undefined,captured.sourceRoleTextureInputs))fail('stored indexed resume resources changed')
    return this.prepareGesture(identity,captured,profile,true,{version:recordedMaterialVersion(first.frame),flags:recordedMaterialFlags(first.frame)})
  }

  private prepareGesture(identity:CanonicalAdmissionIdentity,input:CanonicalGestureBegin,profile:CanonicalStrokeRasterProfile,roomOnly:boolean,resume?:Readonly<{version:number;flags:number}>):{readonly grant:TrustedCanonicalGesture;readonly commit:()=>void} {
    const current=this.authorizedBoard(identity,input.layerId)
    if(!current)fail('board or paint permission unavailable')
    const identityKey = key(identity, input.strokeId)
    const previous = this.gestures.get(identityKey)
    if (previous) {
      if(previous.pipeSource&&!this.imagePipePolicies.authorImagePipeSources.includes(previous.pipeSource))fail('image pipe author policy disabled')
      const g = previous.grant
      const savedScale='version'in g.material&&(g.material.version===2||g.material.version===8)&&g.material.scaledSource?g.material.primarySource.brushScale:undefined
      if(!Object.is(input.sourceScale,savedScale))fail('immutable gesture source scale changed')
      const savedTipGradient='version'in g.material&&(g.material.version===2||g.material.version===8)?canonicalSourceMaterialTipGradient(g.material):undefined
      if(!isDeepStrictEqual(input.sourceTipGradient,savedTipGradient))fail('immutable gesture tip gradient changed')
      const savedGradient='version'in g.material&&g.material.version===8&&g.material.primaryTexture.law==='pixel-color-texture-v1'&&g.material.primaryTexture.mode==='gradient'?g.material.primaryTexture.gradient:undefined
      if(!isDeepStrictEqual(input.textureGradient,savedGradient))fail('immutable gesture texture gradient changed')
      const savedColorFields='version'in g.material&&(g.material.version===2||g.material.version===8)?g.material.sourceColorFields:undefined
      if(!isDeepStrictEqual(input.sourceColorFields,savedColorFields))fail('immutable gesture spatial color changed')
      const savedRoleTextures='version'in g.material&&g.material.version===2?g.material.roleTextures:undefined
      if(!isDeepStrictEqual(input.sourceRoleTextureInputs,savedRoleTextures?sourceRoleTextureInputsFromPins(savedRoleTextures):undefined))fail('immutable gesture role texture changed')
      if(g.plainAutoGeometry==='dynamic-auto-geometry-v1'&&!this.plainAutoGeometryPolicies.authorPlainAutoGeometrySource)fail('dynamic Auto author policy disabled')
      if(g.plainAutoGeometry==='plain-auto-tilt-v1'&&!this.plainTiltPolicies.authorPlainTiltSource)fail('plain-tilt author policy disabled')
      if('version'in g.material&&g.material.version===7&&(!this.texturedAutoPolicies.authorTexturedAutoSource||!isDeepStrictEqual(input.texturePhase,g.material.primaryTexture.phase)))fail('material7 author/phase changed')
      if('version'in g.material&&g.material.version===8&&(!this.primaryGrainPolicies.authorPrimaryGrainSource||!isDeepStrictEqual(input.texturePhase,g.material.primaryTexture.phase)))fail('material8 author/phase changed')
      if(input.texturePhase&&(!('version'in g.material)||g.material.version!==7&&g.material.version!==8))fail('phase on legacy gesture')
      if('version'in g.material&&g.material.version===6&&!this.softPressureTexturedPolicies.authorSoftPressureTexturedSource)fail('material6 author policy disabled')
      if('version'in g.material&&g.material.version===5&&!this.pressureTexturedPolicies.authorPressureTexturedSource)fail('material5 author policy disabled')
      if('version'in g.material&&g.material.version===4&&!this.texturedPolicies.authorTexturedSource)fail('material4 author policy disabled')
      if('version' in g.material&&g.material.primarySource.kind==='defaultAuto'&&g.material.primarySource.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE&&!this.seededPolicies.seededDefaultAuto)fail('seeded default-auto author policy disabled')
      if (roomOnly&&g.rasterProfile!==profile || previous.board !== current.board || previous.lesson !== current.lesson || g.layerId !== input.layerId
        || g.brush !== input.brush || g.pigmentRgb8.some((v, i) => v !== input.pigmentRgb8[i])
        || g.composition.outerResourceOpacity !== input.outerResourceOpacity || g.composition.alphaDarken !== input.alphaDarken) fail('gesture already pinned with different resources or lifetime')
      return Object.freeze({ grant: g, commit: () => {
        const now = this.authorizedBoard(identity, input.layerId)
        if (!now || now.board !== previous.board || now.lesson !== previous.lesson || this.gestures.get(identityKey) !== previous) fail('stale begin ticket')
      } })
    }
    if (this.gestures.size >= this.maxGestures) fail('gesture capacity exhausted; rebuild prefix before clearing')
    const match = /^brush:([a-z0-9-]+)@([1-9][0-9]*)$/.exec(input.brush)
    if (!match || !Number.isSafeInteger(Number(match[2]))) fail('exact versioned brush required')
    const library = roomOnly?this.storage.library('rooms',identity.roomId):merge(this.operator(), this.storage.library('owners', identity.userId), this.storage.library('rooms', identity.roomId))
    const descriptor = library.brushes.find(b => b.descriptor.id === match[1] && b.descriptor.version === Number(match[2]))?.descriptor
    if (!descriptor) fail('brush unavailable')
    const pipeSource=this.assertImagePipeRole(descriptor,'author')
    const {material,mode,outerBlend,descriptorSha256,plainAutoGeometry}=this.bindDescriptor(descriptor,library,profile,'author',input.texturePhase,resume?.version,input.sourceScale!==undefined?{sourceScale:input.sourceScale}:undefined,resume?.flags,input.textureGradient,input.sourceColorFields,input.sourceRoleTextureInputs,input.sourceTipGradient)
    const boardEpoch=this.epochFor(current.board,current.lesson)
    const grant: TrustedCanonicalGesture = Object.freeze({ roomId: identity.roomId, userId: identity.userId, layerId: input.layerId,
      boardEpoch, roomRasterVersion: STRAIGHT_ROOM_RASTER_VERSION, rasterProfile: profile,
      ...plainAutoGeometry?{plainAutoGeometry}:{},descriptorSha256, brush: input.brush, strokeId: input.strokeId,
      pigmentRgb8: Object.freeze([input.pigmentRgb8[0], input.pigmentRgb8[1], input.pigmentRgb8[2]] as const),
      composition: Object.freeze({ mode, alphaDarken: input.alphaDarken,
        outerResourceOpacity: input.outerResourceOpacity, outerBlend }), material })
    let committed = false
    return Object.freeze({ grant, commit: () => {
      if (committed) return
      const now = this.authorizedBoard(identity, grant.layerId)
      if (!now || now.board !== current.board || now.lesson !== current.lesson || this.gestures.has(identityKey)
        || this.gestures.size >= this.maxGestures) fail('stale begin ticket')
      this.gestures.set(identityKey, { ...current, grant,pipeSource }); committed = true
    } })
  }

  /** Internal read preparation only. Caller must establish current board read
   * permission and capture/recheck board/lesson/storage lifetime across its own
   * awaits. The row MUST originate from the authoritative loader/DB, never a
   * client echo. Cross-checking equal objects alone cannot establish provenance.
   * Does not pin, import, publish a BEGIN grant, or mutate admission/session maps. */
  readRecordedCapability(input:{readonly roomId:string;readonly boardEpoch:number;readonly operation:CanonicalStrokeOperation;readonly row:CanonicalStoredOperationRow;readonly bindingScope?:RecordedReadBindingScope}):CanonicalRecordedCapability {
    const {roomId,boardEpoch,operation:op,row}=input
    if(!text(roomId)||!Number.isSafeInteger(boardEpoch)||boardEpoch<0||boardEpoch>=Number.MAX_SAFE_INTEGER)fail('invalid recorded read context')
    verifyCanonicalOperationRow(roomId,op,row)
    return this.bindRecordedOperation(roomId,boardEpoch,op,input.bindingScope)
  }

  /** Internal scalar fold. Actual indexed visitor/old array adapter owns row
   * provenance and id uniqueness; this is not a source/read/append grant. */
  createRecordedPrefixFold(input:{readonly roomId:string;readonly boardEpoch:number;readonly anchor?:CanonicalStrokeOperation;readonly row?:CanonicalStoredOperationRow;readonly purpose:'read'|'undo-redo';readonly bindingScope?:RecordedReadBindingScope}) {return this.foldRecordedPrefix(input,false)}
  /** Original indexed stream only; limits belong to each page, not the total prefix. */
  createIndexedRecordedPrefixFold(input:{readonly roomId:string;readonly boardEpoch:number;readonly anchor?:CanonicalStrokeOperation;readonly row?:CanonicalStoredOperationRow;readonly purpose:'read'|'undo-redo';readonly bindingScope?:RecordedReadBindingScope}) {return this.foldRecordedPrefix(input,true)}
  private foldRecordedPrefix(input:{readonly roomId:string;readonly boardEpoch:number;readonly anchor?:CanonicalStrokeOperation;readonly row?:CanonicalStoredOperationRow;readonly purpose:'read'|'undo-redo';readonly bindingScope?:RecordedReadBindingScope},indexed:boolean,seed?:RecordedFoldSeed):Readonly<RecordedSourceFold> {
    const {roomId,boardEpoch,anchor,purpose,row}=input
    if(purpose!=='read'&&purpose!=='undo-redo')fail('invalid recorded prefix purpose')
    const bindRow=(operation:CanonicalStrokeOperation,row:CanonicalStoredOperationRow)=>this.readRecordedCapability({roomId,boardEpoch,operation,row,bindingScope:input.bindingScope})
    let bound=seed?.source??(anchor?(row?this.readRecordedCapability({roomId,boardEpoch,operation:anchor,row,bindingScope:input.bindingScope}):this.readResidentRecordedCapability({roomId,boardEpoch,operation:anchor})):undefined)
    let requiredAnchor=anchor
    let state=seed?.state??CANONICAL_MATERIAL_PREFIX_START,bytes=0,anchored=!anchor,firstOperationId=seed?.firstOperationId??'',lastOperationId=seed?.lastOperationId??'',firstSeq=seed?.firstSeq??0,lastSeq=seed?.lastSeq??0,endSeq=seed?.endSeq,closed=false,failed=false
    let closeSeal=seed?.closeSeal
    const resolver=this
    const summary=()=>Object.freeze({...state,recordedNext:state.nextOrdinal,firstOperationId,lastOperationId,firstSeq,lastSeq,...endSeq===undefined?{}:{endSeq}})
    const assert=(receiver:unknown)=>{if(receiver!==fold||closed||failed)fail('recorded prefix fold owner changed')}
    const fold:RecordedSourceFold={
      fork(this:unknown){
        assert(this)
        if(!indexed||!bound||!anchored||!state.nextOrdinal)fail('indexed source fold fork unavailable')
        return resolver.foldRecordedPrefix({roomId,boardEpoch,purpose},true,{source:bound,state,firstOperationId,lastOperationId,firstSeq,lastSeq,...endSeq===undefined?{}:{endSeq},...closeSeal?{closeSeal}:{}})
      },
      accept(this:unknown,operation:CanonicalStrokeOperation|import('@grafetto/shared').RecordedCanonicalStrokeCloseOperation,row:CanonicalStoredOperationRow):undefined {
        assert(this)
        try{
        if(operation.type==='canonical_stroke_close'){
          if(!bound||!state.nextOrdinal||closeSeal||!('version'in bound.material)||(bound.material.version!==2&&bound.material.version!==3&&bound.material.version!==4&&bound.material.version!==5&&bound.material.version!==6&&bound.material.version!==7&&bound.material.version!==8))fail('recorded close V1 source read unsupported')
          const close=projectCanonicalIndexedCloseOperation(roomId,row),op=parseCanonicalStrokeCloseOperation(operation)
          if(!isDeepStrictEqual(close.operation,op)||op.id===firstOperationId||op.id===lastOperationId)fail('recorded close immutable identity changed')
          bytes+=close.bytes;if(!indexed&&bytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)fail('recorded prefix close byte capacity exceeded')
          closeSeal=verifyCanonicalRecordedClose(summary(),{userId:bound.originalUserId,layerId:bound.layerId,strokeId:bound.strokeId},op)
          return undefined
        }
        if(closeSeal||!indexed&&state.nextOrdinal>=CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)fail('recorded prefix closure unavailable')
        const normalized=projectCanonicalIndexedOperation(roomId,row),op=normalized.operation
        if(!isDeepStrictEqual(op,operation))fail('recorded prefix projected identity changed')
        bound??=bindRow(op,row)
        if(op.userId!==bound.originalUserId||op.layerId!==bound.layerId||op.seq!<=lastSeq)fail('recorded prefix immutable identity changed')
        bytes+=normalized.bytes;if(!indexed&&bytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)fail('recorded prefix byte capacity exceeded')
        const common={rasterProfile:bound.rasterProfile,brush:bound.brush,strokeId:bound.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:bound.pigmentRgb8,composition:bound.composition}
        const decoded=bound.material.version===8?decodeCanonicalPrimaryGrainStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(bound.rasterProfile),materialVersion:8,material:bound.material}):bound.material.version===7?decodeCanonicalTexturedAutoStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(bound.rasterProfile),materialVersion:7,material:bound.material}):bound.material.version===6?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(bound.rasterProfile),materialVersion:6,material:bound.material}):bound.material.version===5?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(bound.rasterProfile),materialVersion:5,material:bound.material}):bound.material.version===4?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(bound.rasterProfile),materialVersion:4,material:bound.material}):bound.material.version===3?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,materialVersion:3,material:bound.material}):decodeCanonicalStrokeFrame(op.frame,{...common,material:bound.material})
        if(decoded.frame.masked&&!(bound.material.version===2&&bound.material.maskSource&&bound.material.maskingBlend))fail('recorded masked prefix unavailable')
        state=advanceCanonicalMaterialPrefix(state,op.frame.frameOrdinal,decoded.frame)
        if(!firstOperationId){firstOperationId=op.id;firstSeq=op.seq!}
        lastOperationId=op.id;lastSeq=op.seq!;if(state.ended)endSeq=op.seq!
        if(requiredAnchor&&op.id===requiredAnchor.id){if(!isDeepStrictEqual(op,requiredAnchor))fail('recorded prefix anchor changed');anchored=true;requiredAnchor=undefined}
        return undefined
        }catch(error){failed=true;throw error}
      },
      /** Indexed owner may retain one OPEN carry, not prior rows/pages. The
       * checkpoint is DATA only and cannot restore/copy a fold or mint a grant. */
      checkpoint(this:unknown){
        assert(this)
        if(!indexed)fail('indexed prefix checkpoint unavailable')
        if(!state.nextOrdinal||!anchored)fail('recorded prefix anchor unavailable')
        return Object.freeze({...summary(),...closeSeal?{closeSeal}:{}})
      },
      finish(this:unknown){
        assert(this)
        if(!state.nextOrdinal||!anchored)fail('recorded prefix anchor unavailable')
        if(purpose==='undo-redo'&&!state.ended&&!closeSeal)fail('recorded undo prefix is open')
        closed=true
        return Object.freeze({...summary(),...closeSeal?{closeSeal}:{}})
      },
    }
    return Object.freeze(fold)
  }

  /** Compatibility reader: same bounded arrays and cross-page duplicate law. */
  readRecordedPrefix(input:{readonly roomId:string;readonly boardEpoch:number;readonly anchor:CanonicalStrokeOperation;readonly row?:CanonicalStoredOperationRow;readonly operations:readonly CanonicalStrokeOperation[];readonly rows:readonly CanonicalStoredOperationRow[];readonly purpose:'read'|'undo-redo';readonly close?:CanonicalIndexedCloseEvidence}){
    const {operations,rows}=input
    if(!Array.isArray(operations)||!operations.length||operations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings||!Array.isArray(rows)||rows.length!==operations.length)fail('recorded prefix closure unavailable')
    const fold=this.createRecordedPrefixFold(input),ids=new Set<string>()
    for(let n=0;n<operations.length;n++){
      if(ids.has(operations[n].id))fail('recorded prefix duplicate identity');ids.add(operations[n].id)
      fold.accept(operations[n],rows[n])
    }
    if(input.close){if(ids.has(input.close.operation.id))fail('recorded close immutable identity changed');fold.accept(input.close.operation,input.close.row)}
    return fold.finish()
  }

  /** Existing actual resident receipt is the provenance boundary; no row echo. */
  readResidentRecordedCapability(input:{readonly roomId:string;readonly boardEpoch:number;readonly operation:CanonicalStrokeOperation}):CanonicalRecordedCapability {
    const board=rooms.get(input.roomId)
    if(!board||!hasSucceededCanonicalWrite(board,input.operation))fail('recorded resident receipt unavailable')
    return this.bindRecordedOperation(input.roomId,input.boardEpoch,input.operation)
  }

  /** Internal caller has already checked read permission and captured lifetime.
   * Reuses the existing resident epoch owner; creates no append grant. */
  captureReadScope(roomId:string):Readonly<{roomId:string;boardEpoch:number;allowedRasterProfiles?:readonly CanonicalStrokeRasterProfile[]}> {
    const board=rooms.get(roomId)
    if(!board||board.room.rasterVersion!==STRAIGHT_ROOM_RASTER_VERSION)fail('recorded read board unavailable')
    return Object.freeze({roomId,boardEpoch:this.epochFor(board,lessonRecordOf(board)),...this.recordedProfiles.length===1&&this.recordedProfiles[0]===CANONICAL_STROKE_RASTER_PROFILE?{}:{allowedRasterProfiles:this.recordedProfiles}})
  }

  private epochFor(board:RoomRecord,lesson:RoomRecord):number {
    const previous=this.epochs.get(board)
    if(previous?.lesson===lesson)return previous.value
    if(this.nextEpoch>=Number.MAX_SAFE_INTEGER)fail('resident epoch exhausted')
    const value=this.nextEpoch++;this.epochs.set(board,{lesson,value});return value
  }

  private bindRecordedOperation(roomId:string,boardEpoch:number,op:CanonicalStrokeOperation,bindingScope?:RecordedReadBindingScope):CanonicalRecordedCapability {
    if(!text(roomId)||!Number.isSafeInteger(boardEpoch)||boardEpoch<0||boardEpoch>=Number.MAX_SAFE_INTEGER)fail('invalid recorded read context')
    const board=rooms.get(roomId)
    if(!board||board.room.rasterVersion!==STRAIGHT_ROOM_RASTER_VERSION)fail('recorded read board unavailable')
    const match=/^brush:([a-z0-9-]+)@([1-9][0-9]*)$/.exec(op.frame.brush)
    if(!match||!Number.isSafeInteger(Number(match[2])))fail('exact versioned recorded brush required')
    const profile=op.frame.rasterProfile
    if(!this.recordedProfiles.includes(profile))fail('recorded raster profile policy mismatch')
    const selector={brush:op.frame.brush,profile,phase:recordedTexturePhase(op.frame),version:recordedMaterialVersion(op.frame),scale:recordedSourceScale(op.frame),flags:recordedMaterialFlags(op.frame),gradient:recordedTextureGradient(op.frame),fields:recordedSourceColorFields(op.frame),roleInputs:recordedRoleTextureInputs(op.frame),tipGradient:recordedSourceTipGradient(op.frame)}
    // Only copied closed selector DATA reaches the cache key; no unknown input
    // getters are walked by JSON serialization. Signed zero remains distinct.
    const copied=privateRecordedBindingCopy(selector),cacheKey=copied?JSON.stringify(copied,(_key,value:unknown)=>typeof value==='number'&&Object.is(value,-0)?{$negativeZero:true}:value):undefined
    const state=bindingScope?this.recordedBindingState(bindingScope,roomId,boardEpoch):undefined,revision=state?.revision
    let bound=state&&cacheKey?state.entries.get(cacheKey)?.bound:undefined
    if(!bound){
      // Read ONLY the durable room pin. No operator/personal source authority.
      const library=this.storage.library('rooms',roomId)
      const descriptor=library.brushes.find(b=>b.descriptor.id===match[1]&&b.descriptor.version===Number(match[2]))?.descriptor
      if(!descriptor)fail('recorded room brush pin unavailable')
      if(!descriptor.sourceStamp||((descriptor.sourceStamp.version===1||descriptor.sourceStamp.source.kind==='image')&&!this.primaryImageSource))fail('recorded V1 material delivery unavailable')
      this.assertImagePipeRole(descriptor,'recorded',selector.flags)
      bound=this.bindDescriptor(descriptor,library,profile,'recorded',selector.phase,selector.version,selector.scale,selector.flags,selector.gradient,selector.fields,selector.roleInputs,selector.tipGradient)
      if(state&&cacheKey&&bindingScope){
        const current=this.recordedBindingState(bindingScope,roomId,boardEpoch)
        if(current!==state||state.revision!==revision)fail('recorded catalog changed during binding')
        const bytes=Buffer.byteLength(cacheKey,'utf8')+Buffer.byteLength(JSON.stringify(bound),'utf8')+256
        if(bytes<=CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes){const owned=privateRecordedBindingCopy(bound)
          if(owned){
            while(state.entries.size>=64||state.bytes+bytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes){const oldest=state.entries.keys().next().value;if(oldest===undefined)break;state.bytes-=state.entries.get(oldest)!.bytes;state.entries.delete(oldest)}
            state.entries.set(cacheKey,{bound:owned,bytes});state.bytes+=bytes;bound=owned
          }
        }
      }
    }else if(state&&cacheKey){const entry=state.entries.get(cacheKey)!;state.entries.delete(cacheKey);state.entries.set(cacheKey,entry)}
    const {material,mode,outerBlend,descriptorSha256,plainAutoGeometry}=bound
    if(!('version' in material))fail('recorded V1 material delivery unavailable')
    if(!this.variants.has(op.frame.composition.alphaDarken)||op.frame.composition.mode!==mode)fail('recorded composition policy mismatch')
    const common={rasterProfile:profile,brush:op.frame.brush,strokeId:op.frame.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:op.frame.pigmentRgb8,composition:{...op.frame.composition,mode,outerBlend}}
    const decoded=material.version===8?decodeCanonicalPrimaryGrainStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(profile),materialVersion:8,material}):material.version===7?decodeCanonicalTexturedAutoStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(profile),materialVersion:7,material}):material.version===6?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(profile),materialVersion:6,material}):material.version===5?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(profile),materialVersion:5,material}):material.version===4?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(profile),materialVersion:4,material}):material.version===3?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,materialVersion:3,material}):decodeCanonicalStrokeFrame(op.frame,{...common,material})
    if(decoded.frame.masked&&!(material.version===2&&material.maskSource&&material.maskingBlend))fail('recorded masked material unavailable')
    if(plainAutoGeometry==='dynamic-auto-geometry-v1')assertCanonicalDynamicAutoGeometryFrame(decoded.frame)
    else if(plainAutoGeometry)assertCanonicalPlainAutoGeometryFrame(decoded.frame)
    return Object.freeze({roomId,originalUserId:op.userId,operationId:op.id,sequence:op.seq!,layerId:op.layerId,boardEpoch,
      descriptorSha256,brush:decoded.envelope.brush,strokeId:decoded.envelope.strokeId,rasterProfile:profile,
      pigmentRgb8:decoded.envelope.pigmentRgb8,composition:decoded.envelope.composition,material})
  }

  /** Prepare ONE bounded atomic history attachment. Rows are the canonical
   * subsequence of operations, in delivery order, from the authoritative loader.
   * Same read-permission/lifetime preconditions as readRecordedCapability.
   * Dictionary/interner exists only during this synchronous serialization. */
  prepareRecordedAttachment(input:{readonly roomId:string;readonly boardEpoch:number;readonly operations:readonly Operation[];readonly rows:readonly CanonicalStoredOperationRow[]},bindingScope?:RecordedReadBindingScope):CanonicalRecordedAttachmentV8 {
    const {roomId,boardEpoch,operations,rows}=input
    if(!Array.isArray(operations)||operations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings||!Array.isArray(rows)||rows.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)fail('recorded attachment capacity exceeded')
    let rowIndex=0
    const attachment=this.projectRecordedAttachment({roomId,boardEpoch,operations},op=>{
      const row=rows[rowIndex++]
      verifyCanonicalOperationRow(roomId,op,row??null)
      return ()=>this.readRecordedCapability({roomId,boardEpoch,operation:op,row,bindingScope})
    })
    if(rowIndex!==rows.length)fail('recorded attachment row closure mismatch')
    return attachment
  }

  /** Transient delivery may combine exact resident receipts with actual rows
   * recovered by the SAME replay query. A row never mints a resident receipt. */
  prepareMixedRecordedAttachment(input:{readonly roomId:string;readonly boardEpoch:number;readonly operations:readonly Operation[];readonly rows:readonly CanonicalStoredOperationRow[]}):CanonicalRecordedAttachmentV8 {
    if(!Array.isArray(input.rows)||input.rows.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)fail('recorded attachment row capacity exceeded')
    const rows=new Map<string,CanonicalStoredOperationRow>()
    for(const row of input.rows){if(!row||rows.has(row.id))fail('duplicate recorded attachment row');rows.set(row.id,row)}
    const attachment=this.projectRecordedAttachment(input,op=>{
      const row=rows.get(op.id)
      if(row){rows.delete(op.id);verifyCanonicalOperationRow(input.roomId,op,row);return ()=>this.readRecordedCapability({roomId:input.roomId,boardEpoch:input.boardEpoch,operation:op,row})}
      const board=rooms.get(input.roomId)
      if(!board||!hasSucceededCanonicalWrite(board,op))fail('recorded resident receipt unavailable')
      return ()=>this.readResidentRecordedCapability({roomId:input.roomId,boardEpoch:input.boardEpoch,operation:op})
    })
    if(rows.size)fail('recorded attachment row closure mismatch')
    return attachment
  }

  prepareResidentRecordedAttachment(input:{readonly roomId:string;readonly boardEpoch:number;readonly operations:readonly Operation[]}):CanonicalRecordedAttachmentV8 {
    return this.projectRecordedAttachment(input,op=>{
      const board=rooms.get(input.roomId)
      if(!board||!hasSucceededCanonicalWrite(board,op))fail('recorded resident receipt unavailable')
      return ()=>this.readResidentRecordedCapability({roomId:input.roomId,boardEpoch:input.boardEpoch,operation:op})
    })
  }

  private projectRecordedAttachment(input:{readonly roomId:string;readonly boardEpoch:number;readonly operations:readonly Operation[]},authority:(op:CanonicalStrokeOperation)=>()=>CanonicalRecordedCapability):CanonicalRecordedAttachmentV8 {
    const {roomId,boardEpoch,operations}=input
    if(!Array.isArray(operations)||operations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)fail('recorded attachment capacity exceeded')
    const capabilities:CanonicalRecordedReadCapabilityV8[]=[],bindings:CanonicalRecordedAttachmentV1['bindings'][number][]=[],dictionary=new Map<string,number>()
    for(const op of operations){
      if(op.type!=='canonical_stroke')continue
      const read=authority(op)
      if(!text(op.userId)||!op.frame||!text(op.frame.strokeId))fail('invalid recorded attachment identity')
      const identity=JSON.stringify([op.userId,op.frame.strokeId])
      let index=dictionary.get(identity)
      if(index===undefined){
        if(capabilities.length>=CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities)fail('recorded attachment capability capacity exceeded')
        const c=read()
        const common={layerId:c.layerId,brush:c.brush,strokeId:c.strokeId,boardEpoch:c.boardEpoch,descriptorSha256:c.descriptorSha256,
          rasterProfile:c.rasterProfile,pigmentRgb8:c.pigmentRgb8,composition:c.composition,assets:c.material.assets}
        const snapshot=c.material.version===8?canonicalStandaloneStrokeSnapshotV8({...common,materialVersion:8,material:c.material},c.boardEpoch,c.rasterProfile):c.material.version===7?canonicalStrokeSnapshotV7({...common,materialVersion:7,material:c.material},c.boardEpoch,c.rasterProfile):c.material.version===6?canonicalStrokeSnapshotV6({...common,materialVersion:6,material:c.material},c.boardEpoch,c.rasterProfile):c.material.version===5?canonicalStrokeSnapshotV5({...common,materialVersion:5,material:c.material},c.boardEpoch,c.rasterProfile):c.material.version===4?canonicalStrokeSnapshotV4({...common,materialVersion:4,material:c.material},c.boardEpoch,c.rasterProfile):c.material.version===3?canonicalStrokeSnapshotV3({...common,materialVersion:3,material:c.material},c.boardEpoch,c.rasterProfile):Object.freeze({...common,materialVersion:2 as const,material:c.material})
        index=capabilities.length;capabilities.push(Object.freeze({originalUserId:c.originalUserId,snapshot}));dictionary.set(identity,index)
      }
      bindings.push(Object.freeze({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:index}))
    }
    const attachment=Object.freeze({version:1 as const,roomId,boardEpoch,capabilities:Object.freeze(capabilities),bindings:Object.freeze(bindings)})
    // Shared validation checks every frame against its FIRST bound immutable
    // gesture capability, including later identity/resource changes and limits.
    prepareCanonicalRecordedAttachmentV8(attachment,operations,{roomId,boardEpoch,allowedRasterProfiles:this.recordedProfiles})
    return attachment
  }

  private assertImagePipeRole(descriptor:BrushDescriptor,role:'author'|'recorded',recordedFlags=0):CanonicalImagePipeSource|undefined {
    const animation=descriptor.tip.animation
    if(!animation)return
    if(animation.mode==='native-dimensions-v1'||descriptor.texture&&descriptor.sourceStamp?.textureOption||(role==='author'?this.imageMaterialPolicies.authorImageMaterialSource:!!(recordedFlags&8)&&this.imageMaterialPolicies.imageMaterialSource)){
      const allowed=descriptor.texture?(role==='author'?this.primaryGrainPolicies.authorPrimaryGrainSource:this.primaryGrainPolicies.primaryGrainSource):(role==='author'?this.imageMaterialPolicies.authorImageMaterialSource:this.imageMaterialPolicies.imageMaterialSource)
      if(!allowed)fail('Pixel image pipe '+role+' policy disabled')
      return
    }
    const mode=animation.mode==='incremental'?'incremental-inverse-gray-v2':animation.mode==='random'?'random-inverse-gray-v2':undefined
    const allowed=role==='author'?this.imagePipePolicies.authorImagePipeSources:this.imagePipePolicies.allowedRecordedImagePipeSources
    if(!mode||!allowed.includes(mode))fail('image pipe '+role+' policy disabled')
    return mode
  }

  private bindDescriptor(descriptor:BrushDescriptor,library:BrushLibrary,profile:CanonicalStrokeRasterProfile,role:'author'|'recorded',phase?:CanonicalResolvedTexturePhase,recordedVersion?:number,options?:CanonicalSourceScaleOptions,recordedFlags=0,textureGradient?:CanonicalTextureGradientRGBA,sourceColorFields?:CanonicalSourceColorFields,sourceRoleTextureInputs?:CanonicalSourceRoleTexturesInput,sourceTipGradient?:CanonicalSourceTipGradient):ReturnType<CanonicalBrushCapabilityResolver['bindOriginalDescriptor']> {
    const fields=canonicalSourceColorFieldsForDescriptor(descriptor,sourceColorFields)
    if(sourceRoleTextureInputs&&(!descriptor.behavior?.dual||!this.primaryGrainPolicies.primaryGrainSource||role==='author'&&!this.primaryGrainPolicies.authorPrimaryGrainSource))fail('role texture source policy unavailable')
    if(recordedVersion!==undefined&&!!sourceRoleTextureInputs!==!!(recordedFlags&512))fail('role texture recorded law changed')
    if(recordedVersion!==undefined&&!!fields!==!!(recordedFlags&256))fail('spatial color recorded law changed')
    let bound=this.bindOriginalDescriptor(descriptor,library,profile,role,phase,recordedVersion,options,recordedFlags,textureGradient,sourceRoleTextureInputs,sourceTipGradient,fields)
    const actualTipGradient='version'in bound.material&&(bound.material.version===2||bound.material.version===8)?canonicalSourceMaterialTipGradient(bound.material):undefined
    if(!isDeepStrictEqual(sourceTipGradient,actualTipGradient))fail('tip gradient input differs from original material')
    const outerLaw=canonicalPixelSourceOuterCompositionLaw(bound)
    const expectedOuterFlags=outerLaw==='browser-hsy-rgba8-functional-v1'?1024:outerLaw==='generic-separable-u8-v1'?2048:outerLaw==='pixel-direct-composite-browser-v1'?4096:0
    if(recordedVersion!==undefined&&(recordedFlags&(1024|2048|4096))!==expectedOuterFlags)fail('recorded outer composition law changed')
    if(outerLaw){
      const material=bound.material
      if(!('version'in material)||(material.version!==2&&material.version!==8))fail('outer composition requires named Pixel material')
      if(outerLaw==='pixel-direct-composite-browser-v1'&&profile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)fail('incremental composition requires browser raster')
      bound={...bound,material:material.version===2?canonicalSourceMaterialContext({...material,outerCompositionLaw:outerLaw}):canonicalPrimaryGrainMaterialContext({...material,outerCompositionLaw:outerLaw})}
    }
    if(!fields)return bound
    const base=bound.material
    if(!('version'in base)||(base.version!==2&&base.version!==8))fail('spatial color requires Pixel source material')
    const assets=[...base.assets]
    for(const asset of canonicalSourceColorFieldAssets(fields,library.assets.map(({id,size})=>({id,size})))){
      const previous=assets.find(a=>a.id===asset.id)
      if(previous&&!canonicalSourceAssetStorageCompatible([base.primarySource,...base.version===2&&base.maskSource?[base.maskSource]:[]],previous,asset))fail('spatial paint resource crop collision')
      if(!previous)assets.push(asset)
      this.storage.asset(asset.id.slice(6),asset.size)
    }
    if(base.version===8){
      const index=assets.findIndex(a=>a.id===base.primaryTexture.asset)
      if(index<0)fail('spatial texture pattern missing')
      const [pattern]=assets.splice(index,1)
      if(!pattern)fail('spatial texture pattern missing')
      assets.push(pattern)
    }
    const material=base.version===2?canonicalSourceMaterialContext({...base,sourceColorFields:fields,assets}):canonicalPrimaryGrainMaterialContext({...base,sourceColorFields:fields,assets})
    return {...bound,material}
  }

  private bindOriginalDescriptor(descriptor:BrushDescriptor,library:BrushLibrary,profile:CanonicalStrokeRasterProfile,role:'author'|'recorded',phase?:CanonicalResolvedTexturePhase,recordedVersion?:number,options?:CanonicalSourceScaleOptions,recordedFlags=0,textureGradient?:CanonicalTextureGradientRGBA,sourceRoleTextureInputs?:CanonicalSourceRoleTexturesInput,sourceTipGradient?:CanonicalSourceTipGradient,sourceColorFields?:CanonicalSourceColorFields):{material:CanonicalTrustedMaterialContext;mode:'wash'|'buildup';outerBlend:TrustedCanonicalGesture['composition']['outerBlend'];descriptorSha256:string;plainAutoGeometry?:'plain-auto-tilt-v1'|'dynamic-auto-geometry-v1'} {
    if(textureGradient!==undefined&&(!phase||descriptor.texture?.application?.mode!=='gradient'))fail('unexpected texture gradient input')
    const scaleOptions=captureCanonicalSourceScaleOptions(options)
    if(!isSourceStampData(descriptor.sourceStamp))fail('invalid or missing retained source data')
    const extendedEffects=role==='author'?this.primaryGrainPolicies.authorPrimaryGrainSource||this.plainAutoGeometryPolicies.authorPlainAutoGeometrySource||this.pixelMaskedPolicies.authorPixelMaskedSource||this.imageMaterialPolicies.authorImageMaterialSource:this.primaryGrainPolicies.primaryGrainSource||this.plainAutoGeometryPolicies.plainAutoGeometrySource||this.pixelMaskedPolicies.pixelMaskedSource||this.imageMaterialPolicies.imageMaterialSource
    const unsupportedOuter = extendedEffects?canonicalPixelSourceEffectReject(descriptor,profile):canonicalSourceEffectReject(descriptor,profile)
    if (unsupportedOuter) fail((profile===CANONICAL_STROKE_RASTER_PROFILE?'unsupported canonical Over execution: ':'unsupported canonical execution: ')+unsupportedOuter)
    const descriptorSha256 = createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
    const composition=(extendedEffects?canonicalPixelSourceComposition(descriptor,profile):canonicalSourceComposition(descriptor,profile))!
    if(composition.outerBlend==='erase'){
      const enabled=role==='author'
        ?this.imageMaterialPolicies.authorImageMaterialSource||this.plainAutoGeometryPolicies.authorPlainAutoGeometrySource||this.pixelMaskedPolicies.authorPixelMaskedSource||this.primaryGrainPolicies.authorPrimaryGrainSource
        :this.imageMaterialPolicies.imageMaterialSource||this.plainAutoGeometryPolicies.plainAutoGeometrySource||this.pixelMaskedPolicies.pixelMaskedSource||this.primaryGrainPolicies.primaryGrainSource
      if(!enabled)fail('Pixel erase requires negotiated extended source policy')
    }
    let material:CanonicalTrustedMaterialContext, mode:'wash'|'buildup',plainAutoGeometry:'plain-auto-tilt-v1'|'dynamic-auto-geometry-v1'|undefined
    const budget=Object.freeze({workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels})
    // New texture8 carries one captured source and a neutral texture law. The
    // saved wire selector chooses history; current AUTHOR policy cannot upgrade7.
    if(phase&&descriptor.sourceStamp.textureOption&&(recordedVersion!==undefined?recordedVersion===8&&!!(recordedFlags&(32|128)):!!this.primaryGrainPolicies.primaryGrainSource&&!!this.primaryGrainPolicies.authorPrimaryGrainSource)){
      if(!this.primaryGrainPolicies.primaryGrainSource||role==='author'&&!this.primaryGrainPolicies.authorPrimaryGrainSource)fail('Pixel texture source policy disabled')
      if(!canonicalStrokeRasterContract(profile).genericSC||descriptor.sourceStamp.version!==2)fail('Pixel texture raster/source unavailable')
      const kind=descriptor.sourceStamp.version===2?descriptor.sourceStamp.source.kind:'image'
      const configured=kind==='defaultAuto'?this.autoSources.defaultAuto:kind==='gaussianAuto'?this.autoSources.gaussianAuto:kind==='softAuto'?this.autoSources.softAuto:undefined
      if(kind!=='image'&&!configured)fail('Pixel texture Auto family unavailable')
      if(kind==='image'&&!this.primaryImageSource)fail('Pixel texture image family unavailable')
      const binding=canonicalPixelTextureSourceBinding(descriptor,descriptorSha256,library.assets,configured?configured.coverageProfile:'browser-number-coverage-v1',profile,1,scaleOptions)
      for(const asset of binding.assets)this.storage.asset(asset.id.slice(6),asset.size)
      const material=canonicalPixelTextureMaterialContext(binding,phase,budget,(textureGradient||sourceTipGradient||sourceColorFields)?{...textureGradient?{textureGradient}:{},...sourceTipGradient?{sourceTipGradient}:{},...sourceColorFields?{sourceColorFields,sourceColorAvailable:library.assets.map(({id,size})=>({id,size}))}:{}}:undefined)
      return {material,mode:binding.composition.mode,outerBlend:binding.composition.outerBlend,descriptorSha256}
    }
    if(!descriptor.texture&&!descriptor.behavior?.dual&&(descriptor.sourceStamp.version===1||descriptor.sourceStamp.source.kind==='image')&&this.imageMaterialPolicies.imageMaterialSource&&(recordedVersion!==undefined?(!descriptor.tip.animation||!!(recordedFlags&8)):!!this.imageMaterialPolicies.authorImageMaterialSource)){
      if(!canonicalStrokeRasterContract(profile).genericSC||phase)fail('Pixel image raster/phase unavailable')
      const binding=canonicalPixelImageSourceBinding(descriptor,descriptorSha256,library.assets,profile,1,scaleOptions)
      for(const asset of binding.assets)this.storage.asset(asset.id.slice(6),asset.size)
      return {material:canonicalPixelImageMaterialContext(binding,budget,(sourceTipGradient||sourceColorFields)?{...sourceTipGradient?{sourceTipGradient}:{},...sourceColorFields?{sourceColorFields,sourceColorAvailable:library.assets.map(({id,size})=>({id,size}))}:{}}:undefined),mode:binding.composition.mode,outerBlend:binding.composition.outerBlend,descriptorSha256}
    }
    if(descriptor.tip.material&&!descriptor.behavior?.dual){
      if(!this.imageMaterialPolicies.imageMaterialSource||role==='author'&&!this.imageMaterialPolicies.authorImageMaterialSource)fail('image material source policy disabled')
      if(!canonicalStrokeRasterContract(profile).genericSC||phase||descriptor.behavior?.dual)fail('image material profile/phase unavailable')
      // Current public input stores RGB; foreground alpha remains one and the
      // independent resource opacity is retained in the BEGIN composition.
      const binding=descriptor.tip.material.kind==='lightness'
        ?canonicalLightnessImageSourceBinding(descriptor,descriptorSha256,library.assets,1,scaleOptions)
        :canonicalColorImageSourceBinding(descriptor,descriptorSha256,library.assets,1,scaleOptions)
      for(const asset of binding.assets)this.storage.asset(asset.id.slice(6),asset.size)
      const material=binding.kind==='lightness-image-program-v1'
        ?canonicalLightnessImageMaterialContext(binding,budget):canonicalColorImageMaterialContext(binding,budget)
      return {material,mode:composition.mode,outerBlend:composition.outerBlend,descriptorSha256}
    }
    if(descriptor.behavior?.dual){
      if(!this.pixelMaskedPolicies.pixelMaskedSource||role==='author'&&!this.pixelMaskedPolicies.authorPixelMaskedSource)fail('Pixel masked source policy disabled')
      if(!canonicalStrokeRasterContract(profile).genericSC||phase)fail('masked Pixel profile/phase unavailable')
      const data=extractCanonicalPixelDualSourceData(descriptor,library.assets,scaleOptions,profile)
      if(!data.supported)fail('unsupported Pixel masking source: '+data.reasons.join(','))
      const assets=new Map<string,CanonicalMaterialAsset>()
      const imageSources:CanonicalMaterialContextV2['primarySource'][]=[]
      const pinRole=(r:typeof data.primary|typeof data.mask,slot:0|1):CanonicalMaterialContextV2['primarySource']=>{
        const d=r.data,identity={descriptorId:r.descriptor.id,descriptorVersion:r.descriptor.version,descriptorSha256}
        if(d.version===2&&d.source.kind!=='image'){
          const kind=d.source.kind,configured=kind==='defaultAuto'?this.autoSources.defaultAuto:kind==='gaussianAuto'?this.autoSources.gaussianAuto:this.autoSources.softAuto
          if(!configured||!canonicalStrokeCoverageMatches(profile,configured.coverageProfile))fail('masked Auto source profile unavailable')
          const coverageProfile=d.source.randomness!==0||d.source.density!==1?CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE:configured.coverageProfile
          if(d.source.kind==='defaultAuto'){
            if(coverageProfile==='scalar-bionic-f64-fma-v1')fail('Default mask numeric profile mismatch')
            return canonicalDefaultAutoSourcePin({kind:'defaultAuto',...identity,...canonicalDefaultAutoStatic(d.source,r.effectiveBrushScale,d.brush.angle,coverageProfile),coverageProfile})
          }
          if(d.source.kind==='gaussianAuto'){
            if(coverageProfile==='scalar-f64-fma-v1')fail('Gaussian mask numeric profile mismatch')
            return canonicalGaussianAutoSourcePin({kind:'gaussianAuto',...identity,...canonicalGaussianAutoStatic(d.source,r.effectiveBrushScale,d.brush.angle,coverageProfile),coverageProfile})
          }
          if(coverageProfile==='scalar-bionic-f64-fma-v1')fail('Soft mask numeric profile mismatch')
          const compiled=d.compiled
          if(compiled?.version!==2||!compiled.radialCurve)fail('masked Soft radial program unavailable')
          return canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:slot,...identity,source:d.source,brushScale:r.effectiveBrushScale,brushAngle:d.brush.angle,coverageProfile,reader:d.reader,compilerProfile:compiled.profile,buildId:compiled.buildId,radialCurve:compiled.radialCurve})
        }
        if(!this.primaryImageSource||!r.imageSource||!r.imageAssets)fail('masked image source unavailable')
        for(const asset of r.imageAssets){const previous=assets.get(asset.id);if(previous&&!canonicalSourceAssetStorageCompatible([...imageSources,r.imageSource],previous,asset))fail('masked image crop collision');if(!previous)assets.set(asset.id,asset);this.storage.asset(asset.id.slice(6),asset.size)}
        imageSources.push(r.imageSource)
        return r.imageSource
      }
      const primarySource=pinRole(data.primary,0),maskSource=pinRole(data.mask,1)
      const baseMaterial=canonicalMaskedSourceMaterialContext({version:2,...(recordedVersion!==undefined?!!(recordedFlags&8):'imageSource'in data.primary||'imageSource'in data.mask)?{imageFrameIndices:'source-image-pipe-frame-v1'}:{},...scaleOptions.sourceScale!==undefined?{scaledSource:'source-scale-v1'}:{},...(hasActiveSourceMaterialOptions(data.primary.data)||hasActiveSourceMaterialOptions(data.mask.data))?{materialParams:'source-material-parameters-v1'}:{},...[data.primary.data,data.mask.data].some(d=>sourceColorRecording(d))?{colorParams:[data.primary.data,data.mask.data].some(d=>sourceColorRecording(d)==='source-pigment-rgba8-v1')?'source-pigment-rgba8-v1':'source-pigment-rgb8-v1'}:{},assets:[...assets.values()],primarySource,maskSource,maskingBlend:data.blendMode,budget})
      const binding=canonicalPixelDualSourceBinding(descriptor,descriptorSha256,baseMaterial,scaleOptions,library.assets.map(({id,size})=>({id,size})),profile)
      const material=canonicalPixelDualSourceMaterialContext(binding,sourceRoleTextureInputs,(sourceTipGradient||sourceColorFields)?{...sourceTipGradient?{sourceTipGradient}:{},...sourceColorFields?{sourceColorFields,sourceColorAvailable:library.assets.map(({id,size})=>({id,size}))}:{}}:undefined)
      for(const asset of material.assets)this.storage.asset(asset.id.slice(6),asset.size)
      return {material,mode:composition.mode,outerBlend:composition.outerBlend,descriptorSha256}
    }
    if(scaleOptions.sourceScale!==undefined&&phase)fail('scaled source requires neutral Pixel texture')
    if(descriptor.texture?.application?.mode==='multiply'&&(role==='author'||recordedVersion===8)){
      if(!this.primaryGrainPolicies.primaryGrainSource||role==='author'&&!this.primaryGrainPolicies.authorPrimaryGrainSource)fail('primary grain source policy disabled')
      if(!phase||profile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)fail('primary grain phase/profile unavailable')
      const primary=library.assets.find(a=>a.id===descriptor.tip.mask),pattern=library.assets.find(a=>a.id===descriptor.texture?.id)
      if(!primary||!pattern)fail('primary grain CAS metadata unavailable')
      const binding=canonicalPrimaryGrainImageSourceBinding(descriptor,descriptorSha256,{primary:{id:primary.id,size:primary.size},pattern:{id:pattern.id,size:pattern.size}},profile)
      this.storage.asset(primary.id.slice(6),primary.size);this.storage.asset(pattern.id.slice(6),pattern.size)
      const material=canonicalPrimaryGrainImageMaterialContext(binding,phase,budget)
      return {material,mode:binding.composition.mode,outerBlend:binding.composition.outerBlend,descriptorSha256}
    }
    if(phase!==undefined){
      if(role==='recorded'&&recordedVersion!==7)fail('recorded texture material version unavailable')
      if(!this.texturedAutoPolicies.texturedAutoSource)fail('material7 consumer disabled')
      if(role==='author'&&!this.texturedAutoPolicies.authorTexturedAutoSource)fail('material7 author policy disabled')
      material4Raster(profile)
      if(!(composition.mode==='wash'||composition.mode==='buildup'&&composition.outerBlend==='over'))fail('material7 composition unavailable')
      const kind=descriptor.sourceStamp.source?.kind
      const configured=kind==='defaultAuto'?this.autoSources.defaultAuto:kind==='gaussianAuto'?this.autoSources.gaussianAuto:kind==='softAuto'?this.autoSources.softAuto:undefined
      if(!configured)fail('textured-auto family policy disabled')
      const pattern=library.assets.find(a=>a.id===descriptor.texture?.id)
      if(!pattern)fail('textured-auto pattern metadata unavailable')
      const binding=canonicalTexturedAutoProgramBinding(descriptor,descriptorSha256,configured.coverageProfile,{id:pattern.id,size:pattern.size},profile)
      if(binding.source.brushScale!==1||binding.source.kind==='defaultAuto'&&binding.source.source.density!==1)fail('unsupported textured-auto stored scale/density')
      // Actual storage verifies original CAS bytes; no payload/library echo is authority.
      this.storage.asset(pattern.id.slice(6),pattern.size)
      const material=assertTexturedAutoProgramContext(binding,{version:7,assets:[binding.patternAsset],primarySource:binding.source,primaryTexture:{...binding.textureGeometry,strength:'recorded-grain-v1',phase},budget})
      return {material,mode:composition.mode,outerBlend:composition.outerBlend,descriptorSha256}
    }
    if(descriptor.sourceStamp.compiled?.version===4){
      if(!this.softPressureTexturedPolicies.softPressureTexturedSource)fail('material6 consumer disabled')
      if(role==='author'&&!this.softPressureTexturedPolicies.authorSoftPressureTexturedSource)fail('material6 author policy disabled')
      material4Raster(profile)
      const configured=this.autoSources.softAuto
      if(!configured)fail('pressure soft-auto source policy disabled')
      const pattern=library.assets.find(a=>a.id===descriptor.texture?.id)
      if(!pattern)fail('pressure soft-auto pattern metadata unavailable')
      const semantic=extractCanonicalSoftAutoNativeDefaultTextureProgramData(descriptor,{pattern:{id:pattern.id,size:pattern.size}})
      if(!semantic.supported)fail(semantic.reasons.join(','))
      const pin=canonicalSoftAutoNativeDefaultTextureSourceBinding(descriptor,descriptorSha256,configured.coverageProfile,{id:pattern.id,size:pattern.size},profile)
      if(pin.brushScale!==1)fail('unsupported stored auto scale')
      this.storage.asset(pattern.id.slice(6),pattern.size)
      const texture=descriptor.texture!
      const primaryTexture=canonicalPressureCurvePrimaryTexturePin({kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:texture.patternSize!.width,height:texture.patternSize!.height,periodX:texture.periodPx,periodY:texture.periodPx,offsetX:texture.offset!.x,offsetY:texture.offset!.y,strength:'source-pressure-curve-v1'},[semantic.patternAsset])
      const material=canonicalSoftNativeDefaultTexturedSourceMaterialContext({version:6,assets:[semantic.patternAsset],primarySource:pin,primaryTexture,budget})
      return {material,mode:composition.mode,outerBlend:composition.outerBlend,descriptorSha256}
    }
    if(descriptor.sourceStamp.compiled?.version===3){
      if(!this.pressureTexturedPolicies.pressureTexturedSource)fail('material5 consumer disabled')
      if(role==='author'&&!this.pressureTexturedPolicies.authorPressureTexturedSource)fail('material5 author policy disabled')
      material4Raster(profile)
      const configured=this.autoSources.defaultAuto
      if(!configured)fail('pressure default-auto source policy disabled')
      const pattern=library.assets.find(a=>a.id===descriptor.texture?.id)
      if(!pattern)fail('pressure default-auto pattern metadata unavailable')
      const semantic=extractCanonicalDefaultAutoPressureTextureProgramData(descriptor,{pattern:{id:pattern.id,size:pattern.size}})
      if(!semantic.supported)fail(semantic.reasons.join(','))
      const pin=canonicalDefaultAutoPressureTextureSourceBinding(descriptor,descriptorSha256,configured.coverageProfile,{id:pattern.id,size:pattern.size},profile)
      if(pin.brushScale!==1)fail('unsupported stored auto scale')
      this.storage.asset(pattern.id.slice(6),pattern.size)
      const texture=descriptor.texture!
      const primaryTexture=canonicalPressureCurvePrimaryTexturePin({kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:texture.patternSize!.width,height:texture.patternSize!.height,periodX:texture.periodPx,periodY:texture.periodPx,offsetX:texture.offset!.x,offsetY:texture.offset!.y,strength:'source-pressure-curve-v1'},[semantic.patternAsset])
      const material=canonicalPressureTexturedSourceMaterialContext({version:5,assets:[semantic.patternAsset],primarySource:pin,primaryTexture,budget})
      return {material,mode:composition.mode,outerBlend:composition.outerBlend,descriptorSha256}
    }
    if(descriptor.sourceStamp.version===2&&descriptor.sourceStamp.source.kind==='defaultAuto'&&descriptor.sourceStamp.flags.textureEnabled){
      if(!this.texturedPolicies.texturedSource)fail('material4 consumer disabled')
      if(role==='author'&&!this.texturedPolicies.authorTexturedSource)fail('material4 author policy disabled')
      material4Raster(profile)
      const configured=this.autoSources.defaultAuto
      if(!configured)fail('fixed default-auto source policy disabled')
      const pattern=library.assets.find(a=>a.id===descriptor.texture?.id)
      if(!pattern)fail('fixed default-auto pattern metadata unavailable')
      const semantic=extractCanonicalDefaultAutoFixedTextureCapability(descriptor,{pattern:{id:pattern.id,size:pattern.size}})
      if(!semantic.supported)fail(semantic.reasons.join(','))
      if(!hasCanonicalSourceCurvePrograms(descriptor.sourceStamp))fail('retained native curve programs unavailable')
      const pin=canonicalDefaultAutoFixedTextureSourceBinding(descriptor,descriptorSha256,configured.coverageProfile,{id:pattern.id,size:pattern.size},profile)
      if(pin.brushScale!==1)fail('unsupported stored auto scale')
      this.storage.asset(pattern.id.slice(6),pattern.size)
      const material=canonicalTexturedSourceMaterialContext({version:4,assets:[semantic.capability.patternAsset],primarySource:pin,primaryTexture:semantic.capability.primaryTexture,budget})
      return {material,mode:semantic.capability.mode,outerBlend:composition.outerBlend,descriptorSha256}
    }
    if(descriptor.sourceStamp.version===2 && (descriptor.sourceStamp.source.kind==='defaultAuto'||descriptor.sourceStamp.source.kind==='gaussianAuto'||descriptor.sourceStamp.source.kind==='softAuto')){
      const kind=descriptor.sourceStamp.source.kind
      // Historical fixed/plain author behavior is unchanged. This previously
      // client-unsupported geometry frontier now has an explicit server floor.
      const data=descriptor.sourceStamp
      const dynamic=!!this.plainAutoGeometryPolicies.plainAutoGeometrySource&&!data.flags.textureEnabled&&canonicalStrokeRasterContract(profile).genericSC
      if(dynamic){
        if(!(composition.mode==='wash'||composition.mode==='buildup'&&(composition.outerBlend==='over'||composition.outerBlend==='erase')))fail('plain dynamic Auto composition unavailable')
        if(role==='author'){
          if(!this.plainAutoGeometryPolicies.authorPlainAutoGeometrySource)fail('dynamic Auto author policy disabled')
          const capability=extractCanonicalDynamicAutoGeometryData(descriptor,undefined,library.assets.map(({id,size})=>({id,size})))
          if(!capability.supported)fail('unsupported dynamic Auto source: '+capability.reasons.join(','))
        }
        plainAutoGeometry='dynamic-auto-geometry-v1'
      }
      const frontier=data.compiled?.version===2&&kind==='defaultAuto'&&data.source.kind==='defaultAuto'&&data.source.density===1&&!data.flags.textureEnabled&&data.options.some(o=>o.checked&&(['Ratio','Rotation'].includes(o.id)||o.id==='Size'&&o.useCurve&&(o.sensors.length!==1||o.sensors[0].id!=='pressure')))
      const recordedPlain=role==='recorded'&&kind==='defaultAuto'&&data.source.kind==='defaultAuto'&&data.source.density===1&&!data.flags.textureEnabled&&!!this.plainTiltPolicies.plainTiltSource&&canonicalStrokeRasterContract(profile).genericSC
      if(!dynamic&&frontier&&role==='author'){
        const capability=extractCanonicalPlainAutoTiltGeometryData(descriptor)
        if(!capability.supported)fail('unsupported plain-tilt geometry: '+capability.reasons.join(','))
        if(!this.plainTiltPolicies.authorPlainTiltSource)fail('plain-tilt author policy disabled')
        if(!canonicalStrokeRasterContract(profile).genericSC)fail('plain-tilt raster unavailable')
        plainAutoGeometry='plain-auto-tilt-v1'
      }else if(!dynamic&&frontier&&!recordedPlain)fail('plain-tilt recorded policy disabled')
      // Recorded geometry never executes descriptor options. Bind the SAME
      // room-pinned static source/SHA with the existing kernel/cost validators.
      // No known-author-program classifier or compiler is called on this path.
      const recordedDefault=()=>{
        if(data.source.kind!=='defaultAuto'||data.brush.scale!==1)fail('unsupported recorded plain-tilt source')
        const configured=this.autoSources.defaultAuto
        if(!configured||!canonicalStrokeCoverageMatches(profile,configured.coverageProfile))fail('plain-tilt recorded source/profile disabled')
        const stat=canonicalDefaultAutoStatic(data.source,data.brush.scale,data.brush.angle,configured.coverageProfile)
        plainAutoGeometry='plain-auto-tilt-v1'
        return canonicalDefaultAutoSourcePin({kind:'defaultAuto',descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256,...stat,coverageProfile:configured.coverageProfile})
      }
      const dynamicPolicy=kind==='defaultAuto'?this.autoSources.defaultAuto:kind==='gaussianAuto'?this.autoSources.gaussianAuto:this.autoSources.softAuto
      const pin=dynamic?dynamicPolicy?canonicalDynamicAutoSourceBinding(descriptor,descriptorSha256,dynamicPolicy.coverageProfile,profile,scaleOptions,library.assets.map(({id,size})=>({id,size}))):fail('dynamic Auto source family disabled'):recordedPlain?recordedDefault():kind==='softAuto'
        ? this.autoSources.softAuto ? canonicalSoftAutoSourceBinding(descriptor,descriptorSha256,this.autoSources.softAuto.coverageProfile,0,profile) : fail('soft-auto execution policy disabled')
        : kind==='defaultAuto'
        ? descriptor.sourceStamp.source.density<1
          ? (role==='author'?this.seededPolicies.seededDefaultAuto:this.seededPolicies.recordedSeededDefaultAutoProfile) ? canonicalDefaultAutoSourceBinding(descriptor,descriptorSha256,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,profile) : fail('seeded default-auto '+role+' policy disabled')
          : this.autoSources.defaultAuto ? canonicalDefaultAutoSourceBinding(descriptor,descriptorSha256,this.autoSources.defaultAuto.coverageProfile,profile) : fail('default-auto execution policy disabled')
        : this.autoSources.gaussianAuto ? canonicalGaussianAutoSourceBinding(descriptor,descriptorSha256,this.autoSources.gaussianAuto.coverageProfile,profile) : fail('Gaussian execution policy disabled')
      const savedMode=composition.mode
      if(!savedMode)fail('inconsistent-source-painting-mode')
      if(scaleOptions.sourceScale!==undefined&&!dynamic)fail('scaled source requires dynamic Pixel policy')
      if(!dynamic&&pin.brushScale!==1)fail('unsupported stored auto scale')
      mode=savedMode
      material=Object.freeze({version:2,...dynamic&&scaleOptions.sourceScale!==undefined?{scaledSource:'source-scale-v1' as const}:{},...dynamic&&hasActiveSourceMaterialOptions(data)?{materialParams:'source-material-parameters-v1' as const}:{},...dynamic&&sourceColorRecording(data)?{colorParams:sourceColorRecording(data)}:{},assets:Object.freeze([]),primarySource:pin,budget})
    }else{
      if(scaleOptions.sourceScale!==undefined)fail('scaled image requires negotiated Pixel image source')
      // Retained IMAGE data1 is independent of the explicitly selected wire material V2.
      // primaryImageSource is also the shared base-V2 gate required by the pipe-role freezer.
      if(profile!==CANONICAL_STROKE_RASTER_PROFILE&&(!this.primaryImageSource||profile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))fail(this.primaryImageSource?'image V2 raster profile unavailable':'V1 material requires historical raster profile')
      if(descriptor.sourceStamp.flags.textureEnabled){
        if(!this.primaryTextureSource)fail('unsupported-material-consumer')
        if(role==='author'&&!this.authorPrimaryTextureSource)fail('primary texture author policy disabled')
        if(profile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)fail('primary texture raster profile unavailable')
        const primary=library.assets.find(a=>a.id===descriptor.tip.mask),pattern=library.assets.find(a=>a.id===descriptor.texture?.id)
        if(!primary||!pattern)fail('primary texture CAS metadata unavailable')
        const result=extractCanonicalPrimaryTextureCapability(descriptor,{primary:{id:primary.id,size:primary.size},pattern:{id:pattern.id,size:pattern.size}})
        if(!result.supported)fail(result.reasons.join(','))
        if(!hasCanonicalSourceCurvePrograms(descriptor.sourceStamp))fail('retained native curve programs unavailable')
        this.storage.asset(primary.id.slice(6),primary.size);this.storage.asset(pattern.id.slice(6),pattern.size)
        const c=result.capability
        material=canonicalPrimaryTextureMaterialContext({version:3,assets:[c.asset,c.patternAsset],primarySource:{kind:'image',asset:c.asset.id,brushScale:c.brushScale,brushAngle:c.brushAngle},primaryTexture:c.primaryTexture,budget})
        return {material,mode:c.mode,outerBlend:composition.outerBlend,descriptorSha256}
      }
      if(descriptor.tip.animation){
        this.assertImagePipeRole(descriptor,role)
        if(!hasCanonicalSourceCurvePrograms(descriptor.sourceStamp))fail('retained native curve programs unavailable')
        const binding=canonicalImagePipeSourceBinding(descriptor,library.assets)
        if(binding.assets.length>16)fail('trusted pipe asset capacity exceeded')
        for(const asset of binding.assets)this.storage.asset(asset.id.slice(6),asset.size)
        const savedMode=composition.mode;if(!savedMode)fail('inconsistent-source-painting-mode')
        return {material:Object.freeze({version:2 as const,...binding,budget}),mode:savedMode,outerBlend:composition.outerBlend,descriptorSha256}
      }
      const asset=library.assets.find(a=>a.id===descriptor.tip.mask)
      if(!asset)fail('source CAS metadata unavailable')
      const result=extractCanonicalSinglePngCapability(descriptor,asset)
      if(!result.supported)fail(result.reasons.join(','))
      if(!hasCanonicalSourceCurvePrograms(descriptor.sourceStamp!))fail('retained native curve programs unavailable')
      this.storage.asset(asset.id.slice(6),asset.size)
      const capability=result.capability
      const preflightDefinition:CanonicalMaterialContext['preflightDefinition']=(recipe,source)=>{
        if(recipe.brushScale!==capability.brushScale||recipe.brushAngle!==capability.brushAngle)fail('source brush geometry changed')
        return canonicalMaterialGeometryCost(recipe,source)
      }
      mode=capability.mode
      material=this.primaryImageSource?Object.freeze({version:2 as const,...canonicalImageSourceBinding(descriptor,asset),budget}):Object.freeze({assets:Object.freeze([capability.asset]),primaryAsset:asset.id,preflightDefinition,budget})
    }
    return {material,mode,outerBlend:composition.outerBlend,descriptorSha256,...plainAutoGeometry?{plainAutoGeometry}:{}}
  }

  /** Transport-only durable indexed END retirement. Exact grant identity prevents
   * a copied/stale reference from deleting a later admitted gesture. */
  retireGesture(grant:TrustedCanonicalGesture):boolean {
    const id=key(grant,grant.strokeId),pinned=this.gestures.get(id)
    if(!pinned||pinned.grant!==grant)return false
    this.gestures.delete(id)
    return true
  }

  /** Trusted lifetime close only, paired with admission.clearRoom. Caller must
   * reconstruct persisted prefixes before accepting the same stroke IDs again. */
  clearRoom(roomId: string): void {
    for (const [id, pinned] of this.gestures) if (pinned.grant.roomId === roomId) this.gestures.delete(id)
  }

  private authorizedBoard(identity: CanonicalAdmissionIdentity, layerId: string): { board: RoomRecord; lesson: RoomRecord } | undefined {
    const board = rooms.get(identity.roomId)
    if (!board || board.room.id !== identity.roomId || board.room.rasterVersion !== STRAIGHT_ROOM_RASTER_VERSION) return undefined
    let lesson: RoomRecord
    try { lesson = lessonRecordOf(board) } catch { return undefined }
    if (canonicalPaintRejectReason(board, lesson, identity.userId, layerId) !== null) return undefined
    return { board, lesson }
  }
}
function validIdentity(identity: CanonicalAdmissionIdentity): boolean {
  return !!identity && text(identity.roomId) && text(identity.userId)
}

function material4Raster(profile:CanonicalStrokeRasterProfile){
 const contract=canonicalStrokeRasterContract(profile)
 if(!contract.genericSC)fail('material4 composition profile unavailable')
 return contract.profile
}

function recordedRoleTextureInputs(frame:CanonicalStrokeOperation['frame']):CanonicalSourceRoleTexturesInput|undefined {
 const field=Object.getOwnPropertyDescriptor(frame,'sourceRoleTextures')
 if(!field){if('sourceRoleTextures'in frame)fail('inherited role texture');return}
 if(!Object.hasOwn(field,'value'))fail('role texture accessor')
 return sourceRoleTextureInputsFromPins(canonicalSourceRoleTexturesData(field.value))
}

function recordedSourceColorFields(frame:CanonicalStrokeOperation['frame']):CanonicalSourceColorFields|undefined {
 const field=Object.getOwnPropertyDescriptor(frame,'sourceColorFields')
 if(!field){if('sourceColorFields'in frame)fail('inherited spatial color');return}
 if(!Object.hasOwn(field,'value'))fail('spatial color accessor')
 return canonicalSourceColorFields(field.value)
}

function recordedTextureGradient(frame:CanonicalStrokeOperation['frame']):CanonicalTextureGradientRGBA|undefined {
 const field=Object.getOwnPropertyDescriptor(frame,'textureGradient')
 if(!field){if('textureGradient'in frame)fail('inherited texture gradient');return}
 if(!Object.hasOwn(field,'value'))fail('texture gradient accessor')
 return canonicalTextureGradientRGBA(field.value)
}

/** Header selector only; full canonical base64/bytes remain codec-validated. */
function recordedMaterialFlags(frame:CanonicalStrokeOperation['frame']):number {
 const field=Object.getOwnPropertyDescriptor(frame,'materialPacked')
 if(!field||!Object.hasOwn(field,'value')||typeof field.value!=='string'||field.value.length>CANONICAL_MATERIAL_LIMITS.textBytes)return fail('recorded material header unavailable')
 const bytes=Buffer.from(field.value.slice(2,34),'base64')
 if(bytes.length<24||bytes.toString('ascii',0,4)!=='CMAT')return fail('recorded material header unavailable')
 return bytes.readUInt16LE(14)
}

function recordedSourceScale(frame:CanonicalStrokeOperation['frame']):CanonicalSourceScaleOptions|undefined {
 const field=Object.getOwnPropertyDescriptor(frame,'sourceScale')
 if(!field){if('sourceScale'in frame)fail('inherited recorded source scale');return}
 if(!Object.hasOwn(field,'value'))fail('recorded source scale accessor')
 return Object.freeze({sourceScale:canonicalSourceScale(field.value)})
}

/** Selector is read only after the original stored row has been verified. */
function recordedMaterialVersion(frame:CanonicalStrokeOperation['frame']):number {
 const packed=Object.getOwnPropertyDescriptor(frame,'materialPacked')
 if(!packed||!Object.hasOwn(packed,'value')||typeof packed.value!=='string')fail('recorded material selector unavailable')
 const selector=/^([1-8])\|/.exec(packed.value)
 if(!selector)fail('recorded material version unavailable')
 return Number(selector[1])
}

/** Only the verified original row/envelope may supply saved random phase. */
function recordedTexturePhase(frame:CanonicalStrokeOperation['frame']):CanonicalResolvedTexturePhase|undefined {
 const phase=Object.getOwnPropertyDescriptor(frame,'texturePhase')
 const packed=Object.getOwnPropertyDescriptor(frame,'materialPacked')
 if(!packed||!Object.hasOwn(packed,'value')||typeof packed.value!=='string')fail('recorded material selector unavailable')
 if(packed.value.startsWith('7|')||packed.value.startsWith('8|')){
  if(!phase||!Object.hasOwn(phase,'value'))fail('recorded texture phase unavailable')
  return captureCanonicalSavedTexturePhase(phase.value)
 }
 if(phase||'texturePhase'in frame)fail('unexpected legacy recorded phase')
 return undefined
}

function recordedSourceTipGradient(frame:CanonicalStrokeOperation['frame']):CanonicalSourceTipGradient|undefined {
 const field=Object.getOwnPropertyDescriptor(frame,'sourceTipGradient')
 if(!field){if('sourceTipGradient'in frame)fail('inherited tip gradient');return}
 if(!Object.hasOwn(field,'value')||!(/^[28]\|/).test(frame.materialPacked))fail('unexpected tip gradient metadata')
 return canonicalSourceTipGradient(field.value)
}
