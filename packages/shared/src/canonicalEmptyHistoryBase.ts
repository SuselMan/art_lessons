import {decodeCanonicalRecordedSnapshotFrame} from './canonicalRecordedAttachment.js'
import {CANONICAL_RECORDED_ATTACHMENT_LIMITS,canonicalRecordedRasterProfiles,type CanonicalPreparedRecordedOperation,type CanonicalRecordedReadCapability,type CanonicalRecordedReadScope} from './canonicalRecordedAttachment.js'
import {advanceCanonicalMaterialPrefix,CANONICAL_MATERIAL_PREFIX_START,type CanonicalMaterialPrefixState} from './canonicalRecordedPrefix.js'

/** Authenticated room-state metadata only; never an append/execution grant. */
export interface CanonicalEmptyHistoryBaseV1 {
 readonly kind:'empty-room-prefix-v1'
 readonly roomId:string
 readonly boardEpoch:number
 readonly throughSeq:number
 readonly operationCount:number
}
const fail=():never=>{throw new TypeError('Invalid canonical empty history base')}
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER
/** Capture bounded own scalars before any traversal or caller getter. */
export function parseCanonicalEmptyHistoryBase(value:unknown):Readonly<CanonicalEmptyHistoryBaseV1>{
 const fields=['kind','roomId','boardEpoch','throughSeq','operationCount'] as const
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 const keys=Reflect.ownKeys(value)
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!(fields as readonly string[]).includes(k)))return fail()
 const captured:Record<string,unknown>=Object.create(null)
 for(const field of fields){
  const descriptor=Object.getOwnPropertyDescriptor(value,field)
  if(!descriptor||!Object.hasOwn(descriptor,'value'))return fail()
  captured[field]=descriptor.value
 }
 const v=captured
 if(v.kind!=='empty-room-prefix-v1'||!text(v.roomId)||!integer(v.boardEpoch)||!integer(v.throughSeq)||!integer(v.operationCount)
  ||v.throughSeq>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings||v.operationCount!==v.throughSeq)return fail()
 return Object.freeze({kind:'empty-room-prefix-v1',roomId:v.roomId,boardEpoch:v.boardEpoch,throughSeq:v.throughSeq,operationCount:v.operationCount})
}
/** DATA check over ONE complete prepareCanonicalRecordedAttachment batch.
 * That owner already bounds normalized bytes and interns one immutable full
 * capability per gesture. Cross-page concatenations are deliberately refused.
 * The original room-state owner must separately retain delivery/lifetime and
 * actual server range provenance; this helper cannot prove absent DB rows. */
export function verifyCanonicalEmptyHistoryBase(value:unknown,atoms:readonly CanonicalPreparedRecordedOperation[],scope:CanonicalRecordedReadScope):Readonly<CanonicalEmptyHistoryBaseV1>{
 const base=parseCanonicalEmptyHistoryBase(value),profiles=canonicalRecordedRasterProfiles(scope)
 if(base.roomId!==scope.roomId||base.boardEpoch!==scope.boardEpoch||!Array.isArray(atoms)
  ||atoms.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings||atoms.length!==base.operationCount)return fail()
 const ids=new Set<string>(),gestures=new Map<string,{capability:CanonicalRecordedReadCapability;state:CanonicalMaterialPrefixState}>()
 for(let i=0;i<atoms.length;i++){
  const {operation:op,read}=atoms[i]
  if(op.type!=='canonical_stroke'||op.seq!==i+1||!text(op.id)||ids.has(op.id)||!read
   ||read.operationId!==op.id||read.sequence!==op.seq||read.roomId!==base.roomId||read.boardEpoch!==base.boardEpoch
   ||!profiles.includes(read.rasterProfile))return fail()
  const cap=read.capability,s=cap.snapshot
  if(!Object.isFrozen(cap)||!Object.isFrozen(s)||cap.originalUserId!==op.userId||s.strokeId!==op.frame.strokeId
   ||s.layerId!==op.layerId||s.boardEpoch!==base.boardEpoch||s.rasterProfile!==read.rasterProfile||(s.materialVersion!==2&&s.materialVersion!==3&&s.materialVersion!==4&&s.materialVersion!==5&&s.materialVersion!==6&&s.materialVersion!==7)
   ||s.material.version!==s.materialVersion)return fail()
  const key=JSON.stringify([op.userId,s.strokeId]),previous=gestures.get(key)
  if(previous&&previous.capability!==cap)return fail()
  if(!previous&&gestures.size>=CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities)return fail()
  const decoded=decodeCanonicalRecordedSnapshotFrame(op.frame,s,op.frame.frameOrdinal)
  const state=advanceCanonicalMaterialPrefix(previous?.state??CANONICAL_MATERIAL_PREFIX_START,op.frame.frameOrdinal,decoded.frame)
  gestures.set(key,{capability:cap,state});ids.add(op.id)
 }
 return base
}
