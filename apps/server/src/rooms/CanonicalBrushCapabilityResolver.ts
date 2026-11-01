import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE, verifyCanonicalRecordedClose,parseCanonicalStrokeCloseOperation,advanceCanonicalMaterialPrefix,CANONICAL_MATERIAL_PREFIX_START,type CanonicalMaterialPrefixState, CANONICAL_MATERIAL_LIMITS, CANONICAL_STROKE_RASTER_PROFILE, type CanonicalStrokeRasterProfile, STRAIGHT_ROOM_RASTER_VERSION,
  canonicalPressureTexturedSourceMaterialContext,canonicalStrokeSnapshotV5,canonicalDefaultAutoPressureTextureSourceBinding,canonicalPressureCurvePrimaryTexturePin,extractCanonicalDefaultAutoPressureTextureProgramData,type CanonicalMaterialContextV5,canonicalTexturedSourceMaterialContext,canonicalStrokeSnapshotV4,canonicalDefaultAutoFixedTextureSourceBinding,extractCanonicalDefaultAutoFixedTextureCapability,canonicalStrokeRasterContract,type CanonicalMaterialContextV4,canonicalPrimaryTextureMaterialContext,canonicalStrokeSnapshotV3,extractCanonicalPrimaryTextureCapability,type CanonicalMaterialContextV3,canonicalImageSourceBinding,canonicalImagePipeSourceBinding,canonicalSourceEffectReject, canonicalBrushDescriptorJSON, canonicalMaterialGeometryCost, isSourceStampData, extractCanonicalSinglePngCapability, hasCanonicalSourceCurvePrograms, canonicalDefaultAutoSourceBinding, canonicalGaussianAutoSourceBinding, canonicalSoftAutoSourceBinding, canonicalSourceComposition,
  type BrushDescriptor, type BrushLibrary, type CanonicalMaterialContext, type CanonicalStrokeBegin, type CanonicalStrokeOperation, type CanonicalMaterialContextV2, decodeCanonicalStrokeFrame,
  prepareCanonicalRecordedAttachment, CANONICAL_RECORDED_ATTACHMENT_LIMITS, type CanonicalRecordedAttachmentV1, type CanonicalRecordedReadCapability, type Operation,
} from '@grafetto/shared'
import { freezeCanonicalPressureTexturedPolicies,freezeCanonicalTexturedPolicies,freezeCanonicalAuthorPrimaryTexturePolicy,freezeCanonicalPrimaryTexturePolicy,freezeCanonicalSeededDefaultAutoPolicies,freezeCanonicalPrimaryImagePolicy,freezeCanonicalImagePipePolicies,type CanonicalImagePipeSource,freezeCanonicalAutoPolicies,freezeCanonicalRasterPolicy,type CanonicalRoomExecutionPolicy, type CanonicalAutoExecutionPolicies } from './canonicalExecutionPolicy.js'
import { BrushStorage, merge } from '../brushLibrary/storage.js'
import { canonicalPaintRejectReason } from './operationGate.js'
import { lessonRecordOf, rooms, type RoomRecord } from './roomRegistry.js'
import { hasSucceededCanonicalWrite } from './operationLog.js'
import { verifyCanonicalOperationRow, projectCanonicalIndexedOperation,projectCanonicalIndexedCloseOperation, type CanonicalStoredOperationRow } from './roomPersistence.js'
import type {CanonicalIndexedCloseEvidence} from './snapshotStore.js'
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
 readonly material:CanonicalMaterialContextV2|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5
}
interface RecordedFoldCheckpoint extends CanonicalMaterialPrefixState {
 readonly recordedNext:number;readonly firstOperationId:string;readonly lastOperationId:string;readonly firstSeq:number;readonly lastSeq:number
 readonly endSeq?:number;readonly closeSeal?:ReturnType<typeof verifyCanonicalRecordedClose>
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
    this.pressureTexturedPolicies=freezeCanonicalPressureTexturedPolicies(options)
    this.texturedPolicies=freezeCanonicalTexturedPolicies(options)
    this.primaryTextureSource=freezeCanonicalPrimaryTexturePolicy(options)
    this.authorPrimaryTextureSource=freezeCanonicalAuthorPrimaryTexturePolicy(options)
    this.imagePipePolicies=freezeCanonicalImagePipePolicies(options)
    this.seededPolicies=freezeCanonicalSeededDefaultAutoPolicies(options)
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
        ||op.frame.composition.outerResourceOpacity!==captured.outerResourceOpacity)fail('stored resume resources changed')
      bytes+=Buffer.byteLength(JSON.stringify(op),'utf8')
      if(bytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)fail('stored resume prefix byte budget exceeded')
      lastSeq=op.seq!
    }
    return this.prepareGesture(identity,captured,profile,true)
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
      ||first.frame.composition.alphaDarken!==captured.alphaDarken||first.frame.composition.outerResourceOpacity!==captured.outerResourceOpacity)fail('stored indexed resume resources changed')
    return this.prepareGesture(identity,captured,profile,true)
  }

  private prepareGesture(identity:CanonicalAdmissionIdentity,input:CanonicalGestureBegin,profile:CanonicalStrokeRasterProfile,roomOnly:boolean):{readonly grant:TrustedCanonicalGesture;readonly commit:()=>void} {
    const current=this.authorizedBoard(identity,input.layerId)
    if(!current)fail('board or paint permission unavailable')
    const identityKey = key(identity, input.strokeId)
    const previous = this.gestures.get(identityKey)
    if (previous) {
      if(previous.pipeSource&&!this.imagePipePolicies.authorImagePipeSources.includes(previous.pipeSource))fail('image pipe author policy disabled')
      const g = previous.grant
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
    const {material,mode,outerBlend,descriptorSha256}=this.bindDescriptor(descriptor,library,profile,'author')
    const boardEpoch=this.epochFor(current.board,current.lesson)
    const grant: TrustedCanonicalGesture = Object.freeze({ roomId: identity.roomId, userId: identity.userId, layerId: input.layerId,
      boardEpoch, roomRasterVersion: STRAIGHT_ROOM_RASTER_VERSION, rasterProfile: profile,
      descriptorSha256, brush: input.brush, strokeId: input.strokeId,
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
  readRecordedCapability(input:{readonly roomId:string;readonly boardEpoch:number;readonly operation:CanonicalStrokeOperation;readonly row:CanonicalStoredOperationRow}):CanonicalRecordedCapability {
    const {roomId,boardEpoch,operation:op,row}=input
    if(!text(roomId)||!Number.isSafeInteger(boardEpoch)||boardEpoch<0||boardEpoch>=Number.MAX_SAFE_INTEGER)fail('invalid recorded read context')
    verifyCanonicalOperationRow(roomId,op,row)
    return this.bindRecordedOperation(roomId,boardEpoch,op)
  }

  /** Internal scalar fold. Actual indexed visitor/old array adapter owns row
   * provenance and id uniqueness; this is not a source/read/append grant. */
  createRecordedPrefixFold(input:{readonly roomId:string;readonly boardEpoch:number;readonly anchor?:CanonicalStrokeOperation;readonly row?:CanonicalStoredOperationRow;readonly purpose:'read'|'undo-redo'}) {return this.foldRecordedPrefix(input,false)}
  /** Original indexed stream only; limits belong to each page, not the total prefix. */
  createIndexedRecordedPrefixFold(input:{readonly roomId:string;readonly boardEpoch:number;readonly anchor?:CanonicalStrokeOperation;readonly row?:CanonicalStoredOperationRow;readonly purpose:'read'|'undo-redo'}) {return this.foldRecordedPrefix(input,true)}
  private foldRecordedPrefix(input:{readonly roomId:string;readonly boardEpoch:number;readonly anchor?:CanonicalStrokeOperation;readonly row?:CanonicalStoredOperationRow;readonly purpose:'read'|'undo-redo'},indexed:boolean,seed?:RecordedFoldSeed):Readonly<RecordedSourceFold> {
    const {roomId,boardEpoch,anchor,purpose,row}=input
    if(purpose!=='read'&&purpose!=='undo-redo')fail('invalid recorded prefix purpose')
    const bindRow=(operation:CanonicalStrokeOperation,row:CanonicalStoredOperationRow)=>this.readRecordedCapability({roomId,boardEpoch,operation,row})
    let bound=seed?.source??(anchor?(row?this.readRecordedCapability({roomId,boardEpoch,operation:anchor,row}):this.readResidentRecordedCapability({roomId,boardEpoch,operation:anchor})):undefined)
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
          if(!bound||!state.nextOrdinal||closeSeal||!('version'in bound.material)||(bound.material.version!==2&&bound.material.version!==3&&bound.material.version!==4&&bound.material.version!==5))fail('recorded close V1 source read unsupported')
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
        const decoded=bound.material.version===5?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(bound.rasterProfile),materialVersion:5,material:bound.material}):bound.material.version===4?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(bound.rasterProfile),materialVersion:4,material:bound.material}):bound.material.version===3?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,materialVersion:3,material:bound.material}):decodeCanonicalStrokeFrame(op.frame,{...common,material:bound.material})
        if(decoded.frame.masked)fail('recorded masked prefix unavailable')
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

  private bindRecordedOperation(roomId:string,boardEpoch:number,op:CanonicalStrokeOperation):CanonicalRecordedCapability {
    if(!text(roomId)||!Number.isSafeInteger(boardEpoch)||boardEpoch<0||boardEpoch>=Number.MAX_SAFE_INTEGER)fail('invalid recorded read context')
    const board=rooms.get(roomId)
    if(!board||board.room.rasterVersion!==STRAIGHT_ROOM_RASTER_VERSION)fail('recorded read board unavailable')
    const match=/^brush:([a-z0-9-]+)@([1-9][0-9]*)$/.exec(op.frame.brush)
    if(!match||!Number.isSafeInteger(Number(match[2])))fail('exact versioned recorded brush required')
    // Read ONLY the durable room pin. Personal/operator lookup is not authority
    // for someone else's already recorded source revision.
    const library=this.storage.library('rooms',roomId)
    const descriptor=library.brushes.find(b=>b.descriptor.id===match[1]&&b.descriptor.version===Number(match[2]))?.descriptor
    if(!descriptor)fail('recorded room brush pin unavailable')
    if(!descriptor.sourceStamp||((descriptor.sourceStamp.version===1||descriptor.sourceStamp.source.kind==='image')&&!this.primaryImageSource))fail('recorded V1 material delivery unavailable')
    const profile=op.frame.rasterProfile
    if(!this.recordedProfiles.includes(profile))fail('recorded raster profile policy mismatch')
    this.assertImagePipeRole(descriptor,'recorded')
    const {material,mode,outerBlend,descriptorSha256}=this.bindDescriptor(descriptor,library,profile,'recorded')
    if(!('version' in material))fail('recorded V1 material delivery unavailable')
    if(!this.variants.has(op.frame.composition.alphaDarken)||op.frame.composition.mode!==mode)fail('recorded composition policy mismatch')
    const common={rasterProfile:profile,brush:op.frame.brush,strokeId:op.frame.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:op.frame.pigmentRgb8,composition:{...op.frame.composition,mode,outerBlend}}
    const decoded=material.version===5?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(profile),materialVersion:5,material}):material.version===4?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:material4Raster(profile),materialVersion:4,material}):material.version===3?decodeCanonicalStrokeFrame(op.frame,{...common,rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,materialVersion:3,material}):decodeCanonicalStrokeFrame(op.frame,{...common,material})
    if(decoded.frame.masked)fail('recorded masked material unavailable')
    return Object.freeze({roomId,originalUserId:op.userId,operationId:op.id,sequence:op.seq!,layerId:op.layerId,boardEpoch,
      descriptorSha256,brush:decoded.envelope.brush,strokeId:decoded.envelope.strokeId,rasterProfile:profile,
      pigmentRgb8:decoded.envelope.pigmentRgb8,composition:decoded.envelope.composition,material})
  }

  /** Prepare ONE bounded atomic history attachment. Rows are the canonical
   * subsequence of operations, in delivery order, from the authoritative loader.
   * Same read-permission/lifetime preconditions as readRecordedCapability.
   * Dictionary/interner exists only during this synchronous serialization. */
  prepareRecordedAttachment(input:{readonly roomId:string;readonly boardEpoch:number;readonly operations:readonly Operation[];readonly rows:readonly CanonicalStoredOperationRow[]}):CanonicalRecordedAttachmentV1 {
    const {roomId,boardEpoch,operations,rows}=input
    if(!Array.isArray(operations)||operations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings||!Array.isArray(rows)||rows.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)fail('recorded attachment capacity exceeded')
    let rowIndex=0
    const attachment=this.projectRecordedAttachment({roomId,boardEpoch,operations},op=>{
      const row=rows[rowIndex++]
      verifyCanonicalOperationRow(roomId,op,row??null)
      return ()=>this.readRecordedCapability({roomId,boardEpoch,operation:op,row})
    })
    if(rowIndex!==rows.length)fail('recorded attachment row closure mismatch')
    return attachment
  }

  /** Transient delivery may combine exact resident receipts with actual rows
   * recovered by the SAME replay query. A row never mints a resident receipt. */
  prepareMixedRecordedAttachment(input:{readonly roomId:string;readonly boardEpoch:number;readonly operations:readonly Operation[];readonly rows:readonly CanonicalStoredOperationRow[]}):CanonicalRecordedAttachmentV1 {
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

  prepareResidentRecordedAttachment(input:{readonly roomId:string;readonly boardEpoch:number;readonly operations:readonly Operation[]}):CanonicalRecordedAttachmentV1 {
    return this.projectRecordedAttachment(input,op=>{
      const board=rooms.get(input.roomId)
      if(!board||!hasSucceededCanonicalWrite(board,op))fail('recorded resident receipt unavailable')
      return ()=>this.readResidentRecordedCapability({roomId:input.roomId,boardEpoch:input.boardEpoch,operation:op})
    })
  }

  private projectRecordedAttachment(input:{readonly roomId:string;readonly boardEpoch:number;readonly operations:readonly Operation[]},authority:(op:CanonicalStrokeOperation)=>()=>CanonicalRecordedCapability):CanonicalRecordedAttachmentV1 {
    const {roomId,boardEpoch,operations}=input
    if(!Array.isArray(operations)||operations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)fail('recorded attachment capacity exceeded')
    const capabilities:CanonicalRecordedReadCapability[]=[],bindings:CanonicalRecordedAttachmentV1['bindings'][number][]=[],dictionary=new Map<string,number>()
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
        const snapshot=c.material.version===5?canonicalStrokeSnapshotV5({...common,materialVersion:5,material:c.material},c.boardEpoch,c.rasterProfile):c.material.version===4?canonicalStrokeSnapshotV4({...common,materialVersion:4,material:c.material},c.boardEpoch,c.rasterProfile):c.material.version===3?canonicalStrokeSnapshotV3({...common,materialVersion:3,material:c.material},c.boardEpoch,c.rasterProfile):Object.freeze({...common,materialVersion:2 as const,material:c.material})
        index=capabilities.length;capabilities.push(Object.freeze({originalUserId:c.originalUserId,snapshot}));dictionary.set(identity,index)
      }
      bindings.push(Object.freeze({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:index}))
    }
    const attachment=Object.freeze({version:1 as const,roomId,boardEpoch,capabilities:Object.freeze(capabilities),bindings:Object.freeze(bindings)})
    // Shared validation checks every frame against its FIRST bound immutable
    // gesture capability, including later identity/resource changes and limits.
    prepareCanonicalRecordedAttachment(attachment,operations,{roomId,boardEpoch,allowedRasterProfiles:this.recordedProfiles})
    return attachment
  }

  private assertImagePipeRole(descriptor:BrushDescriptor,role:'author'|'recorded'):CanonicalImagePipeSource|undefined {
    const animation=descriptor.tip.animation
    if(!animation)return
    const mode=animation.mode==='incremental'?'incremental-inverse-gray-v2':animation.mode==='random'?'random-inverse-gray-v2':undefined
    const allowed=role==='author'?this.imagePipePolicies.authorImagePipeSources:this.imagePipePolicies.allowedRecordedImagePipeSources
    if(!mode||!allowed.includes(mode))fail('image pipe '+role+' policy disabled')
    return mode
  }

  private bindDescriptor(descriptor:BrushDescriptor,library:BrushLibrary,profile:CanonicalStrokeRasterProfile,role:'author'|'recorded'):{material:CanonicalTrustedMaterialContext;mode:'wash'|'buildup';outerBlend:TrustedCanonicalGesture['composition']['outerBlend'];descriptorSha256:string} {
    if(!isSourceStampData(descriptor.sourceStamp))fail('invalid or missing retained source data')
    const unsupportedOuter = canonicalSourceEffectReject(descriptor,profile)
    if (unsupportedOuter) fail((profile===CANONICAL_STROKE_RASTER_PROFILE?'unsupported canonical Over execution: ':'unsupported canonical execution: ')+unsupportedOuter)
    const descriptorSha256 = createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
    const composition=canonicalSourceComposition(descriptor,profile)!
    let material:CanonicalTrustedMaterialContext, mode:'wash'|'buildup'
    const budget=Object.freeze({workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels})
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
      const pin=kind==='softAuto'
        ? this.autoSources.softAuto ? canonicalSoftAutoSourceBinding(descriptor,descriptorSha256,this.autoSources.softAuto.coverageProfile,0,profile) : fail('soft-auto execution policy disabled')
        : kind==='defaultAuto'
        ? descriptor.sourceStamp.source.density<1
          ? (role==='author'?this.seededPolicies.seededDefaultAuto:this.seededPolicies.recordedSeededDefaultAutoProfile) ? canonicalDefaultAutoSourceBinding(descriptor,descriptorSha256,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,profile) : fail('seeded default-auto '+role+' policy disabled')
          : this.autoSources.defaultAuto ? canonicalDefaultAutoSourceBinding(descriptor,descriptorSha256,this.autoSources.defaultAuto.coverageProfile,profile) : fail('default-auto execution policy disabled')
        : this.autoSources.gaussianAuto ? canonicalGaussianAutoSourceBinding(descriptor,descriptorSha256,this.autoSources.gaussianAuto.coverageProfile,profile) : fail('Gaussian execution policy disabled')
      const savedMode=composition.mode
      if(!savedMode)fail('inconsistent-source-painting-mode')
      if(pin.brushScale!==1)fail('unsupported stored auto scale')
      mode=savedMode
      material=Object.freeze({version:2,assets:Object.freeze([]),primarySource:pin,budget})
    }else{
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
    return {material,mode,outerBlend:composition.outerBlend,descriptorSha256}
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
