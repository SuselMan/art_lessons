import {nanoid} from 'nanoid'
import type {Socket} from 'socket.io-client'
import {parseCanonicalIndexedHistoryOffer,parseCanonicalIndexedHistoryBegin,parseCanonicalIndexedHistoryFollow,parseCanonicalIndexedRoot,prepareCanonicalIndexedHistoryPage,prepareCanonicalIndexedRootEvidence,type CanonicalHistoryAck,type CanonicalIndexedHistoryStartV1,type CanonicalIndexedRootV1,type CanonicalPreparedRecordedOperation,type ClientToServerEvents,type ServerToClientEvents} from '@grafetto/shared'
import type {CanonicalAcceptedCut,CanonicalIndexedOrigin,CanonicalIndexedPage,CanonicalIndexedRead,CanonicalIndexedRootProof,CanonicalRootWitnesses,CanonicalRecordedDelivery,CanonicalRecordedInput} from '../../../engine'
import {captureCanonicalLocalReadScope} from './canonicalRecordedDelivery'
import type {CanonicalHistoryScope} from './canonicalHistoryPage'

/** Same joined origin used by authoring/outbox/UI; no full-history array is
 * claimed by this connection. Finite page/recovery jobs remain separate. */
export interface CanonicalIndexedSocketOrigin extends CanonicalIndexedOrigin {
 readonly kind:'indexed-room-origin-v1'
 readonly scope:CanonicalHistoryScope
 readonly roomGeometry:CanonicalIndexedRead['roomGeometry']
 readonly authorPrimaryTextureSource?:'pressure-identity-subtract-v3'
 readonly authorRasterProfile:CanonicalIndexedRead['authorRasterProfile']
}
export interface CanonicalIndexedSocketRead extends CanonicalIndexedRead {
 readonly lifetime:CanonicalIndexedSocketOrigin
 readonly scope:CanonicalHistoryScope
}

const fail=():never=>{throw Error('Canonical indexed original read unavailable')}
function fields(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 if(Reflect.ownKeys(value).length!==keys.length)return fail()
 const result:Record<string,unknown>=Object.create(null)
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))return fail();result[key]=d.value}
 return result
}
function ack<T>(value:CanonicalHistoryAck<T>):T{
 const tag=value&&Object.getOwnPropertyDescriptor(value,'ok')
 if(!tag||!Object.hasOwn(tag,'value'))return fail()
 if(tag.value===true)return fields(value,['ok','value']).value as T
 fields(value,['ok','reason']);return fail()
}
const equalPolicy=(a:CanonicalIndexedHistoryStartV1,b:ReturnType<typeof parseCanonicalIndexedHistoryOffer>)=>
 (!('offerId'in a)||a.offerId===b.offerId)&&a.scope.roomId===b.scope.roomId&&a.scope.boardEpoch===b.scope.boardEpoch&&JSON.stringify(a.scope.allowedRasterProfiles)===JSON.stringify(b.scope.allowedRasterProfiles)&&a.authorRasterProfile===b.authorRasterProfile&&a.authorPrimaryTextureSource===b.authorPrimaryTextureSource&&a.roomGeometry.width===b.roomGeometry.width&&a.roomGeometry.height===b.roomGeometry.height
/** Called from the actual room_state socket continuation AFTER seating. It
 * performs an authenticated open itself; no DATA-only parser can create this
 * origin, input proof or accepted cut. No original array is owned by origin. */
