import {canonicalTexturedAutoMaterialContext,canonicalStrokeSnapshotV7,CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE,type CanonicalStrokeSnapshotV7,type CanonicalMaterialFrameV7} from '@grafetto/shared'
import {canonicalSoftAutoDataEqual,canonicalSoftNativeDefaultTexturedSourceMaterialContext,canonicalStrokeSnapshotV6,CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE,type CanonicalStrokeSnapshotV6,type CanonicalMaterialFrameV6,canonicalPressureTexturedSourceMaterialContext,canonicalStrokeSnapshotV5,CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE,type CanonicalStrokeSnapshotV5,type CanonicalMaterialFrameV5,canonicalTexturedSourceMaterialContext,canonicalStrokeSnapshotV4,CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE,type CanonicalStrokeSnapshotV4,type CanonicalMaterialFrameV4,canonicalPrimaryTextureMaterialContext,canonicalStrokeSnapshotV3,decodeCanonicalRecordedSnapshotFrame,CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE,type CanonicalMaterialFrameV3,type CanonicalStrokeSnapshotV3} from '@grafetto/shared'
import type {CanonicalMaskCapacityLease} from './TransformedMaskPrepass'
import {canonicalImageRequiredSourceLevels} from './canonicalImageCapacity'
import {CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,canonicalImageMaterialPin,canonicalStrokeSnapshotV2,advanceCanonicalMaterialPrefix,CANONICAL_MATERIAL_PREFIX_START,prepareCanonicalRecordedAttachment,verifyCanonicalRecordedClose,canonicalDefaultAutoSourcePin,canonicalGaussianAutoSourcePin,canonicalSoftAutoSourcePin,type CanonicalMaterialPrefixState,type CanonicalStrokeSnapshotV2,type CanonicalRecordedReadScope,type CanonicalStrokeOperation} from '@grafetto/shared'
import type {CanonicalMaskSourceReader,CanonicalMaskSourceLease} from './CanonicalMaskSourceBank'
import type {CanonicalRecordedInput,CanonicalRecordedLifetime} from '../oplog/CanonicalRecordedDelivery'
import { CANONICAL_STROKE_RASTER_PROFILE, isCanonicalStrokeComposition, type CanonicalStrokeComposition } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { PaintTarget } from '../buffers/ILayerBuffer'
import type { TiledLayerBuffer,PreparedLayerTargets } from '../buffers/TiledLayerBuffer'
import type { WorldRect } from '../buffers/tileMath'
import { runBrushGlBatch, runBrushGlTurn } from './BrushGlBatch'
import { bindCanonicalLayerTargets } from './CanonicalLayerTargets'
import { CanonicalFrameExecutor, canonicalWashOuterOperation, type CanonicalFrameExecutorOptions, type CanonicalFrameSubmission, type CanonicalWashLocalTile, type CanonicalWashOwnership } from './CanonicalFrameExecutor'
import { planCanonicalTargets } from './CanonicalTargetPlan'
import type { CanonicalRgba8SourceView } from './CanonicalRgba8CompositePass'

/** Internal accepted-BEGIN lease. The actual layer owner validates the exact
 * receiver/candidate; received frame fields never confer this authority. */
export interface CanonicalLocalWashAuthor {
 readonly lifetime:CanonicalRecordedLifetime
 readonly snapshot:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV3|CanonicalStrokeSnapshotV4|CanonicalStrokeSnapshotV5|CanonicalStrokeSnapshotV6|CanonicalStrokeSnapshotV7
 readonly userId:string
 assertCurrent(candidate:CanonicalLocalWashAuthor):Readonly<CanonicalRecordedReadScope>
}
// Only decoded bounded envelopes and captured validated BEGIN data enter here.
function samePaintData(a:unknown,b:unknown):boolean {
 if(a===b)return true
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
 const ak=Object.keys(a),bk=Object.keys(b)
 return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&samePaintData(Reflect.get(a,k),Reflect.get(b,k)))
}
interface LocalPrefix {
 readonly author:CanonicalLocalWashAuthor
 readonly scope:Readonly<CanonicalRecordedReadScope>
 state:CanonicalMaterialPrefixState
 readonly receipts:{readonly operation:CanonicalStrokeOperation;readonly frame:CanonicalStrokeOperation['frame'];readonly release:()=>void}[]
}
export interface CanonicalWashLayerCoordinatorOptions extends Omit<CanonicalFrameExecutorOptions, 'washMode' | 'autoSource' | 'bank' | 'softProgramOwner' | 'primaryTexture' | 'changed' | 'poison'> {
  readonly layerId: string
  readonly layerEpoch: number
  /** Distinct derived straight layer; the coordinator never owns/destroys it. */
  readonly presentation: () => { readonly buffer: TiledLayerBuffer; readonly epoch: number }
  /** Trusted gesture source binding, NOT data selected by a material frame. */
  readonly source: (gestureId: string, recorded?: CanonicalRecordedInput, local?:CanonicalLocalWashAuthor) => Pick<CanonicalFrameExecutorOptions, 'autoSource' | 'bank' | 'softProgramOwner' | 'primaryTexture'> & {readonly sourceLease?:CanonicalMaskSourceLease}
  /** Explicit caller capacity; no implicit queue, expiry or GPU quota. Includes
   * completed IDs until this coordinator is discarded after trusted rebuild. */
  readonly maxGestures: number
  /** Internal resource retention only; never a room/source permission. */
  readonly replayRetention?: Readonly<{maxEntries:number;maxBytes:number}>
  readonly changed: (layerId: string) => void
  readonly poison: (layerId: string, reason: unknown) => void
}
interface RecordedPrefix {
 readonly lifetime:CanonicalRecordedLifetime
 readonly scope:Readonly<CanonicalRecordedReadScope>
 readonly snapshot:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV3|CanonicalStrokeSnapshotV4|CanonicalStrokeSnapshotV5|CanonicalStrokeSnapshotV6|CanonicalStrokeSnapshotV7
 readonly userId:string
 readonly strokeId:string
 readonly firstOperationId:string
 readonly firstSeq:number
 readonly lastOperationId:string
 readonly lastSeq:number
 readonly state:CanonicalMaterialPrefixState
 readonly sealed:boolean
}
interface Entry {
  image?:Readonly<{bank:CanonicalMaskSourceReader;generation:number}>
  sourceLease?:CanonicalMaskSourceLease
  recorded?:RecordedPrefix
  local?:LocalPrefix
  readonly id: string
  firstSequence: number|undefined
  readonly executor: CanonicalFrameExecutor
  readonly opacity: number
  readonly blend: CanonicalStrokeComposition['outerBlend']
  readonly releaseMetadata: () => void
  replayPins?:number
  metadataRetired?:boolean
  ownership?: CanonicalWashOwnership
  committed: boolean
  tile: number
  part: number
  committingBuffer?: AccumulationBuffer
  targetPlan?:PreparedLayerTargets
  commitTarget?:PaintTarget
}
type ReplayValue = Readonly<{
    kind: 'recorded';
    input: CanonicalRecordedInput;
}> | Readonly<{
    kind: 'local';
    author: CanonicalLocalWashAuthor;
    operation: CanonicalStrokeOperation;
}>;
interface ReplayEntry {
    readonly id: string;
    readonly gestureId: string;
    value: ReplayValue;
    bytes: number;
    release: () => void;
    pins: number;
    retired: boolean;
}
interface ReplaySnapshot {
    values(): readonly ReplayValue[];
    release(): void;
}
interface Position {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number
  /** Identity only, in the already charged tile metadata; never a pixel mirror.
   * A recovered/replaced target must be initialized with a full rebase. */
  readonly presentation?: { stable?: AccumulationBuffer; derived?: AccumulationBuffer; stableTexture?: WebGLTexture; derivedTexture?: WebGLTexture }
}
interface PresentationWork {
  readonly position: Position
  readonly revision: number
  stage: number
  part: number
  buffer?: AccumulationBuffer
  texture?: WebGLTexture
  stableBuffer?: AccumulationBuffer
  stableTexture?: WebGLTexture
  bounds: WorldRect
  stablePlan?:PreparedLayerTargets
  derivedPlan?:PreparedLayerTargets
  stableTarget?:PaintTarget
  derivedTarget?:PaintTarget
}
const rect = (p: Position): WorldRect => ({ minX: p.x, minY: p.y, maxX: p.x + p.width, maxY: p.y + p.height })
const key = (p: Position) => `${p.x}:${p.y}`

