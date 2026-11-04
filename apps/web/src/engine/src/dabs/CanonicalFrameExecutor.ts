import {setGlColorMask} from '../raster/GlClearState'
import {canonicalPixelSourceOuterCompositionLaw,canonicalStrokeCompositionExtensions} from '@grafetto/shared'
import {canonicalSourceMaterialTipGradient,canonicalPixelTextureAsset,canonicalImageFrameAsset,canonicalMaskedSourceMaterialContext,canonicalSourceMaterialContext,type CanonicalMaterialContextV2,type CanonicalSourceRoleTexturePin} from '@grafetto/shared'
import {assertCanonicalAutoRecipeCapacity,type CanonicalAutoGeometryMechanism} from './canonicalAutoCapacity'
import type {BrushMipCache} from './BrushMipCache'
import {canonicalPrimaryGrainMaterialContext,captureCanonicalPrimaryGrainFrame,CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE,type CanonicalMaterialContextV8,type CanonicalMaterialFrameV8,canonicalSoftAutoDataEqual,captureCanonicalTexturedAutoFrame,canonicalTexturedAutoMaterialContext,CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE,type CanonicalMaterialContextV7,type CanonicalMaterialFrameV7,captureCanonicalSoftNativeDefaultTexturedSourceFrame,canonicalSoftNativeDefaultTexturedSourceMaterialContext,CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE,type CanonicalMaterialContextV6,type CanonicalMaterialFrameV6,captureCanonicalPressureTexturedSourceFrame,canonicalPressureTexturedSourceMaterialContext,CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE,type CanonicalMaterialContextV5,type CanonicalMaterialFrameV5,captureCanonicalTexturedSourceFrame,canonicalTexturedSourceMaterialContext,CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE,canonicalBrushDescriptorJSON,canonicalStrokeCoverageMatches,type CanonicalMaterialContextV4,type CanonicalMaterialFrameV4,captureCanonicalPrimaryTextureFrame,canonicalPrimaryTextureMaterialContext,canonicalPrimaryTextureStrengthU8,canonicalImageMaterialPin,CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE,type CanonicalMaterialContextV3,type CanonicalMaterialFrameV3} from '@grafetto/shared'
import type {BrushGlCanonicalCallbackScope} from './BrushGlState'
import { captureSourceDefaultAutoDensityStrokeIdentity, type SourceDefaultAutoDensityStrokeIdentity } from '../presets/sourceDefaultAutoDensitySeed'
import { CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE, CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE, CANONICAL_MATERIAL_PROFILE, CANONICAL_SOURCE_MATERIAL_PROFILE, canonicalDefaultAutoSourcePin, canonicalGaussianAutoSourcePin, canonicalSoftAutoSourcePin, canonicalSoftAutoCost, canonicalAutoCost, CANONICAL_STROKE_RASTER_PROFILE, CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE, isCanonicalStrokeComposition, type CanonicalStrokeComposition, type CanonicalStrokeRasterProfile, type CanonicalMaterialAsset, type CanonicalAutoSource, type CanonicalSoftAutoSource, type CanonicalAutoRecipe, type CanonicalSoftAutoRecipe, type AnyCanonicalMaterialRecipe, type AnyCanonicalMaterialFrame } from '@grafetto/shared'
import { SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE, SOURCE_RGBA8_GENERIC_SC_PROFILE } from '../presets/sourceColorRgba8'
import { CanonicalSoftCircleProgramOwner } from './CanonicalSoftCircleProgramOwner'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { PaintTarget } from '../buffers/ILayerBuffer'
import type { WorldRect } from '../buffers/tileMath'
import { planCanonicalTargets } from './CanonicalTargetPlan'
import type { RibbonScratchAcquisition,RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { advanceSourcePrimaryComposition, createSourcePrimaryComposition, sealSourcePrimaryComposition, type SourcePrimaryCompositionContext, type SourcePrimaryCompositionResult, type SourcePrimaryCompositionState } from '../presets/sourcePrimaryComposition'
import { runBrushGlBatch, runBrushGlTurn, runBrushGlSequence, runBrushGlClosedNativeSequence, type BrushGlTurn } from './BrushGlBatch'
import { bindCanonicalLayerTargets,prepareCanonicalLayerFrame,createCanonicalRawLifetime,type CanonicalLayerFrame } from './CanonicalLayerTargets'
import {canonicalPatternResourceLifetime,assertCanonicalPatternResourceCurrent,type CanonicalPatternResource,type CanonicalGradientResource,type CanonicalTipGradientResource,type CanonicalMaskSourceReader,type CanonicalMaskSourceLease} from './CanonicalMaskSourceBank'
import {CANONICAL_DUAL_MASKING_MODES} from './CanonicalRgba8CompositePass'
import type { CanonicalCompositeOperationKind, CanonicalOwnedRgba8Target, CanonicalRgba8CompositePass, CanonicalRgba8SourceView } from './CanonicalRgba8CompositePass'
import { canonicalTransformedMaskMetadata } from './TransformedMaskPlan'
import type { AnyTransformedMaskRequest, CanonicalMaskCapacityLease, TransformedMaskPrepass } from './TransformedMaskPrepass'

const autoRecipe = (recipe:AnyCanonicalMaterialRecipe):recipe is CanonicalAutoRecipe|CanonicalSoftAutoRecipe =>
  'kind' in recipe && (recipe.kind==='defaultAuto'||recipe.kind==='gaussianAuto'||recipe.kind==='softAuto')

/** Admission-only pressure, before Work publication or any pixel write. */
export class CanonicalFrameCpuPressure extends RangeError {
  readonly reservedBytes:number
  readonly requiredHeadroomBytes:number
  readonly budgetBytes:number
  readonly phase:'work-headroom'|'planning'
  constructor(reservedBytes:number,requiredHeadroomBytes:number,budgetBytes:number,phase:'work-headroom'|'planning'='work-headroom'){
    super(`Canonical queue exceeds shared CPU work headroom: reserved=${reservedBytes}, required=${requiredHeadroomBytes}, budget=${budgetBytes}, phase=${phase}`)
    this.phase=phase;this.name='CanonicalFrameCpuPressure';this.reservedBytes=reservedBytes;this.requiredHeadroomBytes=requiredHeadroomBytes;this.budgetBytes=budgetBytes
  }
}

/** Both authoring and history adapters submit the SAME already-decoded frame.
 * No pointer, sensor, author DTO, random source or mutable tool state enters here. */
export interface CanonicalFrameSubmission {
  readonly gestureId: string
  /** Required brush-data identity for seeded coverage; independent of authority namespace. */
  readonly densityStrokeIdentity?: Readonly<SourceDefaultAutoDensityStrokeIdentity>
  readonly layerId: string
  readonly layerEpoch: number
  readonly ordinal: number
  readonly frame: AnyCanonicalMaterialFrame
  readonly assets: readonly CanonicalMaterialAsset[]
  readonly rgb: readonly [number, number, number]
  readonly composition: SourcePrimaryCompositionContext
}
/** Explicit local renderer input; the global shared Any unions stay V1/2. */
export interface CanonicalFrameSubmissionV3 extends Omit<CanonicalFrameSubmission,'frame'|'densityStrokeIdentity'> {
  readonly frame:CanonicalMaterialFrameV3
  readonly densityStrokeIdentity?:never
}
/** Standalone explicit accepted4 metadata; no Operation/recorded-input union activation. */
export interface CanonicalFrameSubmissionV4 extends Omit<CanonicalFrameSubmission,'frame'|'densityStrokeIdentity'> {
  readonly frame:CanonicalMaterialFrameV4
  readonly densityStrokeIdentity?:never
}
export interface CanonicalFrameSubmissionV5 extends Omit<CanonicalFrameSubmission,'frame'|'densityStrokeIdentity'> {readonly frame:CanonicalMaterialFrameV5;readonly densityStrokeIdentity?:never}
export interface CanonicalFrameSubmissionV6 extends Omit<CanonicalFrameSubmission,'frame'|'densityStrokeIdentity'> {readonly frame:CanonicalMaterialFrameV6;readonly densityStrokeIdentity?:never}
export interface CanonicalFrameSubmissionV7 extends Omit<CanonicalFrameSubmission,'frame'|'densityStrokeIdentity'>{readonly frame:CanonicalMaterialFrameV7;readonly densityStrokeIdentity?:never}
export interface CanonicalFrameSubmissionV8 extends Omit<CanonicalFrameSubmission,'frame'|'densityStrokeIdentity'>{readonly frame:CanonicalMaterialFrameV8;readonly densityStrokeIdentity?:never}
type ExecutorFrameSubmission=CanonicalFrameSubmissionV8|CanonicalFrameSubmissionV7|CanonicalFrameSubmissionV6|CanonicalFrameSubmission|CanonicalFrameSubmissionV3|CanonicalFrameSubmissionV4|CanonicalFrameSubmissionV5
const textureProfile=(profile:unknown)=>profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE||profile===CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE||profile===CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE||profile===CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE||profile===CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE||profile===CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE
function textureSubmission(input:ExecutorFrameSubmission):input is CanonicalFrameSubmissionV8|CanonicalFrameSubmissionV7|CanonicalFrameSubmissionV6|CanonicalFrameSubmissionV3|CanonicalFrameSubmissionV4|CanonicalFrameSubmissionV5 {return textureProfile(input.frame.profile)}
function captureTextureContext(value:CanonicalMaterialContextV8|CanonicalMaterialContextV7|CanonicalMaterialContextV6|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5):CanonicalMaterialContextV8|CanonicalMaterialContextV7|CanonicalMaterialContextV6|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5 {
  const version=Object.getOwnPropertyDescriptor(value,'version')
  if(!version||!Object.hasOwn(version,'value'))throw new TypeError('Explicit texture context required')
  return version.value===8?canonicalPrimaryGrainMaterialContext(value):version.value===7?canonicalTexturedAutoMaterialContext(value):version.value===6?canonicalSoftNativeDefaultTexturedSourceMaterialContext(value):version.value===5?canonicalPressureTexturedSourceMaterialContext(value):version.value===4?canonicalTexturedSourceMaterialContext(value):canonicalPrimaryTextureMaterialContext(value)
}
function phaseContextOwnField(value:unknown,key:string):unknown {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Invalid standalone7 scalar source')
  const prototype=Object.getPrototypeOf(value),field=Object.getOwnPropertyDescriptor(value,key)
  if(prototype!==Object.prototype&&prototype!==null||!field||!Object.hasOwn(field,'value'))throw new TypeError('Invalid standalone7 scalar source')
  return field.value
}
function assertStandalone7Density(value:unknown):void {
  const source=phaseContextOwnField(value,'primarySource'),kind=phaseContextOwnField(source,'kind')
  if(kind==='defaultAuto'){
    const geometry=phaseContextOwnField(source,'source'),density=phaseContextOwnField(geometry,'density'),coverage=phaseContextOwnField(source,'coverageProfile')
    if(density!==1||coverage===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE)throw new TypeError('Standalone textured7 density is unsupported')
  }
}
function textureFrameCaptureBytes(frame:unknown):number {
  if(!frame||typeof frame!=='object')throw new TypeError('Invalid texture frame capture')
  let bytes=1536
  for(const [name,limit,unit]of [['definitions',800,1024],['draws',800,512],['fences',2404,128]]as const){
    const field=Object.getOwnPropertyDescriptor(frame,name),array=field&&Object.hasOwn(field,'value')?field.value:undefined
    if(!Array.isArray(array)||array.length>limit)throw new RangeError('Texture frame capture exceeds metadata bounds')
    bytes+=array.length*unit
  }
  return bytes
}
/** Reference profile is retained for recorded diagnostic corpora only. The
 * shared canonical wire profile requires the installed fused scalar kernels. */
export type CanonicalExecutorRasterProfile = 'reference-scalar-f32-rne-v1' | CanonicalStrokeRasterProfile
/** Same operation selector for exclusive wash and recorded-layer fold. Local
 * deposition remains the installed fused law under the V2 pipeline profile. */
/** One closed operation manifest, shared by engine admission and executor. */
export function canonicalExecutorOperations(profile:CanonicalExecutorRasterProfile,extra:Readonly<{masked?:boolean;erase?:boolean}>={}):readonly CanonicalCompositeOperationKind[]{
 let operations:CanonicalCompositeOperationKind[]
 if(profile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)operations=['alphaDarkenBrowserFloat','overBrowserFloat','genericSCU8']
 else if(profile===CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)operations=['alphaDarken32FusedScalar','over32FusedScalar','genericSCU8']
 else if(profile===CANONICAL_STROKE_RASTER_PROFILE)operations=['alphaDarken32FusedScalar','over32FusedScalar']
 else if(profile==='reference-scalar-f32-rne-v1')operations=['alphaDarken32','over32']
 else throw new TypeError('Unsupported canonical executor raster profile')
 if(extra.masked!==undefined&&typeof extra.masked!=='boolean'||extra.erase!==undefined&&typeof extra.erase!=='boolean')throw new TypeError('Invalid canonical operation inventory')
 if(extra.masked)operations.push('maskingAlpha')
 if(extra.erase)operations.push('erase32FusedScalar')
 return Object.freeze(operations)
}
export function canonicalWashOuterOperation(profile: CanonicalExecutorRasterProfile, blend: CanonicalStrokeComposition['outerBlend'], opacity: number) {
  if(blend==='colorHsyBrowser'){
    if(profile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE&&profile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)throw new TypeError('Browser HSY requires explicit GenericSC-capable pipeline');
    return {kind:'colorHsyBrowser' as const,control:{mode:'colorHsy' as const,profile:SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE,opacity}};
  }
  if(blend==='erase'){
    if(profile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE&&profile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)throw new TypeError('Erase requires GenericSC composition')
    return {kind:'erase32FusedScalar' as const,control:{profile:CANONICAL_STROKE_RASTER_PROFILE,opacity}}
  }
  if (blend !== 'over') {
    if (profile !== CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE && profile !== CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE) throw new TypeError('GenericSC outer composition requires its pinned raster profile')
    return { kind: 'genericSCU8' as const, control: { mode: blend, profile: SOURCE_RGBA8_GENERIC_SC_PROFILE, opacity } }
  }
  if(profile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)return {kind:'overBrowserFloat' as const,control:{profile:CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,opacity}}
  return profile === 'reference-scalar-f32-rne-v1'
    ? { kind: 'over32' as const, control: { profile: 'portable-f32-division-rne-v1' as const, opacity } }
    : { kind: 'over32FusedScalar' as const, control: { profile: CANONICAL_STROKE_RASTER_PROFILE, opacity } }
}
export interface CanonicalWashLocalTile {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Immutable raw local, BEFORE outer opacity. Borrow only while owner lives. */
  readonly view: CanonicalRgba8SourceView
}
export interface CanonicalWashOwnership {
  readonly tiles: readonly CanonicalWashLocalTile[]
  /** Idempotent. No leases may span this release; lost requires actual loss. */
  release(options?: { lost?: boolean }): void
}
export interface CanonicalFrameExecutorOptions {
  /** Engine-only closed callback capability; generic/custom executors omit it. */
  readonly callbackScope?:BrushGlCanonicalCallbackScope
  readonly washMode?: 'exclusive' | 'deposition-only'
  /** Internal persistent Entry admission role; no executable queue or paint. */
  readonly replayFrontier?:'textured7-buildup-v1'|'primary-grain8-buildup-v1'|'source2-buildup-v1'
  /** Hidden candidate cursor only, never a read/source/room permission. */
  readonly candidateReplay7?:'textured7-buildup-v1'|'primary-grain8-buildup-v1'|'source2-buildup-v1'
  /** Pinned by the room/capability adapter, never selected from mutable tools.
   * No default: a caller must explicitly prepare the matching shader pair. */
  readonly rasterProfile: CanonicalExecutorRasterProfile
  /** Trusted verified-descriptor binding, fixed for this executor; not a client grant. */
  readonly autoSource?: CanonicalAutoSource | CanonicalSoftAutoSource
  /** Explicit executable transform domain; absent preserves historical admission. */
  readonly autoGeometryMechanism?:CanonicalAutoGeometryMechanism
  /** Named original two-source context. Geometry-only masked packets do not opt in. */
  readonly sourceMaterial?:Readonly<CanonicalMaterialContextV2>
  readonly maskedSource?:Readonly<CanonicalMaterialContextV2>
  /** Native source root when image roles exist; Auto-only roles need no fake root. */
  readonly sourceLease?:CanonicalMaskSourceLease
  /** Optional caller-owned fixed source, shared across gesture executors. The
   * caller retires it only after every consumer has stopped using that source. */
  readonly softProgramOwner?: CanonicalSoftCircleProgramOwner
  /** Authoritative room page, never viewport. Absent retains the closed infinite-page QA API. */
  readonly pageBounds?: Readonly<WorldRect> | null
  readonly primaryTexture?:Readonly<{readonly context:CanonicalMaterialContextV8|CanonicalMaterialContextV7|CanonicalMaterialContextV6|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5;readonly root:CanonicalMaskSourceLease}>
  readonly bank?: CanonicalMaskSourceReader
  readonly prepass: TransformedMaskPrepass
  readonly composite: CanonicalRgba8CompositePass
  readonly scratch: RibbonScratchPool
  readonly layer: (id: string) => { readonly buffer: TiledLayerBuffer; readonly epoch: number }
  /** Logical engine GPU-fence upper bound, NOT a second physical storage ticket.
   * ContextStorageOwner physical admission is handed through layer/pool plans.
   * Account scratch-pool live AND idle bytes in the engine fence;
   * release removes this reservation, not the pool's actual allocation charge. */
  readonly reserveTransient: (bytes: number) => () => void
  readonly changed: (layerId: string, bounds?: Readonly<WorldRect>) => void
  /** Must synchronously mark unsettled/block checkpoints until trusted rebuild.
   * The executor will never retry a possibly partly-written frame. */
  readonly poison: (layerId: string, reason: unknown) => void
}
interface TilePosition { x: number; y: number; width: number; height: number; writeBounds?: Readonly<WorldRect> }
interface WashTile extends TilePosition {
  original?: AccumulationBuffer
  local: AccumulationBuffer
  lifetime: CanonicalOwnedRgba8Target['lifetime']
}
type PreparedTurnAction = 'paint' | 'presentation' | 'physical'
/** Immutable pending receipt DATA, not target handles or a storage lease. */
export interface CanonicalReplayTargetData {
  readonly x:number;readonly y:number;readonly width:number;readonly height:number
  readonly writeBounds?:Readonly<WorldRect>
}
/** Internal charged admission receipt, never a source/read/profile grant. */
export interface CanonicalReplayAdmissionTicket {
  targets():readonly CanonicalReplayTargetData[]
  assertCurrent():void
  publish():void
  release():void
  cancel():void
}
/** Internal immutable accepted source borrow, NOT a room/source grant.
 * DATA charge belongs to its live frontier executor; retained root alone does
 * not extend metadata lifetime. No private root handle escapes this view. */
export type CanonicalReplaySourceData = Readonly<{materialVersion:2;rasterProfile:CanonicalStrokeRasterProfile;context:CanonicalMaterialContextV2;autoSource?:CanonicalAutoSource|CanonicalSoftAutoSource;autoGeometryMechanism?:CanonicalAutoGeometryMechanism}> | Readonly<{
  materialVersion:7;rasterProfile:CanonicalStrokeRasterProfile;context:CanonicalMaterialContextV7;autoSource:CanonicalAutoSource|CanonicalSoftAutoSource;autoGeometryMechanism?:CanonicalAutoGeometryMechanism
}> | Readonly<{
  materialVersion:8;rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE|typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE;context:CanonicalMaterialContextV8;autoSource?:CanonicalAutoSource|CanonicalSoftAutoSource;autoGeometryMechanism?:CanonicalAutoGeometryMechanism
}>
export type CanonicalReplaySource = CanonicalReplaySourceData & {assertCurrent():void;retainRoot():CanonicalMaskSourceLease|undefined}
export type CanonicalReplaySource7 = Extract<CanonicalReplaySource,{readonly materialVersion:7}>
interface DualTile extends TilePosition {readonly primary:AccumulationBuffer;readonly mask:AccumulationBuffer;readonly lifetime:CanonicalOwnedRgba8Target['lifetime']}
interface Work {
  input: ExecutorFrameSubmission
  textureStrengths?:Uint8Array
  textureColorStrengths?:Float64Array
  result: SourcePrimaryCompositionResult
  sourceKeys: readonly (string | undefined)[]
  draw: number
  tile: number
  paintPart: number
  tiles?: readonly TilePosition[]
  present: number
  part: number
  presentTiles?: readonly WashTile[]
  releaseMetadata: () => void
  frameTargets:readonly TilePosition[]
  newTiles:readonly TilePosition[]
  dualPositions?:readonly TilePosition[]
  dualAcquisition?:RibbonScratchAcquisition
  dualCursor?:number
  dualPartial?:AccumulationBuffer
  dualPartialMask?:AccumulationBuffer
  segment?:number
  segmentTiles?:readonly DualTile[]
  segmentTile?:number
  segmentPart?:number
  physical?:CanonicalLayerFrame
  targetCursor:number
  scratchCursor:number
  washCursor:number
}
const int = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min
const sameContext = (a: SourcePrimaryCompositionContext, b: SourcePrimaryCompositionContext) =>
  a.mode === b.mode && a.alphaDarken === b.alphaDarken && a.outerResourceOpacity === b.outerResourceOpacity && a.outerBlend === b.outerBlend
const key = (t: TilePosition) => `${t.x}:${t.y}`
const rect = (t: TilePosition) => ({ minX: t.x, minY: t.y, maxX: t.x + t.width, maxY: t.y + t.height })

/** Opt-in production layer service, not wired to engine operation transport yet.
 * One ordered cursor; synchronous leases only. Checkpoint readiness is explicit.
 * Caller serializes ALL writes to the gesture's layer, including peer writes. */
/** Opaque material7/8 rendered state only. Normal constructor source authority is still required. */
export interface CanonicalRenderedPrefixCursor7 {release(this:CanonicalRenderedPrefixCursor7):void}
interface RenderedPrefixState {
 readonly context:CanonicalMaterialContextV7|CanonicalMaterialContextV8
 readonly state:SourcePrimaryCompositionState
 readonly gesture:Readonly<{id:string;layerId:string;epoch:number;rgb:readonly [number,number,number];profile:ExecutorFrameSubmission['frame']['profile']}>
 readonly rasterProfile:CanonicalFrameExecutorOptions['rasterProfile']
 readonly gl:WebGLRenderingContext
 readonly prepass:CanonicalFrameExecutorOptions['prepass']
 readonly composite:CanonicalFrameExecutorOptions['composite']
 readonly maskEpoch:object
 readonly compositeEpoch:object
 readonly oldBuffer:TiledLayerBuffer
}
interface RenderedPrefixCharge {readonly cpu:BrushMipCache;data?:RenderedPrefixState;releaseMetadata?:()=>void}
const issuedReplaySourceReads=new WeakMap<CanonicalFrameExecutor,(receiver:CanonicalFrameExecutor)=>CanonicalReplaySource>()
const renderedPrefixStates7=new WeakMap<CanonicalRenderedPrefixCursor7,RenderedPrefixCharge>()
/** Optional checkpoint header precharged BEFORE candidate pixels. No source
 * or rendered-state authority exists until the real executor fills this cell. */
export function prepareRenderedPrefixCursor7(cpu:BrushMipCache):CanonicalRenderedPrefixCursor7 {
  const releaseHeader=cpu.reserve(1024)
  try{
    const charge:RenderedPrefixCharge={cpu}
    let released=false,cursor:CanonicalRenderedPrefixCursor7
    cursor=Object.freeze({release:function(this:CanonicalRenderedPrefixCursor7){
      if(this!==cursor)throw Error('Foreign rendered cursor receiver')
      if(released)return;released=true;renderedPrefixStates7.delete(cursor)
      const metadata=charge.releaseMetadata;charge.releaseMetadata=undefined;charge.data=undefined
      let failed=false,primary:unknown
      for(const action of[metadata,releaseHeader])if(action)try{action()}catch(error){if(!failed){failed=true;primary=error}}
      if(failed)throw primary
    }})
    renderedPrefixStates7.set(cursor,charge);return cursor
  }catch(primary){releaseHeader();throw primary}
}

export class CanonicalFrameExecutor {
  private readonly candidateReceiver=this
  private readonly candidateReplay:boolean
  private candidateTerminal=false
  private readonly options: CanonicalFrameExecutorOptions
  private maskCapacity: Readonly<{width:number;height:number;epoch:object}>
  private maskLease?:CanonicalMaskCapacityLease
  private retireMaskAfterTurn=false
  private retireTextureAfterTurn=false
  private readonly compositeCapacity: Readonly<{width:number;height:number;epoch:object}>
  private readonly gl: WebGLRenderingContext
  private readonly queue: Work[] = []
  private readonly washes = new Map<string, WashTile>()
  private readonly dualTiles=new Map<string,DualTile>()
  private readonly dualAdmitted=new Map<string,TilePosition>()
  private maskSoftProgram?:CanonicalSoftCircleProgramOwner
  private readonly admittedTiles = new Map<string, TilePosition>()
  private readonly admissionReleases = new Set<() => void>()
  private frontierPreparing=false
  private frontierPending?:CanonicalReplayAdmissionTicket
  private frontierGeneration=0
  private readonly frontierReleases=new Set<()=>void>()
  private planned?: SourcePrimaryCompositionState
  private gesture?: { densityStrokeIdentity?: Readonly<SourceDefaultAutoDensityStrokeIdentity>; id: string; layerId: string; epoch: number; buffer: TiledLayerBuffer; rgb: readonly [number, number, number]; profile: ExecutorFrameSubmission['frame']['profile'] }
  private failed = false
  private readonly cleanupErrors: unknown[] = []
  private advancing = false
  private rawComplete = false
  private rawTransferred = false
  private rawOwner = { alive: true, leases: 0 }
  private washLayerId?: string
  private softProgram?: CanonicalSoftCircleProgramOwner
  private replaySourceRead?: (receiver:CanonicalFrameExecutor)=>CanonicalReplaySource
  private readonly ownsSoftProgram:boolean
  private sourceRetired = false
  private tipGradientMetadataRelease?:()=>void
  private tipGradientRoot?:Readonly<{root:CanonicalMaskSourceLease;view:CanonicalTipGradientResource}>
  private roleTextureMetadataRelease?:()=>void
  private roleTextures?:Readonly<{root:CanonicalMaskSourceLease;bindings:Readonly<Partial<Record<'primary'|'mask',Readonly<{pin:CanonicalSourceRoleTexturePin;view:CanonicalPatternResource;gradient?:CanonicalGradientResource}>>>>}>
  private primaryTexture?:Readonly<{context:CanonicalMaterialContextV8|CanonicalMaterialContextV7|CanonicalMaterialContextV6|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5;root:CanonicalMaskSourceLease;view:CanonicalPatternResource;gradient?:CanonicalGradientResource;releaseMetadata:()=>void}>

  constructor(options: CanonicalFrameExecutorOptions) {
    // Peek scalar DATA only: reject unsupported7 density before any capacity or
    // root reservation. Full context/Soft capture stays inside the existing
    // metadata reservation below; this peek never creates a source grant.
    const version7=options.primaryTexture?Object.getOwnPropertyDescriptor(options.primaryTexture.context,'version'):options.sourceMaterial||options.maskedSource?Object.getOwnPropertyDescriptor(options.sourceMaterial??options.maskedSource!,'version'):undefined
    if(version7&&Object.hasOwn(version7,'value')&&version7.value===7)assertStandalone7Density(options.primaryTexture!.context)
    const roleVersion=(role:unknown)=>role==='textured7-buildup-v1'?7:role==='primary-grain8-buildup-v1'?8:role==='source2-buildup-v1'?2:undefined
    if(options.replayFrontier!==undefined&&(!roleVersion(options.replayFrontier)||!version7||!Object.hasOwn(version7,'value')||version7.value!==roleVersion(options.replayFrontier)||options.washMode==='deposition-only'))throw new TypeError('Replay frontier requires its exact material7/8 source')
    if(options.candidateReplay7!==undefined&&(!roleVersion(options.candidateReplay7)
      ||!version7||!Object.hasOwn(version7,'value')||version7.value!==roleVersion(options.candidateReplay7)
      ||options.replayFrontier!==undefined||options.washMode!==undefined))throw new TypeError('Candidate replay requires exclusive matching material7/8 role')
    if(options.autoGeometryMechanism!==undefined&&(options.autoGeometryMechanism!=='dynamic-auto-geometry-v1'||(!options.autoSource&&!options.maskedSource&&!options.sourceMaterial)))throw new TypeError('Auto geometry mechanism requires its trusted source')
    this.candidateReplay=options.candidateReplay7!==undefined
    if(options.softProgramOwner && options.autoSource?.kind!=='softAuto')throw new TypeError('A soft program owner requires a trusted soft source')
    if (options.washMode !== undefined && options.washMode !== 'exclusive' && options.washMode !== 'deposition-only') throw new TypeError('Invalid wash ownership mode')
    const sourceContext=options.sourceMaterial??options.maskedSource
    const roleField=sourceContext&&Object.getOwnPropertyDescriptor(sourceContext,'roleTextures')
    if(roleField){if(!Object.hasOwn(roleField,'value'))throw new TypeError('Role textures must be captured DATA');this.roleTextureMetadataRelease=options.prepass.brushGlBatchInfo().cpu.reserve(65536)}
    try{
    const tipHeader=sourceContext??options.primaryTexture?.context;
    let declaredTipGradient=false;
    for(const key of ['primarySource','maskSource']){const source=tipHeader&&Object.getOwnPropertyDescriptor(tipHeader,key);const m=source&&Object.hasOwn(source,'value')&&source.value&&typeof source.value==='object'?Object.getOwnPropertyDescriptor(source.value,'imageMaterial'):undefined;const kind=m&&Object.hasOwn(m,'value')&&m.value&&typeof m.value==='object'?Object.getOwnPropertyDescriptor(m.value,'kind'):undefined;if(kind&&Object.hasOwn(kind,'value')&&kind.value==='gradient-map-v1')declaredTipGradient=true;}
    if(declaredTipGradient)this.tipGradientMetadataRelease=options.prepass.brushGlBatchInfo().cpu.reserve(65536);
    const material=options.sourceMaterial?canonicalSourceMaterialContext(options.sourceMaterial):options.maskedSource?canonicalMaskedSourceMaterialContext(options.maskedSource):undefined
    const masked=material?.maskSource?canonicalMaskedSourceMaterialContext(material):undefined
    if(material&&options.maskedSource&&!canonicalSoftAutoDataEqual(material,canonicalMaskedSourceMaterialContext(options.maskedSource)))throw new TypeError('Source2 context aliases differ')
    if(material?.primarySource.kind==='image'&&(!options.sourceLease||options.bank!==options.sourceLease))throw new TypeError('Image source2 requires its original bank root')
    if(material&&material.primarySource.kind!=='image'&&!canonicalSoftAutoDataEqual(material.primarySource,options.autoSource))throw new TypeError('Original source2 primary pin mismatch')
    if(masked&&(masked.primarySource.kind==='image'||masked.maskSource.kind==='image')&&(!options.sourceLease||options.bank!==options.sourceLease))throw new TypeError('Masked image roles require their original source root')
    if(masked&&masked.primarySource.kind==='image'&&options.autoSource)throw new TypeError('Masked image primary cannot bind Auto source')
    if(masked&&masked.primarySource.kind!=='image'&&!canonicalSoftAutoDataEqual(masked.primarySource,options.autoSource))throw new TypeError('Masked original primary pin mismatch')
    if(masked&&(!masked.maskSource||!CANONICAL_DUAL_MASKING_MODES.some(m=>m===masked.maskingBlend)||options.primaryTexture||options.sourceLease&&options.bank!==options.sourceLease||options.replayFrontier!==undefined&&options.replayFrontier!=='source2-buildup-v1'||options.candidateReplay7!==undefined&&options.candidateReplay7!=='source2-buildup-v1'))throw new TypeError('Unsupported masked source binding')
    if(masked&&(masked.primarySource.kind==='image'||masked.maskSource?.kind==='image')&&!masked.imageFrameIndices)throw new TypeError('Dual image sources require recorded role/frame indices')
    if(material&&options.primaryTexture)throw new TypeError('Source2 cannot bind a texture7/8 context')
    const operations = canonicalExecutorOperations(options.rasterProfile,{masked:!!masked})
    if (!options.composite.supportsOperations(operations)) throw new Error('Canonical executor raster profile was not prepared')
    const a = options.prepass.brushGlBatchInfo(), b = options.composite.brushGlBatchInfo()
    if (a.gl !== b.gl || a.cache !== b.cache || a.cpu !== b.cpu) throw new Error('Canonical executor services must share budgets and context')
    if(options.softProgramOwner && !options.softProgramOwner.sharesCpuOwner(a.cpu))throw new Error('Canonical soft program must share the CPU owner')
    planCanonicalTargets({minX:0,minY:0,maxX:0,maxY:0},options.pageBounds ?? null,1,1)

    let captured8:CanonicalMaterialContextV8|undefined,earlyRelease8:(()=>void)|undefined
    if(version7&&Object.hasOwn(version7,'value')&&version7.value===8){
      if((options.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE&&options.rasterProfile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)||options.bank!==options.primaryTexture!.root)throw new TypeError('Standalone image8 requires GenericSC source')
      earlyRelease8=a.cpu.reserve(28672+(options.replayFrontier?512:0))
      try{captured8=canonicalPrimaryGrainMaterialContext(options.primaryTexture!.context);if(options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE&&captured8.primaryTexture.law==='hard-multiply-u8-native-v1')throw new TypeError('Native hard grain requires installed raster profile');if(!options.composite.supportsPrimaryGrainPrograms([{operation:options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'overBrowserFloat':'over32FusedScalar',law:captured8.primaryTexture.law}]))throw new Error('Canonical grain OVER was not prepared')}
      catch(primary){try{earlyRelease8()}catch{/* Preserve source capture failure. */}throw primary}
    }
    try{
    this.maskCapacity=options.prepass.preparedCapacity();
    this.compositeCapacity=options.composite.preparedCapacity();
    this.options = Object.freeze({ ...options, pageBounds: options.pageBounds ? Object.freeze({...options.pageBounds}) : null, sourceMaterial:material,maskedSource:masked, autoSource: options.autoSource ? (options.autoSource.kind === 'defaultAuto' ? canonicalDefaultAutoSourcePin(options.autoSource) : options.autoSource.kind === 'gaussianAuto' ? canonicalGaussianAutoSourcePin(options.autoSource) : canonicalSoftAutoSourcePin(options.autoSource)) : undefined })
    this.gl = a.gl
    this.ownsSoftProgram=!options.softProgramOwner
    this.acquireMaskCapacity()
    try{
    if(options.primaryTexture){
      if((options.softProgramOwner&&!captured8)||options.bank!==options.primaryTexture.root)throw new TypeError('Texture source requires the same root owner')
      const textureOperation=options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'alphaDarkenBrowserFloat':'alphaDarken32FusedScalar'
      if(!captured8&&!options.composite.supportsTexturedOperations([textureOperation]))throw new Error('Canonical texture variant was not prepared')
      // Extra bounded view/three closures are charged BEFORE their allocation.
      const releaseMetadata=earlyRelease8??a.cpu.reserve(4096+(options.replayFrontier?512:0));earlyRelease8=undefined
      let child:CanonicalMaskSourceLease|undefined
      try{
        const context=captured8??captureTextureContext(options.primaryTexture.context)
        if(context.primarySource.kind==='image'){
          if((options.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE&&(options.rasterProfile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE||context.version!==8||context.primaryTexture.law==='hard-multiply-u8-native-v1'))||options.autoSource)throw new TypeError('Image texture requires its matching GenericSC source')
        }else{
          if((options.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE&&options.rasterProfile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)
            ||this.options.autoSource?.kind!==(context.version===7||context.version===8?context.primarySource.kind:context.version===6?'softAuto':'defaultAuto')||canonicalBrushDescriptorJSON(this.options.autoSource)!==canonicalBrushDescriptorJSON(context.primarySource)
            ||!canonicalStrokeCoverageMatches(options.rasterProfile,context.primarySource.coverageProfile))throw new TypeError('Material4 source/profile binding mismatch')
        }
        const patternAsset=context.version===8&&context.primaryTexture.law!=='hard-multiply-u8-native-v1'?canonicalPixelTextureAsset(context.primaryTexture,context.assets):context.assets.find(asset=>asset.id===context.primaryTexture.asset);if(!patternAsset)throw new TypeError('Canonical pattern asset missing')
        const sourceView=options.primaryTexture.root.patternResource(context.primaryTexture,patternAsset,a)
        assertCanonicalPatternResourceCurrent(sourceView,a,options.primaryTexture.root)
        child=options.primaryTexture.root.retain()
        const view=child.patternResource(context.primaryTexture,patternAsset,a)
        assertCanonicalPatternResourceCurrent(view,a,child)
        if(view.width>4096||(view.width&(view.width-1))!==0)throw new TypeError('Canonical texture requires POT storage')
        const resources=child.preparedResources()
        if(context.primarySource.kind==='image'){
          const pin=context.primarySource
          const tip=context.version===8&&context.imageFrameIndices?canonicalImageFrameAsset(pin,context.assets,0):canonicalImageMaterialPin({kind:'image',asset:pin.asset,brushScale:pin.brushScale,brushAngle:pin.brushAngle},[context.assets[0]]).assets[0]
          const indexes=[...new Set(resources.filter(r=>r.canonical&&JSON.stringify(r.canonical.asset)===JSON.stringify(tip)).map(r=>r.canonical!.index))]
          if(!indexes.length)throw new Error('Canonical texture root has no primary tip')
          child.assertRequiredSourceBinding(tip,indexes,a)
        }
        if(!b.resources.some(r=>r.key===view.key&&r.bytes===view.width*view.height*4)||resources.some(r=>!a.resources.some(p=>p.key===r.key&&p.bytes===r.bytes)))throw new Error('Canonical texture root group was not prepared')
        const gradient=context.version===8&&context.primaryTexture.law==='pixel-color-texture-v1'&&context.primaryTexture.mode==='gradient'?child.textureGradientResource(context.primaryTexture,a):undefined
        if(gradient)assertCanonicalPatternResourceCurrent(gradient,a,child)
        this.primaryTexture=Object.freeze({context,root:child,view,gradient,releaseMetadata});child=undefined
        this.options=Object.freeze({...this.options,bank:this.primaryTexture.root,primaryTexture:undefined})
        this.assertPrepared()
      }catch(error){if(!this.primaryTexture){try{child?.release()}catch{/* Preserve source admission failure. */}try{releaseMetadata()}catch{/* Preserve source admission failure. */}}throw error}
    }
    if(material?.roleTextures){
      if(!options.sourceLease||options.bank!==options.sourceLease)throw new TypeError('Role textures require the original source2 bank root')
      const child=options.sourceLease.retain()
      try{
        const bindings:Partial<Record<'primary'|'mask',Readonly<{pin:CanonicalSourceRoleTexturePin;view:CanonicalPatternResource;gradient?:CanonicalGradientResource}>>>={}
        for(const role of ['primary','mask']as const){const pin=material.roleTextures[role];if(!pin)continue
          const asset=canonicalPixelTextureAsset(pin,material.assets)
          const view=child.patternResource(pin,asset,a),gradient=pin.law==='pixel-color-texture-v1'&&pin.mode==='gradient'?child.textureGradientResource(pin,a):undefined
          assertCanonicalPatternResourceCurrent(view,a,child);if(gradient)assertCanonicalPatternResourceCurrent(gradient,a,child)
          if(!options.composite.supportsPrimaryGrainPrograms([{operation:options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'overBrowserFloat':'over32FusedScalar',law:pin.law}]))throw new Error('Role texture program was not prepared')
          if(!b.resources.some(r=>r.key===view.key&&r.bytes===view.width*view.height*4)||gradient&&!b.resources.some(r=>r.key===gradient.key&&r.bytes===1024))throw new Error('Role texture group not prepared')
          bindings[role]=Object.freeze({pin,view,gradient})
        }
        if(child.preparedResources().some(r=>!a.resources.some(p=>p.key===r.key&&p.bytes===r.bytes)))throw new Error('Role texture original union changed')
        this.roleTextures=Object.freeze({root:child,bindings:Object.freeze(bindings)})
      }catch(primary){try{child.release()}catch{}throw primary}
    }
    const tipContext=material??(this.primaryTexture?.context.version===8?this.primaryTexture.context:undefined);
    if(tipContext){
      const sources=tipContext.version===2?[tipContext.primarySource,tipContext.maskSource]:[tipContext.primarySource];
      for(const [slot,source]of sources.entries())if(source?.kind==='image'&&source.imageMaterial?.kind==='gradient-map-v1'){
        const provider=slot===1?tipContext.sourceColorFields?.mask:tipContext.sourceColorFields?.primary;
        if((source.imageMaterial.application==='spatial-mask')!==!!provider)throw new TypeError('Original gradient tip source provider differs');
      }
      const needed=sources.some(s=>s?.kind==='image'&&s.imageMaterial?.kind==='gradient-map-v1'&&s.imageMaterial.application==='plain-gradient');
      if(needed){
        if(!this.maskParticipant.supportsTipGradient())throw new Error('Tip gradient program was not prepared');
        const gradient=canonicalSourceMaterialTipGradient(tipContext),parent=options.sourceLease??options.primaryTexture?.root;
        if(!gradient||!parent)throw new TypeError('Tip gradient original root required');
        const root=parent.retain();try{const view=root.tipGradientResource(gradient,a);assertCanonicalPatternResourceCurrent(view,a,root);this.tipGradientRoot=Object.freeze({root,view})}catch(primary){try{root.release()}catch{}throw primary}
      }
    }
    const source=this.options.autoSource
    if(source?.kind==='softAuto') {
      if(source.sourceSlot!==0)throw new TypeError('Canonical executor requires a primary soft source')
      const s=source.source
      this.softProgram=options.softProgramOwner??new CanonicalSoftCircleProgramOwner(a.cpu,
        {kind:'auto',generator:'soft',shape:s.shape,diameter:s.diameter,ratio:s.ratio,horizontalFade:s.horizontalFade,verticalFade:s.verticalFade,
          spikes:s.spikes,softness:1,randomness:0,density:1,antialias:s.antialias},
        {points:source.radialCurve.source.points,coefficients:source.radialCurve.coefficients},Math.floor(source.source.diameter*4+.5)+(s.shape==='rect'?1:2),source.compilerProfile==='eigen-5.0.1-source-functional-f64-v1'?'source-functional-fused-f64-v1':'installed-arm64-fused-v1')
    }
    if(masked?.maskSource?.kind==='softAuto'){
      const pin=masked.maskSource,t=pin.source
      this.maskSoftProgram=new CanonicalSoftCircleProgramOwner(a.cpu,{kind:'auto',generator:'soft',shape:t.shape,diameter:t.diameter,ratio:t.ratio,horizontalFade:t.horizontalFade,verticalFade:t.verticalFade,spikes:t.spikes,softness:1,randomness:0,density:1,antialias:t.antialias},{points:pin.radialCurve.source.points,coefficients:pin.radialCurve.coefficients},Math.floor(t.diameter*4+.5)+(t.shape==='rect'?1:2),pin.compilerProfile==='eigen-5.0.1-source-functional-f64-v1'?'source-functional-fused-f64-v1':'installed-arm64-fused-v1')
    }
    if(options.replayFrontier)this.initializeReplaySource()
    }catch(error){this.cleanup(()=>this.maskSoftProgram?.retire());if(options.replayFrontier)this.retireSoftProgram();this.retirePrimaryTexture();this.retireMaskCapacity();throw error}
    }catch(primary){if(earlyRelease8)try{earlyRelease8()}catch{/* Preserve constructor failure. */}throw primary}
    }catch(primary){this.retireRoleTextures();throw primary}
  }

  /** Accepted constructor capture only; never re-read an options.source bag. */
  replaySource():CanonicalReplaySource {
    const read=issuedReplaySourceReads.get(this)
    if(!read)throw new Error('Foreign or retired replay source unavailable')
    return read(this)
  }
  replaySource7():CanonicalReplaySource7 {
    const source=CanonicalFrameExecutor.prototype.replaySource.call(this)
    if(source.materialVersion!==7)throw new Error('Material7 replay source required')
    return source
  }
  private initializeReplaySource():void {
    const texture=this.primaryTexture,autoSource=this.options.autoSource,material=this.options.sourceMaterial
    if(!this.options.replayFrontier||(!material&&(!texture||(texture.context.version!==7&&texture.context.version!==8)
      ||texture.context.version===7&&!autoSource)))throw new Error('Accepted replay source requires exact frontier7/8')
    // Radial constructor/reservation callbacks may have invalidated preparation.
    this.assertPrepared()
    const executor=this,context=material??texture!.context,rasterProfile=this.options.rasterProfile,generation=this.frontierGeneration
    if(rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE&&rasterProfile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)throw new Error('Accepted replay raster profile unavailable')
    let checking=false
    const pure=()=>{if(executor.failed||executor.sourceRetired||executor.advancing||executor.frontierPreparing||executor.frontierGeneration!==generation||executor.primaryTexture!==texture||executor.replaySourceRead!==read)throw new Error('Accepted replay source retired or busy')}
    const enter=()=>{if(checking)throw new Error('Accepted replay source reentered');pure();checking=true}
    const check=()=>{executor.assertPrepared();pure()}
    let data:CanonicalReplaySourceData
    if(context.version===2){data={materialVersion:2,rasterProfile,context,autoSource,autoGeometryMechanism:this.options.autoGeometryMechanism}}
    else if(context.version===8){
      if(context.primaryTexture.law==='hard-multiply-u8-native-v1'&&rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)throw new Error('Native hard grain replay requires installed raster profile')
      data={materialVersion:8,rasterProfile,context,autoSource,autoGeometryMechanism:this.options.autoGeometryMechanism}
    }else if(context.version===7){
      if(!autoSource)throw new Error('Material7 replay source missing')
      data={materialVersion:7,rasterProfile,context,autoSource,autoGeometryMechanism:this.options.autoGeometryMechanism}
    }else throw new TypeError('Unsupported captured replay source')
    const view:CanonicalReplaySource=Object.freeze({...data,
      assertCurrent(){if(this!==view)throw new Error('Foreign replay source receiver');enter();try{check()}finally{checking=false}},
      retainRoot(){
        if(this!==view)throw new Error('Foreign replay source receiver')
        enter();let child:CanonicalMaskSourceLease|undefined
        try{check();child=(texture?.root??executor.options.sourceLease)?.retain();check();const accepted=child;child=undefined;return accepted}
        catch(primary){
          if(child)try{child.release(executor.cleanupContextLost())}catch(cleanup){executor.cleanupErrors.push(cleanup);executor.failed=true;executor.cleanup(()=>executor.fail(cleanup,executor.cleanupContextLost()))}
          throw primary
        }finally{checking=false}
      },
    })
    const read=(receiver:CanonicalFrameExecutor)=>{if(receiver!==executor)throw new Error('Foreign replay source executor');enter();try{check();return view}finally{checking=false}}
    this.replaySourceRead=read
    issuedReplaySourceReads.set(this,read)
  }

  private get maskParticipant():CanonicalMaskCapacityLease {
    if(!this.maskLease)throw new Error('Canonical mask capacity is not retained')
    return this.maskLease
  }
  private acquireMaskCapacity():void {
    if(this.maskLease)return
    const lease=this.options.prepass.retainPreparedCapacity()
    try{this.maskCapacity=lease.preparedCapacity();this.maskLease=lease}
    catch(error){try{lease.release()}catch{/* Preserve capture error. */}throw error}
  }
  private retireMaskCapacity():void {
    const lease=this.maskLease;this.maskLease=undefined;this.retireMaskAfterTurn=false
    if(!lease)return
    const advancing=this.advancing;this.advancing=true
    try{this.cleanup(()=>lease.releaseOwner(this));this.cleanup(()=>lease.release())}
    finally{this.advancing=advancing}
  }

  get pending(): boolean { return this.queue.length !== 0 }
  get checkpointReady(): boolean { return !this.candidateReplay && !this.options.replayFrontier && !this.failed && !this.pending && !this.gesture && (!this.rawComplete || this.rawTransferred) }
  get pendingFrameCount(): number { return this.queue.length }
  get replayReservationCount():number {return this.frontierReleases.size}
  /** The existing physical ticket can own unmaterialized layer targets across
   * turns. Its owner must finish that preparation before another layer writer. */
  get hasPendingLayerTargetPreparation():boolean {
    const work=this.queue[0]
    return !!work?.physical&&work.targetCursor<work.physical.targetCount
  }
  get rawWashSealed(): boolean { return this.options.washMode === 'deposition-only' && this.rawComplete && !this.rawTransferred && !this.failed }
  get poisoned(): boolean { return this.failed }
  /** Additional cleanup/notification errors never replace a primary draw error. */
  get cleanupFailures(): readonly unknown[] { return Object.freeze([...this.cleanupErrors]) }

  /** Metadata admission before GPU target reservations, allocation or pixels.
   * V3 first holds bounded CPU capture workspace before shared validation.
   * At most eight accepted frames are retained. Inputs are copied, so later
   * caller mutation cannot relabel a queued definition, pigment or opacity. */
  enqueue(input:CanonicalFrameSubmission):void
  enqueue(input:CanonicalFrameSubmissionV3):void
  enqueue(input:CanonicalFrameSubmissionV8):void
  enqueue(input:CanonicalFrameSubmissionV7):void
  enqueue(input:CanonicalFrameSubmissionV6):void
  enqueue(input:CanonicalFrameSubmissionV5):void
  enqueue(input:CanonicalFrameSubmissionV4):void
  enqueue(input:ExecutorFrameSubmission):void {
    if(this.options.replayFrontier)throw new Error('Replay frontier cannot enqueue executable work')
    this.submit(input)
  }
  /** Same source/capture/planning path, persistent prefix, no executable Work queue. */
  prepareReplayFrontier(input:CanonicalFrameSubmission|CanonicalFrameSubmissionV7|CanonicalFrameSubmissionV8):CanonicalReplayAdmissionTicket {
    const expected=this.options.sourceMaterial?CANONICAL_SOURCE_MATERIAL_PROFILE:this.primaryTexture?.context.version===8?CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE:CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE
    if(!this.options.replayFrontier||input?.frame?.profile!==expected||input.composition?.mode!=='buildup')throw new TypeError('Closed matching material7/8 replay frontier required')
    if(this.frontierPreparing||this.frontierPending||this.frontierReleases.size>=8)throw new Error('Replay admission already pending or full')
    this.frontierPreparing=true
    try{const ticket=this.submit(input,true);if(!ticket||this.frontierPending!==ticket||this.failed||this.sourceRetired){if(ticket)this.cleanup(()=>ticket.cancel());throw new Error('Replay admission retired during capture')}return ticket}
    finally{this.frontierPreparing=false}
  }
  private submit(input:ExecutorFrameSubmission,frontier=false):CanonicalReplayAdmissionTicket|undefined {
    if(this.candidateReplay&&(this.candidateTerminal||input?.frame?.profile!==(this.options.sourceMaterial?CANONICAL_SOURCE_MATERIAL_PROFILE:this.primaryTexture?.context.version===8?CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE:CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE)
      ||input.composition?.mode!=='buildup'))throw new TypeError('Candidate replay requires live material7 buildup cursor')
    if(!textureProfile(input?.frame?.profile)){
      if(this.primaryTexture)throw new TypeError('Texture executor requires its selected material profile')
      return this.enqueueCaptured(input,frontier)
    }
    if(this.failed||this.sourceRetired||this.advancing||this.rawOwner.leases)throw new Error('Canonical executor is poisoned or busy')
    if(this.queue.length>=8)throw new RangeError('Canonical frame queue is full')
    const source=this.primaryTexture
    if(!source)throw new TypeError('Canonical material3 requires a texture root')
    const textureOuterLaw=source.context.version===8?source.context.outerCompositionLaw:undefined
    if(textureOuterLaw!==canonicalPixelSourceOuterCompositionLaw(input.composition))throw new TypeError('Texture outer composition law differs');
    const textureRasterProfile=this.options.rasterProfile
    if(textureRasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE&&textureRasterProfile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)throw new TypeError('Unsupported canonical texture raster profile')
    if(Object.hasOwn(input,'densityStrokeIdentity')||!isCanonicalStrokeComposition(input.composition,textureRasterProfile,canonicalStrokeCompositionExtensions(textureOuterLaw))||!Array.isArray(input.rgb)||input.rgb.length!==3)throw new TypeError('Unsupported canonical texture composition')
    if(source.context.version===8&&source.context.primaryTexture.law==='hard-multiply-u8-native-v1'&&(textureRasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||input.composition.mode!=='buildup'||input.composition.outerBlend!=='over'))throw new TypeError('Standalone image8 requires buildup OVER')
    if(input.composition.mode==='buildup'){
      if(this.options.washMode==='deposition-only')throw new TypeError('Deposition-only requires wash')
      const operation=canonicalWashOuterOperation(textureRasterProfile,input.composition.outerBlend,1).kind
      if(operation!=='overBrowserFloat'&&operation!=='over32FusedScalar'&&operation!=='erase32FusedScalar'&&operation!=='genericSCU8'&&operation!=='colorHsyBrowser')throw new TypeError('Unsupported direct texture operation')
      if(source.context.version===8?!this.options.composite.supportsPrimaryGrainPrograms([{operation,law:source.context.primaryTexture.law}]):!this.options.composite.supportsTexturedOperations([textureRasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'overBrowserFloat':'over32FusedScalar']))throw new TypeError('Canonical texture direct variant was not prepared')
    }
    const identity={gestureId:input.gestureId,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal}
    const rgb=Object.freeze([input.rgb[0],input.rgb[1],input.rgb[2]]as [number,number,number]),composition=Object.freeze({...input.composition})
    const info=this.options.prepass.brushGlBatchInfo(),release=info.cpu.reserve(textureFrameCaptureBytes(input.frame))
    let admission:CanonicalReplayAdmissionTicket|undefined
    let failed=false,failure:unknown
    try{
      assertCanonicalPatternResourceCurrent(source.view,info,source.root)
      if(source.gradient){assertCanonicalPatternResourceCurrent(source.gradient,info,source.root);if(!info.resources.some(r=>r.key===source.gradient!.key&&r.bytes===1024))throw new Error('Canonical gradient group changed')}
      const context=captureTextureContext({...source.context,assets:input.assets})
      if(JSON.stringify(context.assets)!==JSON.stringify(source.context.assets))throw new TypeError('Canonical texture frame assets changed')
      if(input.frame.profile!==(source.context.version===8?CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE:source.context.version===7?CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE:source.context.version===6?CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE:source.context.version===5?CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE:source.context.version===4?CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE:CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE))throw new TypeError('Texture frame/context version mismatch')
      if(source.context.version===8){
        const frame=captureCanonicalPrimaryGrainFrame(input.frame,source.context)
        admission=this.enqueueCaptured({...identity,rgb,composition,assets:source.context.assets,frame},frontier)
      }else if(source.context.version===7){
        const frame=captureCanonicalTexturedAutoFrame(input.frame,source.context)
        admission=this.enqueueCaptured({...identity,rgb,composition,assets:source.context.assets,frame},frontier)
      }else if(source.context.version===6){
        const frame=captureCanonicalSoftNativeDefaultTexturedSourceFrame(input.frame,source.context)
        this.enqueueCaptured({...identity,rgb,composition,assets:source.context.assets,frame})
      }else if(source.context.version===5){
        const frame=captureCanonicalPressureTexturedSourceFrame(input.frame,source.context)
        this.enqueueCaptured({...identity,rgb,composition,assets:source.context.assets,frame})
      }else if(source.context.version===4){
        const frame=captureCanonicalTexturedSourceFrame(input.frame,source.context)
        this.enqueueCaptured({...identity,rgb,composition,assets:source.context.assets,frame})
      }else{
        const frame=captureCanonicalPrimaryTextureFrame(input.frame,source.context)
        this.enqueueCaptured({...identity,rgb,composition,assets:source.context.assets,frame})
      }
    }catch(error){failed=true;failure=error}
    try{release()}catch(error){
      if(failed)this.cleanupErrors.push(error)
      else{this.cleanup(()=>admission?.cancel());if(!this.failed)this.fail(error,this.cleanupContextLost());throw error}
    }
    if(failed){this.cleanup(()=>admission?.cancel());throw failure}
    return admission
  }

  private enqueueCaptured(input:ExecutorFrameSubmission,frontier=false):CanonicalReplayAdmissionTicket|undefined {
    const previousPlanned=this.planned,previousGesture=this.gesture,generation=this.frontierGeneration
    if(textureProfile(input?.frame?.profile)!==!!this.primaryTexture)throw new TypeError('Canonical texture source/frame mismatch')
    if (this.failed || this.sourceRetired || this.advancing || this.rawOwner.leases) throw new Error('Canonical executor is poisoned or busy')
    if (this.rawComplete) throw new Error('Canonical deposition gesture has ended')
    if (this.options.washMode === 'deposition-only' && input?.composition?.mode !== 'wash') throw new TypeError('Deposition-only requires wash')
    const outerContext=this.options.sourceMaterial??this.options.maskedSource??(this.primaryTexture?.context.version===8?this.primaryTexture.context:undefined)
    const outerLaw=outerContext?.outerCompositionLaw
    if(outerLaw!==canonicalPixelSourceOuterCompositionLaw(input?.composition))throw new TypeError('Canonical outer composition law differs')
    if(input?.composition?.outerBlend==='colorHsyBrowser'&&!this.options.composite.supportsOperations(['colorHsyBrowser']))throw new TypeError('Browser HSY program was not prepared')
    if (!isCanonicalStrokeComposition(input?.composition, this.options.rasterProfile === 'reference-scalar-f32-rne-v1' ? CANONICAL_STROKE_RASTER_PROFILE : this.options.rasterProfile,canonicalStrokeCompositionExtensions(outerLaw))) throw new TypeError('Invalid canonical composition for pinned raster profile')
    if(input.composition.outerBlend==='erase'&&!this.options.composite.supportsOperations(['erase32FusedScalar']))throw new TypeError('Canonical eraser program was not prepared')
    if(input.composition.mode==='buildup'&&input.composition.outerBlend!=='over'&&!this.options.composite.supportsOperations([canonicalWashOuterOperation(this.options.rasterProfile,input.composition.outerBlend,1).kind]))throw new TypeError('Canonical direct blend program was not prepared')
    if (this.queue.length >= 8) throw new RangeError('Canonical frame queue is full')
    if (![CANONICAL_MATERIAL_PROFILE, CANONICAL_SOURCE_MATERIAL_PROFILE,CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE,CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE,CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE,CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE,CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE,CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE].includes(input?.frame?.profile)) throw new TypeError('Canonical executor requires accepted material profile')
    if (!input || !input.gestureId || !input.layerId || !int(input.layerEpoch) || !int(input.ordinal)
      || !Array.isArray(input.rgb) || input.rgb.length !== 3 || !input.rgb.every(n => int(n) && n <= 255)) throw new TypeError('Invalid canonical frame identity/pigment')
    if (!this.options.maskedSource&&input.frame.definitions.some(r => 'kind' in r && r.kind === 'softAuto') && this.options.autoSource?.kind !== 'softAuto') throw new TypeError('Soft source data requires a trusted canonical executor raster grant')
    if (!this.options.maskedSource&&input.frame.definitions.some(r => 'kind' in r && r.kind === 'gaussianAuto') && this.options.autoSource?.kind !== 'gaussianAuto') throw new TypeError('Gaussian source data requires a trusted canonical executor raster grant')
    const seeded=this.options.autoSource?.kind==='defaultAuto' && this.options.autoSource.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
    const identityProperty=Object.getOwnPropertyDescriptor(input,'densityStrokeIdentity')
    const densityStrokeIdentity=seeded ? captureSourceDefaultAutoDensityStrokeIdentity(identityProperty && Object.hasOwn(identityProperty,'value') ? identityProperty.value : undefined) : undefined
    if(this.gesture && this.gesture.densityStrokeIdentity?.strokeId!==densityStrokeIdentity?.strokeId)throw new TypeError('Density stroke identity changed')
    this.acquireMaskCapacity()
    this.assertPrepared();
    const { buffer, epoch } = this.options.layer(input.layerId)
    if (epoch !== input.layerEpoch || buffer.tileWidth > 4096 || buffer.tileHeight > 4096 || buffer.pixelEncoding !== 'straight-rgba8') throw new Error('Stale or non-straight canonical layer')
    if (!this.maskParticipant.isReady() || !this.options.composite.isReady()) throw new Error('Canonical services are not prepared')
    if (this.gesture && (this.gesture.profile !== input.frame.profile || this.gesture.id !== input.gestureId || this.gesture.layerId !== input.layerId || this.gesture.epoch !== input.layerEpoch
      || this.gesture.rgb.some((n, i) => n !== input.rgb[i]) || !sameContext(this.planned!.context, input.composition))) throw new Error('Canonical gesture interleaving or context change')
    if (!input.frame || input.frame.draws.length > 800 || input.frame.definitions.length > 800 || input.frame.fences.length > 2404 || input.assets.length > 512) throw new RangeError('Canonical frame exceeds decoder limits')
    const initial = this.planned ?? createSourcePrimaryComposition(input.composition).state
    const result = advanceSourcePrimaryComposition(initial, { ordinal: input.ordinal, frame: input.frame,masked:!!this.options.maskedSource })
    const hasImageDefinitions = input.frame.definitions.some(r => !autoRecipe(r))
    // A paired SOURCE2 chunk may contain only the Auto mask while retaining
    // the captured primary image inventory. Its bank and assets stay validated
    // across chunks, including chunks with no image definitions of their own.
    const capturedImage = this.options.maskedSource?.primarySource.kind === 'image'
      || this.options.maskedSource?.maskSource?.kind === 'image'
      || this.options.sourceMaterial?.primarySource.kind === 'image'
    const hasImage = capturedImage || hasImageDefinitions || input.frame.profile === CANONICAL_MATERIAL_PROFILE || (!input.frame.definitions.length && !this.options.autoSource)
    if (hasImage && !this.options.bank?.isReady()) throw new Error('Canonical image bank is not prepared')
    if (!hasImage&&!this.primaryTexture) {
      if(this.roleTextures){
        const original=this.options.sourceMaterial
        if(!original?.roleTextures||!this.roleTextures.bindings.primary&&!this.roleTextures.bindings.mask
          ||!canonicalSoftAutoDataEqual(input.assets,original.assets))throw new TypeError('Auto-only frame must not supply image assets')
        if(!this.roleTextures.root.isReady())throw new Error('Canonical role texture bank is not prepared')
      }else if(input.assets.length)throw new TypeError('Auto-only frame must not supply image assets')
    }
    const prepared = hasImage ? this.options.bank!.preparedResources() : []
    const indexedImages=this.options.sourceMaterial?.imageFrameIndices==='source-image-pipe-frame-v1'||this.primaryTexture?.context.version===8&&this.primaryTexture.context.imageFrameIndices==='source-image-pipe-frame-v1'
    const definitionSources=input.frame.definitions.map((recipe,index)=>{
      const roles=new Set(input.frame.draws.filter(d=>d.definition===index).map(d=>d.role))
      const slot='sourceSlot'in recipe?recipe.sourceSlot:undefined
      if((indexedImages&&!autoRecipe(recipe)&&slot===undefined)||slot!==undefined&&(slot!==0&&slot!==1||roles.size!==1||!roles.has(slot===1?'mask':'primary')))throw new TypeError('Recorded definition source role changed')
      const pin=(slot!==undefined?slot===1:roles.has('mask'))?this.options.maskedSource?.maskSource:this.options.sourceMaterial?.primarySource??(this.primaryTexture?.context.version===8?this.primaryTexture.context.primarySource:this.options.autoSource)
      if(roles.size>1&&this.options.maskedSource&&!canonicalSoftAutoDataEqual(this.options.maskedSource.primarySource,this.options.maskedSource.maskSource))throw new TypeError('Masked definition cannot change original source roles')
      return pin
    })
    const sourceKeys = input.frame.definitions.map((recipe,index) => {
      const original=definitionSources[index],trusted=original?.kind!=='image'?original:undefined
      if (recipe.width > this.maskCapacity.width || recipe.height > this.maskCapacity.height) throw new RangeError('Canonical material exceeds prepared capacity')
      if(this.options.autoGeometryMechanism&&autoRecipe(recipe)){
        if(!trusted)throw new TypeError('Auto geometry source is not trusted')
        assertCanonicalAutoRecipeCapacity(recipe,trusted,{width:this.maskCapacity.width,height:this.maskCapacity.height,slots:1},this.options.autoGeometryMechanism,this.coverageScaleFactor(trusted))
      }
      if ('kind' in recipe && recipe.kind === 'softAuto') {
        if(trusted?.kind!=='softAuto')throw new TypeError('Canonical soft source is not trusted')
        canonicalSoftAutoCost(recipe,trusted,this.coverageScaleFactor(trusted))
        return undefined
      }
      if ('kind' in recipe && (recipe.kind === 'defaultAuto' || recipe.kind === 'gaussianAuto')) {
        if (!trusted || trusted.kind==='softAuto') throw new TypeError('Canonical auto source is not trusted')
        canonicalAutoCost(recipe, trusted,this.coverageScaleFactor(trusted))
        return undefined
      }
      const recordedFrameIndex='imageFrameIndex'in recipe?recipe.imageFrameIndex:undefined
      const inventoryAsset=input.assets.find(a=>a.id===recipe.asset)
      if(!inventoryAsset)throw new Error('Canonical frame asset is not pinned')
      const asset=indexedImages&&original?.kind==='image'&&recordedFrameIndex!==undefined?canonicalImageFrameAsset(original,input.assets,recordedFrameIndex):inventoryAsset
      const m = canonicalTransformedMaskMetadata(recipe, asset)
      if (recipe.width > this.maskCapacity.width || recipe.height > this.maskCapacity.height) throw new RangeError('Canonical material exceeds prepared capacity')
      const material=original?.kind==='image'?original.imageMaterial:undefined
      const frameIndex='imageFrameIndex'in recipe?recipe.imageFrameIndex:undefined
      let expectedChannels:readonly string[]|undefined
      if(material){
        if(frameIndex!==undefined){
          if(typeof frameIndex!=='number'||!Number.isInteger(frameIndex)||frameIndex<0||frameIndex>255||original?.kind!=='image'||(original.frames??[original.asset])[frameIndex]!==recipe.asset)throw new TypeError('Paired material frame index changed')
          expectedChannels=material.kind!=='color-stamp-v1'?material.grayFrames?.[frameIndex]?[material.grayFrames[frameIndex]]:(frameIndex===0&&(original.frames?.length??1)===1?[material.grayAsset]:undefined):material.frames?.[frameIndex]??(frameIndex===0&&(original.frames?.length??1)===1?material.channels:undefined)
          if(!expectedChannels)throw new TypeError('Paired material frame planes missing')
        }else expectedChannels=material.kind!=='color-stamp-v1'?[material.grayAsset]:material.channels
      }
      const sourceSlot='sourceSlot'in recipe?recipe.sourceSlot:undefined
      const source = prepared.find(p => !!p.canonical&&(!indexedImages||p.canonical.sourceSlot===sourceSlot&&p.canonical.frameIndex===frameIndex)&&(material?!!p.canonical?.imageMaterial&&p.canonical.imageMaterial.kind===material.kind&&p.canonical.imageMaterial.frameIndex===frameIndex&&canonicalSoftAutoDataEqual(p.canonical.imageMaterial.channels.map(c=>c.id),expectedChannels):!p.canonical?.imageMaterial)&&p.canonical?.asset.id === asset.id && p.canonical.index === m.index
        && p.canonical.asset.size === asset.size && p.canonical.asset.x === asset.x && p.canonical.asset.y === asset.y
        && p.canonical.asset.width === asset.width && p.canonical.asset.height === asset.height)
      if (!source) throw new Error('Canonical frame source level is not prepared')
      return source.key
    })
    for(const d of result.draws){
      const original=definitionSources[d.definition]
      if(this.primaryTexture?.context.version===8||original?.kind==='image'&&original.imageMaterial&&original.imageMaterial.kind!=='gradient-map-v1'){
        const kind:CanonicalCompositeOperationKind=d.controls.kind==='localAlphaDarken'?(this.options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'alphaDarkenBrowserFloat':this.options.rasterProfile==='reference-scalar-f32-rne-v1'?'alphaDarken32':'alphaDarken32FusedScalar'):d.controls.kind==='directBlend'&&!this.options.maskedSource?canonicalWashOuterOperation(this.options.rasterProfile,d.controls.blend,d.controls.opacity).kind:d.controls.kind==='directErase'&&!this.options.maskedSource?'erase32FusedScalar':this.options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'overBrowserFloat':this.options.rasterProfile==='reference-scalar-f32-rne-v1'?'over32':'over32FusedScalar'
        if(this.primaryTexture?.context.version===8?!this.options.composite.supportsPrimaryGrainPrograms([{operation:kind==='alphaDarken32FusedScalar'||kind==='alphaDarkenBrowserFloat'||kind==='overBrowserFloat'||kind==='erase32FusedScalar'||kind==='genericSCU8'||kind==='colorHsyBrowser'?kind:'over32FusedScalar',law:this.primaryTexture.context.primaryTexture.law}]):!this.options.composite.supportsImageMaterialOperations([kind]))throw new TypeError('Image material composition was not prepared')
      }
    }
    // Decoder caps definitions/draws. Reserve retained DTO/plan metadata in the
    // EXISTING CPU cache (estimate, not a hard JavaScript-heap guarantee).
    const bytes = 1024 + input.frame.definitions.length * 1024 + input.frame.draws.length * 512 + input.frame.fences.length * 128 + input.assets.length * 256
    const newTiles = new Map<string, TilePosition>(), frameTargets = new Map<string, TilePosition>()
    // Wash presentation/commit revisits ALL accumulated tiles, including an
    // empty gesture-end frame. Each can require recovery after a yield.
    if(this.options.maskedSource)for(const [k,tile]of this.dualAdmitted)frameTargets.set(k,tile)
    if (result.commands.length) for (const [k, tile] of this.admittedTiles) frameTargets.set(k, tile)
    for (const d of result.draws) {
      const recipe = input.frame.definitions[d.definition]
      for (const t of this.targetPositions({ minX: d.x, minY: d.y, maxX: d.x + recipe.width, maxY: d.y + recipe.height },buffer)) {
        frameTargets.set(key(t), t)
        if (frameTargets.size > 64) throw new RangeError('Canonical frame exceeds bounded target union')
        if (input.composition.mode === 'wash' && !this.admittedTiles.has(key(t))) newTiles.set(key(t), t)
      }
    }
    if (newTiles.size + this.admittedTiles.size > 64) throw new RangeError('Canonical wash exceeds bounded tile count')
    // Queued copy and resident brush identity use the SAME existing CPU owner.
    // Each 1024-byte estimate covers at most 256 UTF16 units plus bounded metadata.
    const releaseMetadata = this.maskParticipant.brushGlBatchInfo().cpu.reserve(bytes+frameTargets.size*128+(densityStrokeIdentity?1024:0))
    let releaseDual:(()=>void)|undefined
    let releaseDensityIdentity:(()=>void)|undefined
    let releaseWashMetadata: (() => void) | undefined, releaseBudget: (() => void) | undefined, releaseTargetBudget: (() => void) | undefined
    try {
      const dualPositions=this.options.maskedSource&&!frontier?[...frameTargets.values()].filter(t=>!this.dualAdmitted.has(key(t))):undefined
      if(dualPositions?.length){const cpu=this.maskParticipant.brushGlBatchInfo().cpu.reserve(dualPositions.length*768);try{const gpu=this.options.reserveTransient(dualPositions.reduce((n,t)=>n+t.width*t.height*8,0));releaseDual=()=>{try{gpu()}finally{cpu()}}}catch(error){cpu();throw error}}
      // Reserve an upper bound for the whole target union, not just wash pairs.
      // Even currently resident targets may be evicted before this frame runs.
      // The token lasts through this frame; actual target storage remains owned
      // by the layer and must still be charged by the engine after release.
      if (frameTargets.size&&this.options.washMode!=='deposition-only') releaseTargetBudget = this.options.reserveTransient([...frameTargets.values()].reduce((sum, t) => sum + t.width * t.height * 4, 0))
      // Admit the entire frame union BEFORE any tile creation or pixel write.
      // Pool accounting stays authoritative; caller applies the existing fence.
      if (newTiles.size) {
        releaseWashMetadata = this.maskParticipant.brushGlBatchInfo().cpu.reserve(newTiles.size * (this.options.washMode==='deposition-only'?512:608))
        // Exclusive: captured original4 + raw local4. Deposition-only: raw
        // local4 + potential stable target4, still resolved by the SAME paint
        // cursor. No duplicate original buffer is allocated in that mode.
        releaseBudget = this.options.reserveTransient([...newTiles.values()].reduce((sum, t) => sum + t.width * t.height * 8, 0))
      }
      // Leave bounded headroom for the existing batch capsule plus <=8 staged
      // commands. Never let queued DTOs predictably consume its next turn.
      const info = this.maskParticipant.brushGlBatchInfo(), other = this.options.composite.brushGlBatchInfo()
      const resources = new Set([...info.resources, ...other.resources].map(r => r.key)).size
      if(densityStrokeIdentity&&!this.gesture)releaseDensityIdentity=info.cpu.reserve(1024)
      const requiredHeadroom=(input.frame.definitions.some(autoRecipe) ? 82432 : 65536)+resources*128
      if (info.cpu.reservedBytes + requiredHeadroom > info.cpu.budgetBytes) throw new CanonicalFrameCpuPressure(info.cpu.reservedBytes,requiredHeadroom,info.cpu.budgetBytes)
      const roleStrengths=this.options.sourceMaterial?.roleTextures
      const textureStrengths=roleStrengths?Uint8Array.from(input.frame.draws,d=>{const pin=roleStrengths[d.role];if(pin?.law==='pixel-color-texture-v1'){if(typeof d.textureColorStrength!=='number')throw new TypeError('Recorded role color strength required');return 0}if(typeof d.grainStrengthU8!=='number'||!pin&&d.grainStrengthU8!==0)throw new TypeError('Recorded role grain strength required');return d.grainStrengthU8}):input.frame.profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE?this.primaryTexture?.context.primaryTexture.law==='pixel-color-texture-v1'?undefined:Uint8Array.from(input.frame.draws,d=>{if(!('grainStrengthU8' in d)||typeof d.grainStrengthU8!=='number')throw new TypeError('Recorded grain byte required');return d.grainStrengthU8}):input.frame.profile===CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE?Uint8Array.from(input.frame.draws,d=>{if(d.grainDepth!==1)throw new TypeError('Fixed material4 strength required');return 255}):(input.frame.profile===CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE||input.frame.profile===CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE||input.frame.profile===CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE||input.frame.profile===CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE)?Uint8Array.from(input.frame.draws,d=>canonicalPrimaryTextureStrengthU8(d.grainDepth)):undefined
      let saved:ExecutorFrameSubmission
      if(textureSubmission(input)){
        saved=input
      }else{
        const legacy:CanonicalFrameSubmission=seeded?{gestureId:input.gestureId,densityStrokeIdentity,layerId:input.layerId,layerEpoch:input.layerEpoch,ordinal:input.ordinal,frame:input.frame,assets:input.assets,rgb:input.rgb,composition:input.composition}:input
        saved=structuredClone(legacy)
      }
      const retainedTargets=[...frameTargets.values()]
      if(frontier){
        for(const target of retainedTargets){if(target.writeBounds)Object.freeze(target.writeBounds);Object.freeze(target)}
        Object.freeze(retainedTargets)
      }
      const textureColorStrengths=roleStrengths?Float64Array.from(input.frame.draws,d=>{if(roleStrengths[d.role]?.law!=='pixel-color-texture-v1')return 0;if(typeof d.textureColorStrength!=='number')throw new TypeError('Recorded role color strength required');return d.textureColorStrength}):input.frame.profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE&&this.primaryTexture?.context.primaryTexture.law==='pixel-color-texture-v1'?Float64Array.from(input.frame.draws,d=>{if(!('textureColorStrength' in d)||typeof d.textureColorStrength!=='number')throw new TypeError('Recorded color texture strength required');return d.textureColorStrength}):undefined
      const work:Work={textureColorStrengths,dualPositions,segment:0, input: saved,textureStrengths, result, sourceKeys, draw: 0, tile: 0, paintPart: 0, present: 0, part: 0, frameTargets:retainedTargets,newTiles:[...newTiles.values()],targetCursor:0,scratchCursor:0,washCursor:0,
        releaseMetadata: () => { try { releaseMetadata() } finally { releaseTargetBudget?.() } } }
      if(frontier){
        if(newTiles.size||releaseBudget||releaseWashMetadata||releaseDensityIdentity)throw new Error('Replay frontier cannot retain wash/density admission')
        let state:'pending'|'published'|'retired'='pending',checked=false,asserting=false,released=false,ticket:CanonicalReplayAdmissionTicket
        let retainedWork:Work|undefined=work
        const executor=this
        const releaseWork=work.releaseMetadata
        const assertPure=()=>{if(!retainedWork||state!=='pending'||this.frontierPending!==ticket||this.frontierGeneration!==generation||this.failed||this.sourceRetired||this.planned!==previousPlanned||this.gesture!==previousGesture)throw new Error('Replay admission owner changed')}
        const retire=()=>{if(released)return;released=true;state='retired';if(this.frontierPending===ticket)this.frontierPending=undefined;this.frontierReleases.delete(retire);retainedWork=undefined;releaseWork()}
        ticket=Object.freeze({
          targets(){if(this!==ticket)throw new Error('Foreign replay targets receiver');if(asserting)throw new Error('Replay targets assertion is in flight');assertPure();return retainedWork!.frameTargets},
          assertCurrent(){if(this!==ticket)throw new Error('Foreign replay admission receiver');if(asserting)throw new Error('Replay admission assertion reentered');assertPure();checked=false;asserting=true;try{const current=executor.options.layer(input.layerId);if(current.buffer!==buffer||current.epoch!==input.layerEpoch)throw new Error('Replay layer changed');executor.assertPrepared();assertPure();checked=true}finally{asserting=false}},
          publish(){if(this!==ticket)throw new Error('Foreign replay admission receiver');if(asserting)throw new Error('Replay admission assertion is in flight');assertPure();if(!checked)throw new Error('Replay admission was not checked');state='published';executor.frontierPending=undefined;
            executor.gesture??={densityStrokeIdentity,id:input.gestureId,layerId:input.layerId,epoch:input.layerEpoch,buffer,rgb:[input.rgb[0],input.rgb[1],input.rgb[2]],profile:input.frame.profile};executor.washLayerId=input.layerId;executor.planned=result.state},
          release(){if(this!==ticket)throw new Error('Foreign replay admission receiver');if(state==='pending')throw new Error('Pending replay admission must be cancelled');retire()},
          cancel(){if(this!==ticket)throw new Error('Foreign replay admission receiver');retire()},
        })
        // Constructor/capture/reserve callbacks can retire the source or reenter.
        if(this.frontierPending||this.frontierGeneration!==generation||this.failed||this.sourceRetired||this.planned!==previousPlanned||this.gesture!==previousGesture)throw new Error('Replay admission preparation changed')
        this.frontierPending=ticket;this.frontierReleases.add(retire)
        return ticket
      }
      this.queue.push(work)
      if(releaseDual)this.admissionReleases.add(releaseDual)
      for(const t of dualPositions??[])this.dualAdmitted.set(key(t),t)
      for (const [k, tile] of newTiles) this.admittedTiles.set(k, tile)
      if (releaseBudget) {
        const gpu = releaseBudget, cpu = releaseWashMetadata!
        this.admissionReleases.add(() => { try { gpu() } finally { cpu() } })
      }
      // Accepted new gesture gets a new epoch; never revive bindings to names
      // returned to the pool by an earlier completed exclusive gesture.
      if(!this.gesture&&!this.rawOwner.alive)this.rawOwner={alive:true,leases:0}
      this.gesture ??= { densityStrokeIdentity, id: input.gestureId, layerId: input.layerId, epoch: input.layerEpoch, buffer, rgb: [input.rgb[0], input.rgb[1], input.rgb[2]], profile: input.frame.profile }
      if(releaseDensityIdentity)this.admissionReleases.add(releaseDensityIdentity)
      this.washLayerId=input.layerId
      this.planned = result.state
    } catch (error) {
      if(releaseDual)this.cleanup(releaseDual)
      if (releaseTargetBudget) this.cleanup(releaseTargetBudget)
      if (releaseBudget) this.cleanup(releaseBudget)
      if (releaseWashMetadata) this.cleanup(releaseWashMetadata)
      if(releaseDensityIdentity)this.cleanup(releaseDensityIdentity)
      this.cleanup(releaseMetadata)
      throw error
    }

  }

  /** INTERNAL recorded-prefix control, never a source/read grant. Caller must
   * prove the exact recorded prefix and reconcile live-only work first. Attach
   * closure to the last real queued frame; no material tail or ordinal is made. */
  sealRecordedPrefix(input: {readonly gestureId:string;readonly layerId:string;readonly layerEpoch:number;readonly recordedNext:number}): void {
    if(this.candidateReplay)throw new Error('Candidate replay cannot fabricate prefix completion')
    if(this.options.replayFrontier)throw new Error('Replay close metadata belongs to its Entry prefix')
    if(this.failed||this.sourceRetired||this.advancing||this.rawOwner.leases)throw new Error('Canonical executor is poisoned or busy')
    const {gestureId,layerId,layerEpoch,recordedNext}=input
    if(!this.gesture||!this.planned||gestureId!==this.gesture.id||layerId!==this.gesture.layerId||layerEpoch!==this.gesture.epoch)
      throw new Error('Recorded close does not match canonical gesture')
    this.advancing=true
    let accepted=false
    try{
      this.assertPrepared()
      const current=this.options.layer(layerId)
      if(current.epoch!==layerEpoch||current.buffer!==this.gesture.buffer||current.buffer.pixelEncoding!=='straight-rgba8')throw new Error('Canonical layer changed before recorded close')
      const tail=this.queue.at(-1)
      if(tail&&tail.result.state!==this.planned)throw new Error('Canonical close does not match queued prefix')
      if(this.options.maskedSource&&this.planned.entry.phase!=='between')throw new Error('Masked original close requires completed segment')
      const closed=sealSourcePrimaryComposition(this.planned,recordedNext)
      accepted=true
      this.planned=closed.state
      // Empty open tails admitted no presentation targets/budget. Earlier
      // previews drain first; closing them is metadata-only, just as when the
      // whole prefix has already drained. Never add unadmitted pixel work.
      if(tail)tail.result=Object.freeze({state:closed.state,draws:tail.result.draws,segments:tail.result.segments,commands:tail.result.commands.length?closed.commands:tail.result.commands})
      else this.finishGesture(closed.state)
    }catch(error){
      if(accepted)this.fail(error,this.cleanupContextLost())
      throw error
    }finally{this.advancing=false}
    this.retireFinishedMask()
  }

  /** One synchronous cooperative batch. Call again from the existing engine
   * drain after yielding; this service creates no RAF, promise or scheduler. */
  advance(): { pending: boolean; checkpointReady: boolean } {return this.advanceAt()}
  /** Existing hidden replay cursor shares its caller's soft turn deadline. */
  advanceWithinTurn(turnStarted:number): { pending: boolean; checkpointReady: boolean } {
    if(!this.candidateReplay||!Number.isFinite(turnStarted)||turnStarted>performance.now())throw new Error('Invalid replay turn budget')
    return this.advanceAt(turnStarted)
  }
  private advanceAt(turnStarted?:number): { pending: boolean; checkpointReady: boolean } {
    if(this.candidateReplay&&(this.candidateTerminal||this.sourceRetired))throw new Error('Candidate replay cursor retired')
    if(this.options.replayFrontier)throw new Error('Replay frontier cannot execute pixels')
    const result=this.advanceWork(turnStarted)
    this.retireFinishedMask()
    return result
  }
  private retireFinishedMask():void {
    if(!this.retireMaskAfterTurn&&!this.retireTextureAfterTurn)return
    const before=this.cleanupErrors.length
    if(this.retireMaskAfterTurn)this.retireMaskCapacity()
    if(this.retireTextureAfterTurn)this.retirePrimaryTexture()
    if(!this.failed&&this.cleanupErrors.length>before){const error=this.cleanupErrors[before];this.fail(error);throw error}
  }
  private advanceWork(started?:number): { pending: boolean; checkpointReady: boolean } {
    if (this.failed || this.advancing || this.rawOwner.leases) throw new Error('Canonical executor is poisoned or busy')
    const work = this.queue[0]
    if (!work) return { pending: false, checkpointReady: this.checkpointReady }
    this.advancing = true
    try {
      const turnStarted = started??performance.now();
      this.assertPrepared();
      const layer = this.currentLayer(work)
      // Logical composition was already advanced once at admission; clipping
      // only removes pixel work, without inventing or dropping source inputs.
      let clipped=0;
      while (work.draw < work.result.draws.length) {
        if(this.maskedSegmentDue(work))break
        const d=work.result.draws[work.draw], r=work.input.frame.definitions[d.definition];
        if (this.targetPositions({minX:d.x,minY:d.y,maxX:d.x+r.width,maxY:d.y+r.height},layer).length) break;
        work.draw++; work.tile=0; work.paintPart=0; work.tiles=undefined;
        if (++clipped % 16 === 0 && performance.now()-turnStarted >= 4) return { pending:true, checkpointReady:false };
      }
      if (!this.maskedSegmentDue(work)&&work.draw === work.result.draws.length && (this.options.washMode==='deposition-only'||!work.result.commands.length || !this.washes.size)) {
        // Source framing/opacity history was advanced at admission. No target
        // exists to present/commit: finish only ledger/reservation ownership.
        this.finish(work);
        return { pending:this.pending, checkpointReady:this.checkpointReady };
      }
      this.preparePhysicalPlan(work,layer)
      if(this.options.maskedSource){
        if(!this.preparePhysical(work,layer,turnStarted)||!this.prepareDualPlanes(work,turnStarted))return {pending:true,checkpointReady:false}
        if(this.maskedSegmentDue(work)){
          runBrushGlTurn({callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite]},turn=>this.resolveMaskedSegment(work,layer,turn,turnStarted))
          return {pending:this.pending,checkpointReady:this.checkpointReady}
        }
      }
      // Finish current cold CPU work before acquiring any parent snapshot.
      // Prepared image/resident/final-upload entries retain the original first
      // indivisible paint even if snapshot acquisition crosses the soft clock.
      if(this.canEnterMixedPreparedSequence(work)){
        if(!this.mixedPreparedSourceReady(work)
          &&(!this.prepareAuto(work,turnStarted)||performance.now()-turnStarted>=4))return {pending:true,checkpointReady:false}
        this.paintMixedPreparedSequence(work,layer,turnStarted)
        return {pending:this.pending,checkpointReady:this.checkpointReady}
      }
      const warmAtEntry=this.warmAutoReady(work);
      if (!this.prepareAuto(work,turnStarted) || performance.now()-turnStarted >= 4) return { pending: true, checkpointReady: false }
      if (!this.preparePhysical(work,layer,turnStarted)) return {pending:this.pending,checkpointReady:this.checkpointReady}
      // One owned capture covers direct target preparation, inner batch and
      // its release callbacks; no GL state or lease survives this turn.
      if(this.canEnterMaskedWarmSequence(work))this.paintMaskedWarmSequence(work,layer,turnStarted)
      else if(this.canEnterUniqueAutoSequence(work))this.paintUniqueAutoSequence(work,layer,turnStarted)
      else if(warmAtEntry&&this.canSequenceWarm(work))this.paintWarmSequence(work,layer,turnStarted)
      else this.runPreparedTurn(work,turnStarted,work.draw<work.result.draws.length?'paint':'presentation',turn=>{
        this.paintPrepared(work,layer,turn,turnStarted)
      })
    } catch (error) {
      this.fail(error, this.cleanupContextLost())
      throw error
    } finally { this.advancing = false }
    return { pending: this.pending, checkpointReady: this.checkpointReady }
  }

  private canEnterMixedPreparedSequence(work:Work):boolean {
    const p=work.physical
    return !!this.options.maskedSource&&!!p&&work.draw<work.result.draws.length
      &&work.targetCursor===p.targetCount&&work.scratchCursor===p.scratchCount
      &&work.washCursor===work.newTiles.length&&(work.dualCursor??0)===(work.dualPositions?.length??0)
      &&!work.dualAcquisition&&!this.maskedSegmentDue(work)
  }
  /** Actual source readiness only; never a new source/room grant. */
  private mixedPreparedSourceReady(work:Work):boolean {
    const d=work.result.draws[work.draw],recipe=d&&work.input.frame.definitions[d.definition]
    if(!recipe)return false
    if(!autoRecipe(recipe))return true
    const request=this.maskRequest(work,work.draw)
    return this.maskParticipant.hasReadyAutoGeneration(request)||this.maskParticipant.finalAutoUploadPending(request)
  }
  private paintMixedPreparedSequence(work:Work,layer:TiledLayerBuffer,started:number):void {
    const segment=work.segment??0
    runBrushGlClosedNativeSequence({started,callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite],captureAutoUploadUnpack:true,allowAutoUpload:true},turn=>{
      this.assertPrepared()
      if(this.queue[0]!==work||this.currentLayer(work)!==layer)throw new Error('Mixed sequence owner changed')
      // Next readiness and all caller decisions remain BEFORE child restore.
      // A cold definition is prepared outside any parent on the next advance.
      if((work.segment??0)!==segment||!this.canEnterMixedPreparedSequence(work)||!this.mixedPreparedSourceReady(work))return false
      const draw=work.draw,tile=work.tile,part=work.paintPart
      const d=work.result.draws[work.draw],recipe=work.input.frame.definitions[d.definition]
      if(autoRecipe(recipe)){
        const request=this.maskRequest(work,work.draw)
        if(!this.maskParticipant.hasReadyAutoGeneration(request))this.maskParticipant.flushFinalAutoGeneration(request,turn)
      }
      this.assertPrepared()
      if(this.queue[0]!==work||this.currentLayer(work)!==layer||(work.segment??0)!==segment||!this.canEnterMixedPreparedSequence(work))throw new Error('Mixed paint boundary changed')
      this.paint(work,layer,turn,started)
      if(work.draw===draw&&work.tile===tile&&work.paintPart===part)return false
      return (work.segment??0)===segment&&this.canEnterMixedPreparedSequence(work)&&this.mixedPreparedSourceReady(work)
    })
    // Segment resolve, presentation, END and Work retirement remain outside
    // the completely restored parent and its fresh single-use children.
  }

  /** Masked raw deposition only: no segment resolve, presentation or ownership
   * transition may occur while the parent snapshot is borrowed. */
  private canEnterMaskedWarmSequence(work:Work):boolean {
    const p=work.physical,d=work.result.draws[work.draw],next=work.result.draws[work.draw+1]
    return !!this.options.maskedSource&&!!p&&work.targetCursor===p.targetCount
      &&work.scratchCursor===p.scratchCount&&work.washCursor===work.newTiles.length
      &&(work.dualCursor??0)===(work.dualPositions?.length??0)&&!work.dualAcquisition
      &&!this.maskedSegmentDue(work)&&!!d&&!!next&&d.definition===next.definition&&d.role===next.role
      &&this.warmAutoReady(work)&&!this.maskParticipant.finalAutoUploadPending(this.maskRequest(work,work.draw))
  }
  private paintMaskedWarmSequence(work:Work,layer:TiledLayerBuffer,turnStarted:number):void {
    const firstDraw=work.result.draws[work.draw],definition=firstDraw.definition,role=firstDraw.role
    const segment=work.segment??0
    runBrushGlSequence({callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite]},sequence=>{
      for(let steps=0;steps<32&&(steps===0||performance.now()-turnStarted<4);steps++){
        this.assertPrepared()
        if(this.queue[0]!==work||this.currentLayer(work)!==layer)throw new Error('Masked sequence owner changed')
        const d=work.result.draws[work.draw]
        if(!d||d.definition!==definition||d.role!==role||(work.segment??0)!==segment||this.maskedSegmentDue(work)
          ||!this.warmAutoReady(work)||this.maskParticipant.finalAutoUploadPending(this.maskRequest(work,work.draw)))break
        const draw=work.draw,tile=work.tile,part=work.paintPart
        sequence.step(turn=>{
          this.assertPrepared()
          const current=work.result.draws[work.draw]
          if(this.queue[0]!==work||this.currentLayer(work)!==layer||!current||current.definition!==definition
            ||current.role!==role||(work.segment??0)!==segment||this.maskedSegmentDue(work))throw new Error('Masked sequence boundary changed')
          if(!this.warmAutoReady(work)||this.maskParticipant.finalAutoUploadPending(this.maskRequest(work,work.draw)))throw new Error('Masked sequence resource changed')
          this.paint(work,layer,turn,turnStarted)
        })
        if(work.draw===draw&&work.tile===tile&&work.paintPart===part)break
      }
    })
    // Segment resolve / END / finish stay in advanceWork after full restoration.
  }

  private warmAutoReady(work:Work):boolean {
    if(work.draw>=work.result.draws.length)return false
    const recipe=work.input.frame.definitions[work.result.draws[work.draw].definition]
    return autoRecipe(recipe)&&(!this.softProgram||this.softProgram.done)
      &&this.maskParticipant.hasReadyAutoGeneration(this.maskRequest(work,work.draw))
  }
  private canSequenceWarm(work:Work):boolean {
    const physical=work.physical,draw=work.result.draws[work.draw],next=work.result.draws[work.draw+1]
    return !this.options.maskedSource&&!!physical&&work.targetCursor===physical.targetCount&&work.scratchCursor===physical.scratchCount
      &&work.washCursor===work.newTiles.length&&!!next&&draw.definition===next.definition&&this.warmAutoReady(work)
  }
  private canEnterUniqueAutoSequence(work:Work):boolean {
    const current=work.result.draws[work.draw],next=work.result.draws[work.draw+1]
    if(!current||!next||current.definition===next.definition)return false
    const recipe:AnyCanonicalMaterialRecipe & {readonly kind?:string;readonly coverageProfile?:string}=work.input.frame.definitions[next.definition]
    // No new generation here: the current final upload may still be pending.
    // Full participant/residency/headroom is rechecked before actual continuation.
    return recipe.kind==='defaultAuto'&&recipe.coverageProfile!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
      &&recipe.width*recipe.height<=16384&&this.canSequenceUniqueAuto(work)
  }
  private canSequenceUniqueAuto(work:Work):boolean {
    const p=work.physical
    return !this.options.maskedSource&&!!p&&work.targetCursor===p.targetCount&&work.scratchCursor===p.scratchCount
      &&work.washCursor===work.newTiles.length&&work.draw<work.result.draws.length
      &&this.maskParticipant.canContinueSingleStripeAuto(this.maskRequest(work,work.draw))
  }
  private paintUniqueAutoSequence(work:Work,layer:TiledLayerBuffer,turnStarted:number):void {
    runBrushGlSequence({callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite],captureAutoUploadUnpack:true,allowAutoUpload:true},sequence=>{
      let first=true
      while((first||performance.now()-turnStarted<4)&&this.queue[0]===work&&work.draw<work.result.draws.length){
        this.assertPrepared()
        if(this.currentLayer(work)!==layer)throw new Error('Unique auto sequence layer changed')
        if(!this.canSequenceUniqueAuto(work))break
        if(!first){
          // One pending evaluator, original CPU64 quantum and original deadline.
          // The pure headroom probe excludes optional reclaim under held owners.
          if(!this.prepareAuto(work,turnStarted))break
        }
        const request=this.maskRequest(work,work.draw),draw=work.draw,tile=work.tile,part=work.paintPart
        sequence.step(turn=>{
          this.assertPrepared()
          if(this.queue[0]!==work||this.currentLayer(work)!==layer||!this.canSequenceUniqueAuto(work))throw new Error('Unique auto sequence work changed')
          if(this.maskParticipant.finalAutoUploadPending(request))this.maskParticipant.flushFinalAutoGeneration(request,turn)
          this.assertPrepared()
          if(this.currentLayer(work)!==layer||!this.maskParticipant.hasReadyAutoGeneration(request))throw new Error('Unique auto mask changed after upload')
          this.paint(work,layer,turn,turnStarted)
        })
        first=false
        if(work.draw===draw&&work.tile===tile&&work.paintPart===part)break
      }
    })
    // Terminal/ownership transitions occur only after the parent has restored.
    if(work.draw===work.result.draws.length&&(this.options.washMode==='deposition-only'||!work.result.commands.length||work.presentTiles&&work.present===work.presentTiles.length))this.finish(work)
  }
  private paintWarmSequence(work:Work,layer:TiledLayerBuffer,turnStarted:number):void {
    const definition=work.result.draws[work.draw].definition
    runBrushGlSequence({callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite]},sequence=>{
      let first=true
      while((first||performance.now()-turnStarted<4)&&this.queue[0]===work&&work.draw<work.result.draws.length
        &&work.result.draws[work.draw].definition===definition){
        this.assertPrepared()
        if(this.currentLayer(work)!==layer)throw new Error('Warm sequence layer changed')
        if(!this.warmAutoReady(work))break
        const draw=work.draw,tile=work.tile,part=work.paintPart
        sequence.step(turn=>{
          this.assertPrepared()
          if(this.queue[0]!==work||this.currentLayer(work)!==layer)throw new Error('Warm sequence work changed')
          if(!this.warmAutoReady(work))return
          this.paint(work,layer,turn,turnStarted)
        })
        first=false
        if(work.draw===draw&&work.tile===tile&&work.paintPart===part)break
      }
    })
    // No END, source lease retirement or physical transition inside the sequence.
    if(work.draw===work.result.draws.length&&(this.options.washMode==='deposition-only'||!work.result.commands.length||work.presentTiles&&work.present===work.presentTiles.length))this.finish(work)
  }

  /** A computed final stripe borrows the NEXT actual GL turn, never a new
   * readiness owner. If upload spends the budget, physical cursors stay put. */
  private runPreparedTurn(work:Work,turnStarted:number,action:PreparedTurnAction,execute:(turn:BrushGlTurn)=>void):boolean {
    const recipe=work.input.frame.definitions[work.result.draws[work.draw]?.definition];
    const request=recipe&&autoRecipe(recipe)?this.maskRequest(work,work.draw):undefined;
    const upload=!!request&&this.maskParticipant.finalAutoUploadPending(request);
    let executed=false;
    runBrushGlTurn({callbackScope:this.options.callbackScope,participants:[this.maskParticipant,this.options.composite],...(upload?{captureAutoUploadUnpack:true as const}:{})},turn=>{
      if(upload){
        this.maskParticipant.flushFinalAutoGeneration(request!,turn);
        if(performance.now()-turnStarted>=4){
          // Only the actual paint callsite follows COMPLETE physical preparation.
          // Its first task is indivisible; later tasks keep the original clock.
          const p=work.physical;
          if(action!=='paint'||!p||work.targetCursor!==p.targetCount||work.scratchCursor!==p.scratchCount
            ||work.washCursor!==work.newTiles.length||work.draw>=work.result.draws.length)return;
        }
      }
      execute(turn);executed=true;
    });
    return executed;
  }

  /** Reuses an already captured turn; never captures or advances source state. */
  private paintPrepared(work:Work,layer:TiledLayerBuffer,turn:BrushGlTurn,turnStarted:number):void {
    this.gl.activeTexture(this.gl.TEXTURE0)
    if(work.draw<work.result.draws.length)this.paint(work,layer,turn,turnStarted)
    else if(!this.maskedSegmentDue(work))this.present(work,layer,turn,turnStarted)
    if(work.draw===work.result.draws.length&&(this.options.washMode==='deposition-only'||!work.result.commands.length||work.presentTiles&&work.present===work.presentTiles.length))this.finish(work)
  }

  /** At most one actual materialization per turn. Resident metadata takes use
   * the same turn clock; layer/pool tickets reserve missing bytes once. */
  private maskedSegmentDue(work:Work):boolean {
    const event=work.result.segments?.[work.segment??0]
    return !!this.options.maskedSource&&!!event&&work.draw>=event.at
  }
  private prepareDualPlanes(work:Work,started:number):boolean {
    const positions=work.dualPositions??[]
    if((work.dualCursor??0)>=positions.length)return true
    work.dualAcquisition??=this.options.scratch.prepareAcquisition(positions.flatMap(t=>[0,1].map(()=>({width:t.width,height:t.height,pixelEncoding:'straight-rgba8' as const}))))
    const at=work.dualCursor??0,t=positions[at],plan=work.dualAcquisition
    this.runPreparedTurn(work,started,'physical',()=>{
      this.assertPrepared()
      work.dualPartial=plan.take(2*at)
      work.dualPartialMask=plan.take(2*at+1)
      const mask=work.dualPartialMask,primary=work.dualPartial
      // Publish ownership before clear callbacks; failure uses one cleanup path.
      const lifetime=this.rawLifetime(primary,t,mask)
      this.dualTiles.set(key(t),{...t,primary,mask,lifetime});work.dualPartial=undefined;work.dualPartialMask=undefined
      this.gl.disable(this.gl.SCISSOR_TEST);setGlColorMask(this.gl,true,true,true,true)
      primary.clear();mask.clear();work.dualCursor=at+1
    })
    if(work.dualCursor===positions.length){plan.close();work.dualAcquisition=undefined;return true}
    return false
  }
  private dualView(buffer:AccumulationBuffer,t:DualTile):CanonicalRgba8SourceView {
    return {brand:'canonical-straight-rgba8-view-v1',texture:buffer.texture,textureWidth:t.width,textureHeight:t.height,
      rect:{x:t.x,y:t.y,width:t.width,height:t.height},bounds:{x:0,y:0,width:1,height:1},mirror:{horizontal:false,vertical:false},rowOrder:'bottomAtV0',residency:t.lifetime}
  }
  private resolveMaskedSegment(work:Work,layer:TiledLayerBuffer,turn:BrushGlTurn,_started:number):void {
    const context=this.options.maskedSource
    if(!context||!this.maskedSegmentDue(work))throw new Error('Masked segment is not ready')
    const mode=CANONICAL_DUAL_MASKING_MODES.find(m=>m===context.maskingBlend)
    if(!mode)throw new TypeError('Unsupported original masking blend')
    work.segmentTiles??=[...this.dualTiles.values()]
    const tiles=work.segmentTiles,index=work.segmentTile??0
    if(index>=tiles.length){work.segment=(work.segment??0)+1;work.segmentTiles=undefined;work.segmentTile=0;work.segmentPart=0;return}
    const t=tiles[index],target=this.resolveTile(layer,t),bound=bindCanonicalLayerTargets(layer,[target])[0]
    const wash=work.input.composition.mode==='wash'?this.washTile(t):undefined
    const columns=Math.ceil(t.width/this.compositeCapacity.width),rows=Math.ceil(t.height/this.compositeCapacity.height),part=work.segmentPart??0
    const x=t.x+(part%columns)*this.compositeCapacity.width,y=t.y+Math.floor(part/columns)*this.compositeCapacity.height
    const bounds={minX:x,minY:y,maxX:Math.min(t.x+t.width,x+this.compositeCapacity.width),maxY:Math.min(t.y+t.height,y+this.compositeCapacity.height)}
    const primary=this.scratchTarget(t.primary,t,t.lifetime),output=wash?this.scratchTarget(wash.local,t,wash.lifetime):bound
    runBrushGlBatch({turn,participants:[this.maskParticipant,this.options.composite],owners:[bound.lifetime,t.lifetime,...wash?[wash.lifetime]:[]]},frame=>{
      if(this.currentLayer(work)!==layer)throw new Error('Masked segment target retired')
      this.options.composite.drawSource({source:{kind:'straightRgba8',view:this.dualView(t.mask,t)},target:primary,operation:{kind:'maskingAlpha',control:{mode}},writeBounds:bounds},frame)
      this.options.composite.drawSource({source:{kind:'straightRgba8',view:this.dualView(t.primary,t)},target:output,operation:work.input.composition.mode==='buildup'?canonicalWashOuterOperation(this.options.rasterProfile,work.input.composition.outerBlend,1):this.overOperation(1),writeBounds:bounds},frame)
    })
    if(wash){if(this.options.washMode==='deposition-only')this.options.changed(work.input.layerId,bounds)}else{layer.markContentPainted(bounds);this.options.changed(work.input.layerId,bounds)}
    work.segmentPart=part+1
    if(work.segmentPart===columns*rows){
      // Same owned turn, all batch leases released, no source/plane escapes.
      this.gl.disable(this.gl.SCISSOR_TEST);setGlColorMask(this.gl,true,true,true,true);t.primary.clear();t.mask.clear()
      work.segmentPart=0;work.segmentTile=index+1
    }
  }

  private preparePhysicalPlan(work:Work,layer:TiledLayerBuffer):void {
    const perTile=this.options.washMode==='deposition-only'?1:2
    if(!work.physical){
      const requests=work.newTiles.flatMap(t=>Array.from({length:perTile},()=>({width:t.width,height:t.height,pixelEncoding:'straight-rgba8' as const})))
      work.physical=prepareCanonicalLayerFrame(layer,this.options.scratch,work.frameTargets.map(rect),requests)
    }
  }
  private preparePhysical(work:Work,layer:TiledLayerBuffer,turnStarted:number):boolean {
    const perTile=this.options.washMode==='deposition-only'?1:2,plan=work.physical!
    while(work.targetCursor<plan.targetCount){
      if(plan.takeResidentTarget(work.targetCursor)){
        work.targetCursor++;if(performance.now()-turnStarted>=4)return false
      }else{
        if(this.runPreparedTurn(work,turnStarted,'physical',()=>{this.gl.activeTexture(this.gl.TEXTURE0);plan.takeTarget(work.targetCursor)}))work.targetCursor++;
        return false
      }
    }
    while(work.scratchCursor<plan.scratchCount){
      if(plan.takeResidentScratch(work.scratchCursor)){
        work.scratchCursor++;if(performance.now()-turnStarted>=4)return false
      }else{
        if(this.runPreparedTurn(work,turnStarted,'physical',()=>{this.gl.activeTexture(this.gl.TEXTURE0);plan.takeScratch(work.scratchCursor)}))work.scratchCursor++;
        return false
      }
    }
    if(work.washCursor<work.newTiles.length){
      const position=work.newTiles[work.washCursor],base=work.washCursor*perTile
      // All allocation is complete. Only the LAST initialization may spend
      // remaining turn time painting; all earlier tile clears precede pixels.
      this.runPreparedTurn(work,turnStarted,'physical',turn=>{
        this.gl.activeTexture(this.gl.TEXTURE0)
        const target=this.resolveTile(layer,position),bound=bindCanonicalLayerTargets(layer,[target])[0],release=bound.lifetime.lease()
        try{
          const original=perTile===2?plan.scratchAt(base):undefined,local=plan.scratchAt(base+perTile-1)
          if(original)target.buffer.copyTo(original)
          this.gl.disable(this.gl.SCISSOR_TEST);setGlColorMask(this.gl,true,true,true,true);local.clear()
          const lifetime=this.rawLifetime(local,position,original)
          this.washes.set(key(position),{...position,original,local,lifetime})
          for(let i=0;i<perTile;i++)plan.transferScratch(base+i)
          work.washCursor++
        }finally{release()}
        if(!this.options.maskedSource&&work.washCursor===work.newTiles.length&&performance.now()-turnStarted<4)
          this.paintPrepared(work,layer,turn,turnStarted)
      })
      return false
    }
    return true
  }

  private assertPrepared(): void {
    if(this.tipGradientRoot){assertCanonicalPatternResourceCurrent(this.tipGradientRoot.view,this.options.prepass.brushGlBatchInfo(),this.tipGradientRoot.root);if(!this.maskParticipant.supportsTipGradient())throw new Error('Tip gradient preparation changed')}

    if(this.options.sourceMaterial&&this.options.sourceLease&&!this.options.sourceLease.isReady())throw new Error('Masked source root retired')
    if(this.primaryTexture){
      const source=this.primaryTexture,info=this.options.composite.brushGlBatchInfo()
      assertCanonicalPatternResourceCurrent(source.view,info,source.root)
      if(source.gradient){assertCanonicalPatternResourceCurrent(source.gradient,info,source.root);if(!info.resources.some(r=>r.key===source.gradient!.key&&r.bytes===1024))throw new Error('Canonical gradient group changed')}
      const variantReady=source.context.version===8?this.options.composite.supportsPrimaryGrainPrograms([{operation:this.options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'overBrowserFloat':'over32FusedScalar',law:source.context.primaryTexture.law}]):this.options.composite.supportsTexturedOperations([this.options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'alphaDarkenBrowserFloat':'alphaDarken32FusedScalar'])
      if(!variantReady||!info.resources.some(r=>r.key===source.view.key&&r.bytes===source.view.width*source.view.height*4))throw new Error('Canonical texture group/variant changed')
    }
    if(this.roleTextures){const info=this.options.composite.brushGlBatchInfo();for(const role of ['primary','mask']as const){const binding=this.roleTextures.bindings[role];if(!binding)continue;assertCanonicalPatternResourceCurrent(binding.view,info,this.roleTextures.root);if(binding.gradient)assertCanonicalPatternResourceCurrent(binding.gradient,info,this.roleTextures.root);if(!info.resources.some(r=>r.key===binding.view.key&&r.bytes===binding.view.width*binding.view.height*4)||!this.options.composite.supportsPrimaryGrainPrograms([{operation:this.options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?'overBrowserFloat':'over32FusedScalar',law:binding.pin.law}]))throw new Error('Role texture preparation changed')}}
    let mask:Readonly<{width:number;height:number;epoch:object}>
    try{mask=this.maskParticipant.preparedCapacity()}catch{throw new Error('Canonical prepared service capacity/epoch changed')}
    const composite=this.options.composite.preparedCapacity();
    for (const [current,pinned] of [[mask,this.maskCapacity],[composite,this.compositeCapacity]]) {
      if(current.width!==pinned.width||current.height!==pinned.height||current.epoch!==pinned.epoch)
        throw new Error('Canonical prepared service capacity/epoch changed');
    }
  }

  private targetPositions(footprint: Readonly<WorldRect>, layer: TiledLayerBuffer): TilePosition[] {
    return planCanonicalTargets(footprint,this.options.pageBounds ?? null,layer.tileWidth,layer.tileHeight).tiles.map(t => ({
      x:t.storage.minX,y:t.storage.minY,width:t.storage.maxX-t.storage.minX,height:t.storage.maxY-t.storage.minY,writeBounds:t.paint }));
  }

  private coverageScaleFactor(source:CanonicalAutoSource|CanonicalSoftAutoSource):number|undefined {
    const context=this.options.sourceMaterial??(this.primaryTexture?.context.version===8?this.primaryTexture.context:undefined)
    return context?.scaledSource==='source-scale-v1'?source.brushScale:undefined
  }
  private maskRequest(work: Work, draw: number): AnyTransformedMaskRequest {
    const d = work.result.draws[draw], recipe = work.input.frame.definitions[d.definition];
    const role=d.role,maskPin=this.options.maskedSource?.maskSource,trusted=role==='mask'?(maskPin&&maskPin.kind!=='image'?maskPin:undefined):this.options.autoSource;
    const common = { owner: this, role, rect: { x:d.x, y:d.y, width:recipe.width, height:recipe.height }, profile:'neon4-summed-wordsize64' as const };
    if ('kind' in recipe && recipe.kind === 'softAuto') {
      const program=role==='mask'?this.maskSoftProgram:this.softProgram;
      if(trusted?.kind!=='softAuto'||!program)throw new TypeError('Canonical soft source is not trusted');
      return {...common,material:{kind:'canonicalAuto',recipe,trustedSource:trusted,coverageScaleFactor:this.coverageScaleFactor(trusted),programOwner:program}};
    }
    if ('kind' in recipe && (recipe.kind === 'defaultAuto' || recipe.kind === 'gaussianAuto')) {
      if (!trusted || trusted.kind==='softAuto') throw new TypeError('Canonical auto source is not trusted');
      if(recipe.kind==='defaultAuto'&&recipe.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE){
        if(this.options.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||trusted.kind!=='defaultAuto'||role!=='primary')throw new TypeError('Density executor profile mismatch');
        return {...common,material:{kind:'canonicalAuto',recipe,trustedSource:trusted,densityIdentity:Object.freeze({gestureId:captureSourceDefaultAutoDensityStrokeIdentity(work.input.densityStrokeIdentity).strokeId,descriptorSha256:trusted.descriptorSha256,role:'primary',drawOrdinal:d.drawOrdinal})}};
      }
      return { ...common, material: { kind:'canonicalAuto', recipe, trustedSource:trusted,coverageScaleFactor:this.coverageScaleFactor(trusted) } };
    }
    if (!this.options.bank?.isReady()) throw new Error('Canonical image bank is not prepared');
    const source = this.options.bank.resources().find(s => s.key === work.sourceKeys[d.definition]);
    const imageContext=this.options.sourceMaterial??this.options.maskedSource??(this.primaryTexture?.context.version===8?this.primaryTexture.context:undefined);
    const original=imageContext&&(role==='mask'&&imageContext.version===2?imageContext.maskSource:imageContext.primarySource);
    const asset=imageContext?.imageFrameIndices&&original?.kind==='image'&&recipe.imageFrameIndex!==undefined
      ?canonicalImageFrameAsset(original,work.input.assets,recipe.imageFrameIndex):work.input.assets.find(a=>a.id===recipe.asset);
    if (!source || !asset) throw new Error('Canonical prepared source was evicted');
    return { ...common, material: { kind:'canonical', recipe, asset }, source };
  }
  private prepareSoftTable(work:Work,start:number):boolean {
    const d=work.result.draws[work.draw],recipe=d&&work.input.frame.definitions[d.definition]
    if(recipe&&autoRecipe(recipe)&&recipe.kind==='softAuto'){
      const program=d.role==='mask'?this.maskSoftProgram:this.softProgram
      if(!program)throw new TypeError('Canonical soft source is not trusted')
      while(!program.done){program.advance(64);if(performance.now()-start>=4)return false}
    }
    return true
  }
  private prepareAuto(work: Work, start: number): boolean {
    if (work.draw >= work.result.draws.length) return true;
    const d=work.result.draws[work.draw], recipe=work.input.frame.definitions[d.definition];
    if (!autoRecipe(recipe)) return true;
    if(!this.prepareSoftTable(work,start))return false
    if (this.maskParticipant.beginAutoGeneration(this.maskRequest(work,work.draw))) return performance.now()-start < 4;
    if (performance.now()-start >= 4) return false;
    do { const step=this.maskParticipant.advanceAutoGeneration(64,{deferFinalUpload:true});if(step.done||step.finalUploadPending)return performance.now()-start < 4; }
    while(performance.now()-start < 4);
    return false;
  }

  private currentLayer(work: Work): TiledLayerBuffer {
    const current = this.options.layer(work.input.layerId)
    if (current.epoch !== work.input.layerEpoch || current.buffer !== this.gesture?.buffer || current.buffer.pixelEncoding !== 'straight-rgba8') throw new Error('Canonical layer changed while queued')
    return current.buffer
  }

  private paint(work: Work, layer: TiledLayerBuffer, turn: BrushGlTurn, turnStarted:number): void {
    // Plan at most eight commands before entering the synchronous capsule.
    // These temporary handles are retained only for this turn, never a yield.
    const tasks: { draw: number; tile: number; part: number; parts: number; writeBounds: Readonly<WorldRect>; tiles: readonly TilePosition[]; target: PaintTarget; wash?: WashTile }[] = []
    const stagingReleases: (() => void)[] = []
    try {
      let draw = work.draw, tile = work.tile, part = work.paintPart, positions = work.tiles
      while (tasks.length < 8 && draw < work.result.draws.length) {
        if(this.options.maskedSource&&(work.result.segments?.[work.segment??0]?.at??Infinity)<=draw)break
        if(tasks.length && performance.now()-turnStarted>=4)break
        const d = work.result.draws[draw], r = work.input.frame.definitions[d.definition]
        if(tasks.length&&d.role!==work.result.draws[tasks[0].draw].role)break
        const firstRecipe = work.input.frame.definitions[work.result.draws[work.draw].definition];
        if (draw !== work.draw && (autoRecipe(r) || autoRecipe(firstRecipe))) break;
        if (!positions) {
          positions = this.targetPositions({ minX:d.x,minY:d.y,maxX:d.x+r.width,maxY:d.y+r.height },layer)
        }
        if (!positions.length) { draw++; tile=0; part=0; positions=undefined; continue; }
        const position = positions[tile], target = this.resolveTile(layer, position)
        const bound = bindCanonicalLayerTargets(layer, [target])[0]
        stagingReleases.push(bound.lifetime.lease())
        const wash = d.controls.kind === 'localAlphaDarken' ? this.washTile(position) : undefined
        const paint=position.writeBounds ?? rect(position);
        const columns=Math.ceil((paint.maxX-paint.minX)/this.compositeCapacity.width);
        const rows=Math.ceil((paint.maxY-paint.minY)/this.compositeCapacity.height), parts=columns*rows;
        const x=paint.minX+(part%columns)*this.compositeCapacity.width;
        const y=paint.minY+Math.floor(part/columns)*this.compositeCapacity.height;
        const writeBounds={minX:x,minY:y,maxX:Math.min(paint.maxX,x+this.compositeCapacity.width),maxY:Math.min(paint.maxY,y+this.compositeCapacity.height)};
        tasks.push({ draw, tile, part, parts, writeBounds, tiles: positions, target, wash })
        if(++part===parts){part=0;if (++tile === positions.length) { draw++; tile = 0; positions = undefined }}
      }
      if (!tasks.length) return;
      const bound = bindCanonicalLayerTargets(layer, tasks.map(t => t.target))
      const roleTexture=this.roleTextures?.bindings[work.result.draws[tasks[0].draw].role],roleRoot=this.roleTextures?.root
      runBrushGlBatch({ turn, participants: [this.maskParticipant, this.options.composite], owners: [...this.tipGradientRoot?[canonicalPatternResourceLifetime(this.tipGradientRoot.view,this.options.prepass.brushGlBatchInfo(),this.tipGradientRoot.root)]:[],...roleTexture&&roleRoot?[canonicalPatternResourceLifetime(roleTexture.view,this.options.composite.brushGlBatchInfo(),roleRoot),...roleTexture.gradient?[canonicalPatternResourceLifetime(roleTexture.gradient,this.options.composite.brushGlBatchInfo(),roleRoot)]:[]]:[],...this.primaryTexture?.gradient?[canonicalPatternResourceLifetime(this.primaryTexture.gradient,this.options.composite.brushGlBatchInfo(),this.primaryTexture.root)]:[],bound[0].lifetime,...this.options.maskedSource?[...this.dualTiles.values()].map(t=>t.lifetime):[], ...tasks.flatMap(t => t.wash ? [t.wash.lifetime] : []), ...this.primaryTexture ? [canonicalPatternResourceLifetime(this.primaryTexture.view,this.options.composite.brushGlBatchInfo(),this.primaryTexture.root)] : []] }, frame => {
        for (let i = 0; i < tasks.length; i++) {
          if (this.currentLayer(work) !== layer) throw new Error('Canonical layer changed during batch')
          const task = tasks[i], d = work.result.draws[task.draw]
          const dual=this.options.maskedSource?this.dualTiles.get(key(task.tiles[task.tile])):undefined
          if(this.options.maskedSource&&!dual)throw new Error('Masked planes not prepared')
          const output=dual?this.scratchTarget(d.role==='mask'?dual.mask:dual.primary,dual,dual.lifetime):task.wash ? this.scratchTarget(task.wash.local, task.tiles[task.tile], task.wash.lifetime) : bound[i]
          const group = this.maskParticipant.resolveGroup([this.maskRequest(work,task.draw)], frame)
          try {
            const fused = this.options.rasterProfile !== 'reference-scalar-f32-rne-v1'
            const operation = d.controls.kind === 'localAlphaDarken'
              ? this.options.rasterProfile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE
                ? {kind:'alphaDarkenBrowserFloat' as const,control:{profile:CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,variant:d.controls.variant,opacity:d.controls.opacity,averageOpacity:d.controls.averageOpacity,flow:d.controls.flow}}
                : fused
                ? { kind: 'alphaDarken32FusedScalar' as const, control: { profile: CANONICAL_STROKE_RASTER_PROFILE, variant: d.controls.variant, opacity: d.controls.opacity, averageOpacity: d.controls.averageOpacity, flow: d.controls.flow } }
                : { kind: 'alphaDarken32' as const, control: { profile: 'optimized32-scalar-f32-rne-v1' as const, variant: d.controls.variant, opacity: d.controls.opacity, averageOpacity: d.controls.averageOpacity, flow: d.controls.flow } }
              : d.controls.kind==='directBlend'&&!dual?canonicalWashOuterOperation(this.options.rasterProfile,d.controls.blend,d.controls.opacity):d.controls.kind==='directErase'&&!dual?canonicalWashOuterOperation(this.options.rasterProfile,'erase',d.controls.opacity):this.overOperation(d.controls.opacity)
            const texture=this.primaryTexture
            const original=d.role==='mask'?this.options.maskedSource?.maskSource:this.options.sourceMaterial?.primarySource??(this.primaryTexture?.context.version===8?this.primaryTexture.context.primarySource:undefined)
            const imageMaterial=original?.kind==='image'?original.imageMaterial:undefined
            const recipe=work.input.frame.definitions[d.definition]
            const rgba=d.sourcePigmentRGBA
            const pigment:readonly[number,number,number]=rgba?[rgba[0],rgba[1],rgba[2]]:d.sourcePigmentRGB??work.input.rgb
            const materialControl=imageMaterial?{kind:imageMaterial.kind,strength:imageMaterial.kind==='lightness-map-v1'?(('materialParams'in recipe?recipe.materialParams?.lightnessStrength:undefined)??imageMaterial.strength):0,foregroundAlpha:imageMaterial.kind==='lightness-map-v1'?(rgba?rgba[3]/255:imageMaterial.foregroundAlpha):imageMaterial.kind==='color-stamp-v1'?imageMaterial.foregroundOpacity:1}:undefined
            const spatialContext=this.options.sourceMaterial??(texture?.context.version===8?texture.context:undefined)
            const provider=d.role==='mask'?spatialContext?.sourceColorFields?.mask:spatialContext?.sourceColorFields?.primary
            let view=group.views[0]
            if(imageMaterial?.kind==='gradient-map-v1'&&imageMaterial.application==='plain-gradient'){
              if(provider||!this.tipGradientRoot)throw new TypeError('Tip gradient source/provider changed');
              view=this.maskParticipant.materializeTipGradient(view,this.tipGradientRoot.view,frame);
            }else if(imageMaterial?.kind==='gradient-map-v1'&&!provider)throw new TypeError('Gradient tip spatial provider missing');
            if(provider){
              const fieldDraw=d.sourceColorField;if(!fieldDraw)throw new TypeError('Recorded spatial field parameters required')
              let field:import('./TransformedMaskPrepass').TransformedMaskSource|undefined
              if(provider.kind!=='total-random-rgb8-hash-v1'){
                const resource=provider.resource,bank=this.options.bank
                if(!bank)throw new Error('Spatial pattern root unavailable')
                const slot=d.role==='mask'?1:0
                const binding=bank.preparedResources().find(r=>r.canonical?.index===0&&r.canonical.sourceSlot===slot&&r.canonical.asset.id===resource.alphaAsset&&r.canonical.asset.size===resource.size&&r.canonical.asset.x===resource.x&&r.canonical.asset.y===resource.y&&r.canonical.asset.width===resource.width&&r.canonical.asset.height===resource.height&&r.canonical.imageMaterial?.kind==='color-stamp-v1'&&r.canonical.imageMaterial.channels.every((a,i)=>a.id===resource.channels[i]))
                if(!binding)throw new Error('Original spatial pattern binding missing')
                field=bank.resources().find(r=>r.key===binding.key);if(!field)throw new Error('Spatial pattern residency missing')
              }
              view=this.maskParticipant.materializeSpatial(view,{provider,draw:fieldDraw,field,material:materialControl},frame)
            }
            const imageControl=view.spatialRGBA?{kind:'color-stamp-v1' as const,strength:0,foregroundAlpha:1}:view.materialRGBA?{kind:'gradient-map-v1' as const,strength:0,foregroundAlpha:1}:materialControl
            const source=roleTexture?{kind:'primaryGrainMaskRgb' as const,view,rgb:pigment,pattern:roleTexture.view,pin:roleTexture.pin,...roleTexture.pin.law==='pixel-color-texture-v1'?{textureColorStrength:work.textureColorStrengths![d.frameDrawIndex],gradient:roleTexture.gradient}:{strengthU8:work.textureStrengths![d.frameDrawIndex]},imageMaterial:imageControl}:(work.textureStrengths||work.textureColorStrengths)&&texture?texture.context.version===8?{kind:'primaryGrainMaskRgb' as const,view,rgb:pigment,pattern:texture.view,pin:texture.context.primaryTexture,...(work.textureColorStrengths?{textureColorStrength:work.textureColorStrengths[d.frameDrawIndex],gradient:texture.gradient}:{strengthU8:work.textureStrengths![d.frameDrawIndex]}),imageMaterial:imageControl}:{kind:'texturedMaskRgb' as const,view,rgb:pigment,pattern:texture.view,pin:texture.context.primaryTexture,strengthU8:work.textureStrengths![d.frameDrawIndex]}:materialControl&&!view.spatialRGBA&&!view.materialRGBA?{kind:'imageMaterialRgba' as const,view,rgb:pigment,material:materialControl.kind,strength:materialControl.strength,foregroundAlpha:materialControl.foregroundAlpha}:{kind:'maskRgb' as const,view,rgb:d.role==='mask'?[255,255,255] as const:pigment}
            if((work.textureStrengths||work.textureColorStrengths)&&!texture&&!this.options.sourceMaterial?.roleTextures)throw new Error('Canonical texture root retired before paint')
            this.options.composite.drawSource({ source:{...source,pigmentAlphaU8:rgba?.[3]}, target: output, operation, writeBounds: task.writeBounds }, frame)
            work.draw = task.draw; work.tiles = task.tiles; work.tile = task.tile; work.paintPart=task.part+1;
            if(work.paintPart===task.parts){
              work.paintPart=0;work.tile++;
              if (work.tile === task.tiles.length) { work.draw++; work.tile = 0; work.tiles = undefined }
            }
          } finally { group.release() }
          if(!this.options.maskedSource&&task.wash&&this.options.washMode==='deposition-only')this.options.changed(work.input.layerId,task.writeBounds)
          if (!this.options.maskedSource&&!task.wash) {
            layer.markContentPainted(task.writeBounds)
            this.options.changed(work.input.layerId)
          }
          if (frame.shouldYield || performance.now()-turnStarted>=4) break
        }
      })
    } finally { for (const release of stagingReleases.reverse()) release() }
  }

  private resolveTile(layer: TiledLayerBuffer, t: TilePosition): PaintTarget {
    const targets = layer.resolveForPaint(rect(t))
    const target = targets.find(p => p.originX === t.x && p.originY === t.y && p.buffer.width === t.width && p.buffer.height === t.height)
    if (!target) throw new Error('Canonical tile geometry changed')
    return target
  }

  private washTile(position: TilePosition): WashTile {
    const existing = this.washes.get(key(position))
    if (existing) return existing
    if (this.washes.size >= 64) throw new RangeError('Canonical wash exceeds bounded tile count')
    if (!this.admittedTiles.has(key(position))) throw new Error('Canonical wash tile was not admitted')
    throw new Error('Canonical wash physical preparation incomplete')
  }

  private scratchTarget(buffer: AccumulationBuffer, t: TilePosition, lifetime: CanonicalOwnedRgba8Target['lifetime']): CanonicalOwnedRgba8Target {
    return { brand: 'canonical-straight-rgba8-v1', texture: buffer.texture, framebuffer: buffer.fbo,
      width: t.width, height: t.height, originX: t.x, originY: t.y,
      lifetime }
  }

  private present(work: Work, layer: TiledLayerBuffer, turn: BrushGlTurn, turnStarted:number): void {
    if (!work.result.commands.length) return
    work.presentTiles ??= [...this.washes.values()]
    const command = work.result.commands[0]
    if (command.kind === 'beginWash') throw new Error('Unexpected queued wash initialization')
    const tasks: { tile: WashTile; index: number; part: number; columns: number; rows: number; target: PaintTarget }[] = []
    const releases: (() => void)[] = []
    try {
      let index = work.present, part = work.part
      while (tasks.length < 8 && index < work.presentTiles.length) {
        if(tasks.length && performance.now()-turnStarted>=4)break
        const tile = work.presentTiles[index]
        const columns = Math.ceil(tile.width / this.compositeCapacity.width), rows = Math.ceil(tile.height / this.compositeCapacity.height)
        const target = this.resolveTile(layer, tile)
        releases.push(layer.retainTargets([target]))
        tasks.push({ tile, index, part, columns, rows, target })
        if (++part === rows * columns) { part = 0; index++ }
      }
      if (!tasks.length) return
      const bound = bindCanonicalLayerTargets(layer, tasks.map(t => t.target))
      runBrushGlBatch({ turn, participants: [this.maskParticipant, this.options.composite], owners: [...this.primaryTexture?.gradient?[canonicalPatternResourceLifetime(this.primaryTexture.gradient,this.options.composite.brushGlBatchInfo(),this.primaryTexture.root)]:[],bound[0].lifetime, ...tasks.map(t => t.tile.lifetime)] }, frame => {
        for (let i = 0; i < tasks.length; i++) {
          if (this.currentLayer(work) !== layer) throw new Error('Canonical layer changed during batch')
          const task = tasks[i], tile = task.tile
          const x = task.part % task.columns * this.compositeCapacity.width, y = Math.floor(task.part / task.columns) * this.compositeCapacity.height
          const w = Math.min(this.compositeCapacity.width, tile.width - x), h = Math.min(this.compositeCapacity.height, tile.height - y)
          const original = this.scratchTarget(tile.original!, tile, tile.lifetime)
          const view: CanonicalRgba8SourceView = { brand: 'canonical-straight-rgba8-view-v1', texture: tile.local.texture,
            textureWidth: tile.width, textureHeight: tile.height, rect: { x: tile.x + x, y: tile.y + y, width: w, height: h },
            bounds: { x: x / tile.width, y: (tile.height - y - h) / tile.height, width: w / tile.width, height: h / tile.height },
            mirror: { horizontal: false, vertical: false }, rowOrder: 'bottomAtV0', residency: tile.lifetime }
          this.options.composite.drawSource({ source: { kind: 'straightRgba8', view }, target: bound[i], readDestination: original,
            operation: canonicalWashOuterOperation(this.options.rasterProfile, command.blend, command.opacity), writeBounds: this.options.pageBounds ?? undefined }, frame)
          work.present = task.index; work.part = task.part + 1
          if (work.part === task.rows * task.columns) { work.part = 0; work.present++ }
          layer.markContentPainted(rect(tile)); this.options.changed(work.input.layerId)
          if (frame.shouldYield || performance.now()-turnStarted>=4) break
        }
      })
    } finally { for (const release of releases.reverse()) release() }
  }

  private overOperation(opacity: number) {
    return canonicalWashOuterOperation(this.options.rasterProfile, 'over', opacity)
  }

  private finish(work: Work): void {
    if(this.options.maskedSource&&(work.segment??0)<(work.result.segments?.length??0))return
    this.queue.shift();
    let failed=false,failure:unknown
    for(const release of [()=>work.physical?.close(),()=>work.dualAcquisition?.close(),work.releaseMetadata])try{release()}catch(error){if(!failed){failed=true;failure=error}}
    if(failed)throw failure
    this.finishGesture(work.result.state)
  }

  private finishGesture(state: SourcePrimaryCompositionState): void {
    if (state.ended) {
      if(this.options.sourceMaterial&&this.candidateReplay)this.candidateTerminal=true
      const before = this.cleanupErrors.length
      if(this.gesture)this.gesture.densityStrokeIdentity=undefined
      const maskProgram=this.maskSoftProgram;this.maskSoftProgram=undefined;if(maskProgram)this.cleanup(()=>maskProgram.retire())
      if (this.options.washMode === 'deposition-only') this.rawComplete = true
      else this.releaseWashes()
      if(this.options.washMode==='deposition-only')this.cleanup(()=>this.maskParticipant.releaseOwner(this))
      else if(this.advancing)this.retireMaskAfterTurn=true
      else this.retireMaskCapacity()
      this.gesture = undefined; this.planned = undefined
      if(this.advancing)this.retireTextureAfterTurn=true
      else this.retirePrimaryTexture()
      if (this.cleanupErrors.length > before) throw this.cleanupErrors[before]
    }
  }

  /** Terminal resource retirement of an exactly completed OPEN hidden prefix.
   * No END/close/seal or checkpoint/read authority is manufactured. */
  retireRenderedPrefix(expected:{readonly gestureId:string;readonly layerId:string;readonly layerEpoch:number;readonly nextFrameOrdinal:number}):void {
    this.retireRenderedPrefixOwned(expected)
  }
  takeRenderedPrefix(expected:{readonly gestureId:string;readonly layerId:string;readonly layerEpoch:number;readonly nextFrameOrdinal:number},precharged:CanonicalRenderedPrefixCursor7):CanonicalRenderedPrefixCursor7 {
    const cursor=this.retireRenderedPrefixOwned(expected,precharged)
    if(!cursor)throw Error('Rendered prefix cursor was not captured')
    return cursor
  }
  private retireRenderedPrefixOwned(expected:{readonly gestureId:string;readonly layerId:string;readonly layerEpoch:number;readonly nextFrameOrdinal:number},precharged?:CanonicalRenderedPrefixCursor7):CanonicalRenderedPrefixCursor7|undefined {
    const capture=precharged!==undefined
    if(this.candidateReceiver!==this||!this.candidateReplay||this.candidateTerminal||this.failed
      ||this.sourceRetired||this.advancing||this.rawOwner.leases||this.cleanupErrors.length
      ||this.queue.length||this.frontierPending||this.frontierReleases.size
      ||this.retireMaskAfterTurn||this.retireTextureAfterTurn)throw new Error('Rendered OPEN prefix retirement unavailable')
    this.advancing=true // Before descriptor traps or any resource/layer callback.
    let retainedMetadata:(()=>void)|undefined
    try {
      const gesture=this.gesture,planned=this.planned,mask=this.maskLease,texture=this.primaryTexture,soft=this.softProgram
      if(!gesture||!planned||planned.ended||!mask||(!this.options.sourceMaterial&&(!texture||(texture.context.version!==7&&texture.context.version!==8))))
        throw new Error('Native rendered OPEN prefix required')
      if(!expected||typeof expected!=='object'||Array.isArray(expected))throw new TypeError('Closed rendered prefix identity required')
      const prototype=Object.getPrototypeOf(expected),keys=Reflect.ownKeys(expected)
      if((prototype!==Object.prototype&&prototype!==null)||keys.length!==4
        ||keys.some(key=>key!=='gestureId'&&key!=='layerId'&&key!=='layerEpoch'&&key!=='nextFrameOrdinal'))
        throw new TypeError('Closed rendered prefix identity required')
      const field=(name:string):unknown=>{
        const descriptor=expected&&Object.getOwnPropertyDescriptor(expected,name)
        if(!descriptor||!Object.hasOwn(descriptor,'value'))throw new TypeError('Own rendered prefix identity required')
        return descriptor.value
      }
      if(field('gestureId')!==gesture.id||field('layerId')!==gesture.layerId
        ||field('layerEpoch')!==gesture.epoch||field('nextFrameOrdinal')!==planned.nextFrameOrdinal)
        throw new Error('Rendered OPEN prefix identity mismatch')
      mask.assertMutationIdle();this.options.composite.assertMutationIdle(this.compositeCapacity.epoch)
      this.assertPrepared()
      const resourceInfo=this.options.composite.brushGlBatchInfo()
      const layer=this.options.layer(gesture.layerId)
      if(layer.buffer!==gesture.buffer||layer.epoch!==gesture.epoch||layer.buffer.pixelEncoding!=='straight-rgba8')
        throw new Error('Rendered OPEN prefix layer changed')
      if(this.gl.isContextLost())throw new Error('Rendered OPEN prefix context lost')
      // Revalidate the same root after the final layer/context callbacks.
      if(texture)assertCanonicalPatternResourceCurrent(texture.view,resourceInfo,texture.root)
      else if(this.options.sourceLease&&!this.options.sourceLease.isReady())throw new Error('Masked OPEN source retired')
      // Callbacks above may invalidate owners. The two idle checks are pure.
      mask.assertMutationIdle();this.options.composite.assertMutationIdle(this.compositeCapacity.epoch)
      if(this.candidateTerminal||this.failed||this.sourceRetired||!this.advancing||this.cleanupErrors.length
        ||this.queue.length||this.rawOwner.leases||this.frontierPending||this.frontierReleases.size
        ||this.retireMaskAfterTurn||this.retireTextureAfterTurn||this.gesture!==gesture||this.planned!==planned
        ||this.maskLease!==mask||this.primaryTexture!==texture||this.softProgram!==soft)
        throw new Error('Rendered OPEN prefix owner changed')
      let captured:RenderedPrefixState|undefined
      if(capture){
        if(!texture||(texture.context.version!==7&&texture.context.version!==8))throw Error('Only replay7/8 sources issue rendered-tail cursors')
        const charge=renderedPrefixStates7.get(precharged!)
        if(!charge||charge.data||charge.releaseMetadata||charge.cpu!==this.maskParticipant.brushGlBatchInfo().cpu)throw Error('Rendered cursor precharge unavailable')
        this.assertPrepared()
        const next=this.options.layer(gesture.layerId)
        assertCanonicalPatternResourceCurrent(texture.view,resourceInfo,texture.root)
        mask.assertMutationIdle();this.options.composite.assertMutationIdle(this.compositeCapacity.epoch)
        if(renderedPrefixStates7.get(precharged!)!==charge||next.buffer!==gesture.buffer||next.epoch!==gesture.epoch||this.gesture!==gesture||this.planned!==planned||this.primaryTexture!==texture||this.maskLease!==mask||this.softProgram!==soft||this.failed||this.sourceRetired||this.candidateTerminal||this.queue.length||this.cleanupErrors.length)throw Error('Rendered cursor capture changed')
        captured=Object.freeze({context:texture.context,state:planned,gesture:Object.freeze({id:gesture.id,layerId:gesture.layerId,epoch:gesture.epoch,rgb:Object.freeze([gesture.rgb[0],gesture.rgb[1],gesture.rgb[2]] as const),profile:gesture.profile}),rasterProfile:this.options.rasterProfile,gl:this.gl,prepass:this.options.prepass,composite:this.options.composite,maskEpoch:this.maskCapacity.epoch,compositeEpoch:this.compositeCapacity.epoch,oldBuffer:gesture.buffer})
        retainedMetadata=texture.releaseMetadata
      }
      // Terminal and detached before cleanup callbacks. Source DATA remains
      // charged by its existing transferred metadata reservation if captured.
      this.candidateTerminal=true;this.sourceRetired=true
      this.gesture=undefined;this.planned=undefined;this.softProgram=undefined
      const before=this.cleanupErrors.length
      this.releaseWashes()
      const maskProgram=this.maskSoftProgram;this.maskSoftProgram=undefined;if(maskProgram)this.cleanup(()=>maskProgram.retire())
      this.retireMaskCapacity()
      if(soft&&this.ownsSoftProgram)this.cleanup(()=>soft.retire())
      this.retirePrimaryTexture(false,capture)
      if(this.cleanupErrors.length>before){
        const primary=this.cleanupErrors[before]
        this.failed=true
        this.cleanup(()=>this.options.poison(gesture.layerId,primary))
        throw primary
      }
      if(captured){
        const charge=renderedPrefixStates7.get(precharged!)
        if(!charge||charge.data||charge.releaseMetadata)throw Error('Rendered cursor precharge retired during cleanup')
        charge.data=captured;charge.releaseMetadata=retainedMetadata;retainedMetadata=undefined
        return precharged
      }
    } catch(primary){
      if(retainedMetadata&&this.primaryTexture?.releaseMetadata===retainedMetadata)retainedMetadata=undefined
      if(retainedMetadata)this.cleanup(retainedMetadata)
      throw primary
    } finally {this.advancing=false}
  }

  /** Restores only an executor-issued completed cursor into a NEW normal
   * hidden target. No source/frame/recipe authority is minted by this token. */
  resumeRenderedPrefix(cursor:CanonicalRenderedPrefixCursor7):void {
    if(this.candidateReceiver!==this||!this.candidateReplay||this.candidateTerminal||this.failed||this.sourceRetired||this.advancing||this.gesture||this.planned||this.queue.length||this.rawOwner.leases||this.cleanupErrors.length)throw Error('Rendered cursor destination busy')
    this.advancing=true
    try{
      const charge=renderedPrefixStates7.get(cursor),captured=charge?.data,texture=this.primaryTexture,mask=this.maskLease
      if(!captured||!texture||(texture.context.version!==7&&texture.context.version!==8)||!mask||captured.gl!==this.gl||captured.prepass!==this.options.prepass||captured.composite!==this.options.composite||captured.rasterProfile!==this.options.rasterProfile||captured.maskEpoch!==this.maskCapacity.epoch||captured.compositeEpoch!==this.compositeCapacity.epoch||!canonicalSoftAutoDataEqual(texture.context,captured.context))throw Error('Rendered cursor source mismatch')
      this.assertPrepared()
      const layer=this.options.layer(captured.gesture.layerId)
      assertCanonicalPatternResourceCurrent(texture.view,this.options.composite.brushGlBatchInfo(),texture.root)
      mask.assertMutationIdle();this.options.composite.assertMutationIdle(this.compositeCapacity.epoch)
      if(layer.buffer===captured.oldBuffer||layer.epoch!==captured.gesture.epoch||layer.buffer.pixelEncoding!=='straight-rgba8'||renderedPrefixStates7.get(cursor)!==charge||charge?.data!==captured||this.gesture||this.planned||this.primaryTexture!==texture||this.maskLease!==mask||this.failed||this.sourceRetired||this.candidateTerminal||this.queue.length||this.cleanupErrors.length)throw Error('Rendered cursor target changed')
      this.gesture={...captured.gesture,buffer:layer.buffer,rgb:[captured.gesture.rgb[0],captured.gesture.rgb[1],captured.gesture.rgb[2]]}
      this.planned=captured.state
    }finally{this.advancing=false}
  }

  /** Cancel after ANY accepted work requires trusted rebuild, even if this
   * particular turn had not yet written: earlier preview may already be visible. */
  cancel(reason: unknown = new Error('Canonical execution cancelled'), options: { lost?: boolean } = {}): void {
    if (options.lost && !this.gl.isContextLost()) throw new Error('Cannot forget canonical resources on a live context')
    if (this.advancing || this.rawOwner.leases) throw new Error('Cannot cancel inside a canonical GL batch')
    const before = this.cleanupErrors.length
    if(this.options.replayFrontier){this.failed=true;this.retireFrontierAdmissions()}
    this.retireSoftProgram()
    if (this.gesture || this.pending || (this.washes.size && !this.rawTransferred)) {
      this.fail(reason, options.lost ?? this.cleanupContextLost())
    }
    this.retireMaskCapacity()
    this.retirePrimaryTexture(options.lost??false)
    if (this.cleanupErrors.length > before) throw this.cleanupErrors[before]
  }

  private retireFrontierAdmissions():void {
    this.frontierGeneration++
    const releases=[...this.frontierReleases];this.frontierReleases.clear();this.frontierPending=undefined
    const preparing=this.frontierPreparing;this.frontierPreparing=true
    try{for(const release of releases)this.cleanup(release)}finally{this.frontierPreparing=preparing}
  }
  private fail(reason: unknown, lost = false): void {
    if(this.options.replayFrontier){this.failed=true;this.retireFrontierAdmissions()}
    const layerId = this.gesture?.layerId ?? this.washLayerId, pending = this.queue.splice(0)
    this.failed = true
    // Detach cursor ownership before invoking arbitrary notification/release
    // callbacks. Reentrancy can never release one reservation a second time.
    this.gesture = undefined; this.planned = undefined
    // Storage pins must be gone before the poison callback can undo/clear the
    // authoritative layer. Draw leases were already released synchronously.
    for(const work of pending){this.cleanup(()=>work.physical?.close({lost}));this.cleanup(()=>work.dualAcquisition?.close());if(work.dualPartial&&!lost)this.cleanup(()=>this.options.scratch.release(work.dualPartial!));if(work.dualPartialMask&&!lost)this.cleanup(()=>this.options.scratch.release(work.dualPartialMask!))}
    if (layerId) this.cleanup(() => this.options.poison(layerId, reason))
    for (const work of pending)this.cleanup(work.releaseMetadata)
    this.releaseWashes(lost)
    this.retireMaskCapacity()
    this.retireSoftProgram()
    this.retirePrimaryTexture(lost)
  }

  private retireRoleTextures(lost=false):void {
    const tip=this.tipGradientRoot,tipRelease=this.tipGradientMetadataRelease;this.tipGradientRoot=undefined;this.tipGradientMetadataRelease=undefined;
    if(tip){this.sourceRetired=true;this.cleanup(()=>tip.root.release(lost))}if(tipRelease)this.cleanup(tipRelease);

    const source=this.roleTextures,release=this.roleTextureMetadataRelease;this.roleTextures=undefined;this.roleTextureMetadataRelease=undefined
    if(source){this.sourceRetired=true;this.cleanup(()=>source.root.release(lost))}if(release)this.cleanup(release)
  }
  private retirePrimaryTexture(lost=false,retainMetadata=false):void {
    this.retireRoleTextures(lost)
    const source=this.primaryTexture;this.primaryTexture=undefined;this.replaySourceRead=undefined;issuedReplaySourceReads.delete(this);this.retireTextureAfterTurn=false
    if(!source)return
    this.sourceRetired=true
    this.cleanup(()=>source.root.release(lost));if(!retainMetadata)this.cleanup(source.releaseMetadata)
  }

  private retireSoftProgram():void {
    const mask=this.maskSoftProgram;this.maskSoftProgram=undefined;if(mask)this.cleanup(()=>mask.retire())
    if(!this.softProgram)return
    this.sourceRetired=true
    if(this.ownsSoftProgram)this.cleanup(()=>this.softProgram!.retire())
  }

  private rawLifetime(local:AccumulationBuffer,position:TilePosition,original?:AccumulationBuffer): CanonicalOwnedRgba8Target['lifetime'] {
    return createCanonicalRawLifetime(this.gl,this.rawOwner,local,position,original)
  }

  rawWashTiles(): readonly CanonicalWashLocalTile[] {
    if (this.options.washMode !== 'deposition-only' || this.rawTransferred || this.failed) throw new Error('Raw wash ownership unavailable')
    return Object.freeze([...this.washes.values()].map(t => Object.freeze({
      x: t.x, y: t.y, width: t.width, height: t.height,
      view: Object.freeze({
        brand: 'canonical-straight-rgba8-view-v1' as const, texture: t.local.texture, textureWidth: t.width, textureHeight: t.height,
        rect: Object.freeze({ x: t.x, y: t.y, width: t.width, height: t.height }),
        bounds: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
        mirror: Object.freeze({ horizontal: false, vertical: false }), rowOrder: 'bottomAtV0' as const, residency: t.lifetime,
      }),
    })))
  }

  /** Transfers pool + reservation ownership exactly once, never GL leases. */
  takeRawWash(): CanonicalWashOwnership {
    if (!this.rawWashSealed || this.pending || this.rawOwner.leases) throw new Error('Raw wash is not sealed or is leased')
    const dual=[...this.dualTiles.values()]
    const tiles = this.rawWashTiles(), owned = [...this.washes.values()], releases = [...this.admissionReleases], owner = this.rawOwner
    this.washes.clear(); this.dualTiles.clear();this.dualAdmitted.clear();this.admittedTiles.clear(); this.admissionReleases.clear(); this.rawTransferred = true
    let retainedMask=this.maskLease;this.maskLease=undefined
    let alive = true
    return Object.freeze({ tiles, release: (options: { lost?: boolean } = {}) => {
      if (!alive) return
      if (options.lost && !this.gl.isContextLost()) throw new Error('Cannot forget raw wash on live context')
      if (owner.leases) throw new Error('Raw wash still leased')
      const lost = options.lost ?? this.cleanupContextLost()
      alive = false; owner.alive = false
      const maskLease=retainedMask;retainedMask=undefined
      const errors: unknown[] = []
      const clean = (f: () => void) => { try { f() } catch (e) { errors.push(e) } }
      for(const t of dual)if(!lost){clean(()=>this.options.scratch.release(t.primary));clean(()=>this.options.scratch.release(t.mask))}
      for (const t of owned) if (!lost) clean(() => this.options.scratch.release(t.local))
      for (const release of releases) clean(release)
      clean(()=>maskLease?.releaseOwner(this));clean(()=>maskLease?.release())
      if (errors.length) throw errors[0]
    } })
  }

  /** Cleanup status is advisory. A failing probe cannot replace the primary
   * error or strand plan/pool ownership. Loss grants and hot leases stay strict. */
  private cleanupContextLost():boolean {
    try{return this.gl.isContextLost()}catch(error){this.cleanupErrors.push(error);return false}
  }

  private cleanup(action: () => void): void {
    try { action() } catch (error) { this.cleanupErrors.push(error) }
  }

  private releaseWashes(lost = false): void {
    const dual=[...this.dualTiles.values()];this.dualTiles.clear();this.dualAdmitted.clear()
    for(const t of dual)if(!lost){this.cleanup(()=>this.options.scratch.release(t.primary));this.cleanup(()=>this.options.scratch.release(t.mask))}

    const tiles = [...this.washes.values()], releases = [...this.admissionReleases]
    this.rawOwner.alive = false
    this.washes.clear(); this.admittedTiles.clear(); this.admissionReleases.clear()
    for (const tile of tiles) {
      // Lost handles are forgotten by the caller's ONE global pool.forget(),
      // after cancelling every owner, before recreating the context.
      if (!lost) {
        this.cleanup(() => this.options.scratch.release(tile.local))
        if(tile.original)this.cleanup(() => this.options.scratch.release(tile.original!))
      }
    }
    for (const release of releases) this.cleanup(release)
  }
}
