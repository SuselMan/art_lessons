import {decodeCanonicalStrokeFrame} from './canonicalStrokeFrame.js'
import {CANONICAL_RECORDED_ATTACHMENT_LIMITS,prepareCanonicalRecordedAttachment,type CanonicalPreparedRecordedOperation,type CanonicalRecordedAttachmentV1} from './canonicalRecordedAttachment.js'
import {captureCanonicalFullHistoryMetadata} from './canonicalFullHistoryBase.js'
import {CANONICAL_INDEXED_HISTORY_LIMITS,parseCanonicalIndexedRoot,type CanonicalIndexedHistoryBeginV1,type CanonicalIndexedHistoryPageV1,type CanonicalIndexedHistoryRootEvidenceV1,type CanonicalIndexedRootV1,type CanonicalIndexedOperation} from './canonicalIndexedHistory.js'

const fail=():never=>{throw new TypeError('Invalid canonical indexed original page')}
function fields(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 const own=Reflect.ownKeys(value)
 if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))return fail()
 const result:Record<string,unknown>=Object.create(null)
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))return fail();result[key]=d.value}
 return result
}
const seq=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=CANONICAL_INDEXED_HISTORY_LIMITS.sequence
function captureRows(value:unknown,limit:number):readonly CanonicalIndexedOperation[]{
 if(!Array.isArray(value)||value.length>limit||Reflect.ownKeys(value).length!==value.length+1)return fail()
 let packedBytes=0
 return Object.freeze(Array.from({length:value.length},(_,i)=>{
  const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))return fail()
  const type=d.value&&Object.getOwnPropertyDescriptor(d.value,'type')
  if(!type||!Object.hasOwn(type,'value'))return fail()
  if(type.value!=='canonical_stroke')return captureCanonicalFullHistoryMetadata(d.value)
  const op=fields(d.value,['id','userId','timestamp','seq','type','layerId','frame'])
  const frame=fields(op.frame,['version','rasterProfile','brush','strokeId','frameOrdinal','pigmentRgb8','composition','materialPacked'])
  if(typeof frame.materialPacked!=='string')return fail()
  // Bound packed input BEFORE material decode or any full payload allocation.
  packedBytes+=frame.materialPacked.length
  if(packedBytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)return fail()
  return { ...op,frame } as unknown as CanonicalIndexedOperation
 }))
}
function attachmentOf(atoms:readonly CanonicalPreparedRecordedOperation[],begin:CanonicalIndexedHistoryBeginV1):CanonicalRecordedAttachmentV1{
 const capabilities:CanonicalRecordedAttachmentV1['capabilities'][number][]=[],bindings:CanonicalRecordedAttachmentV1['bindings'][number][]=[]
 const indexes=new Map<NonNullable<CanonicalPreparedRecordedOperation['read']>['capability'],number>()
 for(const atom of atoms){if(!atom.read)continue
  const r=atom.read;let index=indexes.get(r.capability)
  if(index===undefined){index=capabilities.length;indexes.set(r.capability,index);capabilities.push(r.capability)}
  bindings.push(Object.freeze({operationId:r.operationId,sequence:r.sequence,originalUserId:r.capability.originalUserId,capability:index}))
 }
 return Object.freeze({version:1,roomId:begin.scope.roomId,boardEpoch:begin.scope.boardEpoch,capabilities:Object.freeze(capabilities),bindings:Object.freeze(bindings)})
}
function prepareRows(value:unknown,rawAttachment:unknown,begin:CanonicalIndexedHistoryBeginV1,limit:number){
 const rows=captureRows(value,limit)
 const atoms=prepareCanonicalRecordedAttachment(rawAttachment,rows,begin.scope)
 const operations=Object.freeze(atoms.map(atom=>atom.operation as CanonicalIndexedOperation))
 const canonicalCapabilities=attachmentOf(atoms,begin)
 // Walk only normalized, bounded own DATA, never arbitrary received objects.
 if(new TextEncoder().encode(JSON.stringify({operations,canonicalCapabilities})).length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)return fail()
 for(const op of operations)if(!seq(op.seq)||op.seq===0||op.seq>begin.throughSeq)return fail()
 return {operations,atoms,canonicalCapabilities}
}
/** DATA preparation only. Actual authenticated ingress binds issuer, current
 * origin and request before lending these originals to an executor. */