/** Recorded-order lane for one layer. Deposition uses the real executor; local
 * raw surfaces are folded over stable pixels in FIRST-RECORDED-gesture order.
 * A sealed B cannot commit past an open A. The internal local hook accepts only a captured original-BEGIN lease;
 * ordinary room activation remains outside this coordinator. All writes to these layers must enter
 * this lane or a future ordered barrier; seq alone does not serialize peers. */
export class CanonicalWashLayerCoordinator {
  private readonly gl: WebGLRenderingContext
  private readonly options: CanonicalWashLayerCoordinatorOptions
  private readonly stable: TiledLayerBuffer
  private readonly derived: TiledLayerBuffer
  private readonly derivedEpoch: number
  private readonly maskParticipant:CanonicalMaskCapacityLease
  private readonly preparations: readonly Readonly<{ width: number; height: number; epoch: object }>[]
  private readonly entries: Entry[] = []
  private readonly queue: Entry[] = []
  private readonly positions = new Map<string, Position>()
  private readonly dirty = new Map<string, WorldRect>()
  private readonly reservations: (() => void)[] = []
  private readonly errors: unknown[] = []
  private work?: PresentationWork
  private revision = 0
  private completedPresentation = -1
  private lastSequence = 0
  private busy = false
  private failed = false
  private closed = false
  private readonly replay = new Map<string,ReplayEntry>()
  private replayBytes = 0
  private replayCount = 0
  private replayGeneration = 0
  private replayOrderRevision = 0
  private replayWork?:ReplaySnapshot

  constructor(options: CanonicalWashLayerCoordinatorOptions) {
    if (!options.layerId || !Number.isSafeInteger(options.layerEpoch) || options.layerEpoch < 0
      || !Number.isSafeInteger(options.maxGestures) || options.maxGestures < 1) throw new TypeError('Invalid canonical wash layer capacity/identity')
    const retention=options.replayRetention
    if(retention&&(!Number.isSafeInteger(retention.maxEntries)||retention.maxEntries<1||retention.maxEntries>1024
      ||!Number.isSafeInteger(retention.maxBytes)||retention.maxBytes<1))throw new TypeError('Invalid active replay retention bounds')
    const stable = options.layer(options.layerId), derived = options.presentation()
    if (!Number.isSafeInteger(derived.epoch) || derived.epoch < 0 || stable.epoch !== options.layerEpoch || stable.buffer === derived.buffer
      || stable.buffer.pixelEncoding !== 'straight-rgba8' || derived.buffer.pixelEncoding !== 'straight-rgba8'
      || stable.buffer.tileWidth !== derived.buffer.tileWidth || stable.buffer.tileHeight !== derived.buffer.tileHeight) throw new Error('Canonical wash requires distinct matching straight layers')
    this.maskParticipant=options.prepass.retainPreparedCapacity()
    try{
    this.preparations = [this.maskParticipant.preparedCapacity(), options.composite.preparedCapacity()]
    this.reservations.push(()=>this.maskParticipant.release())
    // The existing CPU owner charges bounded metadata, not actual JS heap.
    const batch = options.prepass.brushGlBatchInfo()
    this.gl = batch.gl
    const release = batch.cpu.reserve(options.maxGestures * 1024)
    this.reservations.push(release)
    this.options = Object.freeze({ ...options, ...(retention?{replayRetention:Object.freeze({...retention})}:{}), pageBounds: options.pageBounds ? Object.freeze({ ...options.pageBounds }) : null })
    this.stable = stable.buffer; this.derived = derived.buffer; this.derivedEpoch = derived.epoch
    }catch(error){for(const release of this.reservations.splice(0))try{release()}catch{/* Preserve construction error. */}try{this.maskParticipant.release()}catch{/* Preserve construction error. */}throw error}
  }

  get queuedFrameCount():number { return this.queue.length }
  /** A partially published stable commit cannot be shown through a raw-wash
   * rebase while a later local gesture still lacks its recorded order. */
  private get stableOrderBlocked():boolean {
    return !this.commitFrontier()&&this.entries.some(entry=>!entry.committed&&!!entry.ownership&&!!(entry.targetPlan||entry.tile||entry.part))
  }
  get awaitingRecordedOrder():boolean {return this.stableOrderBlocked&&!this.queue.length}
  /** Original receipts only; a retained local lease after promotion is not pending. */
  get hasPendingLocal():boolean {return this.entries.some(entry=>!!entry.local?.receipts.length)}
  get poisoned(): boolean { return this.failed }
  /** Pixel execution still owed when an unpublished restore defers NEW preview. */
  get executionPending():boolean { return !!this.queue.length || !!this.work || !!this.commitFrontier()?.ownership }
  get pending(): boolean { return !!this.queue.length || !!this.dirty.size || !!this.work || !!this.commitFrontier()?.ownership }
  get presentationReady(): boolean { return !this.failed && !this.closed && !this.dirty.size && !this.work }
  /** Visual publication exists only after every dirty position has finished. */
  get publishedPresentationReady():boolean { return this.presentationReady&&this.completedPresentation>=0 }
  get completedPresentationRevision():number { return this.completedPresentation }
  get checkpointReady(): boolean { return this.presentationReady && !this.queue.length && this.entries.every(e => e.committed) }
  get cleanupFailures(): readonly unknown[] { return Object.freeze([...this.errors]) }

  /** Resource reuse only. Original append still validates the complete receipt
   * and prefix and performs its own final publication checks. */
  hasLocalRecordedPromotion(input:CanonicalRecordedInput):boolean {
    this.assertOpen();input.delivery.assertCurrent(input);this.assertRecordedCurrent();this.assertLayers()
    const lifetime=input.delivery.lifetime,scope=lifetime.assertCurrent(),op=input.operation,read=input.read
    if(op.type!=='canonical_stroke'||!read||op.seq!==read.sequence||read.operationId!==op.id)return false
    const id=JSON.stringify([scope.roomId,scope.boardEpoch,op.userId,op.frame.strokeId]),entry=this.entries.find(e=>e.id===id),local=entry?.local,receipt=local?.receipts[0]
    if(!entry||!local||!receipt)return false
    this.assertLocal(local);input.delivery.assertCurrent(input)
    if(lifetime.assertCurrent()!==scope)throw new Error('Recorded scope replaced')
    return this.entries.includes(entry)&&entry.local===local&&local.receipts[0]===receipt
      &&local.author.lifetime===lifetime&&local.scope===scope&&local.author.userId===op.userId
      &&samePaintData(local.author.snapshot,read.capability.snapshot)
      &&receipt.operation.id===op.id&&receipt.operation.userId===op.userId&&receipt.operation.layerId===op.layerId
      &&receipt.frame.materialPacked===op.frame.materialPacked&&receipt.frame.frameOrdinal===op.frame.frameOrdinal
      &&receipt.frame.strokeId===op.frame.strokeId
  }
  /** Capacity only, never a reservation or source/sequence grant. */
  canAcceptRecorded(input:CanonicalRecordedInput):boolean {
    this.assertOpen();input.delivery.assertCurrent(input);this.assertRecordedCurrent();this.assertLayers()
    const scope=input.delivery.lifetime.assertCurrent(),op=input.operation
    const close=op.type==='canonical_stroke_close'
    if(op.type!=='canonical_stroke'&&!close)throw new TypeError('Recorded source input required')
    if(op.layerId!==this.options.layerId)throw new TypeError('Recorded source layer mismatch')
    const id=JSON.stringify([scope.roomId,scope.boardEpoch,close?op.targetUserId:op.userId,close?op.strokeId:op.frame.strokeId])
    const entry=this.entries.find(e=>e.id===id)
    if(close){if(!entry?.recorded)throw new Error('Recorded close owner missing');return this.queue.includes(entry)||this.queue.length<8}
    if(entry?.local)return true // Original promotion adds no GPU frame.
    return this.queue.length<8&&(!entry||entry.executor.pendingFrameCount<8)
  }

