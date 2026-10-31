import { createHash } from 'node:crypto'
import {
  CANONICAL_MATERIAL_LIMITS, CANONICAL_STROKE_RASTER_PROFILE, STRAIGHT_ROOM_RASTER_VERSION,
  canonicalMaterialGeometryCost, isSourceStampData, extractCanonicalSinglePngCapability, hasCanonicalSourceCurvePrograms, canonicalDefaultAutoSourceBinding, canonicalGaussianAutoSourceBinding, canonicalSoftAutoSourceBinding, sourceStampPaintingMode, hasCanonicalOverComposition,
  type BrushDescriptor, type BrushLibrary, type AnyCanonicalMaterialContext, type CanonicalMaterialContext, type CanonicalStrokeBegin, type CanonicalStrokeOperation, type CanonicalMaterialContextV2, decodeCanonicalStrokeFrame,
  prepareCanonicalRecordedAttachment, CANONICAL_RECORDED_ATTACHMENT_LIMITS, type CanonicalRecordedAttachmentV1, type CanonicalRecordedReadCapability, type Operation,
} from '@grafetto/shared'
import { freezeCanonicalAutoPolicies, type CanonicalAutoExecutionPolicies } from './canonicalExecutionPolicy.js'
import { BrushStorage, merge } from '../brushLibrary/storage.js'
import { canonicalPaintRejectReason } from './operationGate.js'
import { lessonRecordOf, rooms, type RoomRecord } from './roomRegistry.js'
import { hasSucceededCanonicalWrite } from './operationLog.js'
import { verifyCanonicalOperationRow, type CanonicalStoredOperationRow } from './roomPersistence.js'
import type { CanonicalAdmissionIdentity, CanonicalCapabilityResolver, TrustedCanonicalGesture } from './CanonicalStrokeAdmission.js'

export type CanonicalGestureBegin = CanonicalStrokeBegin
/** Read-only attachment input for a future authoritative delivery seam.
 * Deliberately not TrustedCanonicalGesture: it cannot grant append as a peer. */
export interface CanonicalRecordedCapability {
 readonly roomId:string;readonly originalUserId:string;readonly operationId:string;readonly sequence:number;readonly layerId:string
 readonly boardEpoch:number;readonly descriptorSha256:string;readonly brush:string;readonly strokeId:string
 readonly rasterProfile:typeof CANONICAL_STROKE_RASTER_PROFILE
 readonly pigmentRgb8:readonly[number,number,number]
 readonly composition:TrustedCanonicalGesture['composition']
 readonly material:CanonicalMaterialContextV2
}
interface PinnedGesture { readonly board: RoomRecord; readonly lesson: RoomRecord; readonly grant: TrustedCanonicalGesture }
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && !v.includes('\0')
const key = (identity: CanonicalAdmissionIdentity, strokeId: string) => JSON.stringify([identity.roomId, identity.userId, strokeId])
function fail(reason: string): never { throw new Error(`canonical capability: ${reason}`) }
function normalizedDescriptor(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedDescriptor)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, normalizedDescriptor(v)]))
  return value
}

/** The implemented frame composer has one outer Over operation. Retaining a
 * source mask or author program cannot grant unsupported destination/effect law. */
