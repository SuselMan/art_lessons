import {prepareCanonicalImageAssets} from '../../../lib/api/brushLibrary'
import {CANONICAL_RECORDED_ATTACHMENT_LIMITS,captureCanonicalFullHistoryMetadata,canonicalRecordedRasterProfiles,parseCanonicalStrokeCloseOperation,type CanonicalMaterialAsset,type CanonicalPreparedRecordedOperation,type CanonicalRecordedReadScope} from '@grafetto/shared'
import type {CanonicalRecordedDelivery,CanonicalRecordedInput,CanonicalRecordedLifetime} from '../../../engine'

type LocalScope=CanonicalRecordedReadScope&{readonly isCurrent:()=>boolean}
const origin:unique symbol=Symbol('original-recorded-read-lifetime')
type OwnedScope=LocalScope&{readonly [origin]?:(this:OwnedScope,candidate:unknown)=>CanonicalRecordedLifetime}
const fail=():never=>{throw new TypeError('Stale or foreign canonical recorded delivery')}

/** Captures data policy normally. Execution lifetime exists ONLY when the
 * original room-state preparer supplies its private read-owner closure, or
 * when recapturing that same original scope through its guarded origin. */
export function captureCanonicalLocalReadScope(scope:LocalScope,initialLifetime?:()=>CanonicalRecordedLifetime):LocalScope {
 const source=scope as OwnedScope,descriptor=Object.getOwnPropertyDescriptor(source,origin)
 if(descriptor&&(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function'))return fail()
 const original=descriptor?.value as OwnedScope[typeof origin]
 const resolve=original?()=>original.call(source,source):initialLifetime
 const roomId=scope.roomId,boardEpoch=scope.boardEpoch,allowedRasterProfiles=canonicalRecordedRasterProfiles(scope),isCurrent=scope.isCurrent
 let captured:OwnedScope
 captured=Object.freeze({roomId,boardEpoch,allowedRasterProfiles,isCurrent,...resolve?{
  [origin]:function(this:OwnedScope,candidate:unknown){
   if(this!==captured||candidate!==captured||!isCurrent())return fail()
   return resolve()
  }}:{}})
 return captured
}
export function canonicalRecordedLifetimeOf(scope:LocalScope):CanonicalRecordedLifetime|undefined {
 const owned=scope as OwnedScope,descriptor=Object.getOwnPropertyDescriptor(owned,origin)
 if(!descriptor)return undefined
 if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function'||!scope.isCurrent())return fail()
 const lifetime=(descriptor.value as NonNullable<OwnedScope[typeof origin]>).call(owned,owned)
 if(!lifetime||typeof lifetime.assertCurrent!=='function')return fail()
 const current=lifetime.assertCurrent(),a=canonicalRecordedRasterProfiles(current),b=canonicalRecordedRasterProfiles(scope)
 if(current.roomId!==scope.roomId||current.boardEpoch!==scope.boardEpoch||a.length!==b.length||a.some((p,i)=>p!==b[i]))return fail()
 return lifetime
}
/** Immutable per-delivery lexical resource. A data-only scope, a copied atom
 * or copied method receiver cannot manufacture the original input lifetime. */
export function attachCanonicalRecordedDelivery(atom:CanonicalPreparedRecordedOperation,scope:LocalScope):CanonicalPreparedRecordedOperation|CanonicalRecordedInput {
 const metadata=atom.operation.type==='operation_undo'||atom.operation.type==='operation_redo'
 if(atom.operation.type!=='canonical_stroke'&&atom.operation.type!=='canonical_stroke_close'&&!metadata)return atom
 const lifetime=canonicalRecordedLifetimeOf(scope)
 if(!lifetime)return atom
 const originalScope=lifetime.assertCurrent()
 const operation=atom.operation
 if(metadata){
  // Only the original full-history owner may lend metadata delivery authority.
  const full=lifetime as CanonicalRecordedLifetime&{readonly assertFullHistoryBase?:unknown;readonly tailOperations?:readonly unknown[]}
  if(typeof full.assertFullHistoryBase!=='function'||atom.read||!full.tailOperations?.includes(operation))return fail()
  captureCanonicalFullHistoryMetadata(operation)
  if(!Object.isFrozen(operation))return fail()
 }
 if(operation.type==='canonical_stroke_close'){
  // Validate the closed scalar schema, but keep the original normalized atom.
  // Mutable wire metadata must first be captured by its full-history owner.
  parseCanonicalStrokeCloseOperation(operation)
  if(!Object.isFrozen(operation))return fail()
 }
 if(operation.type==='canonical_stroke'&&(!atom.read||atom.read.roomId!==scope.roomId||atom.read.boardEpoch!==scope.boardEpoch
   ||atom.read.operationId!==operation.id||atom.read.sequence!==operation.seq))return fail()
 let input:CanonicalRecordedInput,delivery:CanonicalRecordedDelivery
 delivery=Object.freeze({lifetime,assertCurrent(this:CanonicalRecordedDelivery,candidate:CanonicalRecordedInput){
  if(this!==delivery||candidate!==input||canonicalRecordedLifetimeOf(scope)!==lifetime||lifetime.assertCurrent()!==originalScope)return fail()
 }})
 // Local execution capability never enters operation JSON or spread copies.
 input=Object.freeze(Object.defineProperty({...atom,operation},'delivery',{value:delivery})) as CanonicalRecordedInput
 delivery.assertCurrent(input)
 return input
}

/** Availability preparation only, attached to the SAME original ingress atoms.
 * Native-only items retain their synchronous path. No source owner is minted. */
export function prepareCanonicalRecordedImageResources(atoms:readonly CanonicalPreparedRecordedOperation[],scope:LocalScope,assertFiniteCurrent?:()=>void):Promise<void>|null {
 if(atoms.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)throw new RangeError('Canonical resource atom limit')
 if(!atoms.some(atom=>(atom.read?.capability.snapshot.materialVersion===2||atom.read?.capability.snapshot.materialVersion===3)&&atom.read.capability.snapshot.material.primarySource.kind==='image'))return null
 const lifetime=canonicalRecordedLifetimeOf(scope)
 if(!lifetime)return fail()
 let hasTexture=false
 const legacyAssets=new Set<string>()
 const originalScope=lifetime.assertCurrent(),inputs:CanonicalRecordedInput[]=[],contexts=new Set<object>(),assets=new Map<string,CanonicalMaterialAsset>()
 for(const atom of atoms){
  const field=Object.getOwnPropertyDescriptor(atom,'delivery')
  if(!field||!Object.hasOwn(field,'value'))return fail()
  const input=atom as CanonicalRecordedInput
  if(input.delivery.lifetime!==lifetime)return fail()
  input.delivery.assertCurrent(input);inputs.push(input)
  if(!input.read)continue
  contexts.add(input.read.capability)
  if(contexts.size>CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities)throw new RangeError('Canonical resource capability limit')
  const snapshot=input.read.capability.snapshot
  if((snapshot.materialVersion!==2&&snapshot.materialVersion!==3)||snapshot.material.primarySource.kind!=='image')continue
  if(snapshot.materialVersion===3)hasTexture=true
  for(const asset of snapshot.material.assets){
   if(snapshot.materialVersion===2)legacyAssets.add(asset.id)
   const previous=assets.get(asset.id)
   if(previous&&previous.size!==asset.size)throw new TypeError('Conflicting original image resource side')
   assets.set(asset.id,asset)
  }
 }
 const assertCurrent=()=>{
  assertFiniteCurrent?.()
  if(canonicalRecordedLifetimeOf(scope)!==lifetime||lifetime.assertCurrent()!==originalScope)return fail()
  for(const input of inputs)input.delivery.assertCurrent(input)
  assertFiniteCurrent?.()
 }
 assertCurrent()
 const selected=[...assets.values()]
 if(!hasTexture)return prepareCanonicalImageAssets(scope.roomId,selected,assertCurrent)
 if(legacyAssets.size>CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities)throw new RangeError('Canonical legacy image resource asset limit')
 if(selected.length>2*CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities)throw new RangeError('Canonical texture resource asset limit')
 // Finite availability calls share the original owner, not a new ingress queue.
 return(async()=>{
  for(let at=0;at<selected.length;at+=CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities){
   assertCurrent()
   await prepareCanonicalImageAssets(scope.roomId,selected.slice(at,at+CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities),assertCurrent)
   assertCurrent()
  }
 })()
}
