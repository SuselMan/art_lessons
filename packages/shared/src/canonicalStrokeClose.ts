import type {OperationBase} from './operationBase.js'
import type {verifyCanonicalRecordedPrefix} from './canonicalRecordedPrefix.js'

/** Explicit recorded metadata, never an authored material frame or a grant. */
export type CanonicalStrokeCloseOperation=OperationBase&{
 type:'canonical_stroke_close'
 layerId:string
 targetUserId:string
 strokeId:string
 disposition:'commitPartial'
 recordedNext:number
 firstFrameOpId:string
 lastFrameOpId:string
}
export interface CanonicalStrokeCloseRequest {
 readonly operationId:string
 readonly layerId:string
 readonly targetUserId:string
 readonly strokeId:string
 readonly disposition:'commitPartial'
 readonly expectedRecordedNext:number
 readonly expectedLastFrameOpId:string
}
export type RecordedCanonicalStrokeCloseOperation=Readonly<CanonicalStrokeCloseOperation&{seq:number}>
export interface CanonicalRecordedCloseSeal {
 readonly kind:'commitPartial'
 readonly closeOperationId:string
 readonly closeSeq:number
 readonly recordedNext:number
 readonly firstOperationId:string
 readonly lastOperationId:string
 readonly firstSeq:number
 readonly lastSeq:number
}
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<Number.MAX_SAFE_INTEGER
const fail=():never=>{throw new TypeError('Invalid canonical stroke close metadata')}
function closed(value:unknown,fields:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 const keys=Reflect.ownKeys(value)
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return fail()
 const captured:Record<string,unknown>=Object.create(null)
 for(const field of fields){
  const descriptor=Object.getOwnPropertyDescriptor(value,field)
  if(!descriptor||!Object.hasOwn(descriptor,'value'))return fail()
  captured[field]=descriptor.value
 }
 return captured
}
/** Bounded own scalar fields before copying. A parsed request grants nothing. */
export function parseCanonicalStrokeCloseRequest(value:unknown):Readonly<CanonicalStrokeCloseRequest>{
 const v=closed(value,['operationId','layerId','targetUserId','strokeId','disposition','expectedRecordedNext','expectedLastFrameOpId'])
 if(!text(v.operationId)||!text(v.layerId)||!text(v.targetUserId)||!text(v.strokeId)||v.disposition!=='commitPartial'||!positive(v.expectedRecordedNext)||!text(v.expectedLastFrameOpId))return fail()
 return Object.freeze({operationId:v.operationId,layerId:v.layerId,targetUserId:v.targetUserId,strokeId:v.strokeId,disposition:'commitPartial',expectedRecordedNext:v.expectedRecordedNext,expectedLastFrameOpId:v.expectedLastFrameOpId})
}
/** Recorded/wire parser: seq is mandatory. Does not authenticate actor, row,
 * target, source binding, complete prefix, read scope or execution authority.
 * seq means authoritative server placement, NEVER a rewritten local journal
 * ordinal. Journal owners must supply their original entry.serverSeq. */
export function parseCanonicalStrokeCloseOperation(value:unknown):RecordedCanonicalStrokeCloseOperation{
 const v=closed(value,['type','id','userId','timestamp','seq','layerId','targetUserId','strokeId','disposition','recordedNext','firstFrameOpId','lastFrameOpId'])
 if(v.type!=='canonical_stroke_close'||!text(v.id)||!text(v.userId)||typeof v.timestamp!=='number'||!Number.isFinite(v.timestamp)||v.timestamp<0||!positive(v.seq)
  ||!text(v.layerId)||!text(v.targetUserId)||!text(v.strokeId)||v.disposition!=='commitPartial'||!positive(v.recordedNext)||!text(v.firstFrameOpId)||!text(v.lastFrameOpId))return fail()
 return Object.freeze({type:'canonical_stroke_close',id:v.id,userId:v.userId,timestamp:v.timestamp,seq:v.seq,layerId:v.layerId,targetUserId:v.targetUserId,strokeId:v.strokeId,disposition:'commitPartial',recordedNext:v.recordedNext,firstFrameOpId:v.firstFrameOpId,lastFrameOpId:v.lastFrameOpId})
}
/** Pure metadata law over the SAME already decoded/verified prefix summary.
 * Caller owns complete-prefix provenance, immutable gesture binding, global
 * operation-ID uniqueness and permissions. This result is NOT a source/read/
 * execution grant and never rewrites material fences or commits live-only ink. */
export function verifyCanonicalRecordedClose(prefix:ReturnType<typeof verifyCanonicalRecordedPrefix>,identity:{readonly userId:string;readonly layerId:string;readonly strokeId:string},value:unknown):Readonly<CanonicalRecordedCloseSeal>{
 const close=parseCanonicalStrokeCloseOperation(value)
 if(!text(identity?.userId)||!text(identity.layerId)||!text(identity.strokeId)||!prefix||prefix.ended!==false||prefix.endSeq!==undefined
  ||!positive(prefix.recordedNext)||prefix.nextOrdinal!==prefix.recordedNext||!positive(prefix.firstSeq)||!positive(prefix.lastSeq)||prefix.firstSeq>prefix.lastSeq
  ||!text(prefix.firstOperationId)||!text(prefix.lastOperationId)
  ||(prefix.recordedNext===1?(prefix.firstOperationId!==prefix.lastOperationId||prefix.firstSeq!==prefix.lastSeq):(prefix.firstOperationId===prefix.lastOperationId||prefix.firstSeq>=prefix.lastSeq))
  ||close.targetUserId!==identity.userId||close.layerId!==identity.layerId||close.strokeId!==identity.strokeId||close.recordedNext!==prefix.recordedNext
  ||close.firstFrameOpId!==prefix.firstOperationId||close.lastFrameOpId!==prefix.lastOperationId||close.seq<=prefix.lastSeq||close.id===prefix.firstOperationId||close.id===prefix.lastOperationId)return fail()
 return Object.freeze({kind:'commitPartial',closeOperationId:close.id,closeSeq:close.seq,recordedNext:prefix.recordedNext,firstOperationId:prefix.firstOperationId,lastOperationId:prefix.lastOperationId,firstSeq:prefix.firstSeq,lastSeq:prefix.lastSeq})
}

/** Ephemeral control only; never a recorded close, source grant or tombstone. */
export interface CanonicalStrokeDiscardEmptyRequest {readonly layerId:string;readonly strokeId:string;readonly boardEpoch:number;readonly emptyDiscardNonce:string}
export type CanonicalStrokeDiscardEmptyResult={readonly ok:true;readonly discarded:boolean}|{readonly ok:false;readonly reason:'invalid_operation'|'not_joined'|'canonical_repair_required'|'server_error'}
export function parseCanonicalStrokeDiscardEmptyRequest(value:unknown):Readonly<CanonicalStrokeDiscardEmptyRequest>{
 const v=closed(value,['layerId','strokeId','boardEpoch','emptyDiscardNonce'])
 if(!text(v.layerId)||!text(v.strokeId)||typeof v.emptyDiscardNonce!=='string'||!/^[A-Za-z0-9_-]{10,64}$/.test(v.emptyDiscardNonce)||typeof v.boardEpoch!=='number'||!Number.isSafeInteger(v.boardEpoch)||v.boardEpoch<0||v.boardEpoch>=Number.MAX_SAFE_INTEGER)return fail()
 return Object.freeze({layerId:v.layerId,strokeId:v.strokeId,boardEpoch:v.boardEpoch,emptyDiscardNonce:v.emptyDiscardNonce})
}