  /** Original local delivery, not a log copy or a source selected by a frame. */
  enqueueRecorded(input:CanonicalRecordedInput):void {
    this.assertOpen();this.busy=true
    let staged:ReturnType<CanonicalWashLayerCoordinator['stageReplay']>|undefined
    try{
      if(this.options.replayRetention){
        input.delivery.assertCurrent(input)
        const scope=input.delivery.lifetime.assertCurrent(),op=input.operation
        if(op.type!=='canonical_stroke'||!input.read)throw new TypeError('Original replay frame required')
        staged=this.stageReplay(JSON.stringify([scope.roomId,scope.boardEpoch,op.userId,op.frame.strokeId]),op,{kind:'recorded',input})
      }
      this.enqueueOriginal(input)
      staged?.commit()
    }finally{try{staged?.rollback()}finally{this.busy=false}}
  }
  private enqueueOriginal(input:CanonicalRecordedInput):void {
    input.delivery.assertCurrent(input)
    const lifetime=input.delivery.lifetime,scope=lifetime.assertCurrent(),op=input.operation,read=input.read
    if(op.type!=='canonical_stroke'||!read||op.seq!==read.sequence||read.operationId!==op.id)throw new TypeError('Recorded source input required')
    const accepted=prepareCanonicalRecordedAttachment({version:1,roomId:read.roomId,boardEpoch:read.boardEpoch,
      capabilities:[read.capability],bindings:[{operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:0}]},[op],scope)[0]
    const snapshot=accepted.read!.capability.snapshot
    if(read.rasterProfile!==snapshot.rasterProfile)throw new TypeError('Recorded source profile mismatch')
    if(('maskSource'in snapshot.material&&snapshot.material.maskSource)||snapshot.rasterProfile!==this.options.rasterProfile
      ||snapshot.layerId!==this.options.layerId)throw new TypeError('Unsupported recorded source context')
    const id=JSON.stringify([scope.roomId,scope.boardEpoch,op.userId,snapshot.strokeId])
    const existing=this.entries.find(e=>e.id===id),old=existing?.recorded
    if(existing&&!old&&!existing.local)throw new Error('Recorded namespace already occupied')
    if(old&&(old.lifetime!==lifetime||old.scope!==scope||old.sealed||old.lastSeq>=op.seq!
      ||JSON.stringify(old.snapshot)!==JSON.stringify(snapshot)))throw new Error('Recorded source lifetime/context changed')
    const decoded=decodeCanonicalRecordedSnapshotFrame(op.frame,snapshot,op.frame.frameOrdinal)
    const state=advanceCanonicalMaterialPrefix(old?.state??CANONICAL_MATERIAL_PREFIX_START,op.frame.frameOrdinal,decoded.frame)
    const recorded:RecordedPrefix={lifetime,scope,snapshot:old?.snapshot??snapshot,userId:op.userId,strokeId:snapshot.strokeId,
      firstOperationId:old?.firstOperationId??op.id,firstSeq:old?.firstSeq??op.seq!,lastOperationId:op.id,lastSeq:op.seq!,state,sealed:false}
    input.delivery.assertCurrent(input);if(lifetime.assertCurrent()!==scope)throw new Error('Recorded scope replaced')
    if(existing?.local){
      const local=existing.local,receipt=local.receipts[0],a=local.author
      this.assertLocal(local)
      if(op.seq!<=this.lastSequence||a.lifetime!==lifetime||local.scope!==scope
        ||a.userId!==op.userId||!samePaintData(a.snapshot,snapshot)
        ||!receipt||!this.sameLocalOperation({...receipt.operation,frame:receipt.frame},op,decoded.envelope))throw new Error('Local original confirmation mismatch')
      // Release may call external CPU-owner code. Publish no confirmation until
      // the exact original and local owner have survived that callback.
      receipt.release();this.assertLocal(local);input.delivery.assertCurrent(input)
      if(lifetime.assertCurrent()!==scope)throw new Error('Recorded scope replaced')
      this.assertLayers()
      local.receipts.shift();existing.recorded=recorded;existing.firstSequence??=op.seq!
      this.lastSequence=op.seq!;this.orderEntries();return
    }
    this.enqueueInternal({gestureId:id,layerId:op.layerId,layerEpoch:this.options.layerEpoch,ordinal:op.frame.frameOrdinal,
      frame:decoded.frame,assets:snapshot.material.assets,rgb:snapshot.pigmentRgb8,composition:snapshot.composition,...(snapshot.material.primarySource.kind==='defaultAuto'&&snapshot.material.primarySource.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE?{densityStrokeIdentity:{strokeId:snapshot.strokeId}}:{})},op.seq!,{input,recorded})
  }

  private sameLocalOperation(a:CanonicalStrokeOperation,b:CanonicalStrokeOperation,frame:CanonicalStrokeOperation['frame']):boolean {
    return a.id===b.id&&a.userId===b.userId&&a.layerId===b.layerId&&a.timestamp===b.timestamp&&samePaintData(a.frame,frame)
  }
  private assertLocal(local:LocalPrefix):void {
    if(local.author.assertCurrent(local.author)!==local.scope||local.author.lifetime.assertCurrent()!==local.scope)throw new Error('Local source owner changed')
  }
  private orderEntries():void {
    const compare=(a:Entry,b:Entry)=>a.firstSequence===undefined?(b.firstSequence===undefined?0:1):b.firstSequence===undefined?-1:a.firstSequence-b.firstSequence
    // Sequence promotion can change authority without changing visual order.
    // Preserve the current dirty/presentation state for that common case.
    for(let i=1;i<this.entries.length;i++)if(compare(this.entries[i-1],this.entries[i])>0){
      this.entries.sort(compare);if(this.options.replayRetention)this.replayOrderRevision++;this.invalidate();return
    }
  }
  /** No sequence is invented. Temporary GPU queue pressure alone returns false. */
  tryEnqueueLocal(author:CanonicalLocalWashAuthor,op:CanonicalStrokeOperation):boolean {
    this.assertOpen();this.busy=true
    try{
    this.assertRecordedCurrent()
    const fields=['type','id','userId','timestamp','layerId','frame']
    if(!op||Reflect.ownKeys(op).length!==fields.length||fields.some(k=>!Object.getOwnPropertyDescriptor(op,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(op,k)!,'value'))
      ||typeof op.id!=='string'||!op.id||typeof op.timestamp!=='number'||!Number.isFinite(op.timestamp)||op.timestamp<0)throw new TypeError('Invalid local source operation header')
    const scope=author.assertCurrent(author),snapshot=author.snapshot
    if(author.lifetime.assertCurrent()!==scope||!Object.isFrozen(op)||Object.hasOwn(op,'seq')
      ||op.type!=='canonical_stroke'||op.userId!==author.userId||op.layerId!==this.options.layerId
      ||snapshot.layerId!==op.layerId||snapshot.boardEpoch!==scope.boardEpoch||snapshot.rasterProfile!==this.options.rasterProfile
      ||('maskSource'in snapshot.material&&snapshot.material.maskSource))throw new TypeError('Invalid local source envelope/context')
    // Capacity false is NOT material validation/admission. Preserve cheap
    // original owner/namespace/layer proofs, but do not decode the same retained
    // packed body on every full-queue retry. The free path keeps its late guard.
    if(this.queue.length>=8){
      const id=JSON.stringify([scope.roomId,scope.boardEpoch,author.userId,snapshot.strokeId]),entry=this.entries.find(e=>e.id===id)
      if(entry&&(!entry.local||entry.local.author!==author))throw new Error('Local source namespace occupied')
      if(entry?.local)this.assertLocal(entry.local)
      this.assertLayers()
      return false
    }
    const decoded=decodeCanonicalRecordedSnapshotFrame(op.frame,snapshot,op.frame.frameOrdinal)
    const id=JSON.stringify([scope.roomId,scope.boardEpoch,author.userId,snapshot.strokeId]),entry=this.entries.find(e=>e.id===id)
    if(entry&&(!entry.local||entry.local.author!==author))throw new Error('Local source namespace occupied')
    const previous=entry?.local
    if(previous)this.assertLocal(previous)
    const state=advanceCanonicalMaterialPrefix(previous?.state??CANONICAL_MATERIAL_PREFIX_START,op.frame.frameOrdinal,decoded.frame)
    this.assertLayers()
    if(this.queue.length>=8)return false
    if(this.entries.reduce((n,e)=>n+(e.local?.receipts.length??0),0)>=1024)throw new RangeError('Local receipt capacity exceeded')
    const cpu=this.options.prepass.brushGlBatchInfo().cpu,release=cpu.reserve(JSON.stringify(op).length*2+512)
    let released=false;const retire=()=>{if(!released){released=true;release()}}
    const local:LocalPrefix=previous??{author,scope,state,receipts:[]}
    let staged:ReturnType<CanonicalWashLayerCoordinator['stageReplay']>|undefined
    try{
      if(this.options.replayRetention)staged=this.stageReplay(id,op,{kind:'local',author,operation:op},retire)
      this.assertLocal(local)
      this.enqueueInternal({gestureId:id,layerId:op.layerId,layerEpoch:this.options.layerEpoch,ordinal:op.frame.frameOrdinal,
        frame:decoded.frame,assets:snapshot.material.assets,rgb:snapshot.pigmentRgb8,composition:snapshot.composition,...(snapshot.material.primarySource.kind==='defaultAuto'&&snapshot.material.primarySource.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE?{densityStrokeIdentity:{strokeId:snapshot.strokeId}}:{})},undefined,undefined,local)
      local.state=state;local.receipts.push({operation:op,frame:decoded.envelope,release:()=>{if(!this.replay.has(op.id))retire()}});staged?.commit()
    }catch(error){
      this.clean(retire)
      if(this.failed){this.releaseAll(this.cleanupContextLost());this.clean(()=>this.notifyPoison(error))}
      throw error
    }finally{staged?.rollback()}
    return true
    }finally{this.busy=false}
  }

