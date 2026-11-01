import type {Operation} from './operations.js'
import {canonicalRecordedRasterProfiles,type CanonicalRecordedReadScope,type CanonicalRecordedAttachmentV1} from './canonicalRecordedAttachment.js'
import {CANONICAL_STROKE_RASTER_CONTRACTS,canonicalStrokeRasterContract,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'

/** Closed indexed-history wire DATA. Parsing these shapes never grants original
 * input authority: actual authenticated ingress owns the read lifetime. */
export type CanonicalIndexedOperation = Extract<Operation, {
  type:'canonical_stroke'|'canonical_stroke_close'|'operation_undo'|'operation_redo'
}>
export type CanonicalHistoryAction = 'undo'|'redo'
export interface CanonicalIndexedRoomGeometry { readonly width:number; readonly height:number; readonly infinite:false }

// SHARED WIRE DATA ONLY. Numeric invariants require actual closed validators:
// C integer0..DBIntMax; floor0; operationCount===C; dense actual seq1..C.
export interface CanonicalIndexedHistoryOfferV1 {
  readonly kind:'canonical-indexed-history-offer-v1'
  readonly offerId:string
  readonly scope:Readonly<CanonicalRecordedReadScope>
  readonly roomGeometry:CanonicalIndexedRoomGeometry
  readonly authorRasterProfile:CanonicalStrokeRasterProfile
}
export interface CanonicalHistoryOpenRequestV1 {
  readonly kind:'canonical-history-open-v1'
  readonly offerId:string
  readonly roomId:string
  readonly boardEpoch:number
}
export interface CanonicalIndexedHistoryBeginV1 {
  readonly kind:'canonical-indexed-history-begin-v1'
  readonly streamId:string
  readonly offerId:string
  readonly scope:Readonly<CanonicalRecordedReadScope>
  readonly roomGeometry:CanonicalIndexedRoomGeometry
  readonly authorRasterProfile:CanonicalStrokeRasterProfile
  readonly floor:0
  readonly throughSeq:number
  readonly operationCount:number // === throughSeq, never frames count
}
export interface CanonicalIndexedHistoryFinishV1 {
  readonly kind:'canonical-indexed-history-finish-v1'
  readonly streamId:string
  readonly throughSeq:number
  readonly operationCount:number // === C
  readonly lastSeq:number // === C
}
export interface CanonicalIndexedHistoryFollowV1 {
 readonly kind:'canonical-indexed-history-follow-v1'
 readonly streamId:string
 readonly parentStreamId:string
 readonly scope:Readonly<CanonicalRecordedReadScope>
 readonly roomGeometry:CanonicalIndexedRoomGeometry
 readonly authorRasterProfile:CanonicalStrokeRasterProfile
 readonly floor:number
 readonly throughSeq:number
 readonly operationCount:number
 /** Observed producer watermark only, never original read/paint authority. */
 readonly latestObservedSeq:number
}
export interface CanonicalIndexedHistoryFollowFinishV1 {
 readonly kind:'canonical-indexed-history-follow-finish-v1'
 readonly streamId:string
 readonly floor:number
 readonly throughSeq:number
 readonly operationCount:number
 readonly lastSeq:number
}
export type CanonicalIndexedHistoryStartV1=CanonicalIndexedHistoryBeginV1|CanonicalIndexedHistoryFollowV1
interface CanonicalIndexedPageCommon {
  readonly kind:'canonical-indexed-history-page-v1'
  readonly streamId:string
  readonly throughSeq:number
  readonly afterSeq:number
  readonly nextAfterSeq:number // last ACTUAL consumed seq, not seq+1/ordinal
  readonly canonicalCapabilities:CanonicalRecordedAttachmentV1
}
export type CanonicalIndexedHistoryPageV1 =
  | (CanonicalIndexedPageCommon & {
      readonly terminal:false
      readonly operations:readonly CanonicalIndexedOperation[] // nonempty; contiguous afterSeq+1..nextAfterSeq<=C
      readonly finish?:never
    })
  | (CanonicalIndexedPageCommon & {
      readonly terminal:true
      readonly operations:readonly [] // actual indexed EMPTY query, afterSeq===nextAfterSeq===C
      readonly finish:CanonicalIndexedHistoryFinishV1|CanonicalIndexedHistoryFollowFinishV1
    })
export interface CanonicalIndexedRootV1 {
  readonly originalUserId:string
  readonly strokeId:string
  readonly layerId:string
  readonly firstOperationId:string
  readonly firstSequence:number
}
export interface CanonicalIndexedHistoryRootEvidenceV1 {
  readonly kind:'canonical-indexed-history-root-evidence-v1'
  readonly streamId:string
  readonly throughSeq:number
  readonly root:CanonicalIndexedRootV1
  readonly rows:readonly CanonicalIndexedOperation[] //1..6 unique original rows; ALL used by refs, total<=4MiB
  readonly canonicalCapabilities:CanonicalRecordedAttachmentV1
  readonly first:number // integer0..rows.length-1; actual frameOrdinal0 exactroot
  readonly terminal:number|null // actual ENDframe/typedclose, null=issuer absence<=C
  readonly lastMetadata:number|null // undo/redo, exact issuer verified rootassociation
  readonly latestRedo:number|null // redo
  readonly firstUndoAfterLatestRedo:number|null // FIRSTundo strictlyafter latestRedo orbaseline0
  readonly ownBranchAfterUndo:number|null // actual sameactor firstframe0 >firstUndo throughC
}
export interface CanonicalHistoryStreamNextV1 { readonly streamId:string; readonly requestId:string; readonly afterSeq:number }
export interface CanonicalHistoryStreamEvidenceV1 { readonly streamId:string; readonly requestId:string; readonly root:CanonicalIndexedRootV1 }
export interface CanonicalHistoryStreamSelectV1 { readonly streamId:string; readonly requestId:string; readonly historyAction:CanonicalHistoryAction }
export interface CanonicalHistoryStreamCancelV1 { readonly streamId:string; readonly requestId:string }
export type CanonicalHistoryStreamReopenV1 =
 |{readonly mode:'recovery';readonly offerId:string;readonly roomId:string;readonly boardEpoch:number;readonly throughSeq:number}
 |{readonly mode:'follow';readonly streamId:string;readonly requestId:string;readonly afterSeq:number}
export type CanonicalHistoryReadError = 'not_joined'|'canonical_repair_required'|'invalid_operation'|
  'read_expired'|'read_busy'|'invalid_history'|'stale_read'
export type CanonicalHistoryAck<T> =
  | { readonly ok:true; readonly value:T }
  | { readonly ok:false; readonly reason:CanonicalHistoryReadError }
export interface CanonicalHistorySelectResultV1 {
  readonly targetOperationId:string
  readonly evidence:CanonicalIndexedHistoryRootEvidenceV1
  // target MUST equal evidence.rows[evidence.first].id, an actual original frame0.
}
export interface CanonicalHistoryStreamRequestMap {
  canonical_history_stream_open:readonly [CanonicalHistoryOpenRequestV1, CanonicalHistoryAck<CanonicalIndexedHistoryBeginV1>]
  canonical_history_stream_next:readonly [CanonicalHistoryStreamNextV1, CanonicalHistoryAck<CanonicalIndexedHistoryPageV1>]
  canonical_history_stream_evidence:readonly [CanonicalHistoryStreamEvidenceV1, CanonicalHistoryAck<CanonicalIndexedHistoryRootEvidenceV1>]
  canonical_history_stream_reopen:readonly [CanonicalHistoryStreamReopenV1, CanonicalHistoryAck<CanonicalIndexedHistoryStartV1>]
  canonical_history_stream_select:readonly [CanonicalHistoryStreamSelectV1, CanonicalHistoryAck<CanonicalHistorySelectResultV1|null>]
  canonical_history_stream_cancel:readonly [CanonicalHistoryStreamCancelV1, CanonicalHistoryAck<{readonly streamId:string; readonly requestId:string}>]
}


/** Limits bound one message, never the number of originals in a session. */
export const CANONICAL_INDEXED_HISTORY_LIMITS=Object.freeze({pageOperations:64,witnesses:6,sequence:2147483647})
const fail=():never=>{throw new TypeError('Invalid canonical indexed history data')}
function fields(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 const own=Reflect.ownKeys(value)
 if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))return fail()
 const result:Record<string,unknown>=Object.create(null)
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))return fail();result[key]=d.value}
 return result
}
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
const sequence=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=CANONICAL_INDEXED_HISTORY_LIMITS.sequence
function scope(value:unknown):Readonly<CanonicalRecordedReadScope>{
 // The indexed wire has ONE explicit normalized policy representation.
 const v=fields(value,['roomId','boardEpoch','allowedRasterProfiles'])
 if(!text(v.roomId)||!sequence(v.boardEpoch)||!Array.isArray(v.allowedRasterProfiles))return fail()
 const raw=v.allowedRasterProfiles
 if(raw.length<1||raw.length>CANONICAL_STROKE_RASTER_CONTRACTS.length||Reflect.ownKeys(raw).length!==raw.length+1)return fail()
 const profiles=Array.from({length:raw.length},(_,i)=>{
  const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value'))return fail()
  return canonicalStrokeRasterContract(d.value).profile
 })
 const allowedRasterProfiles=canonicalRecordedRasterProfiles({allowedRasterProfiles:profiles})
 return Object.freeze({roomId:v.roomId,boardEpoch:v.boardEpoch,allowedRasterProfiles})
}
function geometry(value:unknown):Readonly<CanonicalIndexedRoomGeometry>{
 const v=fields(value,['width','height','infinite'])
 if(!sequence(v.width)||v.width===0||!sequence(v.height)||v.height===0||v.infinite!==false)return fail()
 return Object.freeze({width:v.width,height:v.height,infinite:false})
}
export function parseCanonicalIndexedHistoryOffer(value:unknown):Readonly<CanonicalIndexedHistoryOfferV1>{
 const v=fields(value,['kind','offerId','scope','roomGeometry','authorRasterProfile'])
 if(v.kind!=='canonical-indexed-history-offer-v1'||!text(v.offerId))return fail()
 const s=scope(v.scope),roomGeometry=geometry(v.roomGeometry)
 const author=canonicalStrokeRasterContract(v.authorRasterProfile).profile
 if(!s.allowedRasterProfiles!.includes(author))return fail()
 return Object.freeze({kind:v.kind,offerId:v.offerId,scope:s,roomGeometry,authorRasterProfile:author})
}
export function parseCanonicalIndexedHistoryBegin(value:unknown):Readonly<CanonicalIndexedHistoryBeginV1>{
 const v=fields(value,['kind','streamId','offerId','scope','roomGeometry','authorRasterProfile','floor','throughSeq','operationCount'])
 if(v.kind!=='canonical-indexed-history-begin-v1'||!text(v.streamId)||!text(v.offerId)||v.floor!==0||!sequence(v.throughSeq)||v.operationCount!==v.throughSeq)return fail()
 const s=scope(v.scope),roomGeometry=geometry(v.roomGeometry)
 const author=canonicalStrokeRasterContract(v.authorRasterProfile).profile
 if(!s.allowedRasterProfiles!.includes(author))return fail()
 return Object.freeze({kind:v.kind,streamId:v.streamId,offerId:v.offerId,scope:s,roomGeometry,authorRasterProfile:author,floor:0,throughSeq:v.throughSeq,operationCount:v.throughSeq})
}
export function parseCanonicalIndexedRoot(value:unknown):Readonly<CanonicalIndexedRootV1>{
 const v=fields(value,['originalUserId','strokeId','layerId','firstOperationId','firstSequence'])
 if(!text(v.originalUserId)||!text(v.strokeId)||!text(v.layerId)||!text(v.firstOperationId)||!sequence(v.firstSequence)||v.firstSequence===0)return fail()
 return Object.freeze({originalUserId:v.originalUserId,strokeId:v.strokeId,layerId:v.layerId,firstOperationId:v.firstOperationId,firstSequence:v.firstSequence})
}
export function parseCanonicalHistoryOpenRequest(value:unknown):Readonly<CanonicalHistoryOpenRequestV1>{
 const v=fields(value,['kind','offerId','roomId','boardEpoch'])
 if(v.kind!=='canonical-history-open-v1'||!text(v.offerId)||!text(v.roomId)||!sequence(v.boardEpoch))return fail()
 return Object.freeze({kind:v.kind,offerId:v.offerId,roomId:v.roomId,boardEpoch:v.boardEpoch})
}
export function parseCanonicalHistoryStreamNext(value:unknown):Readonly<CanonicalHistoryStreamNextV1>{
 const v=fields(value,['streamId','requestId','afterSeq'])
 if(!text(v.streamId)||!text(v.requestId)||!sequence(v.afterSeq))return fail()
 return Object.freeze({streamId:v.streamId,requestId:v.requestId,afterSeq:v.afterSeq})
}
export function parseCanonicalHistoryStreamEvidence(value:unknown):Readonly<CanonicalHistoryStreamEvidenceV1>{
 const v=fields(value,['streamId','requestId','root'])
 if(!text(v.streamId)||!text(v.requestId))return fail()
 return Object.freeze({streamId:v.streamId,requestId:v.requestId,root:parseCanonicalIndexedRoot(v.root)})
}
export function parseCanonicalHistoryStreamSelect(value:unknown):Readonly<CanonicalHistoryStreamSelectV1>{
 const v=fields(value,['streamId','requestId','historyAction'])
 if(!text(v.streamId)||!text(v.requestId)||(v.historyAction!=='undo'&&v.historyAction!=='redo'))return fail()
 return Object.freeze({streamId:v.streamId,requestId:v.requestId,historyAction:v.historyAction})
}
export function parseCanonicalHistoryStreamCancel(value:unknown):Readonly<CanonicalHistoryStreamCancelV1>{
 const v=fields(value,['streamId','requestId'])
 if(!text(v.streamId)||!text(v.requestId))return fail()
 return Object.freeze({streamId:v.streamId,requestId:v.requestId})
}
export function parseCanonicalHistoryStreamReopen(value:unknown):Readonly<CanonicalHistoryStreamReopenV1>{
 if(!value||typeof value!=='object')return fail()
 const mode=Object.getOwnPropertyDescriptor(value,'mode')
 if(!mode||!Object.hasOwn(mode,'value'))return fail()
 if(mode.value==='follow'){
  const v=fields(value,['mode','streamId','requestId','afterSeq'])
  if(!text(v.streamId)||!text(v.requestId)||!sequence(v.afterSeq))return fail()
  return Object.freeze({mode:'follow',streamId:v.streamId,requestId:v.requestId,afterSeq:v.afterSeq})
 }
 const v=fields(value,['mode','offerId','roomId','boardEpoch','throughSeq'])
 if(v.mode!=='recovery'||!text(v.offerId)||!text(v.roomId)||!sequence(v.boardEpoch)||!sequence(v.throughSeq))return fail()
 return Object.freeze({mode:'recovery',offerId:v.offerId,roomId:v.roomId,boardEpoch:v.boardEpoch,throughSeq:v.throughSeq})
}

