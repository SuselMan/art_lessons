import {BrushCpuBudgetExhaustion} from './BrushMipCache'
import {canonicalMaskedSourceMaterialContext,canonicalSourceMaterialContext,decodeCanonicalStrokeFrame,CANONICAL_SOURCE_MATERIAL_PROFILE} from '@grafetto/shared'
import {canonicalStandaloneStrokeSnapshotV8,decodeCanonicalPrimaryGrainStrokeFrame,canonicalPrimaryGrainMaterialContext,CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE,type CanonicalStandaloneStrokeSnapshotV8,type CanonicalMaterialFrameV8} from '@grafetto/shared'
import {CANONICAL_MATERIAL_LIMITS,decodeCanonicalTexturedAutoStrokeFrame,canonicalTexturedAutoMaterialContext,canonicalStrokeSnapshotV7,CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE,type CanonicalStrokeSnapshotV7,type CanonicalMaterialFrameV7} from '@grafetto/shared'
import {canonicalSoftAutoDataEqual,canonicalSoftNativeDefaultTexturedSourceMaterialContext,canonicalStrokeSnapshotV6,CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE,type CanonicalStrokeSnapshotV6,type CanonicalMaterialFrameV6,canonicalPressureTexturedSourceMaterialContext,canonicalStrokeSnapshotV5,CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE,type CanonicalStrokeSnapshotV5,type CanonicalMaterialFrameV5,canonicalTexturedSourceMaterialContext,canonicalStrokeSnapshotV4,CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE,type CanonicalStrokeSnapshotV4,type CanonicalMaterialFrameV4,canonicalPrimaryTextureMaterialContext,canonicalStrokeSnapshotV3,decodeCanonicalRecordedSnapshotFrameV8,CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE,type CanonicalMaterialFrameV3,type CanonicalStrokeSnapshotV3} from '@grafetto/shared'
import type {CanonicalMaskCapacityLease} from './TransformedMaskPrepass'
import {canonicalImageRequiredSourceLevels} from './canonicalImageCapacity'
import {CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,canonicalImageMaterialPin,canonicalSourceStrokeSnapshotV2,advanceCanonicalMaterialPrefix,CANONICAL_MATERIAL_PREFIX_START,prepareCanonicalRecordedAttachmentV8,verifyCanonicalRecordedClose,canonicalDefaultAutoSourcePin,canonicalGaussianAutoSourcePin,canonicalSoftAutoSourcePin,type CanonicalMaterialPrefixState,type CanonicalStrokeSnapshotV2,type CanonicalRecordedReadScope,type CanonicalStrokeOperation} from '@grafetto/shared'
import type {CanonicalMaskSourceReader,CanonicalMaskSourceLease} from './CanonicalMaskSourceBank'
import type {CanonicalRecordedInput,CanonicalRecordedLifetime} from '../oplog/CanonicalRecordedDelivery'
import { CANONICAL_STROKE_RASTER_PROFILE, CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE, isCanonicalStrokeComposition, canonicalStrokeCompositionExtensions, canonicalPixelSourceOuterCompositionLaw, type CanonicalStrokeComposition } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { PaintTarget } from '../buffers/ILayerBuffer'
import type { TiledLayerBuffer,PreparedLayerTargets } from '../buffers/TiledLayerBuffer'
import type { WorldRect } from '../buffers/tileMath'
import { runBrushGlBatch, runBrushGlTurn } from './BrushGlBatch'
import { bindCanonicalLayerTargets } from './CanonicalLayerTargets'
import {prepareRenderedPrefixCursor7,type CanonicalRenderedPrefixCursor7, CanonicalFrameExecutor, CanonicalFrameCpuPressure, canonicalWashOuterOperation, type CanonicalReplaySource,type CanonicalReplaySourceData, type CanonicalReplayAdmissionTicket, type CanonicalFrameExecutorOptions, type CanonicalFrameSubmission, type CanonicalWashLocalTile, type CanonicalWashOwnership } from './CanonicalFrameExecutor'
import { planCanonicalTargets } from './CanonicalTargetPlan'
import type { CanonicalRgba8SourceView } from './CanonicalRgba8CompositePass'

/** Internal accepted-BEGIN lease. The actual layer owner validates the exact
 * receiver/candidate; received frame fields never confer this authority. */
export interface CanonicalLocalWashAuthor {
 readonly lifetime:CanonicalRecordedLifetime
 readonly snapshot:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV3|CanonicalStrokeSnapshotV4|CanonicalStrokeSnapshotV5|CanonicalStrokeSnapshotV6|CanonicalStrokeSnapshotV7|CanonicalStandaloneStrokeSnapshotV8
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
/** Engine-owned resource staging only; not an input/paint capability. */
export interface CanonicalPreviewCandidate {
  readonly buffer:TiledLayerBuffer
  assertCurrent():void
  cancel():void
  finish(old:TiledLayerBuffer,disposition?:CanonicalPreviewPublicationDisposition):void
}
export type CanonicalPreviewPublicationDisposition='display'|'closed-handoff'
export interface CanonicalPreviewPublication {
  readonly disposition:CanonicalPreviewPublicationDisposition
  readonly buffer:TiledLayerBuffer
  readonly previous:TiledLayerBuffer
  readonly revision:number
  assertCurrent():void
  publish():void
  finish():void
}
export type CanonicalPreviewOutcome =
  | {readonly kind:'preview-failed';readonly revision:number;readonly error:unknown}
  | {readonly kind:'preview-ready';readonly ticket:CanonicalPreviewPublication}
  | {readonly kind:'preview-idle'}
interface PreviewSnapshotEntry {
  readonly committed:boolean
  readonly opacity:number
  readonly blend:CanonicalStrokeComposition['outerBlend']
  readonly tiles:readonly CanonicalWashLocalTile[]
}
interface PreviewCandidateWork {
  checkpoint?:RenderedTailCheckpoint
  mixed?:MixedCandidateWork
  executionStarted?:true
  executionFailed?:true
  readonly revision:number
  readonly generation:number
  readonly order:number
  obsoleteReason?:object
  readonly previous:TiledLayerBuffer
  readonly staged:CanonicalPreviewCandidate
  readonly positions:ReadonlyMap<string,Position>
  readonly remaining:Map<string,WorldRect>
  readonly entries:readonly PreviewSnapshotEntry[]
  readonly releaseMetadata:()=>void
  cleanupFailed?:true
  ticket?:CanonicalPreviewPublication
}
export interface CanonicalWashLayerCoordinatorOptions extends Omit<CanonicalFrameExecutorOptions, 'washMode' | 'autoSource' | 'sourceMaterial' | 'maskedSource' | 'sourceLease' | 'bank' | 'softProgramOwner' | 'primaryTexture' | 'changed' | 'poison' | 'replayFrontier' | 'candidateReplay7'> {
  readonly layerId: string
  readonly layerEpoch: number
  /** Distinct derived straight layer; the coordinator never owns/destroys it. */
  readonly presentation: () => { readonly buffer: TiledLayerBuffer; readonly epoch: number }
  /** Trusted gesture source binding, NOT data selected by a material frame. */
  readonly source: (gestureId: string, recorded?: CanonicalRecordedInput, local?:CanonicalLocalWashAuthor) => Pick<CanonicalFrameExecutorOptions, 'autoSource' | 'autoGeometryMechanism' | 'sourceMaterial' | 'maskedSource' | 'bank' | 'softProgramOwner' | 'primaryTexture'> & {readonly sourceLease?:CanonicalMaskSourceLease}
  /** Explicit caller capacity; no implicit queue, expiry or GPU quota. Includes
   * completed IDs until this coordinator is discarded after trusted rebuild. */
  readonly maxGestures: number
  /** Internal resource retention only; never a room/source permission. */
  /** Owner opt-in; absent leaves the historical wash path unchanged. */
  readonly previewCandidate?: (bytes:number)=>CanonicalPreviewCandidate
  readonly replayRetention?: Readonly<{maxEntries:number;maxBytes:number}>
  /** Internal mixed candidate role; no room/source/read permission. */
  readonly mixedReplay7?:true
  readonly changed: (layerId: string) => void
  readonly poison: (layerId: string, reason: unknown) => void
}
interface RecordedPrefix {
 readonly lifetime:CanonicalRecordedLifetime
 readonly scope:Readonly<CanonicalRecordedReadScope>
 readonly snapshot:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV3|CanonicalStrokeSnapshotV4|CanonicalStrokeSnapshotV5|CanonicalStrokeSnapshotV6|CanonicalStrokeSnapshotV7|CanonicalStandaloneStrokeSnapshotV8
 readonly userId:string
 readonly strokeId:string
 readonly firstOperationId:string
 readonly firstSeq:number
 readonly lastOperationId:string
 readonly lastSeq:number
 readonly state:CanonicalMaterialPrefixState
 readonly sealed:boolean
}
type ReplayStage={readonly published:boolean;bindAcceptedFrame(frame:CanonicalStrokeOperation['frame']):void;assertPrepared():void;publishPrepared():void;commit():void;rollback():void}
type FrontierSlot={readonly kind:'metadata-frontier';readonly entry:Entry;readonly ticket:CanonicalReplayAdmissionTicket}
type LaneSlot=Entry|FrontierSlot
/** Existing original delivery + verifier metadata; never a source/read grant. */
interface RecordedCloseReceipt {
  readonly input:CanonicalRecordedInput
  readonly seal:Readonly<import('@grafetto/shared').CanonicalRecordedCloseSeal>
  readonly prefix:RecordedPrefix
  readonly releaseMetadata:()=>void
}
interface Entry {
  readonly mode:CanonicalStrokeComposition['mode']
  depositedNextOrdinal:number
  /** Two bounded scalars in the existing Entry1024/group768 metadata model. */
  firstRawPaintNextOrdinal?:number
  publishedPaintedNextOrdinal?:number
  washInFlight?:true
  replaySource?:CanonicalReplaySource
  image?:Readonly<{bank:CanonicalMaskSourceReader;generation:number}>
  sourceLease?:CanonicalMaskSourceLease
  recorded?:RecordedPrefix
  closeReceipt?:RecordedCloseReceipt
  metadataReleased?:true
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
// One Map row, counter and idempotent release closure; logical estimate, not V8 heap.
const CANONICAL_REPLAY_CAPABILITY_CPU_METADATA_BYTES=256
type ReplayCapability=NonNullable<CanonicalRecordedInput['read']>['capability']
interface ReplayCapabilityCharge {readonly bytes:number;refs:number;readonly release:()=>void}
interface ReplayEntry {
    /** Buildup7/8: SAME normalized envelope, covered by existing512 index charge. */
    acceptedFrame?:CanonicalStrokeOperation['frame'];
    readonly id: string;
    readonly gestureId: string;
    value: ReplayValue;
    bytes: number;
    release: () => void;
    pins: number;
    retired: boolean;
}
interface ReplayGroupFrame {
    /** Original identity/provenance only; never replay its raw operation.frame. */
    readonly value:ReplayValue
    readonly frame:CanonicalStrokeOperation['frame']
}
interface ReplayBuildupGroup {
    readonly kind:'buildup'
    readonly id:string
    readonly frames:readonly ReplayGroupFrame[]
    readonly source:CanonicalReplaySourceData
    readonly close?:Readonly<Pick<RecordedCloseReceipt,'input'|'seal'>>
}
interface ReplayWashGroup {
    readonly kind:'wash'
    readonly id:string
    readonly depositedNextOrdinal:number
    readonly frames:readonly ReplayGroupFrame[]
    readonly presentation:PreviewSnapshotEntry
    readonly close?:Readonly<Pick<RecordedCloseReceipt,'input'|'seal'>>
}
type ReplayCapturedGroup=ReplayBuildupGroup|ReplayWashGroup
interface RenderedTailCheckpoint {
 readonly generation:number
 readonly order:number
 readonly stable:TiledLayerBuffer
 readonly buffer:TiledLayerBuffer
 readonly grid:Readonly<{x0:number;y0:number;x1:number;y1:number;count:number}>
 readonly groups:readonly Readonly<{owner:Entry;frames:readonly ReplayEntry[];source?:CanonicalReplaySource;sourceLease?:CanonicalMaskSourceLease;ownership?:CanonicalWashOwnership;deposited:number;opacity:number;blend:CanonicalStrokeComposition['outerBlend']}>[]
 readonly root:CanonicalMaskSourceLease
 readonly cursor:CanonicalRenderedPrefixCursor7
 ready:boolean
 retired:boolean
 preempted:boolean
 release():void
}
interface MixedCandidateWork {
    seedBase?:TiledLayerBuffer
    seedPlan?:PreparedLayerTargets
    resumeCursor?:CanonicalRenderedPrefixCursor7
    readonly snapshot:ReplayGroupsWork
    readonly groups:readonly ReplayCapturedGroup[]
    group:number
    frame:number
    seeded:boolean
    lastEnded?:boolean
    pendingEnded?:boolean
    activeEntries:readonly PreviewSnapshotEntry[]
    child?:CanonicalFrameExecutor
    root?:CanonicalMaskSourceLease
}
interface ReplayGroupsWork {
    readonly snapshot:ReplaySnapshot
    readonly detach:()=>void
    readonly assertOwned:()=>void
    readonly closedOwned:()=>boolean
    readonly valuesOwned:()=>readonly ReplayValue[]
    readonly groupsOwned:()=>readonly ReplayCapturedGroup[]
    readonly retainRootOwned:(group:ReplayCapturedGroup)=>CanonicalMaskSourceLease|undefined
}
interface ReplaySnapshot {
    values(): readonly ReplayValue[];
    groups?():readonly ReplayCapturedGroup[];
    assertCurrent?():void;
    retainRoot?(group:ReplayCapturedGroup):CanonicalMaskSourceLease|undefined;
    release(): void;
}
interface Position {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number
  readonly writeBounds?:Readonly<WorldRect>
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
  private derived: TiledLayerBuffer
  private readonly derivedEpoch: number
  private readonly maskParticipant:CanonicalMaskCapacityLease
  private readonly preparations: readonly Readonly<{ width: number; height: number; epoch: object }>[]
  private readonly entries: Entry[] = []
  private readonly queue: LaneSlot[] = []
  private readonly positions = new Map<string, Position>()
  private dirty = new Map<string, WorldRect>()
  private readonly reservations: (() => void)[] = []
  private readonly errors: unknown[] = []
  private work?: PresentationWork
  private candidate?:PreviewCandidateWork
  private previewLane?:Entry
  private previewBoundaryReady=false
  private previewFailure?:{readonly revision:number;readonly error:unknown}
  private revision = 0
  private completedPresentation = -1
  private lastSequence = 0
  private busy = false
  private failed = false
  private closed = false
  private readonly replay = new Map<string,ReplayEntry>()
  private readonly replayCapabilities=new Map<ReplayCapability,ReplayCapabilityCharge>()
  private replayBytes = 0
  private replayCount = 0
  private replayGeneration = 0
  private replayOrderRevision = 0
  private replayWork?:ReplaySnapshot|ReplayGroupsWork
  private renderedTail?:RenderedTailCheckpoint

  constructor(options: CanonicalWashLayerCoordinatorOptions) {
    if (!options.layerId || !Number.isSafeInteger(options.layerEpoch) || options.layerEpoch < 0
      || !Number.isSafeInteger(options.maxGestures) || options.maxGestures < 1) throw new TypeError('Invalid canonical wash layer capacity/identity')
    if(options.mixedReplay7&&(!options.replayRetention||!options.previewCandidate))throw new TypeError('Replay frontier requires retained isolated preview owner')
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
    if(options.mixedReplay7){
      const grid=this.seedGrid(),count=this.fullSeedCount(),owned=batch.cpu.reserve(count*256)
      this.reservations.push(owned)
      const current=this.seedGrid()
      if(this.closed||this.failed||this.positions.size||current.x0!==grid.x0||current.x1!==grid.x1||current.y0!==grid.y0||current.y1!==grid.y1||current.count!==grid.count||this.fullSeedCount()!==count)throw Error('Mixed seed changed during reservation')
      this.addSeed(this.positions,grid)
    }
    }catch(error){for(const release of this.reservations.splice(0))try{release()}catch{/* Preserve construction error. */}try{this.maskParticipant.release()}catch{/* Preserve construction error. */}throw error}
  }

