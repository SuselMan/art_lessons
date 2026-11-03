import {CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,canonicalSourceMaterialContext,canonicalMaskedSourceMaterialContext} from '@grafetto/shared'
import {canonicalPrimaryGrainMaterialContext,decodeCanonicalPrimaryGrainStrokeFrame,type CanonicalMaterialContextV8,type CanonicalMaterialFrameV8} from '@grafetto/shared'
import { createHash } from 'node:crypto'
import { canonicalTexturedAutoMaterialContext,decodeCanonicalTexturedAutoStrokeFrame,type CanonicalMaterialContextV7,type CanonicalMaterialFrameV7,canonicalSoftNativeDefaultTexturedSourceMaterialContext,type CanonicalMaterialContextV6,type CanonicalMaterialFrameV6,canonicalPressureTexturedSourceMaterialContext,type CanonicalMaterialContextV5,type CanonicalMaterialFrameV5,canonicalTexturedSourceMaterialContext,canonicalStrokeRasterContract,canonicalStrokeCoverageMatches,canonicalPrimaryTextureMaterialContext,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,type CanonicalMaterialContextV4,type CanonicalMaterialFrameV4,type CanonicalMaterialContextV3,type CanonicalMaterialFrameV3,canonicalImageMaterialPin,advanceCanonicalMaterialPrefix, CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_RASTER_CONTRACTS,type CanonicalStrokeRasterProfile, STRAIGHT_ROOM_RASTER_VERSION, decodeCanonicalStrokeFrame, canonicalDefaultAutoSourcePin, canonicalGaussianAutoSourcePin, canonicalSoftAutoSourcePin,
  type CanonicalMaterialContext, type AnyCanonicalMaterialContext, type CanonicalMaterialEntry, type AnyCanonicalMaterialFrame,
  type CanonicalRecordedCloseSeal,type CanonicalStrokeComposition, type CanonicalStrokeFrameEnvelope } from '@grafetto/shared'

export interface CanonicalAdmissionIdentity { readonly roomId: string; readonly userId: string }
/** Server-owned policy result, NEVER deserialized from a socket payload.
 * The resolver must use the authoritative pixel-owning board, permissions,
 * immutable descriptor revision and verified CAS metadata. sourceStamp presence
 * and a client's profile name are NOT an authorization. */
