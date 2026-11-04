import {isCanonicalOwnedPatternLifetime} from './CanonicalMaskSourceBank'
import {isCanonicalOwnedLifetime} from './CanonicalLayerTargets'
import { saveBrushGlState,openBrushGlRestoreGate,disableBrushGlRestoreGate,closeBrushGlRestoreGate,type BrushGlStateRestore,type BrushGlContextOwner,type BrushGlCanonicalCallbackScope,type BrushGlRestoreGate } from './BrushGlState'
import type { BrushMipCache } from './BrushMipCache'
import type { BrushTextureCache } from './BrushTextureCache'

export interface BrushGlBatchResource { readonly key: string; readonly bytes: number }
/** Immutable sampler ownership, advertised only by the service that creates
 * and exclusively configures this prepared texture. Borrowers may sample it,
 * never mutate its sampler, including in external lease callbacks. */
export interface BrushGlBatchOwnedSampler extends BrushGlBatchResource {
  readonly texture: WebGLTexture
  readonly epoch: object
}
/** Trusted INTERNAL resource-owner promise, never received frame/material data.
 * The actual source getter and alive epoch bind one immutable nearest/clamp
 * sampler to the exclusive borrow. Neither caller nor lease callbacks may mutate
 * that sampler until release. No global GL-state or handle registry is kept. */
export interface BrushGlBatchLifetimePointSampler {
  readonly texture: WebGLTexture
  readonly source: { readonly texture: WebGLTexture; readonly gl: WebGLRenderingContext }
  readonly epoch: { readonly alive: boolean }
}
export interface BrushGlBatchFramebufferLayout {
  readonly gl:WebGLRenderingContext;readonly texture:WebGLTexture;readonly framebuffer:WebGLFramebuffer;readonly width:number;readonly height:number
}
/** Only a real cold-verified fixed buffer can publish this internal promise. */
export interface BrushGlBatchLifetimeFramebuffer {
  readonly source:{readonly verifiedFramebufferLayout:Readonly<BrushGlBatchFramebufferLayout>|undefined}
  readonly certificate:Readonly<BrushGlBatchFramebufferLayout>
  readonly originX:number;readonly originY:number
}
export interface BrushGlBatchLifetime {
  readonly owner: object
  readonly lease: () => () => void
  readonly ownedPointSampler?: BrushGlBatchLifetimePointSampler
  readonly ownedFramebufferLayouts?:readonly BrushGlBatchLifetimeFramebuffer[]
}
type OwnedSamplerBinding = { readonly participant: BrushGlBatchParticipant; readonly sampler: BrushGlBatchOwnedSampler }
  | { readonly lifetime: BrushGlBatchLifetime; readonly declaration: BrushGlBatchLifetimePointSampler; readonly sampler: BrushGlBatchLifetimePointSampler }
function assertLifetimeSampler(owner:BrushGlBatchLifetime, saved:BrushGlBatchLifetimePointSampler, declaration:BrushGlBatchLifetimePointSampler, gl:WebGLRenderingContext):void {
  const current=owner.ownedPointSampler
  if(current!==declaration || !current || current.texture!==saved.texture || current.source!==saved.source || current.epoch!==saved.epoch
    || current.epoch!==owner.owner || current.epoch.alive!==true || current.source.texture!==saved.texture || current.source.gl!==gl)
    throw new Error('Stale or changed lifetime owned sampler identity/epoch')
}
export interface BrushGlBatchInfo {
  readonly contextOwner?:BrushGlContextOwner
  readonly gl: WebGLRenderingContext
  readonly cache: BrushTextureCache
  readonly cpu: BrushMipCache
  readonly epoch: object
  readonly attributes: readonly number[]
  readonly instancing: ANGLE_instanced_arrays | null
  readonly vertexArrays: OES_vertex_array_object | null
  readonly resources: readonly BrushGlBatchResource[]
  readonly textureUnits?:3|4
  readonly ownedPointSamplers?: readonly BrushGlBatchOwnedSampler[]
}
/** Internal services expose metadata, never a raw draw bypass. */
export interface BrushGlBatchParticipant {
  /** Resource-owner mutation barrier; released only after this synchronous turn restores GL. */
  enterBrushGlTurn?(): () => void
  brushGlBatchInfo(): BrushGlBatchInfo
  enterBrushGlBatch(frame: BrushGlBatchFrame): () => void
}
interface Target { readonly texture: WebGLTexture; readonly framebuffer: WebGLFramebuffer; readonly width: number; readonly height: number; readonly originX: number; readonly originY: number;readonly lifetime?:BrushGlBatchLifetime }
interface FixedFramebufferBinding {
  readonly lifetime:BrushGlBatchLifetime;readonly epoch:object;readonly list:readonly BrushGlBatchLifetimeFramebuffer[];readonly index:number;readonly count:number
  readonly declaration:BrushGlBatchLifetimeFramebuffer;readonly saved:BrushGlBatchLifetimeFramebuffer
}
interface TargetBinding {readonly target:Target;readonly fixed?:FixedFramebufferBinding}
function assertFixedFramebuffer(binding:FixedFramebufferBinding,gl:WebGLRenderingContext):void{
  const {lifetime,list,index,declaration,saved}=binding,c=saved.certificate
  if(lifetime.owner!==binding.epoch || lifetime.ownedFramebufferLayouts!==list || list[index]!==declaration
    || list.length!==binding.count || declaration.source!==saved.source || declaration.certificate!==c
    || declaration.originX!==saved.originX || declaration.originY!==saved.originY
    || c.gl!==gl || saved.source.verifiedFramebufferLayout!==c)throw new Error('Stale or changed fixed framebuffer certificate/identity')
}
const noop = () => {}
const authority = Symbol('brush-gl-batch')