  /** Native content bbox covers evicted content too; never allResident/readback. */
  private seedGrid():Readonly<{x0:number;y0:number;x1:number;y1:number;count:number}> {
    const bounds=this.stable.getContentBoundsWorld(),page=this.options.pageBounds
    if(!bounds)return{x0:0,y0:0,x1:0,y1:0,count:0}
    const minX=page?Math.max(bounds.minX,page.minX):bounds.minX,minY=page?Math.max(bounds.minY,page.minY):bounds.minY
    const maxX=page?Math.min(bounds.maxX,page.maxX):bounds.maxX,maxY=page?Math.min(bounds.maxY,page.maxY):bounds.maxY
    if(maxX<=minX||maxY<=minY)return{x0:0,y0:0,x1:0,y1:0,count:0}
    const x0=Math.floor(minX/this.stable.tileWidth),y0=Math.floor(minY/this.stable.tileHeight)
    const x1=Math.ceil(maxX/this.stable.tileWidth),y1=Math.ceil(maxY/this.stable.tileHeight),count=(x1-x0)*(y1-y0)
    if(![x0,y0,x1,y1,count,x0*this.stable.tileWidth,x1*this.stable.tileWidth,y0*this.stable.tileHeight,y1*this.stable.tileHeight].every(Number.isSafeInteger)||count<0)throw new RangeError('Canonical seed grid exceeds bounds')
    return{x0,y0,x1,y1,count}
  }
  private forSeed(grid:ReturnType<CanonicalWashLayerCoordinator['seedGrid']>,visit:(x:number,y:number)=>void):void {
    for(let y=grid.y0;y<grid.y1;y++)for(let x=grid.x0;x<grid.x1;x++)visit(x*this.stable.tileWidth,y*this.stable.tileHeight)
  }
  private fullSeedCount():number {
    const grid=this.seedGrid()
    if(this.options.mixedReplay7&&grid.count>64)throw new RangeError('Mixed seed exceeds bounded target union')
    let count=grid.count
    for(const p of this.positions.values()){
      const x=p.x/this.stable.tileWidth,y=p.y/this.stable.tileHeight
      if(x<grid.x0||x>=grid.x1||y<grid.y0||y>=grid.y1)count++
    }
    if(!Number.isSafeInteger(count)||this.options.mixedReplay7&&count>64)throw new RangeError('Mixed seed exceeds bounded target union')
    return count
  }
  private addSeed(positions:Map<string,Position>,grid=this.seedGrid()):void {
    this.forSeed(grid,(x,y)=>{const k=`${x}:${y}`;if(!positions.has(k))positions.set(k,{x,y,width:this.stable.tileWidth,height:this.stable.tileHeight,presentation:{}})})
  }
  get mixedReplayEnabled():boolean {return this.options.mixedReplay7===true}
  private publishedNativePaintOrder=-1
  private previewRecapturePending():boolean {
    return !!this.options.mixedReplay7&&!this.closed&&!this.failed
      &&this.entries.length>0&&this.replayCount>0&&this.revision>this.completedPresentation
  }
  private localCapacityRevision=0
  /** Notification stamp only: no readiness or admission authority. */
  get localCapacityProgressRevision():number{return this.localCapacityRevision}
  get queuedFrameCount():number { return this.queue.length }
  private washSlot(index:number):Entry {const slot=this.queue[index];if(!slot||'kind'in slot)throw new Error('Expected executable wash slot');return slot}
  /** A partially published stable commit cannot be shown through a raw-wash
   * rebase while a later local gesture still lacks its recorded order. */
  private get stableOrderBlocked():boolean {
    return !this.options.mixedReplay7&&!this.commitFrontier()&&this.entries.some(entry=>!entry.committed&&!!entry.ownership&&!!(entry.targetPlan||entry.tile||entry.part))
  }
  get awaitingRecordedOrder():boolean {return this.stableOrderBlocked&&!this.queue.length}
  /** Original receipts only; a retained local lease after promotion is not pending. */
  get hasPendingLocal():boolean {return this.entries.some(entry=>!!entry.local?.receipts.length)}
  get poisoned(): boolean { return this.failed }
  /** Pixel execution still owed when an unpublished restore defers NEW preview. */
  get executionPending():boolean { if(this.options.mixedReplay7)return !!this.queue.length||!!this.candidate;return !!this.queue.length || !!this.work || !!this.commitFrontier()?.ownership }
  get pending(): boolean { if(this.options.mixedReplay7)return !!this.queue.length||!!this.candidate||!!this.dirty.size||this.previewRecapturePending();return !!this.queue.length || !!this.dirty.size || !!this.work || !!this.commitFrontier()?.ownership }
  get presentationReady(): boolean { return !this.options.mixedReplay7 && !this.options.previewCandidate && !this.failed && !this.closed && !this.dirty.size && !this.work }
  /** Visual publication exists only after every dirty position has finished. */
  get publishedPresentationReady():boolean { return (!this.options.previewCandidate?this.presentationReady:!this.failed&&!this.closed)&&this.completedPresentation>=0 }
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
    if(close){if(!entry?.recorded)throw new Error('Recorded close owner missing');return this.options.mixedReplay7||this.queue.includes(entry)||this.queue.length<8}
    if(entry?.local)return true // Original promotion adds no GPU frame.
    return this.queue.length<8&&(!entry||entry.executor.pendingFrameCount<8)
  }

  /** Scheduling only for a finite original FOLLOW page. No frame admission,
   * source/ready grant, body decode or retained checkpoint is created. */
  canDeferRecordedPresentation(previous:CanonicalRecordedInput,next:CanonicalRecordedInput):boolean {
    this.assertOpen();this.busy=true
    const generation=this.replayGeneration,order=this.replayOrderRevision,revision=this.revision
    try{
      previous.delivery.assertCurrent(previous);next.delivery.assertCurrent(next)
      this.assertRecordedCurrent();this.assertLayers()
      if(this.closed||this.failed||!this.busy||generation!==this.replayGeneration||order!==this.replayOrderRevision||revision!==this.revision)return false
      if(!this.options.mixedReplay7||this.publishedNativePaintOrder!==order||this.hasPendingLocal)return false
      if(this.entries.some(entry=>!entry.metadataRetired&&!entry.metadataReleased&&entry.firstRawPaintNextOrdinal!==undefined
        &&(entry.publishedPaintedNextOrdinal===undefined||entry.firstRawPaintNextOrdinal>entry.publishedPaintedNextOrdinal)))return false
      const a=previous.operation,b=next.operation
      if(a.type!=='canonical_stroke'||b.type!=='canonical_stroke'||!previous.read||!next.read
        ||a.userId!==b.userId||a.layerId!==this.options.layerId||a.layerId!==b.layerId
        ||a.frame.strokeId!==b.frame.strokeId||b.seq!==a.seq!+1||b.frame.frameOrdinal!==a.frame.frameOrdinal+1
        ||previous.delivery.lifetime!==next.delivery.lifetime)return false
      const scope=previous.delivery.lifetime.assertCurrent()
      if(this.closed||this.failed||!this.busy||generation!==this.replayGeneration||order!==this.replayOrderRevision||revision!==this.revision)return false
      const id=JSON.stringify([scope.roomId,scope.boardEpoch,a.userId,a.frame.strokeId]),entry=this.entries.find(e=>e.id===id),prefix=entry?.recorded
      if(!entry||entry.mode!=='wash'||!prefix||entry.metadataRetired||entry.metadataReleased||entry.committed||entry.ownership
        ||prefix.lifetime!==previous.delivery.lifetime||prefix.scope!==scope||prefix.state.ended||prefix.sealed
        ||prefix.lastOperationId!==a.id||prefix.lastSeq!==a.seq||prefix.state.nextOrdinal!==b.frame.frameOrdinal
        ||entry.publishedPaintedNextOrdinal===undefined||entry.firstRawPaintNextOrdinal===undefined
        ||entry.firstRawPaintNextOrdinal>entry.publishedPaintedNextOrdinal
        ||entry.depositedNextOrdinal-entry.publishedPaintedNextOrdinal>=8
        ||!samePaintData(prefix.snapshot,previous.read.capability.snapshot)||!samePaintData(prefix.snapshot,next.read.capability.snapshot))return false
      if(this.previewLane&&this.previewLane!==entry)return false
      return this.queue.every(slot=>('kind'in slot?slot.entry:slot)===entry)
    }finally{this.busy=false}
  }