export function prepareCanonicalIndexedHistoryPage(value:unknown,begin:CanonicalIndexedHistoryBeginV1,afterSeq:number):Readonly<{page:CanonicalIndexedHistoryPageV1;atoms:readonly CanonicalPreparedRecordedOperation[]}>{
 if(!seq(afterSeq)||afterSeq>begin.throughSeq||!value||typeof value!=='object')return fail()
 const t=Object.getOwnPropertyDescriptor(value,'terminal')
 if(!t||!Object.hasOwn(t,'value')||typeof t.value!=='boolean')return fail()
 const v=fields(value,['kind','streamId','throughSeq','afterSeq','nextAfterSeq','operations','canonicalCapabilities','terminal',...(t.value?['finish']:[])])
 if(v.kind!=='canonical-indexed-history-page-v1'||v.streamId!==begin.streamId||v.throughSeq!==begin.throughSeq||v.afterSeq!==afterSeq||!seq(v.nextAfterSeq))return fail()
 const {operations,atoms,canonicalCapabilities}=prepareRows(v.operations,v.canonicalCapabilities,begin,CANONICAL_INDEXED_HISTORY_LIMITS.pageOperations)
 if(t.value){
  if(operations.length!==0||afterSeq!==begin.throughSeq||v.nextAfterSeq!==afterSeq)return fail()
  const f=fields(v.finish,['kind','streamId','throughSeq','operationCount','lastSeq'])
  if(f.kind!=='canonical-indexed-history-finish-v1'||f.streamId!==begin.streamId||f.throughSeq!==begin.throughSeq||f.operationCount!==begin.throughSeq||f.lastSeq!==begin.throughSeq)return fail()
  const finish=Object.freeze({kind:'canonical-indexed-history-finish-v1' as const,streamId:begin.streamId,throughSeq:begin.throughSeq,operationCount:begin.throughSeq,lastSeq:begin.throughSeq})
  const page:CanonicalIndexedHistoryPageV1=Object.freeze({kind:v.kind,streamId:begin.streamId,throughSeq:begin.throughSeq,afterSeq,nextAfterSeq:afterSeq,operations:Object.freeze([]) as readonly [],canonicalCapabilities,terminal:true,finish})
  return Object.freeze({page,atoms})
 }
 if(operations.length===0||v.nextAfterSeq!==afterSeq+operations.length)return fail()
 for(let i=0;i<operations.length;i++)if(operations[i].seq!==afterSeq+i+1)return fail()
 const page:CanonicalIndexedHistoryPageV1=Object.freeze({kind:v.kind,streamId:begin.streamId,throughSeq:begin.throughSeq,afterSeq,nextAfterSeq:v.nextAfterSeq,operations,canonicalCapabilities,terminal:false})
 return Object.freeze({page,atoms})
}

/** Bounded original witnesses. Root membership and absence are attested by the
 * actual indexed issuer; this parser alone cannot establish that issuer. */