export type CanonicalTrustedMaterialContext=CanonicalMaterialContextV8|CanonicalMaterialContextV7|AnyCanonicalMaterialContext|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5|CanonicalMaterialContextV6
export interface TrustedCanonicalGesture {
  readonly roomId: string
  readonly userId: string
  readonly layerId: string
  readonly boardEpoch: number
  readonly roomRasterVersion: typeof STRAIGHT_ROOM_RASTER_VERSION
  readonly rasterProfile: CanonicalStrokeRasterProfile
  readonly descriptorSha256: string
  readonly brush: string
  readonly strokeId: string
  readonly pigmentRgb8: readonly [number, number, number]
  readonly composition: CanonicalStrokeComposition
  /** Server-owned mechanism marker, never a wire/source authority field. */
  readonly plainAutoGeometry?:'plain-auto-tilt-v1'|'dynamic-auto-geometry-v1'
  readonly material: CanonicalTrustedMaterialContext
}
/** One typed decoder seam used by live, record, durable retry and hydration. */
export function decodeTrustedCanonicalFrame(value:unknown,grant:TrustedCanonicalGesture,ordinal:number){
  const material=grant.material,common={rasterProfile:grant.rasterProfile,brush:grant.brush,strokeId:grant.strokeId,frameOrdinal:ordinal,pigmentRgb8:grant.pigmentRgb8,composition:grant.composition}
  if('version'in material&&material.version===8){
    const c=canonicalPrimaryGrainMaterialContext(material),pin=c.primarySource
    if((grant.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE&&grant.rasterProfile!==CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)||c.primaryTexture.law==='hard-multiply-u8-native-v1'&&(grant.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||grant.composition.mode!=='buildup'||grant.composition.outerBlend!=='over')||pin.kind!=='image'&&!canonicalStrokeCoverageMatches(grant.rasterProfile,pin.coverageProfile))fail('material8 raster/composition mismatch')
    return decodeCanonicalPrimaryGrainStrokeFrame(value,{...common,rasterProfile:grant.rasterProfile,materialVersion:8,material})
  }
  if('version'in material&&material.version===7){
    const contract=canonicalStrokeRasterContract(grant.rasterProfile)
    if(!contract.genericSC||!canonicalStrokeCoverageMatches(grant.rasterProfile,material.primarySource.coverageProfile)||!(grant.composition.mode==='wash'||grant.composition.mode==='buildup'&&grant.composition.outerBlend==='over'))fail('material7 raster/composition mismatch')
    return decodeCanonicalTexturedAutoStrokeFrame(value,{...common,rasterProfile:contract.profile,materialVersion:7,material})
  }
  if('version'in material&&material.version===6){
    const contract=canonicalStrokeRasterContract(grant.rasterProfile)
    if(!contract.genericSC||!canonicalStrokeCoverageMatches(grant.rasterProfile,material.primarySource.coverageProfile))fail('material6 raster mismatch')
    return decodeCanonicalStrokeFrame(value,{...common,rasterProfile:contract.profile,materialVersion:6,material})
  }
  if('version'in material&&material.version===5){
    const contract=canonicalStrokeRasterContract(grant.rasterProfile)
    if(!contract.genericSC||!canonicalStrokeCoverageMatches(grant.rasterProfile,material.primarySource.coverageProfile))fail('material5 raster mismatch')
    return decodeCanonicalStrokeFrame(value,{...common,rasterProfile:contract.profile,materialVersion:5,material})
  }
  if('version'in material&&material.version===4){
    const contract=canonicalStrokeRasterContract(grant.rasterProfile)
    if(!contract.genericSC||!canonicalStrokeCoverageMatches(grant.rasterProfile,material.primarySource.coverageProfile))fail('material4 raster mismatch')
    return decodeCanonicalStrokeFrame(value,{...common,rasterProfile:contract.profile,materialVersion:4,material})
  }
  if('version'in material&&material.version===3){if(grant.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)fail('material3 raster mismatch');return decodeCanonicalStrokeFrame(value,{...common,rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,materialVersion:3,material})}
  const decoded='version' in material?decodeCanonicalStrokeFrame(value,{...common,material}):decodeCanonicalStrokeFrame(value,{...common,material})
  if(grant.plainAutoGeometry){
    if(!('version'in material)||material.version!==2||material.primarySource.kind==='image'||!canonicalStrokeRasterContract(grant.rasterProfile).genericSC)fail('plain Auto geometry grant mismatch')
    if(grant.plainAutoGeometry==='dynamic-auto-geometry-v1')assertCanonicalDynamicAutoGeometryFrame(decoded.frame)
    else{if(grant.plainAutoGeometry!=='plain-auto-tilt-v1'||material.primarySource.kind!=='defaultAuto'||grant.composition.mode!=='wash')fail('plain-tilt grant mismatch');assertCanonicalPlainAutoGeometryFrame(decoded.frame)}
  }
  return decoded
}
export type CanonicalCapabilityResolver = (identity: CanonicalAdmissionIdentity, selector: { readonly layerId: string; readonly brush: string; readonly strokeId: string }) => TrustedCanonicalGesture | undefined
export type CanonicalFrameCandidate = {
  readonly type: 'canonical_stroke'; readonly id: string; readonly layerId: string; readonly frame: CanonicalStrokeFrameEnvelope
} | {
  readonly type: 'canonical_stroke_live'; readonly layerId: string; readonly frame: CanonicalStrokeFrameEnvelope
}
export interface AcceptedCanonicalFrame {
  readonly identity: CanonicalAdmissionIdentity
  readonly candidate: CanonicalFrameCandidate
  readonly decoded: CanonicalMaterialFrameV8|CanonicalMaterialFrameV7|AnyCanonicalMaterialFrame|CanonicalMaterialFrameV3|CanonicalMaterialFrameV4|CanonicalMaterialFrameV5|CanonicalMaterialFrameV6
  readonly descriptorSha256: string
  readonly boardEpoch: number
}
interface Fingerprint { hash: string; operationId?: string; live: boolean; recorded: boolean }
interface Gesture {
  signature: string
  preflight: CanonicalMaterialContext['preflightDefinition']|undefined
  liveNext: number
  recordedNext: number
  uniqueNext: number
  entry: CanonicalMaterialEntry
  lastGroup: number
  ended: boolean
  recordedEnded: boolean
  recordedSealNext?:number
  fingerprints: Map<number, Fingerprint>
}
export interface CanonicalRecordedCloseTicket {
 readonly seal:Readonly<CanonicalRecordedCloseSeal>
 readonly commit:(this:CanonicalRecordedCloseTicket)=>void
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.length && v.length <= 256 && !v.includes('\0')
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER
function fail(reason: string): never { throw new Error(`canonical admission: ${reason}`) }
const fields = (v: Record<string, unknown>, expected: readonly string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k))