/** Explicit synchronous scope. No ambient current frame or cross-frame GL cache.
 * Callers must not issue arbitrary GL, mutate owners, prepare/reset services or
 * yield while inside the callback. Only prepared, declared resources may be used. */
export class BrushGlBatchFrame {
  private readonly infos: Map<BrushGlBatchParticipant, BrushGlBatchInfo>
  private readonly owners: Set<BrushGlBatchLifetime>
  private readonly resources: Map<string, number>
  private readonly ownedSamplers: Map<WebGLTexture, OwnedSamplerBinding>
  private readonly samplers = new Map<WebGLTexture, readonly number[]>()
  private readonly targets:Map<WebGLFramebuffer,TargetBinding>
  private readonly groups: (() => void)[] = []
  private opened = false
  private acquiring = true
  private draws = 0
  private groupCount = 0
  private pendingGroup?: symbol
  private started = 0
  private readonly gl: WebGLRenderingContext
  private readonly cache: BrushTextureCache
  constructor(key: symbol, infos: Map<BrushGlBatchParticipant, BrushGlBatchInfo>, owners: readonly BrushGlBatchLifetime[], resources: Map<string, number>, ownedSamplers: Map<WebGLTexture, OwnedSamplerBinding>,targets:Map<WebGLFramebuffer,TargetBinding>) {
    if (key !== authority) throw new Error('Brush GL batch frames require coordinator ownership')
    this.infos = infos; this.owners = new Set(owners); this.resources = resources; this.ownedSamplers = ownedSamplers;this.targets=targets
    const first = infos.values().next().value!
    this.gl = first.gl; this.cache = first.cache
  }
  /** @internal participant admission is valid only during coordinator acquisition. */
  acceptParticipant(participant: BrushGlBatchParticipant): void {
    if (!this.acquiring || !this.infos.has(participant)) throw new Error('Closed or foreign brush GL batch acquisition')
  }
  /** @internal coordinator only */
  open(key: symbol): void { if (key !== authority) throw new Error('Invalid batch authority'); this.acquiring = false; this.opened = true; this.started = performance.now() }
  get shouldYield(): boolean { return this.draws >= 8 || this.groupCount >= 8 || (this.draws > 0 || this.groupCount > 0) && performance.now() - this.started >= 4 }
  assert(participant: BrushGlBatchParticipant, resources: readonly BrushGlBatchResource[], owners: readonly BrushGlBatchLifetime[] = []): void {
    const saved = this.infos.get(participant)
    if (!this.opened || !saved) throw new Error('Closed or foreign brush GL batch')
    const current = participant.brushGlBatchInfo()
    if (!sameParticipantBinding(current,saved)) throw new Error('Brush GL batch service binding/epoch changed')
    for (const item of resources) if (this.resources.get(item.key) !== item.bytes || this.cache.resourceBytes(item.key) !== item.bytes || !this.cache.get(item.key)) throw new Error('Undeclared or changed batch resource')
    for (const owner of owners) if (!this.owners.has(owner)) throw new Error('Undeclared batch owner')
  }
  beforeWork(): void {
    if (!this.opened) throw new Error('Closed brush GL batch')
    if (this.gl.isContextLost()) throw new Error('Brush GL batch context lost')
    // Time is cooperative: metadata between a caller check and this admission
    // may cross 4ms. Reject only hard bounds; never drop an accepted request.
    if (this.draws >= 8 || this.groupCount >= 8) throw new Error('Brush GL batch budget exhausted; yield outside the frame')
  }
  beginGroup(): symbol {
    this.beforeWork()
    if (this.groupCount >= 8) throw new Error('Brush GL batch group budget exhausted')
    this.groupCount++
    const token = Symbol('brush-batch-group')
    this.pendingGroup = token
    return token
  }
  endGroup(token: symbol): void { if (this.pendingGroup === token) this.pendingGroup = undefined }
  beginDraw(): void {
    // The first draw paired with an already-admitted prepass group must finish
    // its command even if mask preparation crossed the soft 4ms boundary.
    if (this.pendingGroup && this.opened && !this.gl.isContextLost() && this.draws < 8) this.pendingGroup = undefined
    else this.beforeWork()
    this.draws++
  }
  holdGroup(release: () => void): void { if (!this.opened) throw new Error('Closed brush GL batch'); this.groups.push(release) }
  pointSampling(texture: WebGLTexture): () => void {
    if (!this.opened) throw new Error('Closed brush GL batch')
    const owned = this.ownedSamplers.get(texture)
    if (owned) {
      if('lifetime' in owned)assertLifetimeSampler(owned.lifetime,owned.sampler,owned.declaration,this.gl)
      else if (owned.participant.brushGlBatchInfo().epoch !== owned.sampler.epoch || this.cache.resourceBytes(owned.sampler.key) !== owned.sampler.bytes || this.cache.get(owned.sampler.key) !== texture) throw new Error('Owned sampler epoch/residency changed')
      return noop
    }
    if (this.samplers.has(texture)) return noop
    const gl = this.gl, names = [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER, gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]
    this.samplers.set(texture, names.map(name => gl.getTexParameter(gl.TEXTURE_2D, name) as number))
    for (const [i, value] of [gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE].entries()) gl.texParameteri(gl.TEXTURE_2D, names[i], value)
    return noop
  }
  bindTarget(target: Target): void {
    if (!this.opened) throw new Error('Closed brush GL batch')
    const gl=this.gl,binding=this.targets.get(target.framebuffer)
    if(binding){
      const previous=binding.target
      if(previous.texture!==target.texture || previous.width!==target.width || previous.height!==target.height || previous.originX!==target.originX || previous.originY!==target.originY)
        throw new Error('Batch framebuffer attachment identity changed')
      if(binding.fixed){
        if(target.lifetime!==binding.fixed.lifetime || !this.owners.has(binding.fixed.lifetime))throw new Error('Fixed framebuffer lifetime identity mismatch')
        assertFixedFramebuffer(binding.fixed,gl)
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer)
      if(binding.fixed)assertFixedFramebuffer(binding.fixed,gl)
      return
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer)
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE || gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME)!==target.texture)
      throw new Error('Canonical target attachment does not match its declared texture')
    this.targets.set(target.framebuffer,{target:{...target}})
  }
  /** @internal coordinator only; owners remain leased until after state restore. */
  close(key: symbol): void {
    if (key !== authority) throw new Error('Invalid batch authority')
    this.opened = false
    this.acquiring = false
    let failed = false, failure: unknown
    for (const release of this.groups.reverse()) try { release() } catch (error) { if (!failed) { failed = true; failure = error } }
    if (!this.gl.isContextLost()) {
      const gl = this.gl, names = [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER, gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]
      const cleanup=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;failure=error}}}
      let unitReady=false
      cleanup(()=>{gl.activeTexture(gl.TEXTURE0);unitReady=true})
      if(unitReady)for(const [texture,values] of this.samplers){
        let bound=false
        cleanup(()=>{gl.bindTexture(gl.TEXTURE_2D,texture);bound=true})
        if(bound)for(let i=0;i<names.length;i++)cleanup(()=>gl.texParameteri(gl.TEXTURE_2D,names[i],values[i]))
      }
    }
    if (failed) throw failure
  }
}