  enqueueRecordedSeal(input:CanonicalRecordedInput):void {
    this.assertOpen();input.delivery.assertCurrent(input)
    const scope=input.delivery.lifetime.assertCurrent(),op=input.operation
    if(op.type!=='canonical_stroke_close')throw new TypeError('Recorded close input required')
    const id=JSON.stringify([scope.roomId,scope.boardEpoch,op.targetUserId,op.strokeId])
    const entry=this.entries.find(e=>e.id===id),r=entry?.recorded
    if(entry?.local?.receipts.length)throw new Error('Local tail requires authoritative reconciliation')
    if(!r||r.lifetime!==input.delivery.lifetime||r.scope!==scope||r.sealed)throw new Error('Recorded close owner missing or stale')
    verifyCanonicalRecordedClose({...r.state,recordedNext:r.state.nextOrdinal,firstOperationId:r.firstOperationId,
      lastOperationId:r.lastOperationId,firstSeq:r.firstSeq,lastSeq:r.lastSeq},{userId:r.userId,layerId:this.options.layerId,strokeId:r.strokeId},op)
    input.delivery.assertCurrent(input);if(r.lifetime.assertCurrent()!==scope)throw new Error('Recorded scope replaced')
    this.closeInternal(id,r.state.nextOrdinal,op.seq!)
    entry!.recorded={...r,sealed:true}
  }

  private assertRecordedCurrent():void {
    for(const e of this.entries){e.image?.bank.assertCurrentOwners(e.image.generation);if(e.local)this.assertLocal(e.local);if(e.recorded&&e.recorded.lifetime.assertCurrent()!==e.recorded.scope)throw new Error('Recorded scope replaced')}
  }

  /** Sequence is from authoritative recorded history, never a guessed local
   * ordinal. Caller supplies a complete ordered same-layer lane (no gaps from
   * omitted same-layer writers). Runtime live acknowledgements remain outside. */
  enqueue(input: CanonicalFrameSubmission, recordedSequence: number): void {
    if(this.entries.find(e=>e.id===input.gestureId)?.recorded||this.entries.find(e=>e.id===input.gestureId)?.local)throw new Error('Recorded owner requires original delivery')
    this.enqueueInternal(input,recordedSequence)
  }