/** Used by CanonicalRoomTransport with its concrete server-owned binder.
 * This is admission state, not a second log or a legacy authorization fallback. */
export class CanonicalStrokeAdmission {
  private readonly gestures = new Map<string, Gesture>()
  private revision = 0
  private readonly resolve: CanonicalCapabilityResolver
  private readonly maxGestures: number
  private readonly window: number

  constructor(options: {
    readonly resolve: CanonicalCapabilityResolver
    readonly maxGestures: number
    readonly retainedFrames: number
  }) {
    if (typeof options.resolve !== 'function' || !integer(options.maxGestures) || options.maxGestures < 1 || options.maxGestures > 1024
      || !integer(options.retainedFrames) || options.retainedFrames < 1 || options.retainedFrames > 8) fail('invalid bounded policy')
    this.resolve = options.resolve; this.maxGestures = options.maxGestures; this.window = options.retainedFrames
  }

  get size(): number { return this.gestures.size }
  cursor(identity: CanonicalAdmissionIdentity, strokeId: string): { readonly recordedNext: number; readonly liveNext: number; readonly ended: boolean } {
    const state = this.gestures.get(JSON.stringify([identity.roomId, identity.userId, strokeId]))
    return Object.freeze({ recordedNext: state?.recordedNext ?? 0, liveNext: state?.liveNext ?? 0, ended: state?.recordedEnded ?? false })
  }

  /** INTERNAL control over an existing session. Typed seal data is not source/
   * prefix authority: transport must first verify actual indexed prefix/context.
   * No target grant/session is created and no authored ordinal/fence is forged. */
  prepareRecordedClose(identity:CanonicalAdmissionIdentity,strokeId:string,seal:CanonicalRecordedCloseSeal):CanonicalRecordedCloseTicket {
    if(!identity||!text(identity.roomId)||!text(identity.userId)||!text(strokeId)||!seal||typeof seal!=='object')fail('invalid recorded close')
    const {kind,closeOperationId,closeSeq,recordedNext,firstOperationId,lastOperationId,firstSeq,lastSeq}=seal
    if(kind!=='commitPartial'||!text(closeOperationId)||!integer(closeSeq)||closeSeq<1||!integer(recordedNext)||recordedNext<1
      ||!text(firstOperationId)||!text(lastOperationId)||!integer(firstSeq)||firstSeq<1||!integer(lastSeq)||lastSeq<firstSeq||closeSeq<=lastSeq
      ||closeOperationId===firstOperationId||closeOperationId===lastOperationId)fail('invalid recorded close')
    const key=JSON.stringify([identity.roomId,identity.userId,strokeId]),state=this.gestures.get(key)
    if(!state||state.recordedEnded||state.recordedSealNext!==undefined||state.recordedNext!==recordedNext
      ||state.fingerprints.get(recordedNext-1)?.operationId!==lastOperationId
      ||state.fingerprints.has(0)&&state.fingerprints.get(0)?.operationId!==firstOperationId)fail('missing or mismatched recorded close prefix')
    const copied=Object.freeze({kind,closeOperationId,closeSeq,recordedNext,firstOperationId,lastOperationId,firstSeq,lastSeq})
    const revision=this.revision
    let committed=false
    const commit=()=>{
      if(committed)return
      if(this.revision!==revision||this.gestures.get(key)!==state)fail('stale recorded close ticket')
      this.gestures.set(key,{...state,recordedEnded:true,recordedSealNext:recordedNext})
      this.revision++;committed=true
    }
    const ticket:CanonicalRecordedCloseTicket=Object.freeze({seal:copied,commit(this:CanonicalRecordedCloseTicket){
      if(this!==ticket)fail('copied or detached recorded close ticket')
      commit()
    }})
    return ticket
  }