/** Synchronous runtime authority, never serializable author/wire data. */
declare const turnBrand: unique symbol
export interface BrushGlTurn { readonly [turnBrand]: true }
interface TurnRecord {
  readonly infos: Map<BrushGlBatchParticipant, BrushGlBatchInfo>
  readonly restore: () => void
  readonly restoreAutoUpload?:()=>void
  readonly restoreGate?:BrushGlRestoreGate
  /** Scoped cleanup evidence only; never GL state/resource authority. */
  cleanupFailure?:{readonly error:unknown}
  readonly sequenceChild?:true
  readonly sequenceAutoUpload?:true
  stepFailure?:{readonly error:unknown}
  autoUploadBorrowed:boolean
  active: boolean
  claimed: boolean
}
// Authority/reentry bookkeeping only: no implicit current token or ambient GL
// state cache. A batch must receive its genuine caller-owned token explicitly.
const turns = new WeakMap<BrushGlTurn, TurnRecord>()
// Exact live frame -> inherited unpack restore. No ambient context lookup.
const batchUploadScopes=new WeakMap<BrushGlBatchFrame,{record:TurnRecord;infos:Map<BrushGlBatchParticipant,BrushGlBatchInfo>}>()
export function borrowBrushGlBatchAutoUploadRestore(frame:BrushGlBatchFrame,participant:BrushGlBatchParticipant):(()=>void)|undefined {
  const scope=batchUploadScopes.get(frame)
  if(!scope)return undefined
  frame.assert(participant,[])
  if(!scope.record.active||!scope.record.restoreAutoUpload||!scope.infos.has(participant))throw new Error('Closed or foreign batch upload scope')
  const restore=scope.record.restoreAutoUpload
  return()=>{
    if(batchUploadScopes.get(frame)!==scope||!scope.record.active)throw new Error('Expired batch upload restore')
    frame.assert(participant,[])
    restore()
  }
}