  private enqueueInternal(input:Omit<CanonicalFrameSubmission,'frame'>&{readonly frame:CanonicalFrameSubmission['frame']|CanonicalMaterialFrameV3|CanonicalMaterialFrameV4|CanonicalMaterialFrameV5|CanonicalMaterialFrameV6|CanonicalMaterialFrameV7},recordedSequence:number|undefined,origin?:{input:CanonicalRecordedInput;recorded:RecordedPrefix},local?:LocalPrefix):void {
    if(!local&&!origin)this.assertOpen();this.assertRecordedCurrent(); this.busy = true
    try {
    if ((!local&&(!Number.isSafeInteger(recordedSequence)||recordedSequence!<=this.lastSequence)) || input.layerId !== this.options.layerId
      || input.layerEpoch !== this.options.layerEpoch || input.composition.mode !== 'wash') throw new Error('Invalid recorded wash lane order/context')
    if (!isCanonicalStrokeComposition(input.composition, this.options.rasterProfile === 'reference-scalar-f32-rne-v1' ? CANONICAL_STROKE_RASTER_PROFILE : this.options.rasterProfile)) throw new TypeError('Invalid recorded wash composition for pinned raster profile')
    if (this.queue.length >= 8) throw new RangeError('Canonical wash lane queue is full')
    this.assertLayers()
    let entry = this.entries.find(e => e.id === input.gestureId)
    if (!entry && this.entries.length >= this.options.maxGestures) throw new RangeError('Canonical wash lane gesture capacity exceeded')
    if (entry?.committed || entry?.ownership) throw new Error('Recorded wash gesture is already sealed')
    const fresh = new Map<string, Position>()
    for (const d of input.frame.draws) {
      const r = input.frame.definitions[d.definition]
      if (!r) throw new TypeError('Invalid canonical wash definition')
      for (const tile of planCanonicalTargets({ minX: d.x, minY: d.y, maxX: d.x + r.width, maxY: d.y + r.height }, this.options.pageBounds ?? null, this.stable.tileWidth, this.stable.tileHeight).tiles) {
        const p = { x: tile.storage.minX, y: tile.storage.minY, width: this.stable.tileWidth, height: this.stable.tileHeight, presentation: {} }
        if (!this.positions.has(key(p))) fresh.set(key(p), p)
      }
    }
    let acceptedWork=false
    let candidate: CanonicalFrameExecutor | undefined,publishCandidate:(()=>void)|undefined
    let imageBinding:Entry['image'],sourceLease:CanonicalMaskSourceLease|undefined
    let releaseGpu: (() => void) | undefined, releaseCpu: (() => void) | undefined, releaseEntry: (() => void) | undefined
    try {
      if (fresh.size) {
        releaseCpu = this.options.prepass.brushGlBatchInfo().cpu.reserve(fresh.size * 256)
        releaseGpu = this.options.reserveTransient([...fresh.values()].reduce((n, t) => n + t.width * t.height * 4, 0))
      }
      if (!entry) {
        releaseEntry = this.options.prepass.brushGlBatchInfo().cpu.reserve(1024+(local?4096+JSON.stringify(local.author.snapshot).length*2:origin?4096:0))
        let published=false;publishCandidate=()=>{published=true}
        const source=local?this.options.source(input.gestureId,undefined,local.author):this.options.source(input.gestureId,origin?.input)
        sourceLease=source.sourceLease
        if(sourceLease&&source.bank!==sourceLease)throw new Error('Canonical source lease reader changed')
        if(origin||local){
          const snapshot=origin?.recorded.snapshot??(local!.author.snapshot.materialVersion===7?canonicalStrokeSnapshotV7(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):local!.author.snapshot.materialVersion===6?canonicalStrokeSnapshotV6(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):local!.author.snapshot.materialVersion===5?canonicalStrokeSnapshotV5(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):local!.author.snapshot.materialVersion===4?canonicalStrokeSnapshotV4(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):local!.author.snapshot.materialVersion===3?canonicalStrokeSnapshotV3(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):canonicalStrokeSnapshotV2(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile)),expected=snapshot.material.primarySource,actual=source.autoSource
          if(snapshot.materialVersion===7){
            if(snapshot.composition.mode!=='wash'||!source.sourceLease||source.bank!==source.sourceLease||source.primaryTexture?.root!==source.sourceLease||!actual||!canonicalSoftAutoDataEqual(actual,expected)||!canonicalSoftAutoDataEqual(canonicalTexturedAutoMaterialContext(source.primaryTexture.context),snapshot.material))throw new TypeError('Recorded textured Auto source binding missing or changed')
          }else if(snapshot.materialVersion===6){
            if(!source.sourceLease||source.bank!==source.sourceLease||source.primaryTexture?.root!==source.sourceLease||!actual||!canonicalSoftAutoDataEqual(actual,expected)||!canonicalSoftAutoDataEqual(canonicalSoftNativeDefaultTexturedSourceMaterialContext(source.primaryTexture.context),snapshot.material))throw new TypeError('Recorded native-default Soft texture source binding missing or changed')
          }else if(snapshot.materialVersion===5){
            if(!source.sourceLease||source.bank!==source.sourceLease||source.primaryTexture?.root!==source.sourceLease||!samePaintData(canonicalPressureTexturedSourceMaterialContext(source.primaryTexture.context),snapshot.material))throw new TypeError('Recorded pressure texture source binding missing or changed')
          }else if(snapshot.materialVersion===4){
            if(!source.sourceLease||source.bank!==source.sourceLease||source.primaryTexture?.root!==source.sourceLease||!samePaintData(canonicalTexturedSourceMaterialContext(source.primaryTexture.context),snapshot.material))throw new TypeError('Recorded fixed texture source binding missing or changed')
          }else if(snapshot.materialVersion===3){
            if(!source.sourceLease||source.primaryTexture?.root!==source.sourceLease||!samePaintData(canonicalPrimaryTextureMaterialContext(source.primaryTexture.context),snapshot.material))throw new TypeError('Recorded primary texture source binding missing or changed')
          }else if(source.primaryTexture)throw new TypeError('Unexpected recorded primary texture source')
          if(snapshot.rasterProfile!==this.options.rasterProfile)throw new TypeError('Recorded source profile mismatch')
          if(expected.kind==='image'){
            if(!source.bank||actual||source.softProgramOwner)throw new TypeError('Recorded image bank binding missing')
            const image=canonicalImageMaterialPin(expected,snapshot.materialVersion===3?[snapshot.material.assets[0]]:snapshot.material.assets)
            const info=this.options.prepass.brushGlBatchInfo(),release=info.cpu.reserve(16384+image.assets.length*1536);let failed=false,failure:unknown
            try{const requirement=canonicalImageRequiredSourceLevels(expected,image.assets)[0];imageBinding=Object.freeze({bank:source.bank,generation:source.bank.assertRequiredSourceBinding(requirement.asset,requirement.indexes,info)})}
            catch(error){failed=true;failure=error}finally{try{release()}catch(error){if(!failed){failed=true;failure=error}}}
            if(failed)throw failure
          }else{
            if(!actual)throw new TypeError('Recorded source binding missing')
            const normalize=(pin:typeof actual)=>pin.kind==='softAuto'?canonicalSoftAutoSourcePin(pin):pin.kind==='gaussianAuto'?canonicalGaussianAutoSourcePin(pin):canonicalDefaultAutoSourcePin(pin)
            if(JSON.stringify(normalize(actual))!==JSON.stringify(expected))throw new TypeError('Recorded source binding mismatch')
          }
          if(local)this.assertLocal(local)
          origin?.input.delivery.assertCurrent(origin.input)
          if(origin&&origin.recorded.lifetime.assertCurrent()!==origin.recorded.scope)throw new Error('Recorded scope replaced')
        }
        const executor = candidate = new CanonicalFrameExecutor({ ...this.options, ...source, washMode: 'deposition-only',
          changed: (_id, bounds) => this.invalidate(bounds), // The lane retires ALL storage pins before external poison/undo.
          poison: () => {if(published)this.failed=true} })
        entry = { image:imageBinding,sourceLease,id: input.gestureId, firstSequence: recordedSequence, executor, opacity: input.composition.outerResourceOpacity, blend: input.composition.outerBlend,
          committed: false, tile: 0, part: 0, releaseMetadata: releaseEntry }
      }
      if(input.frame.profile===CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE)entry.executor.enqueue({gestureId:input.gestureId,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal,frame:input.frame,assets:input.assets,rgb:input.rgb,composition:input.composition})
      else if(input.frame.profile===CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE)entry.executor.enqueue({gestureId:input.gestureId,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal,frame:input.frame,assets:input.assets,rgb:input.rgb,composition:input.composition})
      else if(input.frame.profile===CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE)entry.executor.enqueue({gestureId:input.gestureId,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal,frame:input.frame,assets:input.assets,rgb:input.rgb,composition:input.composition})
      else if(input.frame.profile===CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE)entry.executor.enqueue({gestureId:input.gestureId,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal,frame:input.frame,assets:input.assets,rgb:input.rgb,composition:input.composition})
      else if(input.frame.profile===CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE)entry.executor.enqueue({gestureId:input.gestureId,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal,frame:input.frame,assets:input.assets,rgb:input.rgb,composition:input.composition})
      else entry.executor.enqueue({...input,frame:input.frame})
      acceptedWork=true
      if(local){this.assertLocal(local);this.assertLayers()}
      if(entry.image){
        if(origin){origin.input.delivery.assertCurrent(origin.input);if(origin.recorded.lifetime.assertCurrent()!==origin.recorded.scope)throw new Error('Recorded scope replaced');this.assertLayers()}
        entry.image.bank.assertCurrentOwners(entry.image.generation)
      }
    } catch (error) {
      if((local||origin&&entry?.image)&&acceptedWork&&!candidate)this.failed=true
      if (candidate) this.clean(() => candidate!.cancel(error, { lost: this.cleanupContextLost() }))
      if (releaseGpu) this.clean(releaseGpu)
      if (releaseCpu) this.clean(releaseCpu)
      if (releaseEntry) this.clean(releaseEntry)
      if(sourceLease)this.clean(()=>sourceLease!.release(this.cleanupContextLost()))
      throw error
    }
    if (releaseEntry) {this.entries.push(entry!);publishCandidate!()}
    if (releaseGpu) { const gpu = releaseGpu, cpu = releaseCpu!; this.reservations.push(() => { try { gpu() } finally { cpu() } }) }
    for (const [k, p] of fresh) this.positions.set(k, Object.freeze(p))
    if(origin)entry!.recorded=origin.recorded
    if(local)entry!.local=local
    this.queue.push(entry!); if(recordedSequence!==undefined)this.lastSequence = recordedSequence
    if(!local&&this.entries.some(e=>e.local))this.orderEntries()
    } finally { this.busy = false }
  }

  /** INTERNAL metadata control. Caller owns genuine indexed-prefix/source
   * proof and reconciliation of live-only geometry. No source is resolved and
   * no new gesture/frame is fabricated by this ordered lane operation. */
  enqueueRecordedClose(gestureId:string,recordedNext:number,recordedSequence:number):void {
    if(this.entries.find(e=>e.id===gestureId)?.recorded||this.entries.find(e=>e.id===gestureId)?.local)throw new Error('Recorded owner requires original close delivery')
    this.closeInternal(gestureId,recordedNext,recordedSequence)
  }