  /** Recorded: prepare -> pin -> recordOperation(assign seq) -> commit -> ack/relay.
   * Live: prepare -> pin -> commit -> relay (skip duplicate tickets).
   * Do NOT await or invoke another prepare/commit between external effects and
   * commit. A failed pin/store leaves this ticket uncommitted and ordinals intact.
   * The existing durable operation-ID lookup must run BEFORE preparing a recorded
   * retry; no unbounded copy of operation history is retained here. */
  prepare(identity: CanonicalAdmissionIdentity, value: unknown): {
    readonly value: AcceptedCanonicalFrame
    readonly duplicate: boolean
    readonly commit: () => void
  } {
    if (!identity || !text(identity.roomId) || !text(identity.userId) || !record(value)
      || !['canonical_stroke', 'canonical_stroke_live'].includes(value.type as string) || !text(value.layerId)
      || !fields(value, value.type === 'canonical_stroke' ? ['type', 'id', 'layerId', 'frame'] : ['type', 'layerId', 'frame'])
      || value.type === 'canonical_stroke' && !text(value.id) || !record(value.frame)) fail('invalid discriminated candidate')
    const f = value.frame
    if (!text(f.brush) || !text(f.strokeId) || !integer(f.frameOrdinal)) fail('invalid frame selector')
    const layerId = value.layerId, brush = f.brush, strokeId = f.strokeId, ordinal = f.frameOrdinal
    const scope = Object.freeze({ roomId: identity.roomId, userId: identity.userId })
    const grant = this.resolve(scope, Object.freeze({ layerId, brush, strokeId }))
    if (!grant || grant.roomId !== scope.roomId || grant.userId !== scope.userId || grant.layerId !== layerId
      || grant.brush !== brush || grant.strokeId !== strokeId || !integer(grant.boardEpoch)
      || grant.roomRasterVersion !== STRAIGHT_ROOM_RASTER_VERSION || !CANONICAL_STROKE_RASTER_CONTRACTS.some(contract=>contract.profile===grant.rasterProfile)
      || !/^[0-9a-f]{64}$/.test(grant.descriptorSha256)) fail('trusted board/brush capability unavailable')
    if(!grant.material||!Array.isArray(grant.material.assets)||grant.material.assets.length>2048)fail('unsupported trusted material capability')
    const m=grant.material
    let preflight:CanonicalMaterialContext['preflightDefinition']|undefined,materialSignature:unknown,maskedSource2=false
    if('version'in m&&m.version===8){
      const c=canonicalPrimaryGrainMaterialContext(m),pin=c.primarySource
      if(!canonicalStrokeRasterContract(grant.rasterProfile).genericSC||pin.descriptorSha256!==grant.descriptorSha256||grant.brush!==`brush:${pin.descriptorId}@${pin.descriptorVersion}`||c.primaryTexture.law==='hard-multiply-u8-native-v1'&&(grant.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||grant.composition.mode!=='buildup'||grant.composition.outerBlend!=='over')||pin.kind!=='image'&&!canonicalStrokeCoverageMatches(grant.rasterProfile,pin.coverageProfile))fail('trusted material8 descriptor/raster/composition mismatch')
      materialSignature=c;preflight=undefined
    }else if('version'in m&&m.version===7){
      const c=canonicalTexturedAutoMaterialContext(m),pin=c.primarySource
      if(!canonicalStrokeRasterContract(grant.rasterProfile).genericSC||!canonicalStrokeCoverageMatches(grant.rasterProfile,pin.coverageProfile)
        ||pin.brushScale!==1||pin.descriptorSha256!==grant.descriptorSha256||grant.brush!==`brush:${pin.descriptorId}@${pin.descriptorVersion}`||!(grant.composition.mode==='wash'||grant.composition.mode==='buildup'&&grant.composition.outerBlend==='over'))fail('trusted material7 descriptor/raster/composition mismatch')
      materialSignature=c;preflight=undefined
    }else if('version'in m&&m.version===6){
      const c=canonicalSoftNativeDefaultTexturedSourceMaterialContext(m),pin=c.primarySource
      if(!canonicalStrokeRasterContract(grant.rasterProfile).genericSC||!canonicalStrokeCoverageMatches(grant.rasterProfile,pin.coverageProfile)
        ||pin.brushScale!==1||pin.descriptorSha256!==grant.descriptorSha256||grant.brush!==`brush:${pin.descriptorId}@${pin.descriptorVersion}`)fail('trusted material6 descriptor/raster mismatch')
      materialSignature=c;preflight=undefined
    }else if('version'in m&&m.version===5){
      const c=canonicalPressureTexturedSourceMaterialContext(m),pin=c.primarySource
      if(!canonicalStrokeRasterContract(grant.rasterProfile).genericSC||!canonicalStrokeCoverageMatches(grant.rasterProfile,pin.coverageProfile)
        ||pin.brushScale!==1||pin.descriptorSha256!==grant.descriptorSha256||grant.brush!==`brush:${pin.descriptorId}@${pin.descriptorVersion}`)fail('trusted material5 descriptor/raster mismatch')
      materialSignature=c;preflight=undefined
    }else if('version'in m&&m.version===4){
      const c=canonicalTexturedSourceMaterialContext(m),pin=c.primarySource
      if(!canonicalStrokeRasterContract(grant.rasterProfile).genericSC||!canonicalStrokeCoverageMatches(grant.rasterProfile,pin.coverageProfile)
        ||pin.brushScale!==1||pin.descriptorSha256!==grant.descriptorSha256||grant.brush!==`brush:${pin.descriptorId}@${pin.descriptorVersion}`)fail('trusted material4 descriptor/raster mismatch')
      materialSignature=c;preflight=undefined
    }else if('version'in m&&m.version===3){
      if(grant.rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)fail('unsupported trusted material3 profile')
      materialSignature=canonicalPrimaryTextureMaterialContext(m);preflight=undefined
    }else if('version'in m&&m.version===2&&!m.maskSource&&(m.outerCompositionLaw||m.materialParams||m.colorParams||m.imageFrameIndices||m.scaledSource||m.primarySource.kind==='image'&&m.primarySource.imageMaterial)){
      if(!canonicalStrokeRasterContract(grant.rasterProfile).genericSC)fail('extended Pixel source raster unavailable')
      materialSignature=canonicalSourceMaterialContext(m);preflight=undefined
    }else if('version'in m&&m.version===2&&m.maskSource){
      if(!canonicalStrokeRasterContract(grant.rasterProfile).genericSC)fail('masked Pixel raster unavailable')
      materialSignature=canonicalMaskedSourceMaterialContext(m);preflight=undefined;maskedSource2=true
    }else if('version' in m){
      if(Object.keys(m).some(k=>!['version','assets','primarySource','maskSource','budget','expectedDrawCount','expectedStrokeEnd'].includes(k))||m.version!==2||m.maskSource!==undefined)fail('unsupported trusted material capability')
      if(m.primarySource?.kind==='image'){
        const image=canonicalImageMaterialPin(m.primarySource,m.assets)
        preflight=undefined;materialSignature={...m,...image}
      }else{
        if(m.assets.length!==0||(m.primarySource?.kind!=='defaultAuto'&&m.primarySource?.kind!=='gaussianAuto'&&m.primarySource?.kind!=='softAuto'))fail('unsupported trusted material capability')
        const pin=m.primarySource.kind==='softAuto'?canonicalSoftAutoSourcePin(m.primarySource):m.primarySource.kind==='defaultAuto'?canonicalDefaultAutoSourcePin(m.primarySource):canonicalGaussianAutoSourcePin(m.primarySource)
        if(pin.kind==='softAuto'&&pin.sourceSlot!==0)fail('unsupported trusted soft source slot')
        if(!grant.plainAutoGeometry&&pin.brushScale!==1||pin.descriptorSha256!==grant.descriptorSha256||grant.brush!==`brush:${pin.descriptorId}@${pin.descriptorVersion}`)fail('trusted auto descriptor binding mismatch')
        preflight=undefined;materialSignature={...m,primarySource:pin}
      }
    }else{
      if(grant.rasterProfile!==CANONICAL_STROKE_RASTER_PROFILE)fail('V1 material requires historical raster profile')
      if(m.maskAsset!==undefined)fail('unsupported trusted material capability')
      preflight=m.preflightDefinition
      materialSignature={assets:m.assets,primaryAsset:m.primaryAsset,maskAsset:m.maskAsset,budget:m.budget,expectedDrawCount:m.expectedDrawCount,expectedStrokeEnd:m.expectedStrokeEnd}
    }
    const signature = JSON.stringify({ roomId: grant.roomId, userId: grant.userId, layerId: grant.layerId, boardEpoch: grant.boardEpoch,
      roomRasterVersion: grant.roomRasterVersion, rasterProfile: grant.rasterProfile, descriptorSha256: grant.descriptorSha256,
      brush: grant.brush, strokeId: grant.strokeId, pigmentRgb8: grant.pigmentRgb8, composition: grant.composition,material:materialSignature })
    const key = JSON.stringify([scope.roomId, scope.userId, strokeId]), previous = this.gestures.get(key)
    if (previous && (previous.signature !== signature || previous.preflight !== preflight)) fail('immutable gesture capability changed')
    if (!previous && (ordinal !== 0 || this.gestures.size >= this.maxGestures)) fail('missing prefix or bounded gesture capacity')
    const state: Gesture = previous ?? { signature, preflight, liveNext: 0, recordedNext: 0, uniqueNext: 0,
      entry: { phase: 'between' }, lastGroup: -1, ended: false, recordedEnded: false, fingerprints: new Map() }
    const live = value.type === 'canonical_stroke_live', next = live ? state.liveNext : state.recordedNext
    const old = state.fingerprints.get(ordinal)
    if(state.recordedSealNext!==undefined&&(!live&&ordinal>=state.recordedSealNext||live&&!old?.live))fail('recorded prefix sealed')
    if (!live && [...state.fingerprints].some(([n, item]) => n !== ordinal && item.operationId === value.id)) fail('operation ID reused across frames')
    if (ordinal > next || ordinal < next && !old || live && ordinal >= state.recordedNext + this.window) fail('noncontiguous or expired frame ordinal')
    const decoded=decodeTrustedCanonicalFrame(f,grant,ordinal)
    if (decoded.frame.masked&&!maskedSource2) fail('masked executor not admitted')
    const hash = createHash('sha256').update(JSON.stringify(decoded.envelope)).digest('hex')
    if (old && (old.hash !== hash || !live && old.operationId !== undefined && old.operationId !== value.id)) fail('frame identity conflicts with accepted lane')
    const duplicate = !!old && (live ? old.live : old.recorded)
    if (ordinal < next && !duplicate) fail('noncontiguous lane')
    let entry = state.entry, lastGroup = state.lastGroup, ended = state.ended
    if (!old) {
      try {
        const prefix=advanceCanonicalMaterialPrefix({nextOrdinal:state.uniqueNext,entry,lastGroup,ended},ordinal,decoded.frame)
        entry=prefix.entry;lastGroup=prefix.lastGroup;ended=prefix.ended
      } catch { fail('missing cross-frame fence prefix') }
    }
    const candidate: CanonicalFrameCandidate = value.type === 'canonical_stroke'
      ? Object.freeze({ type: 'canonical_stroke', id: value.id as string, layerId, frame: decoded.envelope })
      : Object.freeze({ type: 'canonical_stroke_live', layerId, frame: decoded.envelope })
    const accepted = Object.freeze({ identity: scope, candidate, decoded: decoded.frame,
      descriptorSha256: grant.descriptorSha256, boardEpoch: grant.boardEpoch })
    const revision = this.revision
    let committed = false
    return Object.freeze({ value: accepted, duplicate, commit: () => {
      if (committed) return
      if (this.revision !== revision || this.gestures.get(key) !== previous) fail('stale admission ticket; prepare again before effects')
      const fingerprints = new Map(state.fingerprints), current = old ?? { hash, live: false, recorded: false }
      fingerprints.set(ordinal, { ...current, ...(live ? { live: true } : { recorded: true, operationId: candidate.type === 'canonical_stroke' ? candidate.id : undefined }) })
      const liveNext = duplicate ? state.liveNext : live ? next + 1 : state.liveNext
      const recordedNext = duplicate ? state.recordedNext : live ? state.recordedNext : next + 1
      // Authoritative records may progress without live traffic. Old live frames
      // beyond this retained digest window require the normal receiver resync.
      for (const n of fingerprints.keys()) if (n < recordedNext - this.window) fingerprints.delete(n)
      this.gestures.set(key, { ...state, fingerprints, liveNext, recordedNext, uniqueNext: old ? state.uniqueNext : ordinal + 1, entry, lastGroup, ended,
        // A speculative end seals unique admission, but only a committed record
        // seals the cursor returned by begin/reconnect (also for a known live hash).
        recordedEnded: state.recordedEnded || !live && decoded.frame.fences.some(fence => fence.kind === 'gestureEnd') })
      this.revision++; committed = true
    } })
  }