const turnContexts = new WeakSet<WebGLRenderingContext>()
/** Internal mutation barrier only; no GL read, lease or execution authority. */
export function assertBrushGlMutationIdle(gl:WebGLRenderingContext):void {
  if(turnContexts.has(gl))throw new Error('Brush GL turn mutation scope is active')
}
function participantInfos(participants: readonly BrushGlBatchParticipant[]): Map<BrushGlBatchParticipant, BrushGlBatchInfo> {
  if (!participants.length || participants.length > 8) throw new RangeError('Invalid brush GL batch participants')
  const infos=new Map(participants.map(p=>[p,p.brushGlBatchInfo()])), first=infos.values().next().value!
  for(const [p,info] of infos){
    if(info.gl!==first.gl||info.cache!==first.cache||info.cpu!==first.cpu||info.instancing!==first.instancing||info.vertexArrays!==first.vertexArrays)
      throw new Error('Brush GL batch context/cache mismatch')
    if(!Array.isArray(info.attributes)||info.attributes.length>32||info.attributes.some(a=>!Number.isSafeInteger(a)||a<0||a>31))
      throw new RangeError('Invalid brush GL batch attributes')
    if(info.textureUnits!==undefined&&info.textureUnits!==3&&info.textureUnits!==4)throw new RangeError('Invalid brush GL texture unit declaration')
    infos.set(p,{...info,attributes:Object.freeze([...info.attributes])})
  }
  return infos
}
function sameAttributes(a:readonly number[],b:readonly number[]):boolean {
  const x=new Set(a),y=new Set(b);return x.size===y.size&&[...x].every(n=>y.has(n))
}
function sameParticipantBinding(current:BrushGlBatchInfo,pinned:BrushGlBatchInfo):boolean {
  return pinned.gl===current.gl&&pinned.cache===current.cache&&pinned.cpu===current.cpu&&pinned.epoch===current.epoch
    &&(pinned.textureUnits??3)===(current.textureUnits??3)&&pinned.contextOwner===current.contextOwner&&pinned.instancing===current.instancing&&pinned.vertexArrays===current.vertexArrays&&sameAttributes(pinned.attributes,current.attributes)
}
/** One full capture BEFORE direct target allocation/copy and owner callbacks.
 * One inner batch may borrow it. The SAME snapshot is restored inside that
 * batch before owner releases and again here after preparation cleanup. */