export async function openCanonicalIndexedRoomForSocket(
 socket:Socket<ServerToClientEvents,ClientToServerEvents>,rawOffer:unknown,
 lifetime:{readonly expectedBoardId:string;readonly isCurrent:()=>boolean},
):Promise<CanonicalIndexedSocketRead>{
 const offer=parseCanonicalIndexedHistoryOffer(rawOffer)
 const current=()=>socket.connected&&lifetime.isCurrent()
 if(!current()||offer.scope.roomId!==lifetime.expectedBoardId)return fail()
 const response=await socket.timeout(150000).emitWithAck('canonical_history_stream_open',{kind:'canonical-history-open-v1',offerId:offer.offerId,roomId:offer.scope.roomId,boardEpoch:offer.scope.boardEpoch})
 if(!current())return fail()
 const initial=parseCanonicalIndexedHistoryBegin(ack(response))
 if(!equalPolicy(initial,offer))return fail()
 let origin:CanonicalIndexedSocketOrigin,busy=false,cursor:Cursor|undefined,completedCursor:Cursor|undefined
 const cuts=new WeakSet<CanonicalAcceptedCut>(),inputs=new WeakSet<CanonicalRecordedInput>()
 const scope=captureCanonicalLocalReadScope({...offer.scope,isCurrent:current},()=>origin)
 const assertOrigin=()=>{if(!current())return fail();return scope}
 type Cursor={readonly begin:CanonicalIndexedHistoryStartV1;after:number;cancelled:boolean;finished:boolean;cancelSent:boolean;cancelDone?:Promise<void>;resolveCancel?:()=>void}
 const assertCursor=(c:Cursor)=>{assertOrigin();if(cursor!==c||c.cancelled)return fail()}
 async function request<T>(run:()=>Promise<CanonicalHistoryAck<T>>):Promise<T>{
  assertOrigin();if(busy)return fail();busy=true
  try{const response=await run();assertOrigin();return ack(response)}finally{busy=false}
 }
 function cancelWire(c:Cursor):Promise<void>{
  if(!c.cancelDone)c.cancelDone=new Promise<void>(resolve=>{c.resolveCancel=resolve})
  if(cursor!==c||c.finished||!current()){c.resolveCancel?.();return c.cancelDone}
  if(c.cancelSent||busy)return c.cancelDone
  c.cancelSent=true
  // One cleanup promise belongs to this finite cursor. It neither queues a
  // second read nor frees the engine read slot before the cancel ACK settles.
  void request(()=>socket.timeout(30000).emitWithAck('canonical_history_stream_cancel',{streamId:c.begin.streamId,requestId:nanoid(16)})).catch(()=>{}).finally(()=>{c.resolveCancel?.()})
  return c.cancelDone
 }
 function mint(atom:CanonicalPreparedRecordedOperation):CanonicalRecordedInput{
  let input:CanonicalRecordedInput,delivery:CanonicalRecordedDelivery
  delivery=Object.freeze({lifetime:origin,assertCurrent(this:CanonicalRecordedDelivery,candidate:CanonicalRecordedInput){
   if(this!==delivery||candidate!==input||!inputs.has(input))return fail();assertOrigin()
  }})
  input=Object.freeze(Object.defineProperty({...atom},'delivery',{value:delivery})) as CanonicalRecordedInput
  inputs.add(input);return input
 }
 function originalRoot(input:CanonicalRecordedInput):CanonicalIndexedRootV1{
  if(!inputs.has(input))return fail();input.delivery.assertCurrent(input)
  const op=input.operation
  if(op.type!=='canonical_stroke'||op.frame.frameOrdinal!==0||!op.seq)return fail()
  return Object.freeze({originalUserId:op.userId,strokeId:op.frame.strokeId,layerId:op.layerId,firstOperationId:op.id,firstSequence:op.seq})
 }
 function assertCut(cut:CanonicalAcceptedCut){
  assertOrigin();if(!cuts.has(cut)||cut.lifetime!==origin)return fail();cut.assertCurrent(cut)
 }
 function proofOf(raw:unknown,begin:CanonicalIndexedHistoryStartV1,root:CanonicalIndexedRootV1,bound?:CanonicalRecordedInput){
  const prepared=prepareCanonicalIndexedRootEvidence(raw,begin,root),refs=prepared.evidence,atoms=prepared.atoms.map(mint)
  const at=(index:number|null)=>index===null?null:atoms[index]
  let witnesses:Readonly<CanonicalRootWitnesses>|undefined=Object.freeze({root:refs.root,first:atoms[refs.first],terminal:at(refs.terminal),lastMetadata:at(refs.lastMetadata),latestRedo:at(refs.latestRedo),firstUndoAfterLatestRedo:at(refs.firstUndoAfterLatestRedo),ownBranchAfterUndo:at(refs.ownBranchAfterUndo)})
  let exact:CanonicalRecordedInput|undefined=bound??witnesses.first
  let proof:CanonicalIndexedRootProof
  proof=Object.freeze({assertCurrent(this:CanonicalIndexedRootProof,candidate:CanonicalIndexedRootProof,input:CanonicalRecordedInput){
   assertOrigin();if(this!==proof||candidate!==proof||!witnesses||input!==exact||!inputs.has(input))return fail()
   input.delivery.assertCurrent(input);return witnesses
  },release(this:CanonicalIndexedRootProof){if(this!==proof)return fail();witnesses=undefined;exact=undefined}})
  return {proof,target:witnesses.first}
 }
 function makeRead(begin:CanonicalIndexedHistoryStartV1,parentCut?:CanonicalAcceptedCut):CanonicalIndexedSocketRead{
  if(!equalPolicy(begin,offer))return fail()
  const c:Cursor={begin,after:begin.floor,cancelled:false,finished:false,cancelSent:false}
  // Weak membership carries no page payload or historical page collection.
  const terminalPages=new WeakSet<CanonicalIndexedPage>()
  let read:CanonicalIndexedSocketRead
  read=Object.freeze({kind:begin.kind==='canonical-indexed-history-follow-v1'?'follow':'full',floor:begin.floor,latestObservedSeq:begin.kind==='canonical-indexed-history-follow-v1'?begin.latestObservedSeq:begin.throughSeq,lifetime:origin,throughSeq:begin.throughSeq,operationCount:begin.operationCount,scope,roomGeometry:begin.roomGeometry,authorRasterProfile:begin.authorRasterProfile,...(begin.authorPrimaryTextureSource?{authorPrimaryTextureSource:begin.authorPrimaryTextureSource}:{}),
   assertCurrent(this:CanonicalIndexedRead,candidate:CanonicalIndexedRead){if(this!==read||candidate!==read)return fail();assertCursor(c)},
   async nextPage(this:CanonicalIndexedRead){
    if(this!==read||c.finished)return fail();assertCursor(c)
    const after=c.after
    const raw=await request(()=>socket.timeout(30000).emitWithAck('canonical_history_stream_next',{streamId:begin.streamId,requestId:nanoid(16),afterSeq:after})).finally(()=>{if(c.cancelled)cancelWire(c)})
    assertCursor(c)
    const prepared=prepareCanonicalIndexedHistoryPage(raw,begin,after)
    let payload:readonly CanonicalRecordedInput[]|undefined=Object.freeze(prepared.atoms.map(mint))
    let page:CanonicalIndexedPage
    page=Object.freeze({afterSeq:after,nextAfterSeq:prepared.page.nextAfterSeq,terminal:prepared.page.terminal,
     inputs(this:CanonicalIndexedPage){if(this!==page||!payload)return fail();assertCursor(c);return payload},
     assertCurrent(this:CanonicalIndexedPage,candidate:CanonicalIndexedPage){if(this!==page||candidate!==page||!payload)return fail();assertCursor(c)},
     release(this:CanonicalIndexedPage){if(this!==page)return fail();payload=undefined},
    })
    c.after=prepared.page.nextAfterSeq
    if(prepared.page.terminal)terminalPages.add(page)
    return page
   },
   async rootEvidence(this:CanonicalIndexedRead,input:CanonicalRecordedInput){
    if(this!==read)return fail();assertCursor(c)
    const root=originalRoot(input)
    const raw=await request(()=>socket.timeout(30000).emitWithAck('canonical_history_stream_evidence',{streamId:begin.streamId,requestId:nanoid(16),root})).finally(()=>{if(c.cancelled)cancelWire(c)})
    assertCursor(c);input.delivery.assertCurrent(input)
    return proofOf(raw,begin,root,input).proof
   },
   finish(this:CanonicalIndexedRead,page:CanonicalIndexedPage){
    if(this!==read||c.finished||!terminalPages.has(page))return fail()
    page.assertCurrent(page);assertCursor(c)
    if(c.after!==begin.throughSeq||!page.terminal||page.nextAfterSeq!==begin.throughSeq)return fail()
    let cut:CanonicalAcceptedCut
    cut=Object.freeze({lifetime:origin,throughSeq:begin.throughSeq,operationCount:begin.throughSeq,scope,roomGeometry:begin.roomGeometry,authorRasterProfile:begin.authorRasterProfile,...(begin.authorPrimaryTextureSource?{authorPrimaryTextureSource:begin.authorPrimaryTextureSource}:{}),
     assertCurrent(this:CanonicalAcceptedCut,candidate:CanonicalAcceptedCut){if(this!==cut||candidate!==cut||!cuts.has(cut))return fail();assertOrigin()},
    })
    if(parentCut)assertCut(parentCut)
    // Original lifetime callbacks above may reenter cancellation. Only pure
    // finite-cursor observations may separate this check from publication.
    if(cursor!==c||c.cancelled||c.finished||c.after!==begin.throughSeq)return fail()
    cuts.add(cut);c.finished=true;completedCursor=c;return cut
   },
   cancel(this:CanonicalIndexedRead){
    if(this!==read)return fail()
    const active=cursor===c&&!c.cancelled&&!c.finished;c.cancelled=true
    // Cancellation cannot revoke already published inputs/cuts. The server's
    // finite slot/deadlines own cleanup on loss; a pending request sends the
    // cancellation from its finally after settling. This is one cleanup latch.
    return active||c.cancelDone?cancelWire(c):Promise.resolve()
   },
  })
  cursor=c;return read
 }
 origin=Object.freeze({kind:'indexed-room-origin-v1',scope,roomGeometry:offer.roomGeometry,authorRasterProfile:offer.authorRasterProfile,...(offer.authorPrimaryTextureSource?{authorPrimaryTextureSource:offer.authorPrimaryTextureSource}:{}),assertCurrent(this:CanonicalIndexedOrigin){if(this!==origin)return fail();return assertOrigin()},
  async reopen(this:CanonicalIndexedOrigin,cut:CanonicalAcceptedCut){
   if(this!==origin)return fail();assertCut(cut)
   if(cursor&&!cursor.finished&&!cursor.cancelled)return fail()
   const raw=await request(()=>socket.timeout(150000).emitWithAck('canonical_history_stream_reopen',{mode:'recovery',offerId:offer.offerId,roomId:scope.roomId,boardEpoch:scope.boardEpoch,throughSeq:cut.throughSeq}))
   assertCut(cut);const begin=parseCanonicalIndexedHistoryBegin(raw)
   if(begin.throughSeq!==cut.throughSeq)return fail()
   return makeRead(begin)
  },
  async follow(this:CanonicalIndexedOrigin,cut:CanonicalAcceptedCut){
   if(this!==origin)return fail();assertCut(cut)
   const previous=cursor,parent=completedCursor
   if(previous&&!previous.finished&&!previous.cancelled)return fail()
   if(!parent||!parent.finished||parent.begin.throughSeq!==cut.throughSeq)return fail()
   const raw=await request(()=>socket.timeout(150000).emitWithAck('canonical_history_stream_reopen',{mode:'follow',streamId:parent.begin.streamId,requestId:nanoid(16),afterSeq:cut.throughSeq}))
   assertCut(cut);if(cursor!==previous||completedCursor!==parent)return fail()
   const begin=parseCanonicalIndexedHistoryFollow(raw)
   if(begin.parentStreamId!==parent.begin.streamId||begin.floor!==cut.throughSeq)return fail()
   return makeRead(begin,cut)
  },
  async selectHistory(this:CanonicalIndexedOrigin,cut:CanonicalAcceptedCut,action:'undo'|'redo'){
   if(this!==origin)return fail();assertCut(cut)
   const active=cursor,c=completedCursor
   if(!c||c.begin.throughSeq!==cut.throughSeq||active&&!active.finished&&!active.cancelled)return fail()
   const raw=await request(()=>socket.timeout(30000).emitWithAck('canonical_history_stream_select',{streamId:c.begin.streamId,requestId:nanoid(16),historyAction:action}))
   assertCut(cut);if(cursor!==active||completedCursor!==c)return fail();if(raw===null)return null
   const result=fields(raw,['targetOperationId','evidence']),wire=fields(result.evidence,['kind','streamId','throughSeq','root','rows','canonicalCapabilities','first','terminal','lastMetadata','latestRedo','firstUndoAfterLatestRedo','ownBranchAfterUndo'])
   const root=parseCanonicalIndexedRoot(wire.root),prepared=proofOf(result.evidence,c.begin,root)
   if(result.targetOperationId!==prepared.target.operation.id){prepared.proof.release();return fail()}
   let released=false
   const candidate=Object.freeze({target:prepared.target,proof:prepared.proof,
    assertCurrent(this:unknown,value:unknown,accepted:CanonicalAcceptedCut){if(this!==candidate||value!==candidate||accepted!==cut||released)return fail();assertCut(cut);prepared.proof.assertCurrent(prepared.proof,prepared.target)},
    release(this:unknown){if(this!==candidate)return fail();if(!released){released=true;prepared.proof.release()}},
   })
   return candidate
  },
 })
 return makeRead(initial)
}