  /** Room eviction/reset only AFTER its admission state can be reconstructed
   * from trusted persisted canonical history. No auto-tombstone eviction: IDs
   * must never silently become new gestures when a bounded cache fills. */
  clearRoom(roomId: string): void {
    if (!text(roomId)) fail('invalid room lifetime')
    for (const key of this.gestures.keys()) if ((JSON.parse(key) as string[])[0] === roomId) this.gestures.delete(key)
    this.revision++
  }
}

/** Called only on the SAME normal decoder output, not raw wire authority. */
export function assertCanonicalPlainAutoGeometryFrame(frame:Readonly<{definitions:readonly unknown[]}>):void {
 for(const recipe of frame.definitions){
  if(!recipe||typeof recipe!=='object'||!('kind'in recipe)||recipe.kind!=='defaultAuto'||!('scale'in recipe)||typeof recipe.scale!=='number'||recipe.scale<=0||recipe.scale>1||!('ratio'in recipe)||typeof recipe.ratio!=='number'||recipe.ratio<=0||recipe.ratio>1||!('rotation'in recipe)||typeof recipe.rotation!=='number'||!Number.isFinite(recipe.rotation)||!('mirrorH'in recipe)||recipe.mirrorH!==false||!('mirrorV'in recipe)||recipe.mirrorV!==false)fail('plain-tilt recipe transform')
 }
}

/** Resolved placement needs no server RNG. Validate the bounded mask domain. */
export function assertCanonicalDynamicAutoGeometryFrame(frame:Readonly<{definitions:readonly unknown[]}>):void {
 for(const recipe of frame.definitions){
  if(!recipe||typeof recipe!=='object'||!('kind'in recipe)||!['defaultAuto','gaussianAuto','softAuto'].includes(String(recipe.kind))||!('scale'in recipe)||typeof recipe.scale!=='number'||!Number.isFinite(recipe.scale)||recipe.scale<=0||recipe.scale>1||!('ratio'in recipe)||typeof recipe.ratio!=='number'||!Number.isFinite(recipe.ratio)||recipe.ratio<=0||recipe.ratio>1||!('rotation'in recipe)||typeof recipe.rotation!=='number'||!Number.isFinite(recipe.rotation)||!('mirrorH'in recipe)||typeof recipe.mirrorH!=='boolean'||!('mirrorV'in recipe)||typeof recipe.mirrorV!=='boolean')fail('dynamic Auto recipe transform')
 }
}