type BrushGlTurnOptions={readonly participants:readonly BrushGlBatchParticipant[];readonly captureAutoUploadUnpack?:true;readonly callbackScope?:BrushGlCanonicalCallbackScope;readonly onCleanupFailure?:(error:unknown)=>void}
// One synchronous terminal restore receipt, minted/consumed only by this module.
// It never describes ambient state on a later call and is never caller authority.
const terminalRestores=new WeakMap<object,TurnRecord>()
export function runBrushGlTurn(options:BrushGlTurnOptions,execute:(turn:BrushGlTurn)=>void):void {
  runBrushGlTurnCore(options,turn=>{
    const value:unknown=execute(turn)
    if(value&&typeof(value as {then?:unknown}).then==='function')throw new Error('Brush GL turn callback must be synchronous')
    return undefined
  })
}
function runBrushGlTurnCore(options:BrushGlTurnOptions,execute:(turn:BrushGlTurn)=>object|undefined):void {
  const autoUpload=options.captureAutoUploadUnpack===true
  if(options.captureAutoUploadUnpack!==undefined&&!autoUpload)throw new Error('Invalid auto upload capture declaration')
  const infos=participantInfos(options.participants),first=infos.values().next().value!
  if(turnContexts.has(first.gl))throw new Error('Nested brush GL turn is forbidden')
  if(first.gl.isContextLost())throw new Error('Brush GL turn context lost')
  const releaseCpu=first.cpu.reserve(4096+(autoUpload?128:0))
  let restore:BrushGlStateRestore|undefined,restoreGate:BrushGlRestoreGate|undefined,record:TurnRecord|undefined,token:BrushGlTurn|undefined,failed=false,failure:unknown
  const participantReleases:(()=>void)[]=[]
  let cleanupFailure:{readonly error:unknown}|undefined,terminalRestored=false
  const cleanup=(fn:()=>void)=>{try{fn()}catch(error){cleanupFailure??={error};if(!failed){failed=true;failure=error}}}
  turnContexts.add(first.gl)
  try{
    for(const participant of infos.keys())if(participant.enterBrushGlTurn)participantReleases.push(participant.enterBrushGlTurn())
    for(const [participant,pinned]of infos)if(!sameParticipantBinding(participant.brushGlBatchInfo(),pinned))throw new Error('Brush GL turn participant changed during acquisition')
    const attributes=[...new Set([...infos.values()].flatMap(i=>[...i.attributes]))]
    const owner=[...infos.values()].every(info=>info.contextOwner===first.contextOwner)?first.contextOwner:undefined
    restoreGate=openBrushGlRestoreGate(options.callbackScope,first.gl,owner)
    restore=saveBrushGlState(first.gl,attributes,first.instancing,first.vertexArrays,Math.max(...[...infos.values()].map(i=>i.textureUnits??3)),autoUpload,restoreGate)
    token=Object.freeze({}) as BrushGlTurn
    record={infos,restore,restoreGate,restoreAutoUpload:restore.restoreAutoUpload,autoUploadBorrowed:false,active:true,claimed:false};turns.set(token,record)
    const receipt=execute(token)
    if(receipt){terminalRestored=terminalRestores.get(receipt)===record;terminalRestores.delete(receipt)}
  }catch(error){failed=true;failure=error}
  finally{
    if(record)record.active=false
    if(token)turns.delete(token) // retained expired tokens must not retain GL snapshots
    if(restore&&!terminalRestored)cleanup(()=>{if(!first.gl.isContextLost())restore!()})
    cleanup(releaseCpu)
    for(const release of participantReleases.reverse())cleanup(release)
    closeBrushGlRestoreGate(restoreGate)
    turnContexts.delete(first.gl)
  }
  // All native cleanup has been attempted and the scope detached before an
  // optional diagnostic callback. Legacy callers keep the exact same primary.
  const cleanupEvidence=cleanupFailure??record?.cleanupFailure
  if(cleanupEvidence&&options.onCleanupFailure)try{options.onCleanupFailure(cleanupEvidence.error)}catch(error){if(!failed){failed=true;failure=error}}
  if(failed)throw failure
}

/** Synchronous warm-only sequence: one entry snapshot, fresh single-use child
 * for each native step. No token or participant lease survives this call. */
export function runBrushGlSequence(options:Parameters<typeof runBrushGlTurn>[0]&{readonly allowAutoUpload?:true},execute:(sequence:{step(run:(turn:BrushGlTurn)=>void):void})=>void):void {
  if(options.allowAutoUpload!==undefined&&(options.allowAutoUpload!==true||options.captureAutoUploadUnpack!==true))throw new Error('Sequence upload requires declared unpack capture')
  runBrushGlTurn(options,parent=>{
    const parentRecord=turns.get(parent)!
    let active=true,busy=false,failed=false,failure:unknown
    const sequence=Object.freeze({step(run:(turn:BrushGlTurn)=>void):void {
      if(this!==sequence||!active||busy||failed)throw new Error('Closed, failed or reentered GL sequence')
      busy=true
      let token:BrushGlTurn|undefined,record:TurnRecord|undefined
      const latch=(error:unknown)=>{if(!failed){failed=true;failure=error}}
      try{
        for(const [participant,pinned]of parentRecord.infos)if(!sameParticipantBinding(participant.brushGlBatchInfo(),pinned))throw new Error('Sequence participant changed')
        token=Object.freeze({}) as BrushGlTurn
        record={sequenceChild:true,...(options.allowAutoUpload?{sequenceAutoUpload:true as const}:{}),infos:parentRecord.infos,restore:parentRecord.restore,restoreGate:parentRecord.restoreGate,restoreAutoUpload:parentRecord.restoreAutoUpload,autoUploadBorrowed:false,active:true,claimed:false}
        turns.set(token,record)
        const result:unknown=run(token)
        if(result&&typeof(result as {then?:unknown}).then==='function')throw new Error('GL sequence step must be synchronous')
      }catch(error){latch(record?.stepFailure?record.stepFailure.error:error)}
      finally{
        if(record){record.active=false;if(record.stepFailure)latch(record.stepFailure.error);if(record.cleanupFailure){parentRecord.cleanupFailure??=record.cleanupFailure;latch(record.cleanupFailure.error)}}
        if(token)turns.delete(token)
        try{if(!parentRecord.infos.values().next().value!.gl.isContextLost())parentRecord.restore()}catch(error){parentRecord.cleanupFailure??={error};latch(error)}
        busy=false
      }
      if(failed)throw failure
    }})
    try{
      const value:unknown=execute(sequence)
      if(value&&typeof(value as {then?:unknown}).then==='function')throw new Error('GL sequence must be synchronous')
    }catch(error){if(!failed){failed=true;failure=error}}
    finally{active=false}
    if(failed)throw failure
  })
}

