import {decodeCanonicalRecordedSnapshotFrame} from './canonicalRecordedAttachment.js'
import type {Operation} from './operations.js'
import {CANONICAL_RECORDED_ATTACHMENT_LIMITS,canonicalRecordedRasterProfiles,type CanonicalPreparedRecordedOperation,type CanonicalRecordedReadCapability,type CanonicalRecordedReadScope} from './canonicalRecordedAttachment.js'
import {verifyCanonicalRecordedPrefix,advanceCanonicalMaterialPrefix,CANONICAL_MATERIAL_PREFIX_START,type CanonicalMaterialPrefixState,type CanonicalRecordedPrefixFrame} from './canonicalRecordedPrefix.js'
import {parseCanonicalStrokeCloseOperation,verifyCanonicalRecordedClose} from './canonicalStrokeClose.js'

/** Explicit whole-history format. V1 remains frame-only and is not widened. */
export interface CanonicalFullHistoryBaseV2 {
 readonly kind:'full-room-prefix-v2'
 readonly roomId:string
 readonly boardEpoch:number
 readonly throughSeq:number
 readonly operationCount:number
}
const fail=():never=>{throw new TypeError('Invalid canonical full history base')}
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER
function fields(value:unknown,names:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 const keys=Reflect.ownKeys(value)
 if(keys.length!==names.length||keys.some(k=>typeof k!=='string'||!names.includes(k)))return fail()
 const result:Record<string,unknown>=Object.create(null)
 for(const name of names){const d=Object.getOwnPropertyDescriptor(value,name);if(!d||!Object.hasOwn(d,'value'))return fail();result[name]=d.value}
 return result
}
export function parseCanonicalFullHistoryBase(value:unknown):Readonly<CanonicalFullHistoryBaseV2>{
 const v=fields(value,['kind','roomId','boardEpoch','throughSeq','operationCount'])
 if(v.kind!=='full-room-prefix-v2'||!text(v.roomId)||!integer(v.boardEpoch)||!integer(v.throughSeq)
  ||v.throughSeq>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings||v.operationCount!==v.throughSeq)return fail()
 return Object.freeze({kind:'full-room-prefix-v2',roomId:v.roomId,boardEpoch:v.boardEpoch,throughSeq:v.throughSeq,operationCount:v.throughSeq})
}
export type CanonicalFullHistoryMetadata=Extract<Operation,{type:'canonical_stroke_close'|'operation_undo'|'operation_redo'}>
/** Normalize only the bounded metadata admitted by the explicit V2 history. */
export function captureCanonicalFullHistoryMetadata(value:unknown):Readonly<CanonicalFullHistoryMetadata>{
 if(!value||typeof value!=='object')return fail()
 const type=Object.getOwnPropertyDescriptor(value,'type')
 if(!type||!Object.hasOwn(type,'value'))return fail()
 if(type.value==='canonical_stroke_close')return parseCanonicalStrokeCloseOperation(value)
 const v=fields(value,['type','id','userId','timestamp','seq','targetOpId'])
 if((v.type!=='operation_undo'&&v.type!=='operation_redo')||!text(v.id)||!text(v.userId)||!text(v.targetOpId)
  ||typeof v.timestamp!=='number'||!Number.isFinite(v.timestamp)||v.timestamp<0||!integer(v.seq)||v.seq<1)return fail()
 return Object.freeze({type:v.type,id:v.id,userId:v.userId,targetOpId:v.targetOpId,timestamp:v.timestamp,seq:v.seq})
}
interface Gesture {
 readonly capability:CanonicalRecordedReadCapability
 readonly frames:CanonicalRecordedPrefixFrame[]
 state:CanonicalMaterialPrefixState
 sealed:boolean
 visible:boolean
 redoable:boolean
}
/** Derived history DATA only: neither paint authority nor permission to admit a
 * new command. Accepted historical redo remains replay-valid after a branch. */
export function transitionCanonicalHistoryGesture(state:{readonly visible:boolean;readonly redoable:boolean},action:'undo'|'redo'|'new-own-gesture'):Readonly<{visible:boolean;redoable:boolean}>{
 if(action==='redo')return Object.freeze({visible:true,redoable:true})
 if(action==='undo')return Object.freeze({visible:false,redoable:state.visible||state.redoable})
 return Object.freeze({visible:state.visible,redoable:state.visible&&state.redoable})
}
export interface CanonicalFullHistoryGesture {
 readonly userId:string
 readonly layerId:string
 readonly strokeId:string
 readonly frameOperationIds:readonly string[]
 readonly ended:boolean
 readonly sealed:boolean
 readonly visible:boolean
 readonly redoable:boolean
}
/** DATA validation of one complete prepared batch, not proof of an absent DB
 * row, actor permissions, original delivery lifetime or an execution grant.
 * The original read owner must retain its full indexed range receipt. */