export function prepareCanonicalIndexedRootEvidence(value:unknown,begin:CanonicalIndexedHistoryBeginV1,expectedRoot:CanonicalIndexedRootV1):Readonly<{evidence:CanonicalIndexedHistoryRootEvidenceV1;atoms:readonly CanonicalPreparedRecordedOperation[]}>{
 const v=fields(value,['kind','streamId','throughSeq','root','rows','canonicalCapabilities','first','terminal','lastMetadata','latestRedo','firstUndoAfterLatestRedo','ownBranchAfterUndo'])
 if(v.kind!=='canonical-indexed-history-root-evidence-v1'||v.streamId!==begin.streamId||v.throughSeq!==begin.throughSeq)return fail()
 const root=parseCanonicalIndexedRoot(v.root),expected=parseCanonicalIndexedRoot(expectedRoot)
 if(root.originalUserId!==expected.originalUserId||root.strokeId!==expected.strokeId||root.layerId!==expected.layerId||root.firstOperationId!==expected.firstOperationId||root.firstSequence!==expected.firstSequence)return fail()
 const {operations:rows,atoms,canonicalCapabilities}=prepareRows(v.rows,v.canonicalCapabilities,begin,CANONICAL_INDEXED_HISTORY_LIMITS.witnesses)
 const used=new Set<number>()
 const ref=(value:unknown):number|null=>{
  if(value===null)return null
  if(!seq(value)||value>=rows.length)return fail()
  used.add(value);return value
 }
 const first=ref(v.first),terminal=ref(v.terminal),lastMetadata=ref(v.lastMetadata),latestRedo=ref(v.latestRedo),firstUndoAfterLatestRedo=ref(v.firstUndoAfterLatestRedo),ownBranchAfterUndo=ref(v.ownBranchAfterUndo)
 if(first===null||used.size!==rows.length)return fail()
 const f=rows[first]
 if(f.type!=='canonical_stroke'||f.userId!==root.originalUserId||f.layerId!==root.layerId||f.id!==root.firstOperationId||f.seq!==root.firstSequence||f.frame.strokeId!==root.strokeId||f.frame.frameOrdinal!==0)return fail()
 if(terminal!==null){
  const op=rows[terminal]
  if(op.seq!<root.firstSequence)return fail()
  if(op.type==='canonical_stroke_close'){
   if(op.layerId!==root.layerId||op.targetUserId!==root.originalUserId||op.strokeId!==root.strokeId||op.firstFrameOpId!==root.firstOperationId)return fail()
  }else if(op.type==='canonical_stroke'){
   if(op.userId!==root.originalUserId||op.layerId!==root.layerId||op.frame.strokeId!==root.strokeId)return fail()
   const s=atoms[terminal].read?.capability.snapshot;if(!s)return fail()
   const decoded=decodeCanonicalStrokeFrame(op.frame,{rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material:s.material})
   if(!decoded.frame.fences.some(fence=>fence.kind==='gestureEnd'))return fail()
  }else return fail()
 }
 const metadata=(at:number|null,type?:'operation_undo'|'operation_redo')=>{
  if(at===null)return null
  const op=rows[at]
  if((op.type!=='operation_undo'&&op.type!=='operation_redo')||(type&&op.type!==type)||op.userId!==root.originalUserId||op.seq!<=root.firstSequence)return fail()
  return op
 }
 const last=metadata(lastMetadata),redo=metadata(latestRedo,'operation_redo'),undo=metadata(firstUndoAfterLatestRedo,'operation_undo')
 if((redo&&!last)||(undo&&!last)||(redo&&last&&redo.seq!>last.seq!)||(undo&&last&&undo.seq!>last.seq!)||(undo&&redo&&undo.seq!<=redo.seq!))return fail()
 if(last?.type==='operation_redo'&&(lastMetadata!==latestRedo||undo!==null))return fail()
 if(last?.type==='operation_undo'&&!undo)return fail()
 if(ownBranchAfterUndo!==null){
  const branch=rows[ownBranchAfterUndo]
  if(!undo||branch.type!=='canonical_stroke'||branch.userId!==root.originalUserId||branch.frame.frameOrdinal!==0||branch.seq!<=undo.seq!||branch.frame.strokeId===root.strokeId)return fail()
 }
 const evidence:CanonicalIndexedHistoryRootEvidenceV1=Object.freeze({kind:v.kind,streamId:begin.streamId,throughSeq:begin.throughSeq,root,rows,canonicalCapabilities,first,terminal,lastMetadata,latestRedo,firstUndoAfterLatestRedo,ownBranchAfterUndo})
 return Object.freeze({evidence,atoms})
}