/** Closed native driver: caller code only runs INSIDE a child, before its
 * final restore. Unlike the generic sequence it has no arbitrary postlude.
 * The boolean continuation is plain DATA, inspected before restoring the child.
 * A successful terminal child needs no duplicate outer restore. */
export function runBrushGlClosedNativeSequence(options:BrushGlTurnOptions&{readonly started:number;readonly allowAutoUpload?:true},step:(turn:BrushGlTurn)=>boolean):void {
  const started=options.started
  if(!Number.isFinite(started)||typeof step!=='function')throw new Error('Invalid closed sequence plan')
  if(options.allowAutoUpload!==undefined&&(options.allowAutoUpload!==true||options.captureAutoUploadUnpack!==true))throw new Error('Sequence upload requires declared unpack capture')
  runBrushGlTurnCore(options,parent=>{
    const parentRecord=turns.get(parent)!,gl=parentRecord.infos.values().next().value!.gl
    for(let ordinal=0;ordinal<32;ordinal++){
      let token:BrushGlTurn|undefined,record:TurnRecord|undefined,failed=false,failure:unknown,more=false,restored=false
      const latch=(error:unknown)=>{if(!failed){failed=true;failure=error}}
      try{
        for(const [participant,pinned]of parentRecord.infos)if(!sameParticipantBinding(participant.brushGlBatchInfo(),pinned))throw new Error('Sequence participant changed')
        token=Object.freeze({}) as BrushGlTurn
        record={sequenceChild:true,...(options.allowAutoUpload?{sequenceAutoUpload:true as const}:{}),infos:parentRecord.infos,restore:parentRecord.restore,restoreGate:parentRecord.restoreGate,restoreAutoUpload:parentRecord.restoreAutoUpload,autoUploadBorrowed:false,active:true,claimed:false}
        turns.set(token,record)
        // Recheck the original clock AFTER child admission too. The first
        // indivisible paint remains allowed even if entry capture crossed 4ms.
        if(ordinal===0||performance.now()-started<4){
          const result:unknown=step(token)
          if(result!==true&&result!==false)throw new Error('Closed GL sequence requires a boolean continuation')
          more=result
        }
      }catch(error){latch(record?.stepFailure?record.stepFailure.error:error)}
      finally{
        if(record){record.active=false;if(record.stepFailure)latch(record.stepFailure.error);if(record.cleanupFailure){parentRecord.cleanupFailure??=record.cleanupFailure;latch(record.cleanupFailure.error)}}
        if(token)turns.delete(token)
        try{if(!gl.isContextLost()){parentRecord.restore();restored=true}}catch(error){parentRecord.cleanupFailure??={error};latch(error)}
      }
      if(failed)throw failure
      // Only module-owned primitive/clock checks occur after the restore.
      // No caller callback/getter/thenable inspection can modify terminal GL.
      if(!more||ordinal===31||performance.now()-started>=4){
        if(!restored)return undefined
        const receipt=Object.freeze({});terminalRestores.set(receipt,parentRecord);return receipt
      }
    }
    return undefined
  })
}

/** One synchronous final upload may borrow ONLY its genuinely captured state.
 * The cleanup runs before the cache lease release, without another capture. */
export function borrowBrushGlTurnAutoUploadRestore(turn:BrushGlTurn,participant:BrushGlBatchParticipant):()=>void {
  const record=turns.get(turn)
  if(record?.sequenceChild&&!record.sequenceAutoUpload)throw new Error('Warm sequence cannot borrow auto upload')
  if(!record||!record.active||record.claimed||record.autoUploadBorrowed||!record.restoreAutoUpload||!record.infos.has(participant))
    throw new Error('Unknown, closed or undeclared auto upload turn')
  for(const [service,pinned]of record.infos)if(!sameParticipantBinding(service.brushGlBatchInfo(),pinned))throw new Error('Auto upload turn participant/epoch changed')
  if(record.infos.get(participant)!.gl.isContextLost())throw new Error('Auto upload turn context lost')
  record.autoUploadBorrowed=true
  return record.restoreAutoUpload
}

/** Upload failures are recorded before caller cleanup can replace the primary. */
export function withBrushGlTurnAutoUploadRestore<T>(turn:BrushGlTurn,participant:BrushGlBatchParticipant,execute:(borrow:()=>()=>void)=>T):T {
  const record=turns.get(turn)
  // Foreign/stale calls do not start an operation or poison somebody else's child.
  if(!record||!record.active||record.claimed||record.autoUploadBorrowed||!record.restoreAutoUpload
    ||!record.infos.has(participant)||record.sequenceChild&&!record.sequenceAutoUpload)
    throw new Error('Unknown, closed or undeclared auto upload turn')
  try{return execute(()=>borrowBrushGlTurnAutoUploadRestore(turn,participant))}
  catch(error){if(record.sequenceChild)record.stepFailure??={error};throw error}
}