export type CanonicalHistoryStreamClientEvents = {
 [K in keyof CanonicalHistoryStreamRequestMap]: (
  request:CanonicalHistoryStreamRequestMap[K][0],
  ack:(result:CanonicalHistoryStreamRequestMap[K][1])=>void,
 )=>void
}

/** Follow is a bounded original range after an actual completed parent; the
 * received floor is DATA until bound to that parent by private ingress. */
export function parseCanonicalIndexedHistoryFollow(value:unknown):Readonly<CanonicalIndexedHistoryFollowV1>{
 const v=fields(value,['kind','streamId','parentStreamId','scope','roomGeometry','authorRasterProfile','floor','throughSeq','operationCount','latestObservedSeq'])
 if(v.kind!=='canonical-indexed-history-follow-v1'||!text(v.streamId)||!text(v.parentStreamId)||v.streamId===v.parentStreamId||!sequence(v.floor)||!sequence(v.throughSeq)||v.throughSeq<v.floor||v.throughSeq-v.floor>CANONICAL_INDEXED_HISTORY_LIMITS.pageOperations||v.operationCount!==v.throughSeq-v.floor||!sequence(v.latestObservedSeq)||v.latestObservedSeq<v.throughSeq)return fail()
 const s=scope(v.scope),roomGeometry=geometry(v.roomGeometry),authorRasterProfile=canonicalStrokeRasterContract(v.authorRasterProfile).profile
 if(!s.allowedRasterProfiles!.includes(authorRasterProfile))return fail()
 return Object.freeze({kind:v.kind,streamId:v.streamId,parentStreamId:v.parentStreamId,scope:s,roomGeometry,authorRasterProfile,floor:v.floor,throughSeq:v.throughSeq,operationCount:v.throughSeq-v.floor,latestObservedSeq:v.latestObservedSeq})
}
export function parseCanonicalIndexedHistoryStart(value:unknown):Readonly<CanonicalIndexedHistoryStartV1>{
 if(!value||typeof value!=='object')return fail()
 const tag=Object.getOwnPropertyDescriptor(value,'kind')
 if(!tag||!Object.hasOwn(tag,'value'))return fail()
 return tag.value==='canonical-indexed-history-follow-v1'?parseCanonicalIndexedHistoryFollow(value):parseCanonicalIndexedHistoryBegin(value)
}