export function verifyCanonicalFullHistoryBase(value:unknown,atoms:readonly CanonicalPreparedRecordedOperation[],scope:CanonicalRecordedReadScope):{
 readonly base:Readonly<CanonicalFullHistoryBaseV2>;readonly gestures:readonly CanonicalFullHistoryGesture[]
}{
 const base=parseCanonicalFullHistoryBase(value),profiles=canonicalRecordedRasterProfiles(scope)
 if(base.roomId!==scope.roomId||base.boardEpoch!==scope.boardEpoch||!Array.isArray(atoms)
  ||atoms.length!==base.operationCount||atoms.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)return fail()
 const ids=new Set<string>(),gestures=new Map<string,Gesture>(),targets=new Map<string,Gesture>()
 for(let i=0;i<atoms.length;i++){
  const {operation:op,read}=atoms[i]
  if(!op||!text(op.id)||!text(op.userId)||op.seq!==i+1||ids.has(op.id))return fail()
  if(op.type==='canonical_stroke'){
   if(!read||read.operationId!==op.id||read.sequence!==op.seq||read.roomId!==base.roomId||read.boardEpoch!==base.boardEpoch||!profiles.includes(read.rasterProfile))return fail()
   const cap=read.capability,s=cap.snapshot
   if(!Object.isFrozen(cap)||!Object.isFrozen(s)||cap.originalUserId!==op.userId||s.strokeId!==op.frame.strokeId||s.layerId!==op.layerId
    ||s.boardEpoch!==base.boardEpoch||s.rasterProfile!==read.rasterProfile||(s.materialVersion!==2&&s.materialVersion!==3&&s.materialVersion!==4&&s.materialVersion!==5&&s.materialVersion!==6)||s.material.version!==s.materialVersion)return fail()
   const key=JSON.stringify([op.userId,s.strokeId]),previous=gestures.get(key)
   if(previous&&(previous.capability!==cap||previous.sealed))return fail()
   if(!previous&&gestures.size>=CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities)return fail()
   const decoded=decodeCanonicalRecordedSnapshotFrame(op.frame,s,op.frame.frameOrdinal)
   if(!previous)for(const group of gestures.values())if(group.capability.originalUserId===op.userId)Object.assign(group,transitionCanonicalHistoryGesture(group,'new-own-gesture'))
   const group:Gesture=previous??{capability:cap,frames:[],state:CANONICAL_MATERIAL_PREFIX_START,sealed:false,visible:true,redoable:true}
   group.frames.push({operationId:op.id,sequence:op.seq,frameOrdinal:op.frame.frameOrdinal,decoded:decoded.frame})
   group.state=advanceCanonicalMaterialPrefix(group.state,op.frame.frameOrdinal,decoded.frame)
   gestures.set(key,group);targets.set(op.id,group)
  }else if(op.type==='canonical_stroke_close'){
   const close=parseCanonicalStrokeCloseOperation(op),group=gestures.get(JSON.stringify([close.targetUserId,close.strokeId]))
   if(!group||group.sealed)return fail()
   verifyCanonicalRecordedClose(verifyCanonicalRecordedPrefix(group.frames),{userId:group.capability.originalUserId,layerId:group.capability.snapshot.layerId,strokeId:group.capability.snapshot.strokeId},close)
   group.sealed=true
  }else if(op.type==='operation_undo'||op.type==='operation_redo'){
   const metadata=captureCanonicalFullHistoryMetadata(op)
   if(metadata.type==='canonical_stroke_close')return fail()
   const group=targets.get(metadata.targetOpId)
   if(!group||group.capability.originalUserId!==op.userId||!group.sealed&&!group.state.ended)return fail()
   // Repeated server-accepted undo/redo is idempotent, matching the log.
   Object.assign(group,transitionCanonicalHistoryGesture(group,op.type==='operation_redo'?'redo':'undo'));targets.set(op.id,group)
  }else return fail()
  ids.add(op.id)
 }
 const result=[...gestures.values()].map(group=>Object.freeze({userId:group.capability.originalUserId,layerId:group.capability.snapshot.layerId,
  strokeId:group.capability.snapshot.strokeId,frameOperationIds:Object.freeze(group.frames.map(frame=>frame.operationId)),
  ended:group.state.ended,sealed:group.sealed,visible:group.visible,redoable:group.redoable}))
 return Object.freeze({base,gestures:Object.freeze(result)})
}