  private closeInternal(gestureId:string,recordedNext:number,recordedSequence:number):void {
    this.assertOpen();this.assertRecordedCurrent();this.busy=true
    let target:Entry|undefined
    try{
      if(!Number.isSafeInteger(recordedSequence)||recordedSequence<=this.lastSequence)throw new Error('Invalid recorded wash close order')
      this.assertLayers()
      const entry=target=this.entries.find(e=>e.id===gestureId)
      if(!entry||entry.committed||entry.ownership)throw new Error('Recorded wash close target missing or sealed')
      const queued=this.queue.includes(entry)
      if(!queued&&this.queue.length>=8)throw new RangeError('Canonical wash lane queue is full')
      entry.executor.sealRecordedPrefix({gestureId,layerId:this.options.layerId,layerEpoch:this.options.layerEpoch,recordedNext})
      if(!queued)this.queue.push(entry)
      this.lastSequence=recordedSequence
    }catch(error){
      if(target?.executor.poisoned){this.failed=true;this.releaseAll(this.cleanupContextLost());this.clean(()=>this.notifyPoison(error))}
      throw error
    }finally{this.busy=false}
  }
  /** Charged exact originals, not copied delivery authority or decoded frames. */
  private stageReplay(gestureId: string, op: CanonicalStrokeOperation, value: ReplayValue, releaseLocalPayload?: () => void): {
      commit(): void;
      rollback(): void;
  } {
      value = Object.freeze(value);
      const limit = this.options.replayRetention!;
      const old = this.replay.get(op.id);
      if (old && (old.gestureId !== gestureId || old.value.kind !== 'local' || value.kind !== 'recorded'))
          throw new Error('Replay operation already retained');
      // Logical payload/index accounting; normalized input is already bounded by ingress.
      // Every original may carry a separately normalized read/snapshot object.
      // Conservatively charge the whole validated read metadata per entry.
      const readBytes = value.kind === 'recorded' ? JSON.stringify(value.input.read).length * 2 : 0;
      const bytes = readBytes + 512 + 2 * (gestureId.length + op.id.length + op.userId.length + op.layerId.length + op.frame.strokeId.length + op.frame.brush.length + op.frame.materialPacked.length);
      const extra = old ? Math.max(0, bytes - old.bytes) : bytes;
      if (!Number.isSafeInteger(bytes) || (!old && this.replayCount >= limit.maxEntries) || this.replayBytes + extra > limit.maxBytes)
          throw new RangeError('Active replay capacity exceeded');
      // Promotion keeps the old reservation (same logical payload) and only
      // reserves a positive delta before the receipt's external release callback.
      const releaseMetadata = this.options.prepass.brushGlBatchInfo().cpu.reserve(value.kind === 'local' ? 512 : extra);
      const release = () => { try {
          releaseMetadata();
      }
      finally {
          releaseLocalPayload?.();
      } };
      const generation = this.replayGeneration;
      let done = false;
      return {
          commit: () => {
              if (done)
                  return;
              if (this.closed || this.failed || generation !== this.replayGeneration)
                  throw new Error('Replay stage retired');
              if (old) {
                  if (this.replay.get(op.id) !== old)
                      throw new Error('Replay promotion replaced');
                  const prior = old.release;
                  old.value = value;
                  old.bytes += extra;
                  old.release = () => { try {
                      prior();
                  }
                  finally {
                      release();
                  } };
                  this.replayBytes += extra;
              }
              else {
                  this.replay.set(op.id, { id: op.id, gestureId, value, bytes, release, pins: 0, retired: false });
                  this.replayBytes += bytes;
                  this.replayCount++;
              }
              done = true;
          },
          rollback: () => { if (!done) {
              done = true;
              releaseMetadata();
          } },
      };
  }
  private retireReplayGesture(gestureId: string): void {
      for (const [id, entry] of this.replay)
          if (entry.gestureId === gestureId) {
              this.replay.delete(id);
              entry.retired = true;
              if (!entry.pins)
                  this.releaseReplayEntry(entry);
          }
  }
  private releaseReplayEntry(entry: ReplayEntry): void {
      this.replayBytes -= entry.bytes;
      this.replayCount--;
      this.clean(entry.release);
  }
  private retireReplayMetadata(entry: Entry): void {
      if (!this.options.replayRetention) {
          this.clean(entry.releaseMetadata);
          return;
      }
      if (entry.metadataRetired)
          return;
      entry.metadataRetired = true;
      if (!entry.replayPins)
          this.clean(entry.releaseMetadata);
  }
  /** One bounded work snapshot. No new lifetime/grant; exact owners are rechecked. */
  /** @internal Owner-only work pin, not an execution or network grant. */
  retainReplaySnapshot(): ReplaySnapshot {
      this.assertOpen();
      this.assertRecordedCurrent();
      this.assertLayers();
      if (!this.options.replayRetention || this.replayWork)
          throw new Error('Replay work unavailable');
      const count = this.replay.size;
      const generation = this.replayGeneration;
      const orderRevision = this.replayOrderRevision;
      // Reserve before allocating additional snapshot/index arrays or root pins.
      const releaseMetadata = this.options.prepass.brushGlBatchInfo().cpu.reserve(256 + count * 32);
      let entries: ReplayEntry[] = [];
      let values: readonly ReplayValue[] | undefined;
      let owners: Entry[] = [];
      const roots: CanonicalMaskSourceLease[] = [];
      try {
          this.assertOpen();
          this.assertRecordedCurrent();
          this.assertLayers();
          if (generation !== this.replayGeneration || orderRevision !== this.replayOrderRevision || count !== this.replay.size || this.replayWork)
              throw new Error('Replay snapshot owner changed');
          for (const owner of this.entries)
              for (const entry of this.replay.values())
                  if (entry.gestureId === owner.id)
                      entries.push(entry);
          values = Object.freeze(entries.map(e => e.value));
          owners = this.entries.filter(owner => entries.some(e => e.gestureId === owner.id));
          for (const entry of owners)
              if (entry.sourceLease)
                  roots.push(entry.sourceLease.retain());
          this.assertOpen();
          this.assertRecordedCurrent();
          this.assertLayers();
          // The assertions above are owner callbacks and may create another
          // snapshot or retire/replace journal entries with the same count.
          // Claim the work slot only after this final callback-free check.
          if (generation !== this.replayGeneration || orderRevision !== this.replayOrderRevision
              || this.replayWork || count !== this.replay.size || entries.length !== count
              || entries.some(entry => entry.retired || this.replay.get(entry.id) !== entry))
              throw new Error('Replay snapshot owner retired');
      }
      catch (primary) {
          for (const root of roots)
              this.clean(() => root.release());
          this.clean(releaseMetadata);
          throw primary;
      }
      for (const entry of entries)
          entry.pins++;
      for (const owner of owners)
          owner.replayPins = (owner.replayPins ?? 0) + 1;
      let released = false, snapshot: ReplaySnapshot;
      snapshot = Object.freeze({
          values: () => {
              if (!values || released || this.closed || this.failed || generation !== this.replayGeneration || orderRevision !== this.replayOrderRevision)
                  throw new Error('Replay snapshot retired');
              const capturedValues = values;
              this.assertRecordedCurrent();
              this.assertLayers();
              for (const entry of entries) {
                  const value = entry.value;
                  if (value.kind === 'recorded')
                      value.input.delivery.assertCurrent(value.input);
                  else if (value.author.assertCurrent(value.author) !== value.author.lifetime.assertCurrent())
                      throw new Error('Local replay scope replaced');
              }
              for (const value of capturedValues)
                  if (value.kind === 'local' && value.author.assertCurrent(value.author) !== value.author.lifetime.assertCurrent())
                      throw new Error('Captured local replay scope replaced');
              if (released || this.closed || this.failed || generation !== this.replayGeneration || orderRevision !== this.replayOrderRevision)
                  throw new Error('Replay snapshot retired during assertion');
              return capturedValues;
          },
          release: () => {
              if (released)
                  return;
              released = true;
              if (this.replayWork === snapshot)
                  this.replayWork = undefined;
              for (const entry of entries) {
                  entry.pins--;
                  if (entry.retired && !entry.pins)
                      this.releaseReplayEntry(entry);
              }
              for (const owner of owners) {
                  owner.replayPins!--;
                  if (!owner.replayPins && owner.metadataRetired)
                      this.clean(owner.releaseMetadata);
              }
              owners.length = 0;
              for (const root of roots)
                  this.clean(() => root.release(this.cleanupContextLost()));
              this.clean(releaseMetadata);
              entries = [];
              values = undefined;
              roots.length = 0;
          },
      });
      this.replayWork = snapshot;
      return snapshot;
  }

  private commitFrontier():Entry|undefined {
    if(this.entries.some(e=>e.firstSequence===undefined))return undefined
    const entry=this.entries.find(e=>!e.committed)
    if(entry?.local&&(entry.local.receipts.length||!entry.recorded||(!entry.recorded.state.ended&&!entry.recorded.sealed)))return undefined
    return entry
  }