  /** Original local delivery, not a log copy or a source selected by a frame. */
  enqueueRecorded(input:CanonicalRecordedInput):void {
    this.assertOpen();this.busy=true
    let rejected=false
    let staged:ReturnType<CanonicalWashLayerCoordinator['stageReplay']>|undefined
    try{
      if(this.options.replayRetention){
        input.delivery.assertCurrent(input)
        const scope=input.delivery.lifetime.assertCurrent(),op=input.operation
        if(op.type!=='canonical_stroke'||!input.read)throw new TypeError('Original replay frame required')
        staged=this.stageReplay(JSON.stringify([scope.roomId,scope.boardEpoch,op.userId,op.frame.strokeId]),op,{kind:'recorded',input})
      }
      this.enqueueOriginal(input,staged)
      staged?.commit()
    }catch(error){rejected=true;if(this.options.mixedReplay7&&this.failed&&!staged?.published){this.releaseAll(this.cleanupContextLost());this.clean(()=>this.notifyPoison(error))}throw error}
    finally{try{if(this.options.mixedReplay7){const before=this.errors.length;this.cleanFrontier(()=>staged?.rollback());if(this.errors.length>before){this.releaseAll(this.cleanupContextLost());if(!rejected)throw this.errors[before]}}else staged?.rollback()}finally{this.busy=false}}
  }
  private enqueueOriginal(input:CanonicalRecordedInput,stage?:ReplayStage):void {
    input.delivery.assertCurrent(input)
    const lifetime=input.delivery.lifetime,scope=lifetime.assertCurrent(),op=input.operation,read=input.read
    if(op.type!=='canonical_stroke'||!read||op.seq!==read.sequence||read.operationId!==op.id)throw new TypeError('Recorded source input required')
    const accepted=prepareCanonicalRecordedAttachmentV8({version:1,roomId:read.roomId,boardEpoch:read.boardEpoch,
      capabilities:[read.capability],bindings:[{operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:0}]},[op],scope)[0]
    const snapshot=accepted.read!.capability.snapshot
    if(read.rasterProfile!==snapshot.rasterProfile)throw new TypeError('Recorded source profile mismatch')
    if(('maskSource'in snapshot.material&&snapshot.material.maskSource&&!(snapshot.materialVersion===2&&snapshot.material.maskingBlend))||snapshot.rasterProfile!==this.options.rasterProfile
      ||snapshot.layerId!==this.options.layerId)throw new TypeError('Unsupported recorded source context')
    const id=JSON.stringify([scope.roomId,scope.boardEpoch,op.userId,snapshot.strokeId])
    const existing=this.entries.find(e=>e.id===id),old=existing?.recorded
    if(existing&&!old&&!existing.local)throw new Error('Recorded namespace already occupied')
    if(old&&(old.lifetime!==lifetime||old.scope!==scope||old.sealed||old.lastSeq>=op.seq!
      ||JSON.stringify(old.snapshot)!==JSON.stringify(snapshot)))throw new Error('Recorded source lifetime/context changed')
    const decoded=decodeCanonicalRecordedSnapshotFrameV8(op.frame,snapshot,op.frame.frameOrdinal)
    if(this.options.mixedReplay7)stage?.bindAcceptedFrame(decoded.envelope)
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
      if(this.options.mixedReplay7){
        const source=existing.replaySource,sourceLease=existing.sourceLease
        const previousSequence=this.lastSequence,previousPrefix=existing.recorded
        let recapture:ReturnType<CanonicalWashLayerCoordinator['stagePreviewRecaptureOwned']>|undefined
        let rejected=false
        try{
          this.assertLayers();input.delivery.assertCurrent(input);this.assertLocal(local)
          if(lifetime.assertCurrent()!==scope)throw Error('Replay promotion scope changed')
          if(source){source.assertCurrent();this.assertReplayOriginal(source,snapshot)}
          if(sourceLease&&!sourceLease.isReady())throw Error('Replay promotion root retired')
          // A newly recorded local sorts AFTER all already recorded FIRSTs,
          // since its genuine sequence is greater than lastSequence. Capture
          // its insertion indices before the pure publication; no array copy.
          const previousIndex=this.entries.indexOf(existing)
          let targetIndex=previousIndex
          if(existing.firstSequence===undefined){
            targetIndex=0
            while(targetIndex<this.entries.length&&this.entries[targetIndex].firstSequence!==undefined)targetIndex++
          }
          // Confirmation changes retained delivery authority, not native paint.
          // No captured display/replay owner may survive this metadata-only
          // publication. Terminal/last-receipt promotion retains the ordinary
          // close-proof recapture, even when its pixels were already displayed.
          const metadataOnly=existing.mode==='wash'&&!existing.committed
            &&!existing.metadataRetired&&!existing.metadataReleased
            &&targetIndex===previousIndex&&!existing.washInFlight&&!this.dirty.size
            &&op.frame.frameOrdinal<existing.depositedNextOrdinal
            &&local.receipts.length>1&&!recorded.state.ended&&!recorded.sealed
            &&!this.candidate&&!this.replayWork&&!this.previewLane&&!this.work&&!this.renderedTail
          if(!metadataOnly)recapture=this.stagePreviewRecaptureOwned()
          recapture?.assertPrepared();stage?.assertPrepared()
          if(this.closed||this.failed||!this.busy||existing.local!==local
            ||local.receipts[0]!==receipt||existing.recorded!==previousPrefix
            ||existing.replaySource!==source||existing.sourceLease!==sourceLease
            ||this.lastSequence!==previousSequence||op.seq!<=previousSequence
            ||previousIndex<0||targetIndex>previousIndex||this.entries[previousIndex]!==existing)
            throw Error('Replay promotion changed')
          // SAME replay/source/receipt/order/dirty pair; no external callbacks.
          stage?.publishPrepared()
          local.receipts.shift();existing.recorded=recorded
          existing.firstSequence??=op.seq!;this.lastSequence=op.seq!
          if(targetIndex!==previousIndex){
            for(let index=previousIndex;index>targetIndex;index--)this.entries[index]=this.entries[index-1]
            this.entries[targetIndex]=existing;this.replayOrderRevision++
          }
          recapture?.publishPrepared()
          try{receipt.release()}catch(error){
            this.failed=true;this.errors.push(error);this.clean(()=>this.notifyPoison(error));throw error
          }
          return
        }catch(primary){rejected=true;throw primary}
        finally{
          const before=this.errors.length
          if(recapture)this.cleanFrontier(recapture.release)
          if(!rejected&&this.errors.length>before)throw this.errors[before]
        }
      }
      // Release may call external CPU-owner code. Publish no confirmation until
      // the exact original and local owner have survived that callback.
      receipt.release();this.assertLocal(local);input.delivery.assertCurrent(input)
      if(lifetime.assertCurrent()!==scope)throw new Error('Recorded scope replaced')
      this.assertLayers()
      local.receipts.shift();existing.recorded=recorded;existing.firstSequence??=op.seq!
      this.lastSequence=op.seq!;this.orderEntries();return
    }
    this.enqueueInternal({gestureId:id,layerId:op.layerId,layerEpoch:this.options.layerEpoch,ordinal:op.frame.frameOrdinal,
      frame:decoded.frame,assets:snapshot.material.assets,rgb:snapshot.pigmentRgb8,composition:snapshot.composition,...(snapshot.material.primarySource.kind==='defaultAuto'&&snapshot.material.primarySource.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE?{densityStrokeIdentity:{strokeId:snapshot.strokeId}}:{})},op.seq!,{input,recorded,stage})
  }

  private assertReplayOriginal(source:CanonicalReplaySource,snapshot:CanonicalLocalWashAuthor['snapshot']|undefined):void {
    if(!snapshot||source.materialVersion!==snapshot.materialVersion||source.rasterProfile!==snapshot.rasterProfile||!canonicalSoftAutoDataEqual(source.context,snapshot.material))throw new TypeError('Accepted replay source differs from original snapshot')
    if(source.materialVersion===7){
      if(snapshot.materialVersion!==7||!canonicalSoftAutoDataEqual(source.autoSource,snapshot.material.primarySource))throw new TypeError('Accepted Auto replay source differs from original snapshot')
    }else if(source.materialVersion===2){
      if(snapshot.materialVersion!==2||!canonicalSoftAutoDataEqual(canonicalSourceMaterialContext(source.context),canonicalSourceMaterialContext(snapshot.material)))throw new TypeError('Accepted masked replay source differs from original snapshot')
    }else{
      if(snapshot.materialVersion!==8)throw new TypeError('Accepted image replay source differs from original snapshot')
      const original=snapshot.material.primarySource
      if(original.kind==='image'?source.autoSource!==undefined:!source.autoSource||!canonicalSoftAutoDataEqual(source.autoSource,original))
        throw new TypeError('Accepted primary replay source differs from original snapshot')
    }
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
      this.entries.sort(compare);this.replayOrderRevision++;const checkpoint=this.renderedTail;this.renderedTail=undefined;if(checkpoint)this.cleanFrontier(checkpoint.release);this.invalidate();return
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
      ||('maskSource'in snapshot.material&&snapshot.material.maskSource&&(!('version'in snapshot.material)||snapshot.material.version!==2)))throw new TypeError('Invalid local source envelope/context')
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
    const decoded=decodeCanonicalRecordedSnapshotFrameV8(op.frame,snapshot,op.frame.frameOrdinal)
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
    let rejected=false,retryCpuPressure=false
    const errorsBefore=this.errors.length
    const local:LocalPrefix=previous??{author,scope,state,receipts:[]}
    let staged:ReturnType<CanonicalWashLayerCoordinator['stageReplay']>|undefined
    try{
      if(this.options.replayRetention)staged=this.stageReplay(id,op,{kind:'local',author,operation:op},retire)
      if(this.options.mixedReplay7)staged?.bindAcceptedFrame(decoded.envelope)
      this.assertLocal(local)
      this.enqueueInternal({gestureId:id,layerId:op.layerId,layerEpoch:this.options.layerEpoch,ordinal:op.frame.frameOrdinal,
        frame:decoded.frame,assets:snapshot.material.assets,rgb:snapshot.pigmentRgb8,composition:snapshot.composition,...(snapshot.material.primarySource.kind==='defaultAuto'&&snapshot.material.primarySource.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE?{densityStrokeIdentity:{strokeId:snapshot.strokeId}}:{})},undefined,undefined,local,this.options.mixedReplay7?{stage:staged,originalSnapshot:snapshot,publish:()=>{local.state=state;local.receipts.push({operation:op,frame:decoded.envelope,release:()=>{if(!this.replay.has(op.id))retire()}})}}:undefined)
      if(!this.options.mixedReplay7){local.state=state;local.receipts.push({operation:op,frame:decoded.envelope,release:()=>{if(!this.replay.has(op.id))retire()}});staged?.commit()}
    }catch(error){
      rejected=true
      if(this.options.mixedReplay7)this.cleanFrontier(retire);else this.clean(retire)
      if(this.failed&&(!this.options.mixedReplay7||!staged?.published)){this.releaseAll(this.cleanupContextLost());this.clean(()=>this.notifyPoison(error))}
      // Only already-published Work can release retained DTO metadata by
      // draining. An empty executor queue is a real baseline/budget failure.
      retryCpuPressure=error instanceof CanonicalFrameCpuPressure&&!this.failed
        &&this.entries.some(entry=>entry.executor.pendingFrameCount>0)
      if(!retryCpuPressure)throw error
    }finally{if(this.options.mixedReplay7){const before=this.errors.length;this.cleanFrontier(()=>staged?.rollback());if(this.errors.length>before){this.releaseAll(this.cleanupContextLost());if(!rejected||retryCpuPressure)throw this.errors[before]}}else staged?.rollback()}
    // Never turn a rollback/release failure into cooperative waiting.
    if(retryCpuPressure&&this.errors.length>errorsBefore)throw this.errors[errorsBefore]
    return !retryCpuPressure
    }finally{this.busy=false}
  }

  enqueueRecordedSeal(input:CanonicalRecordedInput):void {
    if(this.options.mixedReplay7){this.enqueueMixedRecordedSeal(input);return}
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

  /** Mixed original interrupted-close metadata; WASH does NOT seal native
   * execution or claim completion. No frame, queue slot, source or fake END. */
  /** Temporary metadata staging in the SAME CPU owner. Existing admitted
   * position metadata covers the retained dirty view; this extra reservation
   * covers simultaneous old/new maps until the pure control publication. */
  private stagePreviewRecaptureOwned(){
    if(!this.busy||!this.options.mixedReplay7||this.closed||this.failed)
      throw Error('Preview recapture staging unavailable')
    const previous=this.dirty,revision=this.revision,generation=this.replayGeneration
    const order=this.replayOrderRevision,count=this.positions.size
    const assertPrepared=()=>{
      if(!this.busy||this.closed||this.failed||this.dirty!==previous
        ||this.revision!==revision||this.replayGeneration!==generation
        ||this.replayOrderRevision!==order||this.positions.size!==count)
        throw Error('Preview recapture staging changed')
    }
    const release=this.maskParticipant.brushGlBatchInfo().cpu.reserve(128+count*256)
    let owned=true
    try{
      assertPrepared()
      const dirty=new Map(previous)
      for(const [key,position]of this.positions)dirty.set(key,rect(position))
      assertPrepared()
      return {
        assertPrepared,
        // Caller checked the stage immediately BEFORE its own pure native CAS.
        // No callback/validation/allocation may split that publication block.
        publishPrepared:()=>{
          this.dirty=dirty;this.revision=revision+1;this.previewBoundaryReady=false
        },
        release:()=>{if(owned){owned=false;release()}},
      }
    }catch(primary){
      if(owned){owned=false;this.cleanFrontier(release)}
      throw primary
    }
  }

  private enqueueMixedRecordedSeal(input:CanonicalRecordedInput):void {
    this.assertOpen()
    this.busy=true
    const generation=this.replayGeneration,previousSequence=this.lastSequence
    let release:(()=>void)|undefined
    let recapture:ReturnType<CanonicalWashLayerCoordinator['stagePreviewRecaptureOwned']>|undefined,rejected=false
    try {
      input.delivery.assertCurrent(input)
      const lifetime=input.delivery.lifetime,scope=lifetime.assertCurrent(),op=input.operation
      if(op.type!=='canonical_stroke_close'||input.read)throw new TypeError('Original close input required')
      const id=JSON.stringify([scope.roomId,scope.boardEpoch,op.targetUserId,op.strokeId])
      const entry=this.entries.find(e=>e.id===id),prefix=entry?.recorded
      if(!entry||!prefix||prefix.snapshot.composition.mode!==entry.mode||entry.mode==='buildup'&&prefix.snapshot.materialVersion!==7&&prefix.snapshot.materialVersion!==8&&prefix.snapshot.materialVersion!==2
        ||entry.committed||entry.metadataReleased||entry.metadataRetired
        ||prefix.lifetime!==lifetime||prefix.scope!==scope||prefix.sealed||entry.closeReceipt
        ||entry.local?.receipts.length)throw new Error('Recorded close owner missing or stale')
      const source=entry.replaySource,sourceLease=entry.sourceLease,image=entry.image
      this.assertRecordedCurrent()
      this.assertLayers()
      // The closed normalized operation has seven texts, each <=256 UTF-16
      // units. 1024 fixed logical bytes cover receipt/seal/sealed-prefix and
      // the retained own-scalar input tuple; no snapshot/read bag is accepted.
      release=this.options.prepass.brushGlBatchInfo().cpu.reserve(1024+7*256*2)
      recapture=this.stagePreviewRecaptureOwned()
      const seal=verifyCanonicalRecordedClose({...prefix.state,recordedNext:prefix.state.nextOrdinal,
        firstOperationId:prefix.firstOperationId,lastOperationId:prefix.lastOperationId,
        firstSeq:prefix.firstSeq,lastSeq:prefix.lastSeq},
        {userId:prefix.userId,layerId:this.options.layerId,strokeId:prefix.strokeId},op)
      const sealed=Object.freeze({...prefix,sealed:true})
      let ownedRelease:(()=>void)|undefined=release
      const receipt:RecordedCloseReceipt=Object.freeze({input,seal,prefix,releaseMetadata:()=>{
        const owned=ownedRelease;ownedRelease=undefined;owned?.()
      }})
      input.delivery.assertCurrent(input)
      if(lifetime.assertCurrent()!==scope)throw new Error('Recorded close scope replaced')
      this.assertRecordedCurrent()
      this.assertLayers()
      if(entry.mode==='buildup'){
        if(!source)throw new Error('Accepted close source missing')
        source.assertCurrent();this.assertReplayOriginal(source,prefix.snapshot)
      }
      if(sourceLease&&!sourceLease.isReady())throw new Error('Accepted WASH close source retired')
      recapture.assertPrepared()
      // Final pure CAS after every external assertion. No callback between
      // receipt, sealed-prefix, sequence and metadata-only control revision.
      if(this.closed||this.failed||!this.busy||generation!==this.replayGeneration
        ||previousSequence!==this.lastSequence||!this.entries.includes(entry)||entry.recorded!==prefix
        ||entry.closeReceipt||entry.local?.receipts.length||entry.replaySource!==source||entry.sourceLease!==sourceLease||entry.image!==image||entry.metadataReleased||entry.metadataRetired||seal.closeSeq<=previousSequence)
        throw new Error('Recorded close owner changed before publication')
      entry.closeReceipt=receipt
      entry.recorded=sealed
      this.lastSequence=seal.closeSeq
      recapture.publishPrepared()
      release=undefined
    } catch(primary) {
      rejected=true
      if(release){const pending=release;release=undefined;this.cleanFrontier(pending)}
      if(this.failed){this.releaseAll(this.cleanupContextLost());this.clean(()=>this.notifyPoison(primary))}
      throw primary
    } finally {
      try{
        const before=this.errors.length
        this.cleanFrontier(()=>recapture?.release())
        if(!rejected&&this.errors.length>before)throw this.errors[before]
      }finally{this.busy=false}
    }
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

  private enqueueInternal(input:Omit<CanonicalFrameSubmission,'frame'>&{readonly frame:CanonicalFrameSubmission['frame']|CanonicalMaterialFrameV3|CanonicalMaterialFrameV4|CanonicalMaterialFrameV5|CanonicalMaterialFrameV6|CanonicalMaterialFrameV7|CanonicalMaterialFrameV8},recordedSequence:number|undefined,origin?:{input:CanonicalRecordedInput;recorded:RecordedPrefix;stage?:ReplayStage},local?:LocalPrefix,pair?:{stage?:ReplayStage;originalSnapshot:CanonicalLocalWashAuthor['snapshot'];publish():void}):void {
    if(!local&&!origin)this.assertOpen();this.assertRecordedCurrent(); this.busy = true
    try {
    if ((!local&&(!Number.isSafeInteger(recordedSequence)||recordedSequence!<=this.lastSequence)) || input.layerId !== this.options.layerId
      || input.layerEpoch !== this.options.layerEpoch || (!this.options.mixedReplay7&&input.composition.mode!=='wash')
      ||this.options.mixedReplay7&&(!origin&&!local||input.composition.mode==='buildup'&&input.frame.profile!==CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE&&input.frame.profile!==CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE&&!(input.frame.profile===CANONICAL_SOURCE_MATERIAL_PROFILE&&(origin?.recorded.snapshot.materialVersion===2||local?.author.snapshot.materialVersion===2)))) throw new Error('Invalid recorded wash lane order/context')
    const original=origin?.recorded.snapshot??local?.author.snapshot??pair?.originalSnapshot
    const outerLaw=original&&(original.materialVersion===2||original.materialVersion===8)?original.material.outerCompositionLaw:undefined
    const extensions=canonicalStrokeCompositionExtensions(outerLaw)
    const browserHsy=!!extensions.browserHsy
    if(canonicalPixelSourceOuterCompositionLaw(input.composition)!==outerLaw)throw new TypeError('Recorded Pixel composition marker differs from original source')
    if(extensions.directBlend&&(this.options.rasterProfile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE||input.composition.mode!=='buildup'||input.composition.outerBlend==='over'))throw new TypeError('Invalid direct Pixel composition context')
    if(extensions.separableOuter&&input.composition.mode!=='wash')throw new TypeError('Invalid separable Pixel WASH context')
    if((extensions.separableOuter||extensions.directBlend)&&input.composition.outerBlend!=='colorHsyBrowser'&&!this.options.composite.supportsOperations(['genericSCU8']))throw new TypeError('Recorded GenericSC program was not prepared')
    if((input.composition.outerBlend==='colorHsyBrowser')!==(browserHsy||!!extensions.directBlend&&input.composition.outerBlend==='colorHsyBrowser'))throw new TypeError('Recorded outer composition law differs from original source')
    if(input.composition.outerBlend==='colorHsyBrowser'&&!this.options.composite.supportsOperations(['colorHsyBrowser']))throw new TypeError('Recorded browser HSY program was not prepared')
    if (!isCanonicalStrokeComposition(input.composition, this.options.rasterProfile === 'reference-scalar-f32-rne-v1' ? CANONICAL_STROKE_RASTER_PROFILE : this.options.rasterProfile,extensions)) throw new TypeError('Invalid recorded wash composition for pinned raster profile')
    if (this.queue.length >= 8) throw new RangeError('Canonical wash lane queue is full')
    this.assertLayers()
    let entry = this.entries.find(e => e.id === input.gestureId)
    if (!entry && this.entries.length >= this.options.maxGestures) throw new RangeError('Canonical wash lane gesture capacity exceeded')
    if (entry?.committed || entry?.ownership) throw new Error('Recorded wash gesture is already sealed')
    const buildup=!!this.options.mixedReplay7&&input.composition.mode==='buildup'
    let releasePlanning:(()=>void)|undefined
    let fresh:Map<string,Position>|undefined
    const previousPositionCount=this.positions.size
    const seed=this.options.mixedReplay7?this.seedGrid():undefined
    const seedCurrent=()=>{if(!seed)return true;const current=this.seedGrid();return current.x0===seed.x0&&current.y0===seed.y0&&current.x1===seed.x1&&current.y1===seed.y1&&current.count===seed.count}
    let ticket:CanonicalReplayAdmissionTicket|undefined
    let acceptedWork=false
    let candidate: CanonicalFrameExecutor | undefined,publishCandidate:(()=>void)|undefined
    let imageBinding:Entry['image'],sourceLease:CanonicalMaskSourceLease|undefined
    let releaseGpu: (() => void) | undefined, releaseCpu: (() => void) | undefined, releaseEntry: (() => void) | undefined
    try {
    if(!buildup){
    if(this.options.mixedReplay7){
      const cpu=this.options.prepass.brushGlBatchInfo().cpu
      const reservation=cpu.reserveAdmission(1024+64*512)
      if(reservation instanceof BrushCpuBudgetExhaustion)throw new CanonicalFrameCpuPressure(reservation.reservedBytes,reservation.requestedBytes,reservation.budgetBytes,'planning')
      releasePlanning=reservation
    }
    fresh=new Map<string,Position>()
    for (const d of input.frame.draws) {
      const r = input.frame.definitions[d.definition]
      if (!r) throw new TypeError('Invalid canonical wash definition')
      for (const tile of planCanonicalTargets({ minX: d.x, minY: d.y, maxX: d.x + r.width, maxY: d.y + r.height }, this.options.pageBounds ?? null, this.stable.tileWidth, this.stable.tileHeight).tiles) {
        const k=`${tile.storage.minX}:${tile.storage.minY}`
        if(this.positions.has(k)||fresh.has(k))continue
        if(this.options.mixedReplay7&&this.positions.size+fresh.size>=64)throw new RangeError('Mixed cohort exceeds bounded target union')
        fresh.set(k,{x:tile.storage.minX,y:tile.storage.minY,width:this.stable.tileWidth,height:this.stable.tileHeight,presentation:{}})
      }
    if(this.options.mixedReplay7&&this.positions.size+fresh.size>64)throw new RangeError('Mixed cohort exceeds bounded target union')
    }
    }
      if (fresh?.size) {
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
          const snapshot=origin?.recorded.snapshot??(local!.author.snapshot.materialVersion===8?canonicalStandaloneStrokeSnapshotV8(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):local!.author.snapshot.materialVersion===7?canonicalStrokeSnapshotV7(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):local!.author.snapshot.materialVersion===6?canonicalStrokeSnapshotV6(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):local!.author.snapshot.materialVersion===5?canonicalStrokeSnapshotV5(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):local!.author.snapshot.materialVersion===4?canonicalStrokeSnapshotV4(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):local!.author.snapshot.materialVersion===3?canonicalStrokeSnapshotV3(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile):canonicalSourceStrokeSnapshotV2(local!.author.snapshot,local!.scope.boardEpoch,local!.author.snapshot.rasterProfile)),expected=snapshot.material.primarySource,actual=source.autoSource
          if(snapshot.materialVersion===2&&source.sourceMaterial&&!canonicalSoftAutoDataEqual(canonicalSourceMaterialContext(source.sourceMaterial),canonicalSourceMaterialContext(snapshot.material)))throw new TypeError('Original source2 context changed')
          if(snapshot.materialVersion===2&&snapshot.material.maskingBlend!==undefined){
            if(!(source.sourceMaterial??source.maskedSource)||!canonicalSoftAutoDataEqual(canonicalMaskedSourceMaterialContext(source.sourceMaterial??source.maskedSource),canonicalMaskedSourceMaterialContext(snapshot.material)))throw new TypeError('Original masked source binding missing or changed')
          }else if(source.maskedSource)throw new TypeError('Unexpected masked source binding')
          if(snapshot.materialVersion===8){
            if(snapshot.composition.mode!==input.composition.mode||!source.sourceLease||source.bank!==source.sourceLease||source.primaryTexture?.root!==source.sourceLease||(expected.kind==='image'?!!actual:!actual||!canonicalSoftAutoDataEqual(actual,expected))||!canonicalSoftAutoDataEqual(canonicalPrimaryGrainMaterialContext(source.primaryTexture.context),snapshot.material))throw new TypeError('Recorded primary grain image source binding missing or changed')
          }else if(snapshot.materialVersion===7){
            if(snapshot.composition.mode!==input.composition.mode||!source.sourceLease||source.bank!==source.sourceLease||source.primaryTexture?.root!==source.sourceLease||!actual||!canonicalSoftAutoDataEqual(actual,expected)||!canonicalSoftAutoDataEqual(canonicalTexturedAutoMaterialContext(source.primaryTexture.context),snapshot.material))throw new TypeError('Recorded textured Auto source binding missing or changed')
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
            const imageSource={kind:'image' as const,asset:expected.asset,brushScale:expected.brushScale,brushAngle:expected.brushAngle,...'frames'in expected&&expected.frames?{frames:expected.frames}:{}}
            const tipAssets=snapshot.material.assets.filter(asset=>asset.id===expected.asset||('frames'in expected&&expected.frames?.includes(asset.id)))
            const image=canonicalImageMaterialPin(imageSource,tipAssets)
            const info=this.options.prepass.brushGlBatchInfo(),release=info.cpu.reserve(16384+image.assets.length*1536);let failed=false,failure:unknown
            try{const requirement=canonicalImageRequiredSourceLevels(image.primarySource,image.assets)[0];imageBinding=Object.freeze({bank:source.bank,generation:source.bank.assertRequiredSourceBinding(requirement.asset,requirement.indexes,info)})}
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
        const executor = candidate = new CanonicalFrameExecutor({ ...this.options, ...source,sourceMaterial:source.sourceMaterial,maskedSource:source.maskedSource, autoGeometryMechanism:source.autoSource||source.sourceMaterial||source.maskedSource?source.autoGeometryMechanism??this.options.autoGeometryMechanism:undefined, ...buildup?{replayFrontier:input.frame.profile===CANONICAL_SOURCE_MATERIAL_PROFILE?'source2-buildup-v1' as const:input.frame.profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE?'primary-grain8-buildup-v1' as const:'textured7-buildup-v1' as const}:{washMode:'deposition-only' as const},
          changed: (_id, bounds) => {
            this.invalidate(bounds)
            // Existing Executor.changed(bounds) is native deposition, not clear
            // or visible/nonempty RGBA. Never infer this fact from frame DTOs.
            if(bounds&&this.options.mixedReplay7&&published&&this.busy&&entry?.mode==='wash'
              &&entry.executor===executor&&entry.washInFlight&&!entry.metadataRetired&&!entry.metadataReleased
              &&this.entries.includes(entry)&&entry.firstRawPaintNextOrdinal===undefined)
              entry.firstRawPaintNextOrdinal=entry.depositedNextOrdinal+1
          }, // The lane retires ALL storage pins before external poison/undo.
          poison: () => {if(published)this.failed=true} })
        const replaySource=buildup?executor.replaySource():undefined
        if(replaySource)this.assertReplayOriginal(replaySource,origin?.recorded.snapshot??pair?.originalSnapshot)
        entry = { mode:input.composition.mode,depositedNextOrdinal:0,...replaySource?{replaySource}:{},image:imageBinding,sourceLease,id: input.gestureId, firstSequence: recordedSequence, executor, opacity: input.composition.outerResourceOpacity, blend: input.composition.outerBlend,
          committed: false, tile: 0, part: 0, releaseMetadata: releaseEntry }
      }
      if(buildup){
        if(input.frame.profile!==CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE&&input.frame.profile!==CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE&&!(input.frame.profile===CANONICAL_SOURCE_MATERIAL_PROFILE&&entry.executor.replaySource().materialVersion===2))throw new Error('Replay frontier requires matching material7/8')
        const frontierInput={gestureId:input.gestureId,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal,assets:input.assets,rgb:input.rgb,composition:input.composition}
        ticket=input.frame.profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE?entry.executor.prepareReplayFrontier({...frontierInput,frame:input.frame}):input.frame.profile===CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE?entry.executor.prepareReplayFrontier({...frontierInput,frame:input.frame}):entry.executor.prepareReplayFrontier({...frontierInput,frame:input.frame})
        // Exact existing executor geometry, never replanned from DTO bounds.
        // Count first: no persistent Position/Map allocation before SAME CPU.
        const targets=ticket.targets(),previousCount=previousPositionCount
        let freshCount=0
        for(const target of targets){
          if(target.width!==this.stable.tileWidth||target.height!==this.stable.tileHeight)throw new Error('Replay target tile geometry changed')
          if(!this.positions.has(key(target)))freshCount++
        }
        if(previousCount+freshCount>64)throw new RangeError('Replay cohort exceeds bounded target union')
        if(freshCount){
          releaseCpu=this.options.prepass.brushGlBatchInfo().cpu.reserve(freshCount*256)
          if(this.closed||this.failed||!this.busy||this.positions.size!==previousCount)throw new Error('Replay geometry retired during reservation')
          fresh=new Map<string,Position>()
          for(const target of targets)if(!this.positions.has(key(target)))fresh.set(key(target),Object.freeze({x:target.x,y:target.y,width:target.width,height:target.height,...target.writeBounds?{writeBounds:target.writeBounds}:{},presentation:{}}))
        }

      }else if(input.frame.profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE)entry.executor.enqueue({gestureId:input.gestureId,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal,frame:input.frame,assets:input.assets,rgb:input.rgb,composition:input.composition})
      else if(input.frame.profile===CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE)entry.executor.enqueue({gestureId:input.gestureId,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal,frame:input.frame,assets:input.assets,rgb:input.rgb,composition:input.composition})
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
      if(this.options.mixedReplay7){
        ticket?.assertCurrent();if(local)this.assertLocal(local);if(origin){origin.input.delivery.assertCurrent(origin.input);if(origin.recorded.lifetime.assertCurrent()!==origin.recorded.scope)throw new Error('Recorded scope replaced')}this.assertLayers()
        if(buildup){if(!entry.replaySource)throw new Error('Accepted replay source missing');entry.replaySource.assertCurrent();this.assertReplayOriginal(entry.replaySource,origin?.recorded.snapshot??pair?.originalSnapshot)}
        if(releasePlanning){const planning=releasePlanning;releasePlanning=undefined;planning()}
        if(entry.sourceLease&&!entry.sourceLease.isReady())throw Error('Accepted mixed source root retired')
        const stage=pair?.stage??origin?.stage;stage?.assertPrepared()
        if(!seedCurrent())throw Error('Mixed seed changed before admission')
        if(this.positions.size!==previousPositionCount||this.positions.size+(fresh?.size??0)>64)throw new Error('Replay cohort changed before publication')
        if(this.closed||this.failed||!this.busy||this.queue.length>=8||!entry||(!candidate&&this.entries.find(e=>e.id===entry!.id)!==entry))throw new Error('Replay pair owner changed')
        // Pure commit only: no user/release/current callback until both owners publish.
        ticket?.publish();stage?.publishPrepared();pair?.publish()
      }
    } catch (error) {
      const cleanup=(action:()=>void)=>this.options.mixedReplay7?this.cleanFrontier(action):this.clean(action)
      if(ticket)cleanup(()=>ticket!.cancel())
      if(releasePlanning)cleanup(releasePlanning)
      if((!this.options.mixedReplay7||!buildup)&&(local||origin&&entry?.image)&&acceptedWork&&!candidate)this.failed=true
      if (candidate) cleanup(() => candidate!.cancel(error, { lost: this.cleanupContextLost() }))
      if (releaseGpu) cleanup(releaseGpu)
      if (releaseCpu) cleanup(releaseCpu)
      if (releaseEntry) cleanup(releaseEntry)
      if(sourceLease)cleanup(()=>sourceLease!.release(this.cleanupContextLost()))
      throw error
    }
    if (releaseEntry) {this.entries.push(entry!);publishCandidate!()}
    if (releaseGpu) { const gpu = releaseGpu, cpu = releaseCpu!; this.reservations.push(() => { try { gpu() } finally { cpu() } }) }
    else if(releaseCpu)this.reservations.push(releaseCpu)
    if(fresh)for (const [k, p] of fresh) this.positions.set(k, Object.freeze(p))
    if(origin)entry!.recorded=origin.recorded
    if(local)entry!.local=local
    this.queue.push(ticket?{kind:'metadata-frontier',entry:entry!,ticket}:entry!);if(ticket){this.revision++;for(const[k,p]of this.positions)this.dirty.set(k,rect(p))}; if(recordedSequence!==undefined)this.lastSequence = recordedSequence
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
      if(this.options.mixedReplay7&&entry.mode==='buildup'){this.lastSequence=recordedSequence;return}
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
  private stageReplay(gestureId: string, op: CanonicalStrokeOperation, value: ReplayValue, releaseLocalPayload?: () => void): ReplayStage {
      value = Object.freeze(value);
      const limit = this.options.replayRetention!;
      const old = this.replay.get(op.id);
      if (old && (old.gestureId !== gestureId || old.value.kind !== 'local' || value.kind !== 'recorded'))
          throw new Error('Replay operation already retained');
      // Exact read header stays per frame. Only a genuinely shared capability
      // object can share its retained body; equal copies receive no credit.
      const read=value.kind==='recorded'?value.input.read:undefined
      if(value.kind==='recorded'&&!read)throw new TypeError('Recorded replay read metadata required')
      const capability=read?.capability
      const priorCapability=capability?this.replayCapabilities.get(capability):undefined
      const capabilityBytes=capability?(priorCapability?.bytes??JSON.stringify(capability).length*2+CANONICAL_REPLAY_CAPABILITY_CPU_METADATA_BYTES):0
      // Include the omitted ,"capability": field punctuation exactly, without
      // serializing that large immutable body again for every frame.
      const header=read?(({capability:_capability,...fields})=>fields)(read):undefined
      const readBytes=header?(JSON.stringify(header).length+14)*2:0
      const sharedExtra=capability&&!priorCapability?capabilityBytes:0;
      const bytes = readBytes + 512 + 2 * (gestureId.length + op.id.length + op.userId.length + op.layerId.length + op.frame.strokeId.length + op.frame.brush.length + op.frame.materialPacked.length);
      const extra = old ? Math.max(0, bytes - old.bytes) : bytes;
      if (!Number.isSafeInteger(bytes)||!Number.isSafeInteger(capabilityBytes) || (!old && this.replayCount >= limit.maxEntries) || this.replayBytes + extra + sharedExtra > limit.maxBytes)
          throw new RangeError('Active replay capacity exceeded');
      let releaseCapability:(()=>void)|undefined
      if(capability)releaseCapability=this.retainReplayCapability(capability,capabilityBytes);
      // Promotion keeps the old reservation (same logical payload) and only
      // reserves a positive delta before the receipt's external release callback.
      let releaseMetadata:()=>void
      try{releaseMetadata=this.options.prepass.brushGlBatchInfo().cpu.reserve(value.kind === 'local' ? 512 : extra)}
      catch(primary){try{releaseCapability?.()}catch{/* Preserve admission primary. */}throw primary}
      const releaseMetadataAndCapability=()=>{
        let failed=false,primary:unknown
        for(const action of [releaseMetadata,releaseCapability])try{action?.()}catch(error){if(!failed){failed=true;primary=error}}
        if(failed)throw primary
      }
      const release=()=>{
        let failed=false,primary:unknown
        for(const action of [releaseMetadataAndCapability,releaseLocalPayload])try{action?.()}catch(error){if(!failed){failed=true;primary=error}}
        if(failed)throw primary
      };
      const generation = this.replayGeneration;
      let done = false,published=false;
      let acceptedFrame:CanonicalStrokeOperation['frame']|undefined
      const bindAcceptedFrame=(frame:CanonicalStrokeOperation['frame'])=>{
          if(!this.options.mixedReplay7||done||acceptedFrame||!Object.isFrozen(frame))throw Error('Replay accepted frame already bound or unavailable')
          acceptedFrame=frame
      }
      const assertPrepared=()=>{
              if(done)throw new Error('Replay stage retired');
              if(this.options.mixedReplay7&&!acceptedFrame)throw Error('Replay accepted frame missing');
              if (this.closed || this.failed || generation !== this.replayGeneration)
                  throw new Error('Replay stage retired');
              if(old?this.replay.get(op.id)!==old:this.replay.has(op.id)||this.replayCount>=limit.maxEntries)throw new Error('Replay promotion replaced');
              if(this.replayBytes+extra>limit.maxBytes)throw new Error('Replay capacity changed');
      };
      const publishPrepared=()=>{
              if (old) {
                  const prior = old.release;
                  old.value = value;
                  if(this.options.mixedReplay7)old.acceptedFrame=acceptedFrame;
                  old.bytes += extra;
                  old.release = () => {
                      let failed=false,primary:unknown
                      for(const action of [prior,release])try{action()}catch(error){if(!failed){failed=true;primary=error}}
                      if(failed)throw primary
                  };
                  this.replayBytes += extra;
              }
              else {
                  this.replay.set(op.id, { id: op.id, gestureId, value, ...this.options.mixedReplay7?{acceptedFrame}:{}, bytes, release, pins: 0, retired: false });
                  this.replayBytes += bytes;
                  this.replayCount++;
              }
              published=true;done = true;
      };
      return {get published(){return published},bindAcceptedFrame,assertPrepared,publishPrepared,commit:()=>{if(done)return;assertPrepared();publishPrepared()},
          rollback: () => { if (!done) {
              done = true;
              releaseMetadataAndCapability();
          } },
      };
  }
  /** A stage owns one reference, transferred unchanged to its ReplayEntry on
   * publication. Snapshot pins postpone that Entry's final release; no global
   * clear can release a capability while a captured value still owns it. */
  private retainReplayCapability(capability:ReplayCapability,bytes:number):()=>void {
    let charge=this.replayCapabilities.get(capability)
    if(charge){if(charge.bytes!==bytes||charge.refs>=Number.MAX_SAFE_INTEGER)throw new Error('Replay capability charge changed');charge.refs++}
    else{
      const release=this.options.prepass.brushGlBatchInfo().cpu.reserve(bytes)
      charge={bytes,refs:1,release}
      this.replayCapabilities.set(capability,charge);this.replayBytes+=bytes
    }
    const owned=charge;let released=false
    return()=>{
      if(released)return
      if(this.replayCapabilities.get(capability)!==owned||owned.refs<1)throw new Error('Replay capability reference changed')
      released=true
      if(--owned.refs===0){
        this.replayCapabilities.delete(capability)
        this.replayBytes-=owned.bytes
        owned.release()
      }
    }
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
          this.releaseReplayOwnerMetadata(entry);
  }
  private releaseReplayOwnerMetadata(entry:Entry):void {
      if(entry.metadataReleased)return
      entry.metadataReleased=true
      const receipt=entry.closeReceipt
      entry.closeReceipt=undefined
      // Detach first and attempt both even when either release throws.
      const cleanup=(action:()=>void)=>this.options.mixedReplay7?this.cleanFrontier(action):this.clean(action)
      cleanup(entry.releaseMetadata)
      if(receipt)cleanup(receipt.releaseMetadata)
  }
  /** One bounded work snapshot. No new lifetime/grant; exact owners are rechecked. */
  /** @internal Owner-only work pin, not an execution or network grant. */
  retainReplaySnapshot(): ReplaySnapshot {
      if(this.options.mixedReplay7){
          this.assertOpen();this.busy=true
          try{return this.captureReplayGroupsOwned()}finally{this.busy=false}
      }
      return this.retainLegacyReplaySnapshot()
  }
  private retainLegacyReplaySnapshot():ReplaySnapshot {
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
                      this.releaseReplayOwnerMetadata(owner);
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

  /** Buildup-only private capture under the caller's exclusive busy turn.
   * No public trusted flag, source remint, rendering, or readiness publication. */
  private captureReplayGroupsOwned():ReplaySnapshot {
    if(!this.busy||this.closed||this.failed||!this.options.replayRetention||this.replayWork)throw Error('Replay work unavailable')
    const generation=this.replayGeneration,order=this.replayOrderRevision,count=this.replay.size
    // Allocation-free bounded counting; no geometry or coefficient copies.
    let groupCount=0,closeCount=0,frameCount=0,washCount=0
    for(const owner of this.entries){let found=false;for(const entry of this.replay.values())if(entry.gestureId===owner.id){found=true;frameCount++}if(found){groupCount++;if(owner.mode==='wash')washCount++;if(owner.closeReceipt)closeCount++}}
    if(frameCount!==count||count>this.options.replayRetention.maxEntries||groupCount>this.options.maxGestures)throw Error('Replay group membership unavailable')
    if(this.entries.some(owner=>owner.washInFlight))throw Error('Mixed raw frame is incomplete')
    const rawBound=washCount*this.positions.size
    if(!Number.isSafeInteger(rawBound)||this.positions.size>64)throw Error('Mixed raw views exceed bounded union')
    const releaseMetadata=this.options.prepass.brushGlBatchInfo().cpu.reserve(1024+count*128+groupCount*768+closeCount*256+rawBound*1024)
    const entries:ReplayEntry[]=[],values:ReplayValue[]=[],proofs:{owner:Entry;source?:CanonicalReplaySource;root?:CanonicalMaskSourceLease;sourceLease?:CanonicalMaskSourceLease;ownership?:CanonicalWashOwnership;group:ReplayCapturedGroup;close?:RecordedCloseReceipt;prefix?:RecordedPrefix;capturedPrefix?:RecordedPrefix;witness?:Readonly<Record<string,unknown>>}[]=[]
    let released=false,checking=false,pinned=false,work:ReplayGroupsWork|undefined
    // One synchronous busy+checking window: public mutation is fenced before
    // entry/prefix changes. Full membership remains checked at both boundaries.
    const pureGate=()=>{
      if(released||this.closed||this.failed||!this.busy||generation!==this.replayGeneration||order!==this.replayOrderRevision||(work?this.replayWork!==work:!!this.replayWork))throw Error('Replay snapshot retired')
    }
    const pure=()=>{
      pureGate()
      for(const entry of entries)if(entry.retired||this.replay.get(entry.id)!==entry)throw Error('Replay snapshot entry retired')
      for(const proof of proofs)if(!this.entries.includes(proof.owner)||proof.owner.replaySource!==proof.source||proof.owner.sourceLease!==proof.sourceLease||proof.owner.metadataReleased||proof.group.kind==='wash'&&(proof.owner.washInFlight||proof.owner.depositedNextOrdinal!==proof.group.depositedNextOrdinal||proof.owner.ownership!==proof.ownership))throw Error('Replay snapshot source replaced')
    }
    const assertValue=(value:ReplayValue)=>{
      if(value.kind==='recorded')value.input.delivery.assertCurrent(value.input)
      else if(value.author.assertCurrent(value.author)!==value.author.lifetime.assertCurrent())throw Error('Captured local replay scope replaced')
      pureGate()
    }
    const assertBodyOwned=()=>{
        if(!checking)throw Error('Replay snapshot assertion window missing')
        pure();this.assertRecordedCurrent();pureGate();this.assertLayers();pureGate()
        for(const entry of entries)assertValue(entry.value)
        for(const value of values)assertValue(value)
        for(const proof of proofs){
          if(proof.sourceLease){if(!proof.sourceLease.isReady())throw Error('Captured pattern root retired');pureGate()}
          if(proof.source){proof.source.assertCurrent();pureGate()
          this.assertReplayOriginal(proof.source,proof.group.frames[0].value.kind==='recorded'?proof.group.frames[0].value.input.read?.capability.snapshot:proof.group.frames[0].value.author.snapshot);pureGate()}
          if(proof.close){
            const prefix=proof.prefix!,close=proof.close
            if(!samePaintData(proof.witness,{firstOperationId:prefix.firstOperationId,lastOperationId:prefix.lastOperationId,firstSeq:prefix.firstSeq,lastSeq:prefix.lastSeq,state:prefix.state,userId:prefix.userId,strokeId:prefix.strokeId}))throw Error('Replay close prefix changed')
            close.input.delivery.assertCurrent(close.input);pureGate()
            if(prefix.lifetime.assertCurrent()!==prefix.scope)throw Error('Replay close original replaced')
            pureGate()
            const seal=verifyCanonicalRecordedClose({...prefix.state,recordedNext:prefix.state.nextOrdinal,firstOperationId:prefix.firstOperationId,lastOperationId:prefix.lastOperationId,firstSeq:prefix.firstSeq,lastSeq:prefix.lastSeq},{userId:prefix.userId,layerId:this.options.layerId,strokeId:prefix.strokeId},close.input.operation)
            if(!samePaintData(seal,close.seal))throw Error('Replay close seal changed')
          }
        }
        pure()
    }
    const assertOwned=()=>{
      if(checking)throw Error('Replay snapshot assertion reentered')
      checking=true
      try{assertBodyOwned()}finally{checking=false}
    }
    // Private teardown: valid after closed=true or inside a busy failure catch.
    // Detach before all cleanup callbacks; never call a public/current wrapper.
    const detach=()=>{
      if(released)return
      released=true
      if(work&&this.replayWork===work)this.replayWork=undefined
      const cleanup=(action:()=>void)=>this.cleanFrontier(action)
      if(pinned){pinned=false
        for(const entry of entries){entry.pins--;if(entry.retired&&!entry.pins)cleanup(()=>this.releaseReplayEntry(entry))}
        for(const proof of proofs){proof.owner.replayPins!--;if(!proof.owner.replayPins&&proof.owner.metadataRetired)cleanup(()=>this.releaseReplayOwnerMetadata(proof.owner))}
      }
      for(const proof of proofs)cleanup(()=>proof.root?.release(this.cleanupContextLost()))
      cleanup(releaseMetadata)
    }
    const enter=()=>{this.assertOpen();this.busy=true}
    const coordinator=this
    let snapshot:ReplaySnapshot
    try{
      this.assertRecordedCurrent();pure();this.assertLayers();pure()
      for(const owner of this.entries){
        let has=false;for(const entry of this.replay.values())if(entry.gestureId===owner.id){has=true;break}
        if(!has)continue
        const source=owner.replaySource
        if(owner.mode==='buildup'&&!source)throw Error('Accepted replay source unavailable')
        const frames:ReplayGroupFrame[]=[]
        for(const entry of this.replay.values())if(entry.gestureId===owner.id){
          const frame=entry.acceptedFrame
          if(!frame||!Object.isFrozen(frame))throw Error('Replay accepted immutable frame missing')
          entries.push(entry);values.push(entry.value);frames.push(Object.freeze({value:entry.value,frame}))
        }
        const close=owner.closeReceipt,prefix=close?.prefix
        const witness=prefix?Object.freeze({firstOperationId:prefix.firstOperationId,lastOperationId:prefix.lastOperationId,firstSeq:prefix.firstSeq,lastSeq:prefix.lastSeq,state:Object.freeze({...prefix.state}),userId:prefix.userId,strokeId:prefix.strokeId}):undefined
        let group:ReplayCapturedGroup
        if(owner.mode==='wash'){
          const tiles=this.locals(owner)
          if(tiles.length>this.positions.size)throw Error('Mixed raw view count changed')
          for(const tile of tiles)if(!this.positions.has(key(tile)))throw Error('Mixed raw tile outside accepted union')
          group=Object.freeze({kind:'wash',id:owner.id,depositedNextOrdinal:owner.depositedNextOrdinal,frames:Object.freeze(frames),presentation:Object.freeze({committed:owner.committed,opacity:owner.opacity,blend:owner.blend,tiles}),...(close?{close:Object.freeze({input:close.input,seal:close.seal})}:{})})
          proofs.push({owner,sourceLease:owner.sourceLease,ownership:owner.ownership,group,close,prefix,capturedPrefix:owner.recorded,witness})
        }else{
          if(!source)throw Error('Accepted replay source unavailable')
          group=Object.freeze({kind:'buildup',id:owner.id,frames:Object.freeze(frames),source:Object.freeze(source.materialVersion===2?{materialVersion:2 as const,rasterProfile:source.rasterProfile,context:source.context,autoSource:source.autoSource,autoGeometryMechanism:source.autoGeometryMechanism}:source.materialVersion===8?{materialVersion:8 as const,rasterProfile:source.rasterProfile,context:source.context,autoSource:source.autoSource,autoGeometryMechanism:source.autoGeometryMechanism}:{materialVersion:7 as const,rasterProfile:source.rasterProfile,context:source.context,autoSource:source.autoSource,autoGeometryMechanism:source.autoGeometryMechanism}),...(close?{close:Object.freeze({input:close.input,seal:close.seal})}:{})})
          source.assertCurrent();pure()
          const root=source.retainRoot()
          proofs.push({owner,source,root,sourceLease:owner.sourceLease,group,close,prefix,capturedPrefix:owner.recorded,witness})
          source.assertCurrent();pure()
        }
      }
      Object.freeze(values)
      const groups=Object.freeze(proofs.map(proof=>proof.group))
      assertOwned()
      if(entries.length!==count||this.replay.size!==count||proofs.length!==groupCount||proofs.filter(p=>p.close).length!==closeCount)throw Error('Replay snapshot membership changed')
      let acceptedIndex=0
      for(const proof of proofs)for(const captured of proof.group.frames){
        const entry=entries[acceptedIndex++]
        if(entry.value!==captured.value||entry.acceptedFrame!==captured.frame)throw Error('Replay accepted frame changed before capture')
      }
      for(const entry of entries)entry.pins++
      for(const proof of proofs)proof.owner.replayPins=(proof.owner.replayPins??0)+1
      pinned=true
      const valuesOwned=()=>{assertOwned();return values}
      const groupsOwned=()=>{assertOwned();return groups}
      const retainRootOwned=(group:ReplayCapturedGroup)=>{
        if(checking)throw Error('Replay snapshot retain reentered')
        checking=true
        let child:CanonicalMaskSourceLease|undefined
        try{
          assertBodyOwned();const proof=proofs.find(p=>p.group===group)
          if(!proof||group.kind!=='buildup'||!proof.root&&group.source.materialVersion!==2)throw Error('Foreign replay group')
          child=proof.root?.retain();assertBodyOwned()
          const accepted=child;child=undefined;return accepted
        }catch(primary){if(child)this.cleanFrontier(()=>child!.release(this.cleanupContextLost()));throw primary}
        finally{checking=false}
      }
      snapshot=Object.freeze({
        values:function(this:ReplaySnapshot){if(this!==snapshot)throw Error('Foreign replay snapshot receiver');enter();try{return valuesOwned()}finally{coordinator.busy=false}},
        groups:function(this:ReplaySnapshot){if(this!==snapshot)throw Error('Foreign replay snapshot receiver');enter();try{return groupsOwned()}finally{coordinator.busy=false}},
        assertCurrent:function(this:ReplaySnapshot){if(this!==snapshot)throw Error('Foreign replay snapshot receiver');enter();try{assertOwned()}finally{coordinator.busy=false}},
        retainRoot:function(this:ReplaySnapshot,group:ReplayCapturedGroup){
          if(this!==snapshot)throw Error('Foreign replay snapshot receiver')
          enter();try{return retainRootOwned(group)}finally{coordinator.busy=false}
        },
        release:function(this:ReplaySnapshot){if(this!==snapshot)throw Error('Foreign replay snapshot receiver');if(released)return;enter();try{detach()}finally{coordinator.busy=false}},
      })
      work=Object.freeze({snapshot,detach,assertOwned,valuesOwned,groupsOwned,retainRootOwned,
        // Pure identity check of SAME retained proof, not another witness slot.
        // Do not apply this stronger condition to display snapshots: late close
        // may leave their old pixels displayable while a new R is requested.
        closedOwned:()=>{
          if(released||!pinned||this.replayWork!==work||this.entries.length!==proofs.length)return false
          for(let index=0;index<proofs.length;index++){
            const proof=proofs[index]
            if(this.entries[index]!==proof.owner||proof.owner.recorded!==proof.capturedPrefix
              ||proof.owner.closeReceipt!==proof.close)return false
          }
          for(const entry of entries)if(entry.retired||this.replay.get(entry.id)!==entry)return false
          return true
        }})
      this.replayWork=work
      return snapshot
    }catch(primary){detach();throw primary}
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
  advance(options:{readonly deferPresentation?:true}={}): CanonicalPreviewOutcome|undefined {
    this.assertOpen();this.assertRecordedCurrent()
    const capacityCpu=this.options.prepass.brushGlBatchInfo().cpu,beforeCpu=capacityCpu.reservedBytes,beforeQueue=this.queue.length
    this.busy = true
    try {
      const result=this.advanceQuantum(performance.now(),options)
      // Submit every successful bounded quantum before exposing idle/capacity.
      // This submits queued commands without requesting GPU completion.
      this.gl.flush()
      return result
    } catch (error) {
      this.failed = true
      this.releaseAll(this.cleanupContextLost())
      this.clean(() => this.notifyPoison(error))
      throw error
    } finally { this.busy = false;if(this.queue.length<beforeQueue||capacityCpu.reservedBytes<beforeCpu)this.localCapacityRevision++ }
  }

  private advanceQuantum(turnStarted:number,options:{readonly deferPresentation?:true}):CanonicalPreviewOutcome|undefined {
    this.assertLayers()
    if(this.options.mixedReplay7){this.assertMixedSourcesCurrent();return this.advanceMixed(turnStarted,options.deferPresentation===true)}
    if(this.options.previewCandidate)return this.advancePreview(turnStarted)
    const frontier = this.commitFrontier()
    const preparing=this.queue.findIndex(entry=>!('kind'in entry)&&entry.executor.hasPendingLayerTargetPreparation)
    // A confirmation can dirty presentation while this SAME executor still
    // owns an unmaterialized stable target ticket. Finish its bounded turn
    // before either presentation or commit attempts another admission.
    if(preparing>=0)this.advanceEntry(this.washSlot(preparing),preparing)
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
      this.advanceEntry(this.washSlot(0),0)
    }
    // A started preview owns physical plans and must finish normally. Only
    // a NEW preview may wait while an unpublished indexed candidate consumes
    // its next already-delivered continuation. Readiness remains unchanged.
    else if (this.dirty.size && (this.work || !options.deferPresentation)) this.present(turnStarted)
    else if (this.queue.length)this.advanceEntry(this.washSlot(0),0)
  }

  private advanceEntry(entry:Entry,index:number):boolean {
    if(this.options.mixedReplay7){
      if(this.replayWork||this.candidate||entry.mode!=='wash'||this.entries.some(e=>e!==entry&&e.washInFlight))throw new Error('Mixed raw lane is frozen')
      entry.washInFlight=true
    }
    const before=entry.executor.pendingFrameCount,revision=this.revision
    entry.executor.advance()
    const completed=entry.executor.pendingFrameCount<before||!entry.executor.pending&&entry.executor.rawWashSealed
    if(completed){this.queue.splice(index,1);if(this.options.mixedReplay7){if(entry.executor.pendingFrameCount<before)entry.depositedNextOrdinal++;entry.washInFlight=undefined}}
    if(entry.executor.rawWashSealed){entry.ownership=entry.executor.takeRawWash();this.invalidate()}
    // A real completed zero-DRAW/clipped frame still changes captured original
    // prefix membership. Do not advance this stamp merely on queue admission.
    if(completed&&this.options.mixedReplay7&&this.revision===revision)this.revision++
    return completed
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
    if(!this.options.previewCandidate){
      const previous=this.work;this.work=undefined
      this.closePresentationPlans(previous)
    }
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
    const candidate=this.candidate,dirty=candidate?.remaining??this.dirty
    const seedBase=candidate?.mixed?.seedBase??this.stable
    const derived=candidate?.staged.buffer??this.derived
    const entries=candidate?.mixed?candidate.mixed.activeEntries:candidate?.entries??this.entries
    const k = dirty.keys().next().value as string | undefined
    if (k === undefined) return
    this.work ??= { position: (candidate?.positions??this.positions).get(k)!, revision: candidate?.revision??this.revision, stage: candidate?.mixed?.seeded?0:-1, part: 0, bounds: { ...dirty.get(k)! } }
    const work = this.work, p = work.position
    if(!work.stablePlan){
      const stable=seedBase.preparePaintTargetRects([rect(p)])
      try{work.derivedPlan=derived.preparePaintTargetRects([rect(p)]);work.stablePlan=stable}
      catch(primary){try{stable.close()}catch{if(candidate)candidate.cleanupFailed=true}throw primary}
    }
    if(!work.stableTarget)work.stableTarget=this.target(work.stablePlan!,p,true)
    // Deposition-only stable can be genuinely unallocated/transparent. Prove
    // blank from retained content metadata (including evicted content), without
    // materializing/recovering stable storage during candidate work.
    if(candidate&&!work.stableTarget){
      const content=seedBase.getContentBoundsWorld()
      if(content&&content.minX<p.x+p.width&&content.maxX>p.x&&content.minY<p.y+p.height&&content.maxY>p.y)throw new Error('Preview nonempty stable target is not resident')
    }
    if(performance.now()-turnStarted>=4)return
    if(!work.derivedTarget)work.derivedTarget=this.target(work.derivedPlan!,p,true)
    if(performance.now()-turnStarted>=4)return
    if((!candidate&&!work.stableTarget)||!work.derivedTarget){
      runBrushGlTurn({...candidate?{onCleanupFailure:()=>{candidate.cleanupFailed=true}}:{},callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite]},()=>{
        const gl=this.maskParticipant.brushGlBatchInfo().gl;gl.activeTexture(gl.TEXTURE0)
        if(!candidate&&!work.stableTarget)work.stableTarget=this.target(work.stablePlan!,p)
        else work.derivedTarget=this.target(work.derivedPlan!,p)
      })
      return
    }
    runBrushGlTurn({...candidate?{onCleanupFailure:()=>{candidate.cleanupFailed=true}}:{},callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite]},turn=>{
      const gl=this.maskParticipant.brushGlBatchInfo().gl
      gl.activeTexture(gl.TEXTURE0)
      // Resolve while preserving the caller's complete GL state. Each actual
      // layer binding is retained only inside this one synchronous capsule.
      const target = this.target(work.derivedPlan!,p), stable = candidate?work.stableTarget:this.target(work.stablePlan!,p)
      const bound = bindCanonicalLayerTargets(derived, [target])[0], base = stable?bindCanonicalLayerTargets(seedBase, [stable])[0]:undefined
      const initialized=p.presentation!
      if(work.buffer ? work.buffer!==target.buffer || work.texture!==target.buffer.texture || work.stableBuffer!==stable?.buffer || work.stableTexture!==stable?.buffer.texture
        : initialized.derived!==target.buffer || initialized.derivedTexture!==target.buffer.texture || initialized.stable!==stable?.buffer || initialized.stableTexture!==stable?.buffer.texture){
        if(candidate?.mixed?.seeded)throw Error('Mixed candidate target identity changed after seed')
        work.stage=-1;work.part=0;work.bounds=rect(p)
      }
      work.buffer=target.buffer;work.texture=target.buffer.texture;work.stableBuffer=stable?.buffer;work.stableTexture=stable?.buffer.texture
      const tiles=entries.map(entry=>('tiles'in entry?entry.tiles:this.locals(entry)).find(t=>key(t)===key(p)))
      const owners=[bound.lifetime,...base?[base.lifetime]:[]]
      for(const tile of tiles)if(tile){
        if(tile.view.residency.kind!=='external')throw new Error('Raw wash must have explicit ownership')
        owners.push(tile.view.residency)
      }
      runBrushGlBatch({turn,participants:[this.maskParticipant,this.options.composite],owners},frame=>{
        if (work.stage === -1) {
          const b=work.bounds
          if(!stable){
            if(!candidate||b.minX!==p.x||b.minY!==p.y||b.maxX!==p.x+p.width||b.maxY!==p.y+p.height)throw new Error('Unproven blank preview target')
            target.buffer.clear()
          }else if(b.minX===p.x&&b.minY===p.y&&b.maxX===p.x+p.width&&b.maxY===p.y+p.height)stable.buffer.copyTo(target.buffer)
          else { const x=b.minX-p.x,y=p.height-(b.maxY-p.y);stable.buffer.copyRegionInto(target.buffer,x,y,x,y,b.maxX-b.minX,b.maxY-b.minY) }
          work.stage = 0
        }
        let draws=0
        while(work.stage<entries.length&&draws<8){
          const entry=entries[work.stage],tile=tiles[work.stage]
          if(entry.committed||!tile){work.stage++;work.part=0;continue}
          this.assertLayers()
          const part=this.part(tile.view,work.part,work.bounds)
          if(!part.count){work.part=0;work.stage++;continue}
          this.options.composite.drawSource({source:{kind:'straightRgba8',view:part.view},target:bound,operation:canonicalWashOuterOperation(this.options.rasterProfile, entry.blend, entry.opacity),writeBounds:this.options.pageBounds??undefined},frame)
          work.part++;draws++
          if(work.part===part.count){work.part=0;work.stage++}
          if(frame.shouldYield||performance.now()-turnStarted>=4)break
        }
        derived.markContentPainted(work.bounds)
      })
    })
    if (work.stage === entries.length) {
      Object.assign(p.presentation!,{stable:work.stableBuffer,derived:work.buffer,stableTexture:work.stableTexture,derivedTexture:work.texture})
      this.closePresentationPlans(work)
      dirty.delete(k); this.work = undefined;
      if(!candidate){
        if(!this.dirty.size)this.completedPresentation=this.revision
        this.options.changed(this.options.layerId)
      }
    }
  }

  private assertMixedSourcesCurrent():void {
    for(const entry of this.entries){
      if(entry.sourceLease&&!entry.sourceLease.isReady())throw Error('Accepted mixed source root retired')
      entry.replaySource?.assertCurrent()
    }
    if(this.closed||this.failed||!this.busy)throw Error('Mixed source owner retired')
  }
  private cancelObsoletePreview(candidate:PreviewCandidateWork):void {
    const mixed=candidate.mixed,child=mixed?.child
    if(candidate!==this.candidate||candidate.generation!==this.replayGeneration||candidate.order===this.replayOrderRevision
      ||candidate.cleanupFailed||candidate.executionFailed||child?.poisoned||child?.cleanupFailures.length||this.entries.some(entry=>entry.executor.poisoned))throw Error('Obsolete candidate is not known clean')
    this.assertRecordedCurrent();this.assertLayers();if(mixed)this.assertMixedSourcesCurrent();candidate.staged.assertCurrent()
    this.maskParticipant.assertMutationIdle();this.options.composite.assertMutationIdle(this.preparations[1].epoch)
    if(this.gl.isContextLost())throw Error('Obsolete candidate context lost')
    if(candidate!==this.candidate||candidate.generation!==this.replayGeneration||candidate.order===this.replayOrderRevision||this.closed||this.failed||!this.busy)throw Error('Obsolete candidate owner changed')
    // Exact private reason only for intentional disposal of this hidden child.
    // Actual draw/cleanup exceptions have already failed, or remain fatal.
    if(child)candidate.obsoleteReason=Object.freeze({kind:'obsolete-preview-candidate'})
    this.cancelPreview(candidate.obsoleteReason)
    if(candidate.executionFailed||this.failed||this.gl.isContextLost()||child?.cleanupFailures.length)throw Error('Obsolete candidate cleanup failed')
    this.assertRecordedCurrent();this.assertLayers();if(mixed)this.assertMixedSourcesCurrent()
    this.previewFailure=undefined;this.previewBoundaryReady=false
  }
  private advanceMixed(turnStarted:number,deferPresentation=false):CanonicalPreviewOutcome|undefined {
    if(!this.options.previewCandidate)throw Error('Mixed candidate staging owner missing')
    if(!this.candidate){
      // External retained snapshots freeze raw too. Admission can continue;
      // consumption waits for that SAME owner to release the view.
      if(this.replayWork)return
      const head=this.queue[0]
      if(head&&'kind'in head&&(deferPresentation||!this.dirty.size||!this.previewBoundaryReady||this.previewFailure?.revision===this.revision)){
        this.queue.shift();head.ticket.release();this.previewBoundaryReady=true
        this.assertRecordedCurrent();this.assertLayers()
        if(this.closed||this.failed||!this.busy)throw Error('Mixed frontier retired during release')
        // A displayed R may already contain every accepted frame while its
        // admission tickets still drained. Queue-empty is a NEW close-proof
        // frontier, not new pixels. Request one recapture on the existing
        // revision lane; failed staging then parks at that same revision.
        if(!this.queue.length&&this.entries.length&&this.revision===this.completedPresentation)this.revision++
        return
      }
      if(this.previewLane){
        const index=this.queue.indexOf(this.previewLane)
        if(index<0)throw Error('Mixed selected frame disappeared')
        if(this.advanceEntry(this.previewLane,index)){this.previewLane=undefined;this.previewBoundaryReady=true}
        return
      }
      if(head&&!('kind'in head)&&(deferPresentation||!this.dirty.size||!this.previewBoundaryReady||this.previewFailure?.revision===this.revision)){
        this.previewLane=head
        if(this.advanceEntry(head,0)){this.previewLane=undefined;this.previewBoundaryReady=true}
        return
      }
      if(deferPresentation)return
    }
    return this.advancePreview(turnStarted)
  }
  /** Pure eligibility of this captured, completely rendered R. External source,
   * layer and original-close assertions remain snapshot.assertOwned's job. This
   * disposition is layer ownership only, never a room/cut/read permission. */
  private closedCandidateOwned(candidate:PreviewCandidateWork):boolean {
    const mixed=candidate.mixed
    if(!mixed||this.closed||this.failed||this.candidate!==candidate
      ||candidate.generation!==this.replayGeneration||candidate.order!==this.replayOrderRevision
      ||candidate.revision!==this.revision||candidate.cleanupFailed||candidate.executionFailed
      ||this.queue.length||this.work||candidate.remaining.size||!mixed.seeded
      ||mixed.group!==mixed.groups.length||mixed.child||mixed.root
      ||mixed.groups.length!==this.entries.length||!mixed.snapshot.closedOwned()||this.errors.length)return false
    for(let index=0;index<this.entries.length;index++){
      const entry=this.entries[index],group=mixed.groups[index],prefix=entry.recorded
      if(group.id!==entry.id||entry.firstSequence===undefined||!prefix
        ||entry.local?.receipts.length||entry.metadataRetired||entry.metadataReleased
        ||entry.targetPlan||entry.commitTarget||entry.committingBuffer
        ||entry.washInFlight||entry.executor.pendingFrameCount)return false
      if(group.frames.length!==prefix.state.nextOrdinal)return false
      for(const frame of group.frames)if(frame.value.kind!=='recorded')return false
      if(group.kind==='wash'&&(entry.mode!=='wash'
        ||group.depositedNextOrdinal!==prefix.state.nextOrdinal
        ||entry.depositedNextOrdinal!==group.depositedNextOrdinal))return false
      if(group.kind==='buildup'&&entry.mode!=='buildup')return false
      // A receipt is the captured original verifier result, not a sealed flag.
      // Snapshot assertions revalidate its source/lifetime and exact prefix.
      if(!prefix.state.ended&&(!group.close||entry.closeReceipt?.input!==group.close.input
        ||entry.closeReceipt.seal!==group.close.seal))return false
    }
    return true
  }

  private createMixedChildOwned(candidate:PreviewCandidateWork,mixed:MixedCandidateWork,group:Extract<ReplayCapturedGroup,{kind:'buildup'}>,current:()=>void):CanonicalFrameExecutor {
    const root=mixed.root=mixed.snapshot.retainRootOwned(group)
    const source=group.source
    if(source.materialVersion!==2&&!root)throw Error('Textured replay source root missing')
    const binding=source.materialVersion===2?{sourceMaterial:source.context,maskedSource:undefined,sourceLease:root,bank:root,autoSource:source.autoSource,autoGeometryMechanism:source.autoGeometryMechanism}:
      {sourceMaterial:undefined,maskedSource:undefined,sourceLease:undefined,bank:root,primaryTexture:root?{context:source.context,root}:undefined,autoSource:source.autoSource,autoGeometryMechanism:source.autoGeometryMechanism}
    mixed.child=new CanonicalFrameExecutor({...this.options,...binding,
      washMode:undefined,replayFrontier:undefined,candidateReplay7:source.materialVersion===2?'source2-buildup-v1':source.materialVersion===8?'primary-grain8-buildup-v1':'textured7-buildup-v1',
      layer:id=>{
        current();if(id!==this.options.layerId||this.closed||this.failed)throw Error('Mixed child target retired')
        return {buffer:candidate.staged.buffer,epoch:this.options.layerEpoch}
      },changed:()=>{},poison:(_id,reason)=>{if(!candidate.obsoleteReason||reason!==candidate.obsoleteReason)candidate.executionFailed=true}})
    return mixed.child
  }
  private advanceMixedCandidate(candidate:PreviewCandidateWork,turnStarted:number):void {
    const mixed=candidate.mixed!
    mixed.snapshot.assertOwned()
    if(!mixed.seeded){
      this.present(turnStarted)
      if(candidate.remaining.size)return
      const plan=mixed.seedPlan;mixed.seedPlan=undefined
      if(plan)try{plan.close()}catch(error){candidate.cleanupFailed=true;throw error}
      mixed.snapshot.assertOwned();mixed.seeded=true
      return
    }
    const group=mixed.groups[mixed.group]
    if(!group)return
    if(group.kind==='wash'){
      if(!mixed.activeEntries.length){
        mixed.activeEntries=[group.presentation]
        for(const tile of group.presentation.tiles){const p=candidate.positions.get(key(tile));if(!p)throw Error('Captured raw tile outside seed');candidate.remaining.set(key(p),rect(p))}
      }
      this.present(turnStarted)
      if(candidate.remaining.size)return
      mixed.activeEntries=[];mixed.group++;mixed.frame=0
      return
    }
    // Child failures are fatal, including constructor and retirement: there is
    // no evidence that a failed executable turn restored its GL capsule.
    if(performance.now()-turnStarted>=4)return
    candidate.executionStarted=true
    if(!mixed.child){
      mixed.lastEnded=false
      const created=this.createMixedChildOwned(candidate,mixed,group,()=>{if(this.candidate!==candidate)throw Error('Mixed child target retired')})
      if(mixed.resumeCursor){created.resumeRenderedPrefix(mixed.resumeCursor);mixed.resumeCursor=undefined}
    }
    const child=mixed.child
    if(!child)throw Error('Mixed child missing')
    // Continue only completely rendered frames on THIS captured child/group.
    // The outer turn budget never resets between frames; an existing atomic
    // child step can cross its soft boundary, but no new frame starts after it.
    while(performance.now()-turnStarted<4){
      if(child.pending){
        child.advanceWithinTurn(turnStarted);mixed.snapshot.assertOwned()
        if(child.pending)return
        mixed.lastEnded=mixed.pendingEnded;mixed.pendingEnded=undefined;mixed.frame++
        continue
      }
      if(mixed.frame>=group.frames.length)break
      const captured=group.frames[mixed.frame],accepted=captured.frame
      if(group.source.rasterProfile===CANONICAL_STROKE_RASTER_PROFILE)throw Error('Mixed buildup requires GenericSC composition')
      const decoded=group.source.materialVersion===2
        ?decodeCanonicalStrokeFrame(accepted,{rasterProfile:group.source.rasterProfile,materialVersion:2,material:group.source.context,brush:accepted.brush,strokeId:accepted.strokeId,frameOrdinal:mixed.frame,pigmentRgb8:accepted.pigmentRgb8,composition:accepted.composition})
        :group.source.materialVersion===8
        ?decodeCanonicalPrimaryGrainStrokeFrame(accepted,{rasterProfile:group.source.rasterProfile,materialVersion:8,material:group.source.context,brush:accepted.brush,strokeId:accepted.strokeId,frameOrdinal:mixed.frame,pigmentRgb8:accepted.pigmentRgb8,composition:accepted.composition})
        :decodeCanonicalTexturedAutoStrokeFrame(accepted,{rasterProfile:group.source.rasterProfile,materialVersion:7,material:group.source.context,brush:accepted.brush,strokeId:accepted.strokeId,frameOrdinal:mixed.frame,pigmentRgb8:accepted.pigmentRgb8,composition:accepted.composition})
      mixed.pendingEnded=decoded.frame.fences.some(f=>f.kind==='gestureEnd')
      const submission={gestureId:group.id,layerId:this.options.layerId,layerEpoch:this.options.layerEpoch,ordinal:mixed.frame,assets:group.source.context.assets,rgb:accepted.pigmentRgb8,composition:accepted.composition}
      if(decoded.frame.profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE)child.enqueue({...submission,frame:decoded.frame})
      else if(decoded.frame.profile===CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE)child.enqueue({...submission,frame:decoded.frame})
      else child.enqueue({...submission,frame:decoded.frame})
      child.advanceWithinTurn(turnStarted);mixed.snapshot.assertOwned()
      if(child.pending)return
      mixed.lastEnded=mixed.pendingEnded;mixed.pendingEnded=undefined;mixed.frame++
    }
    if(mixed.frame<group.frames.length)return
    if(mixed.lastEnded)child.cancel()
    else if(group.source.materialVersion!==2&&mixed.group===mixed.groups.length-1&&candidate.checkpoint&&!candidate.checkpoint.retired){child.takeRenderedPrefix({gestureId:group.id,layerId:this.options.layerId,layerEpoch:this.options.layerEpoch,nextFrameOrdinal:mixed.frame},candidate.checkpoint.cursor);candidate.checkpoint.ready=true}
    else child.retireRenderedPrefix({gestureId:group.id,layerId:this.options.layerId,layerEpoch:this.options.layerEpoch,nextFrameOrdinal:mixed.frame})
    mixed.child=undefined
    const root=mixed.root;mixed.root=undefined;root?.release(this.cleanupContextLost())
    mixed.snapshot.assertOwned();mixed.group++;mixed.frame=0
  }
  private advancePreview(turnStarted:number):CanonicalPreviewOutcome|undefined {
    if(this.candidate&&this.candidate.order!==this.replayOrderRevision){this.cancelObsoletePreview(this.candidate);return}
    // Finish only the already selected head frame. before/after is measured in
    // ONE synchronous call, so admission between RAFs cannot mask completion.
    if(!this.candidate&&this.queue.length&&(!this.dirty.size||this.previewLane)){
      const entry=this.previewLane??this.washSlot(0)
      const index=this.queue.indexOf(entry)
      if(index<0)throw new Error('Preview ordinary lane changed')
      this.previewLane=entry
      if(this.advanceEntry(entry,index)){this.previewLane=undefined;this.previewBoundaryReady=true}
      return
    }
    if(!this.candidate){
      if(!this.dirty.size&&!this.previewRecapturePending())return {kind:'preview-idle'}
      // With no previously selected head, begin one ordinary frame first.
      // Once complete, dirty work gets the exclusive lane on the next turn.
      if(this.queue.length&&!this.previewBoundaryReady&&this.previewLane===undefined){
        const entry=this.washSlot(0);this.previewLane=entry
        if(this.advanceEntry(entry,0)){this.previewLane=undefined;this.previewBoundaryReady=true}
        // Mark the completed boundary independently from any later queue refill.
        return
      }
      // A parked candidate cannot retry without actual ordinary progress.
      // One accepted frame gets the existing synchronous completion frontier
      // first; only its real raw changes can advance the revision.
      if(this.previewFailure?.revision===this.revision)return {kind:'preview-failed',...this.previewFailure}
      try{this.beginPreview()}catch(error){
        this.assertRecordedCurrent();this.assertLayers()
        if(this.options.mixedReplay7)this.assertMixedSourcesCurrent()
        if(this.failed)throw error
        this.previewBoundaryReady=false
        this.previewFailure={revision:this.revision,error}
        return {kind:'preview-failed',revision:this.revision,error}
      }
    }
    const candidate=this.candidate!
    try{
      candidate.staged.assertCurrent()
      this.assertRecordedCurrent();this.assertLayers()
      if(candidate.mixed)this.advanceMixedCandidate(candidate,turnStarted)
      else this.present(turnStarted)
      if(candidate.cleanupFailed)throw new Error('Candidate GL cleanup failed')
      if(candidate!==this.candidate)throw new Error('Preview work replaced')
      if(candidate.remaining.size||candidate.mixed&&(!candidate.mixed.seeded||candidate.mixed.group<candidate.mixed.groups.length))return
      candidate.mixed?.snapshot.assertOwned()
      // Existing owner metadata barriers only: no empty GL probe, state query
      // or resource mutation. Repeated after callbacks for closed assertion.
      if(this.closedCandidateOwned(candidate)){
        this.maskParticipant.assertMutationIdle()
        this.options.composite.assertMutationIdle(this.preparations[1].epoch)
        if(this.gl.isContextLost())throw Error('Closed preview context lost')
        this.maskParticipant.assertMutationIdle()
        this.options.composite.assertMutationIdle(this.preparations[1].epoch)
      }
      const coordinator=this
      const disposition:CanonicalPreviewPublicationDisposition=this.closedCandidateOwned(candidate)?'closed-handoff':'display'
      const previousCheckpoint=this.renderedTail,nextCheckpoint=disposition==='display'&&candidate.checkpoint?.ready&&!candidate.checkpoint.retired?candidate.checkpoint:undefined
      let published=false,finished=false,asserting=false,validated=false,ticket:CanonicalPreviewPublication
      ticket=Object.freeze({disposition,buffer:candidate.staged.buffer,previous:candidate.previous,revision:candidate.revision,
        assertCurrent(){
          if(this!==ticket||published||asserting||coordinator.busy||coordinator.closed||coordinator.failed||coordinator.candidate!==candidate||candidate.ticket!==ticket)throw new Error('Foreign preview publication')
          asserting=true;validated=false;coordinator.busy=true
          try{
            coordinator.assertRecordedCurrent();coordinator.assertLayers();candidate.staged.assertCurrent()
            // Final external assertion is captured authority/root, after staged
            // callbacks. The final validation below is a pure owner/order CAS.
            candidate.mixed?.snapshot.assertOwned()
            if(coordinator.closed||coordinator.failed||coordinator.candidate!==candidate||candidate.ticket!==ticket||candidate.generation!==coordinator.replayGeneration||candidate.order!==coordinator.replayOrderRevision||coordinator.derived!==candidate.previous||candidate.mixed&&coordinator.replayWork!==candidate.mixed.snapshot)throw Error('Preview assertion owner changed')
            if(disposition==='closed-handoff'){
              coordinator.maskParticipant.assertMutationIdle()
              coordinator.options.composite.assertMutationIdle(coordinator.preparations[1].epoch)
              if(coordinator.gl.isContextLost())throw Error('Closed preview context lost')
              coordinator.maskParticipant.assertMutationIdle()
              coordinator.options.composite.assertMutationIdle(coordinator.preparations[1].epoch)
            }
            if(disposition==='closed-handoff'&&!coordinator.closedCandidateOwned(candidate))throw Error('Closed preview cohort changed')
            validated=true
          }finally{coordinator.busy=false;asserting=false}
        },
        publish(){
          // This is the final pure coordinator CAS. Engine updates its pointer
          // immediately afterwards; no callback/GL/cleanup occurs in between.
          if(this!==ticket||published||asserting||!validated||coordinator.busy||coordinator.closed||coordinator.failed||candidate.generation!==coordinator.replayGeneration||candidate.order!==coordinator.replayOrderRevision||coordinator.candidate!==candidate||candidate.ticket!==ticket||coordinator.derived!==candidate.previous||candidate.remaining.size||coordinator.work||candidate.mixed&&coordinator.replayWork!==candidate.mixed.snapshot)throw new Error('Stale preview publication')
          if(disposition==='closed-handoff'&&!coordinator.closedCandidateOwned(candidate))throw Error('Stale closed preview publication')
          published=true;validated=false;coordinator.derived=candidate.staged.buffer;coordinator.renderedTail=nextCheckpoint
          coordinator.completedPresentation=candidate.revision
          // Captured group owns an immutable completed deposition prefix. Pure
          // writes only in the SAME successful publication CAS; no new pins.
          if(candidate.mixed){
            for(let index=0;index<candidate.mixed.groups.length;index++){
              const group=candidate.mixed.groups[index],entry=coordinator.entries[index]
              if(group.kind==='wash'&&entry?.id===group.id&&entry.firstRawPaintNextOrdinal!==undefined
                &&entry.firstRawPaintNextOrdinal<=group.depositedNextOrdinal)
                entry.publishedPaintedNextOrdinal=group.depositedNextOrdinal
            }
            coordinator.publishedNativePaintOrder=candidate.order
          }
          coordinator.candidate=undefined;coordinator.previewFailure=undefined;coordinator.previewBoundaryReady=false
          if(coordinator.revision===candidate.revision)coordinator.dirty.clear()
          if(disposition==='closed-handoff')coordinator.closed=true
        },
        finish(){
          if(this!==ticket||!published||finished||coordinator.busy)throw new Error('Preview cleanup ownership changed')
          finished=true
          const mixed=candidate.mixed;candidate.mixed=undefined
          coordinator.busy=true
          let failed=false,error:unknown
          const previousErrors=coordinator.errors.length
          const cleanup=(action:()=>void)=>{try{action()}catch(e){if(!failed){failed=true;error=e}}}
          try{
            cleanup(()=>previousCheckpoint?.release())
            if(candidate.checkpoint!==nextCheckpoint)cleanup(()=>candidate.checkpoint?.release())
            cleanup(()=>mixed?.snapshot.detach())
            cleanup(()=>candidate.staged.finish(candidate.previous,disposition))
            if(disposition==='closed-handoff')cleanup(()=>coordinator.releaseAll(coordinator.cleanupContextLost()))
            cleanup(candidate.releaseMetadata)
          }finally{coordinator.busy=false}
          if(coordinator.errors.length>previousErrors&&!failed){failed=true;error=coordinator.errors[previousErrors]}
          if(failed)throw error
        }})
      candidate.ticket=ticket
      return {kind:'preview-ready',ticket}
    }catch(error){
      // Only candidate work is recoverable; ordinary execution and original
      // authority failures stay in advance's existing fatal boundary.
      this.assertRecordedCurrent();this.assertLayers();candidate.staged.assertCurrent()
      if(this.options.mixedReplay7)this.assertMixedSourcesCurrent()
      if(candidate.cleanupFailed||candidate.executionStarted||candidate.executionFailed||this.entries.some(entry=>entry.executor.poisoned))throw error
      if(this.candidate!==candidate)throw error
      try{this.cancelPreview()}catch(cleanup){throw new AggregateError([error,cleanup],'Preview cleanup failed',{cause:error})}
      this.previewBoundaryReady=false
      this.previewFailure={revision:candidate.revision,error}
      return {kind:'preview-failed',revision:candidate.revision,error}
    }
  }
  /** Allocation-free maximum over SAME accepted frozen bodies, not a packet
   * header parser. Existing codec7 record strides96/40/16 and Executor logical
   * units1024/512/128 imply <=13 logical bytes per decoded raw byte. Native
   * capture overlaps separately. This is NOT a hard JS-heap guarantee.
   */
  private mixedDecodeWorkspaceBytes():number {
    if(!this.options.mixedReplay7)return 0
    let maximum=0
    for(const owner of this.entries){
      if(owner.mode!=='buildup')continue
      const source=owner.replaySource?.context.primarySource
      if(!source)throw Error('Mixed accepted decode source missing')
      const masked=owner.replaySource?.materialVersion===2?owner.replaySource.context.maskSource:undefined
      const contextBytes=16384+(source.kind==='softAuto'?4*(source.source.softnessCurve.text.length+source.radialCurve.source.text.length):0)+(masked?.kind==='softAuto'?4*(masked.source.softnessCurve.text.length+masked.radialCurve.source.text.length):0)
      for(const retained of this.replay.values()){
        if(retained.gestureId!==owner.id)continue
        const text=retained.acceptedFrame?.materialPacked
        if(typeof text!=='string'||text.length>CANONICAL_MATERIAL_LIMITS.textBytes)throw Error('Mixed accepted body bound changed')
        const raw=Math.min(CANONICAL_MATERIAL_LIMITS.rawBytes,Math.ceil(text.length*3/4))
        // 1536 frame base +13/raw decoded DTO +3/raw string/bytes +4/text
        // base64 slice/re-encode +bounded context/Soft curve metadata copies.
        const bytes=1536+16*raw+4*text.length+contextBytes
        if(!Number.isSafeInteger(bytes))throw Error('Mixed decoder workspace bound')
        maximum=Math.max(maximum,bytes)
      }
    }
    return maximum
  }
  private prepareRenderedTailOwned(mixed:MixedCandidateWork,buffer:TiledLayerBuffer):RenderedTailCheckpoint|undefined {
    const tail=mixed.groups.at(-1)
    if(!tail||tail.kind!=='buildup'||tail.source.materialVersion===2||tail.close)return
    const count=mixed.groups.reduce((n,g)=>n+g.frames.length,0),bytes=1024+count*128+mixed.groups.length*512
    const cpu=this.maskParticipant.brushGlBatchInfo().cpu
    // Exact current retain() child header2048 + cursor precharge1024. No new cap.
    // Insufficient OPTIONAL metadata disables checkpoint, never denies full rendering.
    if(cpu.budgetBytes-cpu.reservedBytes<bytes+3072)return
    let releaseMetadata:()=>void
    try{releaseMetadata=cpu.reserve(bytes)}catch(error){this.failed=true;throw error}
    let cursor:CanonicalRenderedPrefixCursor7|undefined,root:CanonicalMaskSourceLease|undefined,pinned=false,checkpoint:RenderedTailCheckpoint|undefined,unregister:(()=>void)|undefined
    const groups:{owner:Entry;frames:readonly ReplayEntry[];source?:CanonicalReplaySource;sourceLease?:CanonicalMaskSourceLease;ownership?:CanonicalWashOwnership;deposited:number;opacity:number;blend:CanonicalStrokeComposition['outerBlend']}[]=[]
    const release=()=>{
      if(checkpoint?.retired)return
      if(checkpoint)checkpoint.retired=true
      unregister?.();unregister=undefined
      if(this.renderedTail===checkpoint)this.renderedTail=undefined
      let failed=false,primary:unknown
      const attempt=(action:()=>void)=>{try{action()}catch(error){if(!failed){failed=true;primary=error}}}
      attempt(()=>cursor?.release());attempt(()=>root?.release(this.cleanupContextLost()))
      if(pinned){pinned=false
        for(const group of groups){for(const frame of group.frames){frame.pins--;if(frame.retired&&!frame.pins)attempt(()=>this.releaseReplayEntry(frame))}group.owner.replayPins!--;if(!group.owner.replayPins&&group.owner.metadataRetired)attempt(()=>this.releaseReplayOwnerMetadata(group.owner))}
      }
      attempt(releaseMetadata)
      if(failed)throw primary
    }
    try{
      cursor=prepareRenderedPrefixCursor7(cpu);mixed.snapshot.assertOwned()
      for(const group of mixed.groups){
        const owner=this.entries.find(e=>e.id===group.id)
        if(!owner)throw Error('Rendered checkpoint owner disappeared')
        const frames=group.frames.map(frame=>{const value=frame.value,id=value.kind==='recorded'?value.input.operation.id:value.operation.id,entry=this.replay.get(id);if(!entry||entry.gestureId!==group.id||entry.acceptedFrame!==frame.frame)throw Error('Rendered checkpoint prefix changed');return entry})
        groups.push({owner,frames:Object.freeze(frames),source:owner.replaySource,sourceLease:owner.sourceLease,ownership:owner.ownership,deposited:owner.depositedNextOrdinal,opacity:owner.opacity,blend:owner.blend})
      }
      root=mixed.snapshot.retainRootOwned(tail);if(!root)throw Error('Rendered checkpoint root missing');mixed.snapshot.assertOwned()
      const grid=this.seedGrid()
      checkpoint={generation:this.replayGeneration,order:this.replayOrderRevision,stable:this.stable,buffer,grid,groups:Object.freeze(groups.map(g=>Object.freeze(g))),root,cursor,ready:false,retired:false,preempted:false,release}
      for(const group of groups){group.owner.replayPins=(group.owner.replayPins??0)+1;for(const frame of group.frames)frame.pins++}pinned=true
      unregister=cpu.registerOptionalReclaim(()=>{checkpoint!.preempted=true;try{release()}catch(primary){this.failed=true;this.errors.push(primary);throw primary}})
      return checkpoint
    }catch(primary){this.failed=true;try{release()}catch(error){this.errors.push(error)}throw primary}
  }
  private incrementalTailOwned(groups:readonly ReplayCapturedGroup[],positions:ReadonlyMap<string,Position>):Readonly<{checkpoint:RenderedTailCheckpoint;plan:PreparedLayerTargets}>|undefined {
    const checkpoint=this.renderedTail,tail=groups.at(-1)
    if(!checkpoint||checkpoint.retired||!checkpoint.ready||!tail||tail.kind!=='buildup'||tail.close||checkpoint.generation!==this.replayGeneration||checkpoint.order!==this.replayOrderRevision||checkpoint.stable!==this.stable||checkpoint.buffer!==this.derived||checkpoint.groups.length!==groups.length||groups.length!==this.entries.length)return
    const grid=this.seedGrid(),previous=checkpoint.grid
    if(grid.x0!==previous.x0||grid.y0!==previous.y0||grid.x1!==previous.x1||grid.y1!==previous.y1||grid.count!==previous.count||positions.size>64||this.derived.evictedTileCount||this.derived.tileCount!==positions.size)return
    for(let index=0;index<groups.length;index++){
      const group=groups[index],old=checkpoint.groups[index],owner=this.entries[index]
      if(owner!==old.owner||group.id!==owner.id||owner.metadataRetired||owner.metadataReleased||owner.replaySource!==old.source||owner.sourceLease!==old.sourceLease||owner.opacity!==old.opacity||owner.blend!==old.blend||owner.washInFlight)return
      if(index===groups.length-1?group.frames.length<=old.frames.length:group.frames.length!==old.frames.length)return
      if(group.kind==='wash'&&(owner.mode!=='wash'||owner.depositedNextOrdinal!==old.deposited||owner.ownership!==old.ownership))return
      if(group.kind==='buildup'&&owner.mode!=='buildup')return
      for(let ordinal=0;ordinal<old.frames.length;ordinal++){
        const value=group.frames[ordinal].value,id=value.kind==='recorded'?value.input.operation.id:value.operation.id
        if(old.frames[ordinal].retired||this.replay.get(id)!==old.frames[ordinal])return
      }
    }
    if(!checkpoint.root.isReady())return
    this.assertMixedSourcesCurrent()
    if(this.renderedTail!==checkpoint||checkpoint.retired||checkpoint.generation!==this.replayGeneration||checkpoint.order!==this.replayOrderRevision||checkpoint.buffer!==this.derived)throw Error('Incremental checkpoint changed during source check')
    const plan=this.derived.preparePaintTargetRects([...positions.values()].map(rect))
    try{
      for(let i=0;i<plan.length;i++)if(!plan.takeResident(i))throw Error('Incremental checkpoint resident source disappeared')
      if(this.renderedTail!==checkpoint||checkpoint.retired||checkpoint.buffer!==this.derived||checkpoint.order!==this.replayOrderRevision)throw Error('Incremental checkpoint owner changed')
      return {checkpoint,plan}
    }catch(primary){try{plan.close()}catch(error){this.failed=true;this.errors.push(error)}throw primary}
  }

  private beginPreview():void {
    if(this.candidate||this.previewLane)throw new Error('Preview lane busy')
    const seed=this.seedGrid(),count=this.fullSeedCount(),entries=this.entries.length,revision=this.revision
    const bytes=512+count*1024+entries*512+count*entries*1024+this.mixedDecodeWorkspaceBytes()
    if(!Number.isSafeInteger(bytes))throw new RangeError('Preview metadata bound')
    // Reserve BEFORE allocating any captured raw-view arrays or candidate.
    const releaseMetadata=this.maskParticipant.brushGlBatchInfo().cpu.reserve(bytes)
    const seedCurrent=()=>{const now=this.seedGrid();return now.x0===seed.x0&&now.y0===seed.y0&&now.x1===seed.x1&&now.y1===seed.y1&&now.count===seed.count}
    let staged:CanonicalPreviewCandidate|undefined,snapshot:ReplayGroupsWork|undefined,preparedMixed:MixedCandidateWork|undefined,preparedCheckpoint:RenderedTailCheckpoint|undefined
    try{
      const gpu=count*this.stable.tileWidth*this.stable.tileHeight*4
      if(!Number.isSafeInteger(gpu))throw new RangeError('Preview target bound')
      for(const p of this.positions.values())if(p.width!==this.stable.tileWidth||p.height!==this.stable.tileHeight)throw Error('Preview tile dimensions changed')
      staged=this.options.previewCandidate!(gpu)
      this.assertRecordedCurrent();this.assertLayers();staged.assertCurrent()
      if(this.candidate||this.previewLane||this.revision!==revision||this.fullSeedCount()!==count||!seedCurrent())throw Error('Preview staging changed seed')
      const positions=new Map<string,Position>(),remaining=new Map<string,WorldRect>()
      for(const [k,p]of this.positions){positions.set(k,{...p,presentation:{}});remaining.set(k,rect(p))}
      this.addSeed(positions,seed)
      for(const[k,p]of positions)if(!remaining.has(k)){remaining.set(k,rect(p))}
      if(!Number.isSafeInteger(gpu))throw new RangeError('Preview target bound')
      let captured:readonly PreviewSnapshotEntry[]
      if(this.options.mixedReplay7){
        this.captureReplayGroupsOwned();const held=this.replayWork
        if(!held||!('snapshot'in held))throw Error('Mixed snapshot owner missing')
        snapshot=held
        captured=[]
      }else captured=this.entries.map(entry=>Object.freeze({committed:entry.committed,opacity:entry.opacity,blend:entry.blend,tiles:this.locals(entry)}))
      this.assertRecordedCurrent();this.assertLayers();staged.assertCurrent()
      if(this.candidate||this.previewLane||this.revision!==revision||this.fullSeedCount()!==count||!seedCurrent())throw new Error('Preview creation reentered')
      const groups=snapshot?.groupsOwned()
      snapshot?.assertOwned()
      if(this.candidate||this.previewLane||this.revision!==revision||this.fullSeedCount()!==count||!seedCurrent())throw Error('Candidate publication owner changed')
      const mixed:MixedCandidateWork|undefined=snapshot?{snapshot,groups:groups!,group:0,frame:0,seeded:false,activeEntries:[]}:undefined
      preparedMixed=mixed
      let checkpoint:RenderedTailCheckpoint|undefined,selected:RenderedTailCheckpoint|undefined
      if(mixed){
        checkpoint=this.prepareRenderedTailOwned(mixed,staged.buffer);preparedCheckpoint=checkpoint
        try{
          const previous=this.incrementalTailOwned(mixed.groups,positions)
          if(previous){selected=previous.checkpoint;mixed.seedBase=previous.checkpoint.buffer;mixed.seedPlan=previous.plan;mixed.resumeCursor=previous.checkpoint.cursor;mixed.group=mixed.groups.length-1;mixed.frame=previous.checkpoint.groups.at(-1)!.frames.length}
          mixed.snapshot.assertOwned()
          if(this.candidate||this.previewLane||this.revision!==revision||this.fullSeedCount()!==count||!seedCurrent())throw Error('Incremental candidate staging changed')
        }catch(primary){this.failed=true;for(const action of[()=>mixed.seedPlan?.close(),()=>checkpoint?.release()])try{action()}catch(error){this.errors.push(error)}throw primary}
      }
      const next:PreviewCandidateWork={revision,generation:this.replayGeneration,order:this.replayOrderRevision,previous:this.derived,staged,positions,remaining,entries:Object.freeze(captured),releaseMetadata,...mixed?{mixed}:{},...checkpoint?{checkpoint}:{}}
      let attached=false
      if(mixed?.resumeCursor&&selected){
        const tail=mixed.groups.at(-1)!
        if(tail.kind!=='buildup')throw Error('Incremental tail source changed')
        this.createMixedChildOwned(next,mixed,tail,()=>{
          if(attached?this.candidate!==next:this.candidate!==undefined||this.previewLane!==undefined||this.revision!==revision||next.generation!==this.replayGeneration||next.order!==this.replayOrderRevision)throw Error('Incremental prepared child changed')
        })
        // Mandatory constructor reserves can synchronously evict OPTIONAL old
        // checkpoint. No pixels exist yet; normal full replay is still valid.
        if(selected.preempted){
          mixed.child!.cancel();mixed.child=undefined
          const root=mixed.root;mixed.root=undefined;root?.release(this.cleanupContextLost())
          const plan=mixed.seedPlan;mixed.seedPlan=undefined;plan!.close()
          mixed.seedBase=undefined;mixed.resumeCursor=undefined;mixed.group=0;mixed.frame=0
        }else{
          mixed.child!.resumeRenderedPrefix(mixed.resumeCursor);mixed.resumeCursor=undefined
          selected.release()
        }
        mixed.snapshot.assertOwned()
        if(this.candidate||this.previewLane||this.revision!==revision||next.generation!==this.replayGeneration||next.order!==this.replayOrderRevision||!seedCurrent())throw Error('Incremental pre-pixel owner changed')
      }
      this.candidate=next;attached=true
      preparedMixed=undefined;preparedCheckpoint=undefined;staged=undefined
    }catch(error){
      let cleanupFailed=false,cleanupError:unknown
      for(const action of[()=>preparedMixed?.child?.cancel(),()=>preparedMixed?.root?.release(this.cleanupContextLost()),()=>preparedMixed?.seedPlan?.close(),()=>preparedCheckpoint?.release(),()=>staged?.cancel()])try{action()}catch(e){if(!cleanupFailed){cleanupFailed=true;cleanupError=e}}
      try{snapshot?.detach()}catch(e){if(!cleanupFailed){cleanupFailed=true;cleanupError=e}}
      try{releaseMetadata()}catch(e){if(!cleanupFailed){cleanupFailed=true;cleanupError=e}}
      if(cleanupFailed){this.failed=true;throw new AggregateError([error,cleanupError],'Preview staging cleanup failed',{cause:error})}
      throw error
    }
  }
  private cancelPreview(reason?:object):void {
    const candidate=this.candidate;this.candidate=undefined
    const work=this.work;this.work=undefined
    let failed=false,error:unknown
    for(const action of [()=>this.closePresentationPlans(work),()=>candidate?.mixed?.child?.cancel(reason),()=>candidate?.mixed?.root?.release(this.cleanupContextLost()),()=>candidate?.mixed?.seedPlan?.close(),()=>candidate?.checkpoint?.release(),()=>candidate?.mixed?.snapshot.detach(),()=>candidate?.staged.cancel(),()=>candidate?.releaseMetadata()])try{action()}catch(e){if(!failed){failed=true;error=e}}
    if(failed)throw error
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
  /** Buildup-only rollback fault: attempt all cleanup, retain primary exception. */
  private cleanFrontier(action:()=>void):void {try{action()}catch(error){this.failed=true;this.errors.push(error);this.clean(()=>this.notifyPoison(error))}}
  private closePresentationPlans(work?:PresentationWork):void {
    if(!work)return
    const plans=[work.stablePlan,work.derivedPlan];work.stablePlan=undefined;work.derivedPlan=undefined;work.stableTarget=undefined;work.derivedTarget=undefined
    let failed=false,failure:unknown
    for(const plan of plans)try{plan?.close()}catch(error){if(this.candidate)this.candidate.cleanupFailed=true;if(!failed){failed=true;failure=error}}
    if(failed)throw failure
  }
  private closeCommitPlan(entry:Entry):void {
    const plan=entry.targetPlan;entry.targetPlan=undefined;entry.commitTarget=undefined;plan?.close()
  }
  private releaseAll(lost: boolean): void {
    this.clean(()=>this.cancelPreview());this.previewLane=undefined
    const checkpoint=this.renderedTail;this.renderedTail=undefined;if(checkpoint)this.clean(checkpoint.release)
    this.replayGeneration++
    for(const entry of this.entries)this.retireReplayGesture(entry.id)
    this.clean(()=>{const work=this.replayWork;if(work){if('snapshot'in work)work.detach();else work.release()}})
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
