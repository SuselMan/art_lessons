import {prepareCanonicalImageAssets} from '../../../lib/api/brushLibrary'
import {canonicalSoftAutoDataEqual,canonicalImageMaterialReadSource,canonicalPlainAutoGeometryReadSource,canonicalPixelMaskedReadSource,prepareCanonicalRecordedAttachment,prepareCanonicalRecordedAttachmentV8,canonicalPrimaryGrainReadSource,type Operation,CANONICAL_RECORDED_ATTACHMENT_LIMITS,captureCanonicalFullHistoryMetadata,canonicalRecordedRasterProfiles,parseCanonicalStrokeCloseOperation,type CanonicalMaterialAsset,type CanonicalPreparedRecordedOperationV8 as CanonicalPreparedRecordedOperation,type CanonicalRecordedReadScope} from '@grafetto/shared'
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
type RecordedCapability=NonNullable<CanonicalPreparedRecordedOperation['read']>['capability']
// Optimization only: no retained snapshot graph and no new delivery authority.
// The existing capability64 limit also bounds weak cache index metadata.
const sharedReadCapabilities=new WeakMap<CanonicalRecordedLifetime,{readonly slots:WeakRef<RecordedCapability>[];next:number}>()
/** Parser results are deeply frozen DATA. A custom atom is never promoted into
 * the sharing table merely because its outer wrapper happens to be frozen. */
function frozenCapabilityData(value:unknown):boolean {
 let nodes=0
 const ancestors=new Set<object>()
 const visit=(v:unknown,depth:number):boolean=>{
  if(++nodes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilityBytes||depth>64)return false
  if(v===null||typeof v==='string'||typeof v==='boolean'||v===undefined)return true
  if(typeof v==='number')return Number.isFinite(v)
  if(typeof v!=='object'||!Object.isFrozen(v)||ancestors.has(v))return false
  const array=Array.isArray(v),prototype=Object.getPrototypeOf(v)
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)return false
  const keys=Reflect.ownKeys(v),length=array?Object.getOwnPropertyDescriptor(v,'length')?.value:undefined
  if(array&&(!Number.isSafeInteger(length)||length<0||length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilityBytes||keys.length!==length+1))return false
  ancestors.add(v)
  try{
   for(const key of keys){
    if(typeof key!=='string')return false
    const field=Object.getOwnPropertyDescriptor(v,key)
    if(array&&key==='length')continue
    if(array&&(!Number.isSafeInteger(Number(key))||Number(key)<0||Number(key)>=length||String(Number(key))!==key))return false
    if(!field||!Object.hasOwn(field,'value')||field.enumerable!==true||!visit(field.value,depth+1))return false
   }
   return true
  }finally{ancestors.delete(v)}
 }
 return visit(value,0)
}
function shareRecordedCapability(atom:CanonicalPreparedRecordedOperation,lifetime:CanonicalRecordedLifetime):CanonicalPreparedRecordedOperation {
 const read=atom.read,capability=read?.capability
 if(!read||!capability||!frozenCapabilityData(capability))return atom
 let table=sharedReadCapabilities.get(lifetime)
 if(!table){table={slots:[],next:0};sharedReadCapabilities.set(lifetime,table)}
 let vacant:number|undefined
 for(let index=0;index<table.slots.length;index++){
  const previous=table.slots[index].deref()
  if(!previous){vacant??=index;continue}
  if(previous.originalUserId!==capability.originalUserId||previous.snapshot.layerId!==capability.snapshot.layerId||previous.snapshot.strokeId!==capability.snapshot.strokeId)continue
  // ALL normalized fields, including coefficient/signed-zero bits, must match.
  // A descriptor ID or stroke namespace alone never permits substitution.
  if(!canonicalSoftAutoDataEqual(previous,capability))throw new TypeError('Original recorded stroke capability changed')
  if(previous===capability)return atom
  return Object.freeze({...atom,read:Object.freeze({...read,capability:previous})})
 }
 // No strong namespace-string keys or snapshot graph survives this call.
 const reference=new WeakRef(capability)
 if(vacant!==undefined)table.slots[vacant]=reference
 else if(table.slots.length<CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities)table.slots.push(reference)
 else{table.slots[table.next]=reference;table.next=(table.next+1)%CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities}
 return atom
}

/** Select the named format8 decoder only from the SAME original READ owner. */
export function prepareCanonicalOriginalAttachment(capabilities:unknown,operations:readonly Operation[],scope:LocalScope):readonly CanonicalPreparedRecordedOperation[] {
 const lifetime=canonicalRecordedLifetimeOf(scope)
 const profile=lifetime&&Object.getOwnPropertyDescriptor(lifetime,'authorRasterProfile')
 if(profile&&!Object.hasOwn(profile,'value'))return fail()
 const enabled=!!lifetime&&!!profile&&(canonicalPrimaryGrainReadSource(lifetime,'primaryGrainSource',profile.value)==='primary-grain-image-v1'||canonicalPlainAutoGeometryReadSource(lifetime,'plainAutoGeometrySource',profile.value)==='dynamic-auto-geometry-v1'||canonicalPixelMaskedReadSource(lifetime,'pixelMaskedSource',profile.value)==='pixel-masked-v1'||canonicalImageMaterialReadSource(lifetime,'imageMaterialSource',profile.value)==='pixel-image-material-v1')
 const prepared=enabled?prepareCanonicalRecordedAttachmentV8(capabilities,operations,scope):prepareCanonicalRecordedAttachment(capabilities,operations,scope)
 if(prepared.some(a=>a.read?.capability.snapshot.materialVersion===2&&a.read.capability.snapshot.material.maskingBlend!==undefined)&&(!lifetime||!profile||canonicalPixelMaskedReadSource(lifetime,'pixelMaskedSource',profile.value)!=='pixel-masked-v1'))return fail()
 if(lifetime&&canonicalRecordedLifetimeOf(scope)!==lifetime)return fail()
 return lifetime?Object.freeze(prepared.map(atom=>shareRecordedCapability(atom,lifetime))):prepared
}
/** Immutable per-delivery lexical resource. A data-only scope, a copied atom
 * or copied method receiver cannot manufacture the original input lifetime. */