  /** Exactly one existing deposition turn OR one <=8 draw rebase/commit turn.
   * No draw leases or GL state survive the synchronous return. Metadata
   * storage pins can span turns; no RAF, promise or automatic retry is created. */
  advance(options:{readonly deferPresentation?:true}={}): void {
    this.assertOpen();this.assertRecordedCurrent(); this.busy = true
    try {
      const turnStarted = performance.now()
      this.assertLayers()
      const frontier = this.commitFrontier()
      const preparing=this.queue.findIndex(entry=>entry.executor.hasPendingLayerTargetPreparation)
      // A confirmation can dirty presentation while this SAME executor still
      // owns an unmaterialized stable target ticket. Finish its bounded turn
      // before either presentation or commit attempts another admission.
      if(preparing>=0)this.advanceEntry(this.queue[preparing],preparing)
      else if (frontier?.ownership) this.commit(frontier,turnStarted)
      else if(this.stableOrderBlocked){
        if(!this.queue.length)return
        // Keep a partial stable commit's SAME pin. Resident plans compose via
        // the layer's existing storagePins; no partial buffer is unpinned.
        const pending=this.entries.find(entry=>entry.targetPlan&&!entry.commitTarget)
        if(pending){
          const tile=pending.ownership!.tiles[pending.tile]
          pending.commitTarget=this.target(pending.targetPlan!,tile,true)
          if(!pending.commitTarget){
            runBrushGlTurn({callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite]},()=>{
              this.gl.activeTexture(this.gl.TEXTURE0)
              pending.commitTarget=this.target(pending.targetPlan!,tile)
            })
            return // At most one materialization; raw work starts next turn.
          }
        }
        this.advanceEntry(this.queue[0],0)
      }
      // A started preview owns physical plans and must finish normally. Only
      // a NEW preview may wait while an unpublished indexed candidate consumes
      // its next already-delivered continuation. Readiness remains unchanged.
      else if (this.dirty.size && (this.work || !options.deferPresentation)) this.present(turnStarted)
      else if (this.queue.length)this.advanceEntry(this.queue[0],0)
    } catch (error) {
      this.failed = true
      this.releaseAll(this.cleanupContextLost())
      this.clean(() => this.notifyPoison(error))
      throw error
    } finally { this.busy = false }
  }

  private advanceEntry(entry:Entry,index:number):void {
    const before=entry.executor.pendingFrameCount
    entry.executor.advance()
    if(entry.executor.pendingFrameCount<before||!entry.executor.pending&&entry.executor.rawWashSealed)this.queue.splice(index,1)
    if(entry.executor.rawWashSealed){entry.ownership=entry.executor.takeRawWash();this.invalidate()}
  }

  private invalidate(bounds?: Readonly<WorldRect>): void {
    if(bounds !== undefined && (!bounds || typeof bounds!=='object' || ![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(Number.isSafeInteger)
      || bounds.maxX<bounds.minX || bounds.maxY<bounds.minY))throw new RangeError('Invalid canonical wash dirty bounds')
    // Validate before revision/dirty mutation. Crop to the same admitted page and
    // existing tile union; a changed callback cannot allocate another target.
    const updates: [string,WorldRect][]=[]
    for(const [k,p]of this.positions){
      const page=this.options.pageBounds, area=bounds??rect(p)
      const b={minX:Math.max(p.x,area.minX,bounds&&page?page.minX:p.x),minY:Math.max(p.y,area.minY,bounds&&page?page.minY:p.y),
        maxX:Math.min(p.x+p.width,area.maxX,bounds&&page?page.maxX:p.x+p.width),maxY:Math.min(p.y+p.height,area.maxY,bounds&&page?page.maxY:p.y+p.height)}
      if(b.maxX>b.minX&&b.maxY>b.minY)updates.push([k,b])
    }
    this.revision++
    for(const [k,b]of updates){const old=this.dirty.get(k);this.dirty.set(k,old?{minX:Math.min(old.minX,b.minX),minY:Math.min(old.minY,b.minY),maxX:Math.max(old.maxX,b.maxX),maxY:Math.max(old.maxY,b.maxY)}:b)}
    const previous=this.work;this.work=undefined
    this.closePresentationPlans(previous)
  }
  private locals(entry: Entry): readonly CanonicalWashLocalTile[] { return entry.ownership?.tiles ?? (entry.committed ? [] : entry.executor.rawWashTiles()) }
  private target(plan:PreparedLayerTargets,p:Position,residentOnly:true):PaintTarget|undefined
  private target(plan:PreparedLayerTargets,p:Position,residentOnly?:false):PaintTarget
  private target(plan:PreparedLayerTargets,p:Position,residentOnly=false):PaintTarget|undefined {
    if(plan.length!==1)throw new Error('Canonical wash target geometry changed')
    const target=residentOnly?plan.takeResident(0):plan.take(0)
    if(!target)return undefined
    if(target.originX!==p.x||target.originY!==p.y||target.buffer.width!==p.width||target.buffer.height!==p.height)throw new Error('Canonical wash target geometry changed')
    return target
  }
  private part(view: CanonicalRgba8SourceView, part: number, bounds?: Readonly<WorldRect>): { view: CanonicalRgba8SourceView; count: number } {
    const capacity = this.options.composite.preparedCapacity()
    const left=bounds?Math.max(0,bounds.minX-view.rect.x):0, top=bounds?Math.max(0,bounds.minY-view.rect.y):0
    const right=bounds?Math.min(view.textureWidth,bounds.maxX-view.rect.x):view.textureWidth
    const bottom=bounds?Math.min(view.textureHeight,bounds.maxY-view.rect.y):view.textureHeight
    const columns=Math.ceil((right-left)/capacity.width), rows=Math.ceil((bottom-top)/capacity.height)
    const count=Math.max(0,columns)*Math.max(0,rows)
    if(!count)return {count:0,view}
    const x=left+part%columns*capacity.width, y=top+Math.floor(part/columns)*capacity.height
    const width=Math.min(capacity.width,right-x), height=Math.min(capacity.height,bottom-y)
    return { count, view: { ...view, rect: { x: view.rect.x+x, y: view.rect.y+y, width, height },
      bounds: { x:x/view.textureWidth, y:(view.textureHeight-y-height)/view.textureHeight, width:width/view.textureWidth, height:height/view.textureHeight } } }
  }

  private commit(entry: Entry, turnStarted: number): void {
    const tiles = entry.ownership!.tiles
    if(entry.tile<tiles.length){
      const tile=tiles[entry.tile]
      entry.targetPlan??=this.stable.preparePaintTargetRects([rect(tile)])
      if(!entry.commitTarget)entry.commitTarget=this.target(entry.targetPlan,tile,true)
      if(performance.now()-turnStarted>=4)return
      if(!entry.commitTarget){
        runBrushGlTurn({callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite]},()=>{
          const gl=this.maskParticipant.brushGlBatchInfo().gl;gl.activeTexture(gl.TEXTURE0)
          entry.commitTarget=this.target(entry.targetPlan!,tile)
        })
        return
      }
    }
    if (entry.tile < tiles.length) runBrushGlTurn({callbackScope:this.options.callbackScope, participants: [this.maskParticipant, this.options.composite] }, turn => {
      const gl=this.maskParticipant.brushGlBatchInfo().gl
      gl.activeTexture(gl.TEXTURE0)
      const tile = tiles[entry.tile], target = this.target(entry.targetPlan!,tile)
      if (entry.committingBuffer && entry.committingBuffer !== target.buffer) throw new Error('Partially committed canonical target was replaced; rebuild required')
      const bound = bindCanonicalLayerTargets(this.stable, [target])[0]
      if(tile.view.residency.kind!=='external')throw new Error('Raw wash must have explicit ownership')
      runBrushGlBatch({turn,participants:[this.maskParticipant,this.options.composite],owners:[bound.lifetime,tile.view.residency]},frame=>{
        let draws=0
        while(draws++<8){
          this.assertLayers()
          const part = this.part(tile.view, entry.part)
          this.options.composite.drawSource({ source: { kind: 'straightRgba8', view: part.view }, target: bound, operation: canonicalWashOuterOperation(this.options.rasterProfile, entry.blend, entry.opacity), writeBounds: this.options.pageBounds ?? undefined }, frame)
          entry.committingBuffer = target.buffer; entry.part++
          this.stable.markContentPainted(rect(tile))
          if(entry.part===part.count){this.closeCommitPlan(entry);entry.part=0;entry.tile++;entry.committingBuffer=undefined;break}
          if(frame.shouldYield||performance.now()-turnStarted>=4)break
        }
      })
    })
    // During partial commit no old derived preview is exposed as ready.
    this.invalidate()
    if (entry.tile === tiles.length) {
      entry.committed = true
      this.retireReplayGesture(entry.id)
      const ownership = entry.ownership!; entry.ownership = undefined
      entry.local=undefined
      const sourceLease=entry.sourceLease;entry.sourceLease=undefined;entry.image=undefined
      const cleanupStart=this.errors.length
      this.clean(()=>ownership.release());this.retireReplayMetadata(entry)
      if(sourceLease)this.clean(()=>sourceLease.release())
      if(this.errors.length>cleanupStart)throw this.errors[cleanupStart]
      this.options.changed(this.options.layerId)
    }
  }

  private present(turnStarted: number): void {
    const k = this.dirty.keys().next().value as string | undefined
    if (k === undefined) return
    this.work ??= { position: this.positions.get(k)!, revision: this.revision, stage: -1, part: 0, bounds: { ...this.dirty.get(k)! } }
    const work = this.work, p = work.position
    if(!work.stablePlan){
      const stable=this.stable.preparePaintTargetRects([rect(p)])
      try{work.derivedPlan=this.derived.preparePaintTargetRects([rect(p)]);work.stablePlan=stable}
      catch(primary){try{stable.close()}catch{/* Preserve admission failure. */}throw primary}
    }
    if(!work.stableTarget)work.stableTarget=this.target(work.stablePlan!,p,true)
    if(performance.now()-turnStarted>=4)return
    if(!work.derivedTarget)work.derivedTarget=this.target(work.derivedPlan!,p,true)
    if(performance.now()-turnStarted>=4)return
    if(!work.stableTarget||!work.derivedTarget){
      runBrushGlTurn({callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite]},()=>{
        const gl=this.maskParticipant.brushGlBatchInfo().gl;gl.activeTexture(gl.TEXTURE0)
        if(!work.stableTarget)work.stableTarget=this.target(work.stablePlan!,p)
        else work.derivedTarget=this.target(work.derivedPlan!,p)
      })
      return
    }
    runBrushGlTurn({callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite]},turn=>{
      const gl=this.maskParticipant.brushGlBatchInfo().gl
      gl.activeTexture(gl.TEXTURE0)
      // Resolve while preserving the caller's complete GL state. Each actual
      // layer binding is retained only inside this one synchronous capsule.
      const target = this.target(work.derivedPlan!,p), stable = this.target(work.stablePlan!,p)
      const bound = bindCanonicalLayerTargets(this.derived, [target])[0], base = bindCanonicalLayerTargets(this.stable, [stable])[0]
      const initialized=p.presentation!
      if(work.buffer ? work.buffer!==target.buffer || work.texture!==target.buffer.texture || work.stableBuffer!==stable.buffer || work.stableTexture!==stable.buffer.texture
        : initialized.derived!==target.buffer || initialized.derivedTexture!==target.buffer.texture || initialized.stable!==stable.buffer || initialized.stableTexture!==stable.buffer.texture){
        work.stage=-1;work.part=0;work.bounds=rect(p)
      }
      work.buffer=target.buffer;work.texture=target.buffer.texture;work.stableBuffer=stable.buffer;work.stableTexture=stable.buffer.texture
      const tiles=this.entries.map(entry=>this.locals(entry).find(t=>key(t)===key(p)))
      const owners=[base.lifetime,bound.lifetime]
      for(const tile of tiles)if(tile){
        if(tile.view.residency.kind!=='external')throw new Error('Raw wash must have explicit ownership')
        owners.push(tile.view.residency)
      }
      runBrushGlBatch({turn,participants:[this.maskParticipant,this.options.composite],owners},frame=>{
        if (work.stage === -1) {
          const b=work.bounds
          if(b.minX===p.x&&b.minY===p.y&&b.maxX===p.x+p.width&&b.maxY===p.y+p.height)stable.buffer.copyTo(target.buffer)
          else { const x=b.minX-p.x,y=p.height-(b.maxY-p.y);stable.buffer.copyRegionInto(target.buffer,x,y,x,y,b.maxX-b.minX,b.maxY-b.minY) }
          work.stage = 0
        }
        let draws=0
        while(work.stage<this.entries.length&&draws<8){
          const entry=this.entries[work.stage],tile=tiles[work.stage]
          if(entry.committed||!tile){work.stage++;work.part=0;continue}
          this.assertLayers()
          const part=this.part(tile.view,work.part,work.bounds)
          if(!part.count){work.part=0;work.stage++;continue}
          this.options.composite.drawSource({source:{kind:'straightRgba8',view:part.view},target:bound,operation:canonicalWashOuterOperation(this.options.rasterProfile, entry.blend, entry.opacity),writeBounds:this.options.pageBounds??undefined},frame)
          work.part++;draws++
          if(work.part===part.count){work.part=0;work.stage++}
          if(frame.shouldYield||performance.now()-turnStarted>=4)break
        }
        this.derived.markContentPainted(work.bounds)
      })
    })
    if (work.stage === this.entries.length) {
      Object.assign(p.presentation!,{stable:work.stableBuffer,derived:work.buffer,stableTexture:work.stableTexture,derivedTexture:work.texture})
      this.closePresentationPlans(work)
      this.dirty.delete(k); this.work = undefined;
      if(!this.dirty.size)this.completedPresentation=this.revision
      this.options.changed(this.options.layerId)
    }
  }

  private assertOpen(): void { if (this.closed || this.failed || this.busy) throw new Error('Canonical wash coordinator is closed, poisoned or busy') }
  private assertLayers(): void {
    let mask:Readonly<{width:number;height:number;epoch:object}>
    try{mask=this.maskParticipant.preparedCapacity()}catch{throw new Error('Canonical wash service preparation changed')}
    const current = [mask, this.options.composite.preparedCapacity()]
    for (let i = 0; i < current.length; i++) {
      const a=current[i], b=this.preparations[i]
      if(a.width!==b.width||a.height!==b.height||a.epoch!==b.epoch)throw new Error('Canonical wash service preparation changed')
    }
    const a = this.options.layer(this.options.layerId), b = this.options.presentation()
    if (a.buffer !== this.stable || a.epoch !== this.options.layerEpoch || b.buffer !== this.derived || b.epoch !== this.derivedEpoch) throw new Error('Canonical wash layer epoch changed')
  }
  private notifyPoison(reason: unknown): void { this.failed = true; this.options.poison(this.options.layerId, reason) }
  /** Cleanup status is advisory; a probe failure must not strand owners or
   * replace the primary error. Explicit lost:true admission still proves loss. */
  private cleanupContextLost():boolean {
    try{return this.gl.isContextLost()}catch(error){this.errors.push(error);return false}
  }
  private clean(action: () => void): void { try { action() } catch (error) { this.errors.push(error) } }
  private closePresentationPlans(work?:PresentationWork):void {
    if(!work)return
    const plans=[work.stablePlan,work.derivedPlan];work.stablePlan=undefined;work.derivedPlan=undefined;work.stableTarget=undefined;work.derivedTarget=undefined
    let failed=false,failure:unknown
    for(const plan of plans)try{plan?.close()}catch(error){if(!failed){failed=true;failure=error}}
    if(failed)throw failure
  }
  private closeCommitPlan(entry:Entry):void {
    const plan=entry.targetPlan;entry.targetPlan=undefined;entry.commitTarget=undefined;plan?.close()
  }
  private releaseAll(lost: boolean): void {
    this.replayGeneration++
    for(const entry of this.entries)this.retireReplayGesture(entry.id)
    this.clean(()=>this.replayWork?.release())
    this.clean(()=>this.closePresentationPlans(this.work))
    for(const entry of this.entries)this.clean(()=>this.closeCommitPlan(entry))
    this.queue.length = 0; this.dirty.clear(); this.work = undefined; this.positions.clear()
    for (const e of this.entries) {
      if (e.ownership) { const owned = e.ownership; e.ownership = undefined; this.clean(() => owned.release({ lost })) }
      this.clean(() => e.executor.cancel(new Error('Canonical wash lane cancelled'), { lost }))
      const receipts=e.local?.receipts.splice(0)??[];e.local=undefined
      for(const receipt of receipts)this.clean(receipt.release)
      const sourceLease=e.sourceLease;e.sourceLease=undefined;e.image=undefined
      if(sourceLease)this.clean(()=>sourceLease.release(lost))
      this.retireReplayMetadata(e)
    }
    const releases = this.reservations.splice(0)
    for (const release of releases) this.clean(release)
  }
  cancel(reason: unknown = new Error('Canonical wash layer cancelled'), options: { lost?: boolean } = {}): void {
    if (this.busy) throw new Error('Cannot cancel a canonical wash turn')
    if (options.lost && !this.gl.isContextLost()) throw new Error('Cannot forget canonical wash on live context')
    if (this.closed) return
    this.closed = true; this.failed = true
    this.releaseAll(options.lost ?? this.cleanupContextLost());this.clean(() => this.notifyPoison(reason))
  }
}
