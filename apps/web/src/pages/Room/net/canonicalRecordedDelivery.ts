import {canonicalRecordedRasterProfiles,parseCanonicalStrokeCloseOperation,type CanonicalPreparedRecordedOperation,type CanonicalRecordedReadScope} from '@grafetto/shared'
import type {CanonicalRecordedDelivery,CanonicalRecordedInput,CanonicalRecordedLifetime} from '../../../engine/src/oplog/CanonicalRecordedDelivery'

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
 if(atom.operation.type!=='canonical_stroke'&&atom.operation.type!=='canonical_stroke_close')return atom
 const lifetime=canonicalRecordedLifetimeOf(scope)
 if(!lifetime)return atom
 const originalScope=lifetime.assertCurrent()
 const operation=atom.operation.type==='canonical_stroke_close'?parseCanonicalStrokeCloseOperation(atom.operation):atom.operation
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