export function runBrushGlBatch(options: {
  readonly participants: readonly BrushGlBatchParticipant[]
  readonly owners?: readonly BrushGlBatchLifetime[]
  readonly resources?: readonly BrushGlBatchResource[]
  readonly turn?: BrushGlTurn
  /** Internal diagnostic only; first failure, AFTER attempt-all cleanup. */
  readonly onCleanupFailure?:(error:unknown)=>void
}, execute: (frame: BrushGlBatchFrame) => void): void {
  const borrowed=options.turn===undefined?undefined:turns.get(options.turn)
  if(options.turn!==undefined&&(!borrowed||!borrowed.active||borrowed.claimed))throw new Error('Unknown, closed or reused brush GL turn')
  const infos=participantInfos(options.participants),first=infos.values().next().value!
  if(borrowed){
    if(borrowed.infos.size!==infos.size)throw new Error('Foreign brush GL turn participants')
    for(const [p,current] of infos){
      const pinned=borrowed.infos.get(p)
      if(!pinned||!sameParticipantBinding(current,pinned))
        throw new Error('Foreign or changed brush GL turn participant/epoch/attributes')
    }
    borrowed.claimed=true
  }else if(turnContexts.has(first.gl))throw new Error('Nested brush GL batch requires its owned turn')
  try{
  if(first.gl.isContextLost())throw new Error('Brush GL batch context lost')
  const resources = new Map<string, number>(), owners = [...new Set(options.owners ?? [])]
  // Downgrade BEFORE reading any untrusted owner metadata or invoking its lease.
  if(borrowed?.restoreGate&&owners.some(owner=>!isCanonicalOwnedLifetime(first.gl,owner)&&!isCanonicalOwnedPatternLifetime(first.gl,owner)))disableBrushGlRestoreGate(borrowed.restoreGate)
  if (owners.length > 64 || (options.resources?.length ?? 0) > 1024) throw new RangeError('Brush GL batch declarations exceed capacity')
  for (const info of infos.values()) if (info.gl !== first.gl || info.cache !== first.cache || info.cpu !== first.cpu || info.instancing !== first.instancing || info.vertexArrays !== first.vertexArrays) throw new Error('Brush GL batch context/cache mismatch')
  for (const item of [...[...infos.values()].flatMap(info => info.resources), ...options.resources ?? []]) {
    if (!item.key || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || first.cache.resourceBytes(item.key) !== item.bytes || !first.cache.get(item.key) || resources.has(item.key) && resources.get(item.key) !== item.bytes) throw new RangeError('Unprepared batch resource')
    resources.set(item.key, item.bytes)
  }
  if (resources.size > 1024 || [...resources.values()].reduce((a, b) => a + b, 0) > first.cache.budgetBytes) throw new RangeError('Brush GL batch GPU budget exceeded')
  for (const owner of owners) if (!owner || !owner.owner || typeof owner.owner !== 'object' || typeof owner.lease !== 'function') throw new RangeError('Invalid batch owner lifetime')
  const ownedSamplers = new Map<WebGLTexture, OwnedSamplerBinding>()
  for (const [participant, info] of infos) {
    if ((info.ownedPointSamplers?.length ?? 0) > 8) throw new RangeError('Owned sampler declaration capacity exceeded')
    for (const item of info.ownedPointSamplers ?? []) {
      if (item.epoch !== info.epoch || resources.get(item.key) !== item.bytes || info.cache.resourceBytes(item.key) !== item.bytes || info.cache.get(item.key) !== item.texture) throw new Error('Invalid owned sampler identity/epoch/charge')
      const previous = ownedSamplers.get(item.texture)
      if (previous && (!('participant' in previous) || previous.participant !== participant || previous.sampler.key !== item.key || previous.sampler.bytes !== item.bytes || previous.sampler.epoch !== item.epoch)) throw new Error('Conflicting owned sampler metadata')
      ownedSamplers.set(item.texture, { participant, sampler: { ...item } })
    }
  }
  for(const owner of owners){
    const declaration=owner.ownedPointSampler
    if(declaration===undefined)continue
    if(!declaration || !declaration.texture || typeof declaration.texture!=='object' || !declaration.source || typeof declaration.source!=='object'
      || !declaration.epoch || typeof declaration.epoch!=='object')throw new Error('Invalid lifetime owned sampler metadata')
    const saved={texture:declaration.texture,source:declaration.source,epoch:declaration.epoch}
    assertLifetimeSampler(owner,saved,declaration,first.gl)
    if(ownedSamplers.has(saved.texture))throw new Error('Conflicting lifetime owned sampler metadata')
    ownedSamplers.set(saved.texture,{lifetime:owner,declaration,sampler:saved})
  }
  // Same per-frame target dictionary: certified fixed bindings and old guarded
  // foreign bindings share one lifetime, not a persistent handle registry.
  const targets=new Map<WebGLFramebuffer,TargetBinding>()
  for(const lifetime of owners){
    const list=lifetime.ownedFramebufferLayouts
    if(list===undefined)continue
    if(!Array.isArray(list)||list.length>64)throw new Error('Invalid fixed framebuffer declaration capacity')
    for(let index=0;index<list.length;index++){
      const declaration=list[index],c=declaration?.certificate
      if(!declaration||!declaration.source||!c||!Object.isFrozen(c)||!c.texture||!c.framebuffer
        || ![c.width,c.height,declaration.originX,declaration.originY].every(Number.isSafeInteger)||c.width<1||c.height<1)
        throw new Error('Invalid fixed framebuffer certificate metadata')
      const saved={source:declaration.source,certificate:c,originX:declaration.originX,originY:declaration.originY}
      const fixed={lifetime,epoch:lifetime.owner,list,index,count:list.length,declaration,saved}
      assertFixedFramebuffer(fixed,first.gl)
      if(targets.has(c.framebuffer))throw new Error('Conflicting fixed framebuffer certificate identity')
      targets.set(c.framebuffer,{fixed,target:{texture:c.texture,framebuffer:c.framebuffer,width:c.width,height:c.height,originX:saved.originX,originY:saved.originY,lifetime}})
    }
  }
  const cpuBytes = (borrowed ? 0 : 4096) + ownedSamplers.size * 96 + targets.size * 96 + resources.size * 96 + owners.length * 128 + infos.size * 256
  const releaseCpu = first.cpu.reserve(cpuBytes)
  const frame = new BrushGlBatchFrame(authority, infos, owners, resources, ownedSamplers,targets), releases: (() => void)[] = []
  let restore: (() => void) | undefined = borrowed?.restore, failed = false, failure: unknown
  let cleanupFailure:{readonly error:unknown}|undefined
  const cleanup = (fn: () => void) => { try { fn() } catch (error) {
    cleanupFailure??={error}
    if(borrowed)borrowed.cleanupFailure??=cleanupFailure
    if (!failed) { failed = true; failure = error }
  } }
  try {
    for (const participant of infos.keys()) releases.push(participant.enterBrushGlBatch(frame))
    first.cache.protect([...resources.keys()])
    releases.push(first.cache.lease([...resources].map(([key, bytes]) => ({ key, bytes }))))
    const attributes = [...new Set([...infos.values()].flatMap(info => [...info.attributes]))]
    if(!borrowed)restore = saveBrushGlState(first.gl, attributes, first.instancing, first.vertexArrays, Math.max(...[...infos.values()].map(i=>i.textureUnits??3)))
    for (const owner of owners) {
      const release = owner.lease()
      if (typeof release !== 'function') throw new Error('Invalid batch owner release')
      releases.push(release)
    }
    // Metadata was admitted before ownership effects; callbacks cannot replace
    // a declared buffer/epoch/sampler while acquiring another owner.
    for(const binding of ownedSamplers.values())if('lifetime' in binding)assertLifetimeSampler(binding.lifetime,binding.sampler,binding.declaration,first.gl)
    for(const binding of targets.values())if(binding.fixed)assertFixedFramebuffer(binding.fixed,first.gl)
    if(first.gl.isContextLost())throw new Error('Brush GL batch context lost during acquisition')
    // Owner callbacks may touch GL: capture precedes them, including failure paths.
    for (const [participant, info] of infos) if (!sameParticipantBinding(participant.brushGlBatchInfo(),info)) throw new Error('Brush GL batch service changed during acquisition')
    frame.open(authority)
    if(borrowed?.restoreAutoUpload)batchUploadScopes.set(frame,{record:borrowed,infos})
    const value: unknown = execute(frame)
    if (value && typeof (value as { then?: unknown }).then === 'function') throw new Error('Brush GL batch callback must be synchronous')
  } catch (error) { if(borrowed?.sequenceChild)borrowed.stepFailure??={error}; failed = true; failure = error }
  finally {
    batchUploadScopes.delete(frame)
    cleanup(() => frame.close(authority))
    if (restore) cleanup(() => { if (!first.gl.isContextLost()) restore!() })
    for (const release of releases.reverse()) cleanup(release)
    cleanup(releaseCpu)
  }
  if(cleanupFailure&&options.onCleanupFailure)try{options.onCleanupFailure(cleanupFailure.error)}catch(error){if(!failed){failed=true;failure=error}}
  if (failed) throw failure
  }catch(error){if(borrowed?.sequenceChild)borrowed.stepFailure??={error};throw error}
}