export function attachCanonicalRecordedDelivery(atom:CanonicalPreparedRecordedOperation,scope:LocalScope):CanonicalPreparedRecordedOperation|CanonicalRecordedInput {
 const metadata=atom.operation.type==='operation_undo'||atom.operation.type==='operation_redo'
 if(atom.operation.type!=='canonical_stroke'&&atom.operation.type!=='canonical_stroke_close'&&!metadata)return atom
 const lifetime=canonicalRecordedLifetimeOf(scope)
 if(!lifetime)return atom
 const originalScope=lifetime.assertCurrent()
 if(atom.read?.capability.snapshot.materialVersion===2&&(atom.read.capability.snapshot.material.materialParams||atom.read.capability.snapshot.material.colorParams||atom.read.capability.snapshot.material.scaledSource||atom.read.capability.snapshot.material.imageFrameIndices||atom.read.capability.snapshot.material.sourceColorFields||atom.read.capability.snapshot.material.roleTextures||atom.read.capability.snapshot.material.outerCompositionLaw)&&!atom.read.capability.snapshot.material.maskSource){const profile=Object.getOwnPropertyDescriptor(lifetime,'authorRasterProfile');if(!profile||!Object.hasOwn(profile,'value'))return fail();if(atom.read.capability.snapshot.material.primarySource.kind==='image'?canonicalImageMaterialReadSource(lifetime,'imageMaterialSource',profile.value)!=='pixel-image-material-v1':canonicalPlainAutoGeometryReadSource(lifetime,'plainAutoGeometrySource',profile.value)!=='dynamic-auto-geometry-v1')return fail()}
 if(atom.read?.capability.snapshot.materialVersion===2&&atom.read.capability.snapshot.material.primarySource.kind==='image'&&atom.read.capability.snapshot.material.primarySource.imageMaterial){const profile=Object.getOwnPropertyDescriptor(lifetime,'authorRasterProfile');if(!profile||!Object.hasOwn(profile,'value')||canonicalImageMaterialReadSource(lifetime,'imageMaterialSource',profile.value)!=='pixel-image-material-v1')return fail()}
 if(atom.read?.capability.snapshot.materialVersion===2&&atom.read.capability.snapshot.material.maskingBlend!==undefined){const profile=Object.getOwnPropertyDescriptor(lifetime,'authorRasterProfile');if(!profile||!Object.hasOwn(profile,'value')||canonicalPixelMaskedReadSource(lifetime,'pixelMaskedSource',profile.value)!=='pixel-masked-v1')return fail()}
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
 // Initial room_state atoms already share within their batch. Seed that
 // exact capability after its genuine lifetime exists; later pages/live ACKs
 // are canonicalized before their accepted-payload closures retain read DATA.
 const shared=shareRecordedCapability(atom,lifetime)
 input=Object.freeze(Object.defineProperty({...shared,operation},'delivery',{value:delivery})) as CanonicalRecordedInput
 delivery.assertCurrent(input)
 return input
}

/** Availability preparation only, attached to the SAME original ingress atoms.
 * Native-only items retain their synchronous path. No source owner is minted. */
export function prepareCanonicalRecordedImageResources(atoms:readonly CanonicalPreparedRecordedOperation[],scope:LocalScope,assertFiniteCurrent?:()=>void):Promise<void>|null {
 if(atoms.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)throw new RangeError('Canonical resource atom limit')
 if(!atoms.some(atom=>{const s=atom.read?.capability.snapshot;return s&&(s.materialVersion===2||s.materialVersion===3||s.materialVersion===4||s.materialVersion===5||s.materialVersion===6||s.materialVersion===7||s.materialVersion===8)&&(s.materialVersion===4||s.materialVersion===5||s.materialVersion===6||s.materialVersion===7||s.materialVersion===8||s.material.primarySource.kind==='image')}))return null
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
  if((snapshot.materialVersion!==2&&snapshot.materialVersion!==3&&snapshot.materialVersion!==4&&snapshot.materialVersion!==5&&snapshot.materialVersion!==6&&snapshot.materialVersion!==7&&snapshot.materialVersion!==8)||(snapshot.materialVersion!==4&&snapshot.materialVersion!==5&&snapshot.materialVersion!==6&&snapshot.materialVersion!==7&&snapshot.materialVersion!==8&&snapshot.material.primarySource.kind!=='image'))continue
  if(snapshot.materialVersion===3||snapshot.materialVersion===4||snapshot.materialVersion===5||snapshot.materialVersion===6||snapshot.materialVersion===7||snapshot.materialVersion===8)hasTexture=true
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