function outerExecutionReject(descriptor: BrushDescriptor): string | undefined {
  const behavior = descriptor.behavior, rendering = behavior?.rendering
  if (!hasCanonicalOverComposition(descriptor)) return 'outer-composition'
  if (rendering && (rendering.mode !== 'buildUp' || rendering.opacityCeiling === 'shape' || rendering.accumulation === 'maxAlpha')) return 'stroke-rendering-mode'
  if (rendering?.gammaCorrect || rendering?.luminance) return 'color-effect'
  if (descriptor.tip.alphaThreshold) return 'mask-threshold'
  if (behavior?.wetMix || behavior?.edgeBleed || behavior?.grain || behavior?.taper) return 'brush-effect'
  return undefined
}

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
    readonly rasterProfile: typeof CANONICAL_STROKE_RASTER_PROFILE
    /** Explicit server execution/config policy, never inferred from saved KPP. */
    readonly alphaDarkenVariants: readonly ('creamy' | 'hard')[]
    readonly maxGestures: number
    readonly autoSources?:CanonicalAutoExecutionPolicies|false
  }) {
    if (!(options.storage instanceof BrushStorage) || typeof options.operator !== 'function'
      || options.rasterProfile !== CANONICAL_STROKE_RASTER_PROFILE
      || !Number.isInteger(options.maxGestures) || options.maxGestures < 1 || options.maxGestures > 1024
      || !Array.isArray(options.alphaDarkenVariants) || options.alphaDarkenVariants.length < 1 || options.alphaDarkenVariants.length > 2
      || options.alphaDarkenVariants.some(v => v !== 'creamy' && v !== 'hard')
      || new Set(options.alphaDarkenVariants).size !== options.alphaDarkenVariants.length) fail('invalid explicit execution policy')
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
  prepareBeginGesture(identity: CanonicalAdmissionIdentity, input: CanonicalGestureBegin): { readonly grant: TrustedCanonicalGesture; readonly commit: () => void } {
    if (!validIdentity(identity) || !input || Object.keys(input).length !== 6
      || !['layerId', 'brush', 'strokeId', 'pigmentRgb8', 'outerResourceOpacity', 'alphaDarken'].every(k => Object.hasOwn(input, k))
      || !text(input.layerId) || !text(input.brush) || !text(input.strokeId)
      || !Array.isArray(input.pigmentRgb8) || input.pigmentRgb8.length !== 3 || !input.pigmentRgb8.every(v => Number.isInteger(v) && v >= 0 && v <= 255)
      || !Number.isFinite(input.outerResourceOpacity) || input.outerResourceOpacity < 0 || input.outerResourceOpacity > 1
      || !this.variants.has(input.alphaDarken)) fail('invalid gesture resource settings')
    const current = this.authorizedBoard(identity, input.layerId)
    if (!current) fail('board or paint permission unavailable')
    const identityKey = key(identity, input.strokeId)
    const previous = this.gestures.get(identityKey)
    if (previous) {
      const g = previous.grant
      if (previous.board !== current.board || previous.lesson !== current.lesson || g.layerId !== input.layerId
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
    const library = merge(this.operator(), this.storage.library('owners', identity.userId), this.storage.library('rooms', identity.roomId))
    const descriptor = library.brushes.find(b => b.descriptor.id === match[1] && b.descriptor.version === Number(match[2]))?.descriptor
    if (!descriptor) fail('brush unavailable')
    const {material,mode,descriptorSha256}=this.bindDescriptor(descriptor,library)
    const boardEpoch=this.epochFor(current.board,current.lesson)
    const grant: TrustedCanonicalGesture = Object.freeze({ roomId: identity.roomId, userId: identity.userId, layerId: input.layerId,
      boardEpoch, roomRasterVersion: STRAIGHT_ROOM_RASTER_VERSION, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
      descriptorSha256, brush: input.brush, strokeId: input.strokeId,
      pigmentRgb8: Object.freeze([input.pigmentRgb8[0], input.pigmentRgb8[1], input.pigmentRgb8[2]] as const),
      composition: Object.freeze({ mode, alphaDarken: input.alphaDarken,
        outerResourceOpacity: input.outerResourceOpacity, outerBlend: 'over' as const }), material })
    let committed = false
    return Object.freeze({ grant, commit: () => {
      if (committed) return
      const now = this.authorizedBoard(identity, grant.layerId)
      if (!now || now.board !== current.board || now.lesson !== current.lesson || this.gestures.has(identityKey)
        || this.gestures.size >= this.maxGestures) fail('stale begin ticket')
      this.gestures.set(identityKey, { ...current, grant }); committed = true
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

  /** Existing actual resident receipt is the provenance boundary; no row echo. */
  readResidentRecordedCapability(input:{readonly roomId:string;readonly boardEpoch:number;readonly operation:CanonicalStrokeOperation}):CanonicalRecordedCapability {
    const board=rooms.get(input.roomId)
    if(!board||!hasSucceededCanonicalWrite(board,input.operation))fail('recorded resident receipt unavailable')
    return this.bindRecordedOperation(input.roomId,input.boardEpoch,input.operation)
  }

  /** Internal caller has already checked read permission and captured lifetime.
   * Reuses the existing resident epoch owner; creates no append grant. */
  captureReadScope(roomId:string):Readonly<{roomId:string;boardEpoch:number}> {
    const board=rooms.get(roomId)
    if(!board||board.room.rasterVersion!==STRAIGHT_ROOM_RASTER_VERSION)fail('recorded read board unavailable')
    return Object.freeze({roomId,boardEpoch:this.epochFor(board,lessonRecordOf(board))})
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
    if(descriptor.sourceStamp?.version!==2||descriptor.sourceStamp.source.kind==='image')fail('recorded V1 material delivery unavailable')
    const {material,mode,descriptorSha256}=this.bindDescriptor(descriptor,library)
    if(!('version' in material))fail('recorded V1 material delivery unavailable')
    if(!this.variants.has(op.frame.composition.alphaDarken)||op.frame.composition.mode!==mode)fail('recorded composition policy mismatch')
    const decoded=decodeCanonicalStrokeFrame(op.frame,{brush:op.frame.brush,strokeId:op.frame.strokeId,frameOrdinal:op.frame.frameOrdinal,
      pigmentRgb8:op.frame.pigmentRgb8,composition:{...op.frame.composition,mode,outerBlend:'over'},material})
    if(decoded.frame.masked)fail('recorded masked material unavailable')
    return Object.freeze({roomId,originalUserId:op.userId,operationId:op.id,sequence:op.seq!,layerId:op.layerId,boardEpoch,
      descriptorSha256,brush:decoded.envelope.brush,strokeId:decoded.envelope.strokeId,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,
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
        const snapshot=Object.freeze({layerId:c.layerId,brush:c.brush,strokeId:c.strokeId,boardEpoch:c.boardEpoch,descriptorSha256:c.descriptorSha256,
          rasterProfile:c.rasterProfile,pigmentRgb8:c.pigmentRgb8,composition:c.composition,assets:c.material.assets,materialVersion:2 as const,material:c.material})
        index=capabilities.length;capabilities.push(Object.freeze({originalUserId:c.originalUserId,snapshot}));dictionary.set(identity,index)
      }
      bindings.push(Object.freeze({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:index}))
    }
    const attachment=Object.freeze({version:1 as const,roomId,boardEpoch,capabilities:Object.freeze(capabilities),bindings:Object.freeze(bindings)})
    // Shared validation checks every frame against its FIRST bound immutable
    // gesture capability, including later identity/resource changes and limits.
    prepareCanonicalRecordedAttachment(attachment,operations,{roomId,boardEpoch})
    return attachment
  }

  private bindDescriptor(descriptor:BrushDescriptor,library:BrushLibrary):{material:AnyCanonicalMaterialContext;mode:'wash'|'buildup';descriptorSha256:string} {
    if(!isSourceStampData(descriptor.sourceStamp))fail('invalid or missing retained source data')
    const unsupportedOuter = outerExecutionReject(descriptor)
    if (unsupportedOuter) fail('unsupported canonical Over execution: ' + unsupportedOuter)
    const descriptorSha256 = createHash('sha256').update(JSON.stringify(normalizedDescriptor(descriptor))).digest('hex')
    let material:AnyCanonicalMaterialContext, mode:'wash'|'buildup'
    const budget=Object.freeze({workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels})
    if(descriptor.sourceStamp.version===2 && (descriptor.sourceStamp.source.kind==='defaultAuto'||descriptor.sourceStamp.source.kind==='gaussianAuto'||descriptor.sourceStamp.source.kind==='softAuto')){
      const kind=descriptor.sourceStamp.source.kind
      const pin=kind==='softAuto'
        ? this.autoSources.softAuto ? canonicalSoftAutoSourceBinding(descriptor,descriptorSha256,this.autoSources.softAuto.coverageProfile) : fail('soft-auto execution policy disabled')
        : kind==='defaultAuto'
        ? this.autoSources.defaultAuto ? canonicalDefaultAutoSourceBinding(descriptor,descriptorSha256,this.autoSources.defaultAuto.coverageProfile) : fail('default-auto execution policy disabled')
        : this.autoSources.gaussianAuto ? canonicalGaussianAutoSourceBinding(descriptor,descriptorSha256,this.autoSources.gaussianAuto.coverageProfile) : fail('Gaussian execution policy disabled')
      const savedMode=sourceStampPaintingMode(descriptor.sourceStamp)
      if(!savedMode)fail('inconsistent-source-painting-mode')
      if(pin.brushScale!==1)fail('unsupported stored auto scale')
      mode=savedMode
      material=Object.freeze({version:2,assets:Object.freeze([]),primarySource:pin,budget})
    }else{
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
      material=Object.freeze({assets:Object.freeze([capability.asset]),primaryAsset:asset.id,preflightDefinition,budget})
    }
    return {material,mode,descriptorSha256}
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
