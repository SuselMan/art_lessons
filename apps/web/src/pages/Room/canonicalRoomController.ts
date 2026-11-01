import {captureCanonicalFullHistoryMetadata,type Operation,type SendResult} from '@grafetto/shared'
import type {CanonicalSendLineage,OutboxDeliveryContext,Outbox} from './net/outbox'
import {prepareCanonicalRoomState,assertCanonicalRoomStateRead,type CanonicalRoomStatePreparer,type CanonicalRoomStateRead,type CanonicalRoomConnectionRead} from './net/canonicalRoomState'
import type {CanonicalIndexedSocketOrigin} from './net/canonicalIndexedRead'
import type {RoomStatePayload} from './restoreRoomState'
import type {LocalDeliveryLane} from './net/outboxStorage'
import type {CanonicalOutboxVerdicts} from './net/outboxVerdict'
import {sendCanonicalStrokeBegin,type CanonicalBeginEmitter} from './net/sendCanonicalStrokeBegin'
import type {ReplayGate} from './replayGate'
import type {CanonicalSourceAuthorService,CanonicalRecordedInput,PencilEngineAPI} from '../../engine'

/** The existing pending stash is the sole payload owner before construction. */
export function canonicalBootstrapOf(stash:RoomStatePayload|null|undefined,boardId:string,required:boolean){
 if(!stash?.canonicalRead){if(required)throw Error('Original canonical bootstrap unavailable');return undefined}
 if(!required)throw Error('Canonical bootstrap requires straight engine policy')
 const read=stash.canonicalRead,tail=stash.tailOperations
 assertCanonicalRoomStateRead(read,tail,boardId)
 if(stash.latestSnapshotSeq!==null||!read.fullHistoryBase||!read.assertFullHistoryBase)throw Error('Full canonical bootstrap required')
 read.assertFullHistoryBase(tail)
 return {read,tail}
}
export function stageCanonicalRoomReplacement(stash:RoomStatePayload,deps:{readonly boardId:string;readonly minimumSequence:number;readonly pending:{current:RoomStatePayload|null};readonly installedRead:CanonicalRoomConnectionRead|undefined;readonly hasPendingLocals:()=>boolean;readonly retire:()=>void;readonly bump:()=>void}):boolean{
 const original=canonicalBootstrapOf(stash,deps.boardId,true)!
 if(deps.pending.current?.canonicalRead===original.read||deps.installedRead===original.read)return false
 if(deps.hasPendingLocals())throw Error('Canonical replacement has unresolved local work')
 if(!Number.isSafeInteger(deps.minimumSequence)||deps.minimumSequence<0||original.read.fullHistoryBase!.throughSeq<deps.minimumSequence)throw Error('Canonical replacement cut precedes accepted work')
 // No queue: replace the SAME pending slot only after every admission check.
 deps.retire();deps.pending.current=stash;deps.bump();return true
}
export function createCanonicalRoomAuthor(read:CanonicalRoomConnectionRead,socket:CanonicalBeginEmitter,getSocket:()=>CanonicalBeginEmitter|null,isEngineCurrent:()=>boolean,options?:{readonly primaryTextureSource?:'pressure-identity-subtract-v3'}):CanonicalSourceAuthorService{
 read.assertCurrent()
 const primaryTextureSource=options?.primaryTextureSource
 const service:CanonicalSourceAuthorService={...(primaryTextureSource==='pressure-identity-subtract-v3'?{primaryTextureSource}:{}),begin:(input,lifetime)=>sendCanonicalStrokeBegin(socket,input,{boardEpoch:read.scope.boardEpoch,
  expectedDescriptorSha256:lifetime.expectedDescriptorSha256,authorRasterProfile:read.authorRasterProfile,responseRasterProfiles:read.scope.allowedRasterProfiles??(read.scope.rasterProfile?[read.scope.rasterProfile]:undefined),signal:lifetime.signal,
  isCurrent:()=>{try{read.assertCurrent();return getSocket()===socket&&isEngineCurrent()&&lifetime.isCurrent()}catch{return false}}})}
 return Object.freeze(service)
}
/** Original connection binding; finite indexed cursors never own history. */
export type CanonicalHistoryBinding={readonly kind:'full';readonly read:CanonicalRoomStateRead;readonly tail:readonly Operation[]}|{readonly kind:'indexed';readonly origin:CanonicalIndexedSocketOrigin}
function historyBinding(read:CanonicalRoomConnectionRead,tail:readonly Operation[]|undefined,board:string):CanonicalHistoryBinding{
 if('kind' in read&&read.kind==='indexed-room-origin-v1'){
  const origin=read as CanonicalIndexedSocketOrigin
  if(tail!==undefined||origin.assertCurrent()!==origin.scope||origin.scope.roomId!==board)throw Error('Original indexed history origin required')
  return {kind:'indexed',origin}
 }
 const full=read as CanonicalRoomStateRead
 if(!tail)throw Error('Full canonical history tail required')
 assertCanonicalRoomStateRead(full,tail,board)
 if(!full.fullHistoryBase||!full.assertFullHistoryBase)throw Error('Full canonical history origin required')
 full.assertFullHistoryBase(tail)
 return {kind:'full',read:full,tail}
}
const bindingRead=(binding:CanonicalHistoryBinding):CanonicalRoomConnectionRead=>binding.kind==='full'?binding.read:binding.origin
const assertHistoryBinding=(binding:CanonicalHistoryBinding,board:string)=>historyBinding(bindingRead(binding),binding.kind==='full'?binding.tail:undefined,board)
/** Captured local classification only, never read/undo/append permission.
 * A canonical constructor keeps this callback even when its origin is offline. */
export function createCanonicalControlCapture(read:CanonicalRoomConnectionRead,tail:readonly Operation[]|undefined,boardId:string,deps:{
 readonly socket:{readonly connected:boolean}|null
 readonly getSocket:()=>{readonly connected:boolean}|null
 readonly getInstalledRead:()=>CanonicalRoomConnectionRead|undefined
 readonly isEngineCurrent:()=>boolean
 readonly isJoined:()=>boolean
 readonly getBoard:()=>string|null
}):()=>LocalDeliveryLane {
 const binding=historyBinding(read,tail,boardId)
 const {socket,getSocket,getInstalledRead,isEngineCurrent,isJoined,getBoard}=deps
 const current=()=>!!socket&&getSocket()===socket&&socket.connected&&isJoined()&&getBoard()===boardId&&getInstalledRead()===read&&isEngineCurrent()
 return ()=>{
  assertHistoryBinding(binding,boardId)
  if(!current())throw Error('Original canonical control owner unavailable')
  read.assertCurrent()
  if(!current())throw Error('Original canonical control owner unavailable')
  return 'canonical-control-v1'
 }
}
/** Stable control facade, not a recorded-read factory. ACK precedes broadcast. */
export function createCanonicalRoomVerdicts({repair,isReplacing,drain}:{readonly repair:()=>void;readonly isReplacing:()=>boolean;readonly drain?:()=>unknown}):CanonicalOutboxVerdicts{
 const repairIfNeeded=()=>{if(!isReplacing())repair()}
 const verdicts:CanonicalOutboxVerdicts={onSettled:(_op,result)=>{if(result.ok)drain?.();else repairIfNeeded()},onStalled:repairIfNeeded}
 return Object.freeze(verdicts)
}

/** Bulk publication updates the EXISTING idempotency set only after the same
 * engine has committed the same original read. ACKs never call this. */
export async function restoreCanonicalRoomBaseline(engine:PencilEngineAPI,read:CanonicalRoomStateRead,tail:readonly import('@grafetto/shared').Operation[],currentEngine:()=>PencilEngineAPI|null,applied:Set<string>):Promise<void>{
 assertCanonicalRoomStateRead(read,tail,read.scope.roomId)
 if(currentEngine()!==engine)throw Error('Canonical baseline engine replaced')
 await engine.restoreCanonicalEmptyRoom(read,tail)
 assertCanonicalRoomStateRead(read,tail,read.scope.roomId)
 if(currentEngine()!==engine)throw Error('Canonical baseline engine replaced')
 for(const operation of tail)applied.add(operation.id)
}

type CanonicalHistoryRequest=Extract<Operation,{type:'operation_undo'|'operation_redo'}>
const requestFields=['id','type','userId','timestamp','targetOpId'] as const
const requestAllowed:readonly string[]=[...requestFields,'seq']
function controlRequest(operation:Operation):CanonicalHistoryRequest{
 const keys=Reflect.ownKeys(operation)
 if(keys.length>6||keys.some(k=>typeof k!=='string'||!requestAllowed.includes(k)))throw Error('Invalid canonical control request')
 const descriptors=Object.getOwnPropertyDescriptors(operation)
 if(keys.some(k=>!Object.hasOwn(descriptors[k as string],'value')))throw Error('Canonical control accessor unavailable')
 const get=(key:string):unknown=>descriptors[key]?.value,text=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
 if((get('type')!=='operation_undo'&&get('type')!=='operation_redo')||!text(get('id'))||!text(get('userId'))||!text(get('targetOpId'))||typeof get('timestamp')!=='number'||!Number.isFinite(get('timestamp'))||Number(get('timestamp'))<0||(get('seq')!==undefined&&(!Number.isSafeInteger(get('seq'))||Number(get('seq'))<1)))throw Error('Invalid canonical control request')
 return Object.freeze(Object.defineProperties({},descriptors)) as CanonicalHistoryRequest
}
const historyReceiptBrand:unique symbol=Symbol('canonical-history-control-receipt')
/** Internal interval identity, not a source or execution capability. */
export interface CanonicalHistoryControlReceipt {readonly [historyReceiptBrand]:true}
const sameControlLineage=(a:CanonicalSendLineage|undefined,b:CanonicalSendLineage|undefined)=>!!a&&!!b&&a.socket===b.socket&&a.connectionId===b.connectionId&&a.boardId===b.boardId&&a.originalRead===b.originalRead

/** One control latch for the current engine, never an operation/payload queue.
 * Fault callbacks already arrive after source holds reach zero. Outbox final
 * settlement invokes drain after publishing its accepted sequence watermark. */
export function createCanonicalRecoveryControl(deps:{readonly getEngine:()=>PencilEngineAPI|null;readonly getBoard:()=>string|null;readonly hasPendingLocals:()=>boolean;readonly canRequest:()=>boolean;readonly resync:()=>void;readonly onWaiting:()=>void;
 readonly getControlLineage?:()=>CanonicalSendLineage|undefined
 readonly holdHistory?:()=>void
 readonly onHistoryJoining?:()=>void
 readonly noteKnownSequence?:(sequence:number)=>void
}){
 type Transition='joining'|'stale'|'failed'
 type Interval={retired:boolean;outcome?:Transition;barrier?:{promise:Promise<Transition>;resolve:(value:Transition)=>void}}
 type History={readonly binding:CanonicalHistoryBinding;readonly lineage:CanonicalSendLineage;readonly operation?:CanonicalHistoryRequest;readonly receipt?:CanonicalHistoryControlReceipt;minimumSequence?:number;held:boolean}
 type Origin={history?:History;engine:PencilEngineAPI;board:string;phase:'restoring'|'ready'|'waiting'|'joining'|'failed';requested:boolean;interval:Interval}
 let origin:Origin|undefined
 const settle=(interval:Interval,result:Transition)=>{if(interval.outcome)return;interval.outcome=result;const barrier=interval.barrier;interval.barrier=undefined;barrier?.resolve(result)}
 const current=(owner:Origin)=>origin===owner&&deps.getEngine()===owner.engine&&deps.getBoard()===owner.board&&origin===owner
 const matching=(engine:PencilEngineAPI,board:string)=>{
  const owner=origin;if(!owner||owner.engine!==engine||owner.board!==board)return undefined
  if(!current(owner)){settle(owner.interval,'stale');return undefined}
  return owner
 }
 const historyCurrent=(owner:Origin,history:History):boolean=>{
  try{
   assertHistoryBinding(history.binding,owner.board)
   const lineage=deps.getControlLineage?.()
   bindingRead(history.binding).assertCurrent()
   return current(owner)&&owner.history===history&&sameControlLineage(history.lineage,lineage)
  }catch{return false}
 }
 const historyFor=(engine:PencilEngineAPI,board:string,read:CanonicalRoomConnectionRead,tail:readonly Operation[]|undefined):{owner:Origin;history:History}=>{
  const owner=matching(engine,board)
  if(!owner||owner.phase!=='ready'&&!(owner.phase==='waiting'&&owner.history)||owner.interval.outcome)throw Error('Canonical history origin unavailable')
  const binding=historyBinding(read,tail,board)
  if(owner.history){
   if(bindingRead(owner.history.binding)!==read||(owner.history.binding.kind==='full'?owner.history.binding.tail:undefined)!==tail||!historyCurrent(owner,owner.history))throw Error('Canonical history origin replaced')
   return{owner,history:owner.history}
  }
  if(!deps.holdHistory||!deps.noteKnownSequence||!deps.onHistoryJoining)throw Error('Canonical history transport unavailable')
  const live=deps.getControlLineage?.()
  if(!live||live.originalRead!==read||live.boardId!==board||!live.connectionId)throw Error('Canonical history connection unavailable')
  const history:History={binding,lineage:Object.freeze({socket:live.socket,connectionId:live.connectionId,boardId:live.boardId,originalRead:live.originalRead}),held:false}
  read.assertCurrent()
  if(!current(owner)||owner.phase!=='ready'||owner.requested||owner.history)throw Error('Canonical history origin changed')
  return{owner,history}
 }
 const phase=(owner:Origin):Origin['phase']=>owner.phase
 const fail=(owner:Origin,interval:Interval)=>{if(origin===owner&&owner.interval===interval)owner.phase='failed';settle(interval,'failed')}
 const drain=():boolean=>{
  const owner=origin
  if(!owner)return false
  const interval=owner.interval
  if(!current(owner)){settle(interval,'stale');return false}
  if(!owner.requested||owner.phase!=='waiting'||interval.outcome)return false
  const history=owner.history
  if(history&&(history.minimumSequence===undefined||!historyCurrent(owner,history)))return false
  if(owner.engine.hasActiveCanonicalAuthor()||deps.hasPendingLocals()||!deps.canRequest())return false
  if(!current(owner)||owner.interval!==interval){settle(interval,'stale');return false}
  if(owner.phase!=='waiting')return false
  if(history){
   const pending=deps.hasPendingLocals()
   if(!historyCurrent(owner,history)||owner.interval!==interval||phase(owner)!=='waiting'||interval.outcome||pending)return false
   // The last pure author observation follows the pending/origin callbacks;
   // no callback separates this observation and the idle lock.
   if(owner.engine.hasActiveCanonicalAuthor())return false
   owner.phase='joining'
   try{owner.engine.setLocked(true);deps.onHistoryJoining!()}catch{fail(owner,interval);return false}
   if(!historyCurrent(owner,history)||owner.interval!==interval||phase(owner)!=='joining'||interval.outcome||owner.engine.hasActiveCanonicalAuthor()||deps.hasPendingLocals()){fail(owner,interval);return false}
  }else owner.phase='joining'
  try{deps.resync()}catch{
   fail(owner,interval)
   if(origin===owner&&owner.interval===interval)try{deps.onWaiting()}catch{/* Original resync failure remains terminal. */}
   return false
  }
  // resync owns actual read invalidation. A provisional joining phase alone
  // cannot release the old ingress head before that synchronous call returns.
  if(!current(owner)||owner.interval!==interval){settle(interval,'stale');return false}
  if(phase(owner)!=='joining'||interval.outcome){if(phase(owner)==='failed')settle(interval,'failed');return false}
  if(history){
   let invalidated=false
   try{bindingRead(history.binding).assertCurrent()}catch{invalidated=true}
   if(!invalidated){fail(owner,interval);return false}
  }
  settle(interval,'joining');return true
 }
 const request=(engine:PencilEngineAPI,board:string):void=>{
  const owner=matching(engine,board);if(!owner)return
  if(owner.history){
   const retired=owner.interval.retired;settle(owner.interval,'failed');owner.history=undefined;owner.interval={retired};owner.requested=false
  }
  const interval=owner.interval
  if(owner.requested){drain();return}
  owner.requested=true
  if(owner.phase==='ready')owner.phase='waiting'
  try{deps.onWaiting()}catch(error){fail(owner,interval);throw error}
  if(!current(owner)||owner.interval!==interval){settle(interval,'stale');return}
  if(owner.phase==='joining'||owner.phase==='failed')return
  // Arm first: locking can synchronously finish a source and reenter here.
  try{engine.setLocked(true)}catch{fail(owner,interval);return}
  if(!current(owner)||owner.interval!==interval){settle(interval,'stale');return}
  drain()
 }
 const durableHistory=(owner:Origin,history:History,sequence:number):boolean=>{
  if(!Number.isSafeInteger(sequence)||sequence<1||owner.interval.outcome||!historyCurrent(owner,history))return false
  const interval=owner.interval
  history.minimumSequence=Math.max(history.minimumSequence??0,sequence)
  owner.requested=true;owner.phase='waiting'
  try{
   if(!history.held){history.held=true;deps.holdHistory!()}
   if(!historyCurrent(owner,history)||owner.interval!==interval)return false
   deps.noteKnownSequence!(history.minimumSequence)
   if(!historyCurrent(owner,history)||owner.interval!==interval)return false
  }catch{fail(owner,interval);return false}
  drain();return true
 }
 return Object.freeze({
  bind(engine:PencilEngineAPI,board:string){
   if(origin?.engine===engine&&origin.board===board)return
   if(origin)settle(origin.interval,'stale')
   origin={engine,board,phase:'restoring',requested:false,interval:{retired:false}}
  },
  detach(engine:PencilEngineAPI){if(origin?.engine===engine){const old=origin;origin=undefined;settle(old.interval,'stale')}},
  request,drain,
  /** Healthy local submission is armed before enqueue; it supplies NO cut. */
  beginControl(engine:PencilEngineAPI,board:string,read:CanonicalRoomConnectionRead,tail:readonly Operation[]|undefined,operation:CanonicalHistoryRequest):CanonicalHistoryControlReceipt{
   const captured=controlRequest(operation)
   const {owner,history}=historyFor(engine,board,read,tail)
   if(owner.history||engine.hasActiveCanonicalAuthor()||deps.hasPendingLocals())throw Error('Canonical history control busy')
   const pending=deps.hasPendingLocals()
   read.assertCurrent()
   const live=deps.getControlLineage?.()
   read.assertCurrent()
   if(!current(owner)||owner.history||owner.phase!=='ready'||owner.requested||owner.interval.outcome||!sameControlLineage(history.lineage,live))throw Error('Canonical history origin changed')
   if(pending||engine.hasActiveCanonicalAuthor())throw Error('Canonical history control busy')
   const receipt:CanonicalHistoryControlReceipt=Object.freeze({[historyReceiptBrand]:true as const})
   owner.history={...history,operation:captured,receipt};owner.phase='waiting'
   return receipt
  },
  /** Roll back only a submission that never acquired a durable placement.
   * The caller handles an enqueue rejection; this never clears Outbox work. */
  cancelControl(receipt:CanonicalHistoryControlReceipt):boolean{
   const owner=origin,history=owner?.history
   if(!owner||!history||history.receipt!==receipt||history.minimumSequence!==undefined||owner.interval.outcome||!historyCurrent(owner,history))return false
   settle(owner.interval,'failed');owner.history=undefined;owner.interval={retired:false};owner.requested=false;owner.phase='ready';return true
  },
  confirmedControl(engine:PencilEngineAPI,board:string,read:CanonicalRoomStateRead,tail:readonly Operation[],operation:Operation):boolean{
   const existing=matching(engine,board);if(!existing)return false
   const metadata=captureCanonicalFullHistoryMetadata(operation)
   if(metadata.type!=='operation_undo'&&metadata.type!=='operation_redo')throw Error('Canonical history metadata required')
   let prepared:ReturnType<typeof historyFor>
   try{prepared=historyFor(engine,board,read,tail)}catch(error){
    if(!current(existing))return false
    try{assertCanonicalRoomStateRead(read,tail,board)}catch{return false}
    throw error
   }
   const {owner,history}=prepared
   if(!owner.history)owner.history=history
   return durableHistory(owner,history,metadata.seq!)
  },
  /** Exact network-owned input remains valid after finite page release. */
  confirmedIndexedControl(engine:PencilEngineAPI,board:string,read:CanonicalIndexedSocketOrigin,input:CanonicalRecordedInput):boolean{
   const existing=matching(engine,board);if(!existing)return false
   try{read.assertCurrent()}catch{return false}
   input.delivery.assertCurrent(input)
   if(input.delivery.lifetime!==read||input.read!==undefined)throw Error('Original indexed history metadata required')
   const metadata=controlRequest(input.operation)
   if(!Number.isSafeInteger(metadata.seq)||metadata.seq!<1)throw Error('Durable indexed history metadata required')
   const {owner,history}=historyFor(engine,board,read,undefined)
   input.delivery.assertCurrent(input)
   if(!current(owner)||!sameControlLineage(history.lineage,deps.getControlLineage?.()))return false
   if(!owner.history)owner.history=history
   return durableHistory(owner,history,metadata.seq!)
  },
  settleControl(operation:Operation,result:SendResult,context:OutboxDeliveryContext|undefined):boolean{
   let captured:CanonicalHistoryRequest
   try{captured=controlRequest(operation)}catch{return false}
   const owner=origin,history=owner?.history
   if(!owner||!history?.operation||!history.receipt||owner.interval.outcome
    ||context?.deliveryLane!=='canonical-control-v1'||context.invalidLocalDelivery
    ||context.roomId!==owner.board||!sameControlLineage(context.lineage,history.lineage)||!historyCurrent(owner,history))return false
   if(requestFields.some(key=>!Object.is(history.operation![key],captured[key])))return false
   if(!result.ok){
    if(history.minimumSequence===undefined){settle(owner.interval,'failed');owner.history=undefined;owner.interval={retired:false};owner.requested=false;owner.phase='ready'}
    else drain()
    return true
   }
   return durableHistory(owner,history,result.seq)
  },
  authorIdle(engine:PencilEngineAPI,board:string):void{const owner=matching(engine,board);if(owner?.history)drain()},
  controlBusy(engine:PencilEngineAPI,board:string):boolean{return !!matching(engine,board)?.history},
  /** INTERNAL: only the exact constructed-engine fault callback may attest
   * completed physical/FIFO retirement. Arbitrary preparation errors may not. */
  retired(engine:PencilEngineAPI,board:string){const owner=matching(engine,board);if(!owner)return;owner.interval.retired=true;request(engine,board)},
  /** Observe only an authentic durable healthy interval. This shares its
   * existing lazy barrier, and cannot attest physical retirement. */
  whenHistoryTransition(engine:PencilEngineAPI,board:string):Promise<Transition>{
   const owner=matching(engine,board)
   if(!owner)return Promise.resolve('stale')
   const interval=owner.interval,history=owner.history
   if(!history||history.minimumSequence===undefined||!history.held)return Promise.resolve('failed')
   if(interval.outcome)return Promise.resolve(interval.outcome)
   const valid=historyCurrent(owner,history)
   if(interval.outcome)return Promise.resolve(interval.outcome)
   if(!valid||owner.interval!==interval){settle(interval,'stale');return Promise.resolve('stale')}
   if(!interval.barrier){let resolve!:(value:Transition)=>void;const promise=new Promise<Transition>(done=>{resolve=done});interval.barrier={promise,resolve}}
   return interval.barrier.promise
  },
  whenRetiredTransition(engine:PencilEngineAPI,board:string):Promise<Transition>{
   const owner=matching(engine,board)
   if(!owner)return Promise.resolve('stale')
   const interval=owner.interval
   if(!interval.retired||owner.phase==='failed')return Promise.resolve('failed')
   if(interval.outcome)return Promise.resolve(interval.outcome)
   if(!interval.barrier){let resolve!:(value:Transition)=>void;const promise=new Promise<Transition>(done=>{resolve=done});interval.barrier={promise,resolve}}
   return interval.barrier.promise
  },
  restored(engine:PencilEngineAPI){if(origin?.engine!==engine)return;origin.phase=origin.requested?'waiting':'ready';drain()},
  failed(engine:PencilEngineAPI){if(origin?.engine===engine)fail(origin,origin.interval)},
  retry(engine:PencilEngineAPI,board:string){
   const owner=matching(engine,board);if(!owner)return
   if(owner.history){
    const previous=owner.history
    if(!historyCurrent(owner,previous))return
    settle(owner.interval,'failed');owner.interval={retired:false};owner.requested=false
    if(previous.minimumSequence===undefined){owner.history=undefined;owner.phase='ready';return}
    const history:History={...previous,receipt:undefined}
    owner.history=history;owner.phase='waiting';durableHistory(owner,history,previous.minimumSequence);return
   }
   settle(owner.interval,'failed')
   // A retry is a new observation interval, never a refresh of an old witness
   // or a reused already-settled joining promise.
   owner.interval={retired:false};owner.phase='waiting';owner.requested=false;request(engine,board)
  },
  isReplacing:()=>origin?.phase==='joining'||origin?.phase==='restoring',
 })
}

export type CanonicalRecordedPreparationOutcome='ready'|'obsolete'
/** Resource-only paired consumer. The ingress owner must bind its final apply
 * predicate to this SAME engine identity as well as the original read lifetime. */
export async function prepareCanonicalRoomRecordedInput(engine:PencilEngineAPI,input:CanonicalRecordedInput,deps:{
 readonly currentEngine:()=>PencilEngineAPI|null;readonly currentBoard:()=>string|null
 readonly recovery:Pick<ReturnType<typeof createCanonicalRecoveryControl>,'whenRetiredTransition'>
}):Promise<CanonicalRecordedPreparationOutcome>{
 input.delivery.assertCurrent(input)
 const scope=input.delivery.lifetime.assertCurrent(),board=scope.roomId
 const current=()=>{try{input.delivery.assertCurrent(input);return input.delivery.lifetime.assertCurrent()===scope&&deps.currentEngine()===engine&&deps.currentBoard()===board}catch{return false}}
 if(!current())return 'obsolete'
 try{
  while(true){
   const result=await engine.prepareOriginalRecorded(input)
   if(!current())return 'obsolete'
   if(result.status==='ready')return 'ready'
   if(result.status!=='cancelled')throw new Error('Canonical resource preparation unavailable')
   // Only cancellation is retried. Every engine reentry validates the physical
   // owner and passively waits existing finite preparation; exceptions, END and
   // ACKs are never retried/waited here. No caller AbortSignal is supplied.
  }
 }catch(error){
  if(!current())return 'obsolete'
  // Observing cannot mint retirement. Only the captured engine fault callback
  // may have marked this origin after retiring its actual FIFO/resources.
  const transition=await deps.recovery.whenRetiredTransition(engine,board)
  if((transition==='joining'||transition==='stale')&&!current())return 'obsolete'
  throw error
 }
}


/** Room supplies observations/UI notifications; these helpers retain no extra
 * command owner, payload queue or authority. */
type RecoveryControl=ReturnType<typeof createCanonicalRecoveryControl>
type HistorySocket={readonly connected:boolean;readonly id?:string}
export function createCanonicalHistoryVerdicts(source:CanonicalOutboxVerdicts,getControl:()=>RecoveryControl|null,notify:()=>void):CanonicalOutboxVerdicts {
 const verdicts:CanonicalOutboxVerdicts={onSettled:(op,result,context)=>{
  if((op.type==='operation_undo'||op.type==='operation_redo')&&context?.deliveryLane==='canonical-control-v1'){
   if(getControl()?.settleControl(op,result,context)&&!result.ok)notify()
   return
  }
  source.onSettled(op,result,context)
 },onStalled:(op,context)=>{
  // The SAME Outbox retains visible stalled control work, not a source fault.
  if((op.type==='operation_undo'||op.type==='operation_redo')&&context?.deliveryLane==='canonical-control-v1')return
  source.onStalled(op,context)
 }}
 return Object.freeze(verdicts)
}
export function createCanonicalRoomHistoryControl(deps:Omit<Parameters<typeof createCanonicalRecoveryControl>[0],'getControlLineage'|'holdHistory'> & {
 readonly getSocket:()=>HistorySocket|null
 readonly getRead:()=>CanonicalRoomConnectionRead|undefined
 readonly getSocketBoard:()=>string|null
 readonly isJoined:()=>boolean
 readonly getReplayGate:()=>ReplayGate<Parameters<import('@grafetto/shared').ServerToClientEvents['operation_confirmed']>[0]>
 readonly notify:()=>void
}):RecoveryControl {
 const control=createCanonicalRecoveryControl({...deps,getControlLineage:()=>{
  const socket=deps.getSocket(),read=deps.getRead(),board=deps.getBoard()
  if(!socket?.connected||!socket.id||!deps.isJoined()||!read||!board||deps.getSocketBoard()!==board)return undefined
  try{read.assertCurrent()}catch{return undefined}
  return{socket,connectionId:socket.id,boardId:board,originalRead:read}
 },holdHistory:()=>{
  const engine=deps.getEngine(),board=deps.getBoard()
  if(!engine||!board)throw Error('Canonical history hold owner unavailable')
  const gate=deps.getReplayGate(),ticket=gate.begin()
  const notifyCurrent=()=>{if(deps.getEngine()===engine&&deps.getBoard()===board)deps.notify()}
  void control.whenHistoryTransition(engine,board).then(outcome=>{
   if(outcome==='joining')gate.end(ticket)
   else if(outcome==='failed')notifyCurrent()
  }).catch(notifyCurrent)
 }})
 return control
}
export function createCanonicalHistoryRequestCheck(deps:{
 readonly getRead:()=>CanonicalRoomConnectionRead|undefined
 readonly legacyHistory:()=>boolean
 readonly getEngine:()=>PencilEngineAPI|null
 readonly getBoard:()=>string|null
 readonly getSocket:()=>HistorySocket|null
 readonly getSocketBoard:()=>string|null
 readonly isJoined:()=>boolean
 readonly isReady:()=>boolean
 readonly hasPending:()=>boolean
 readonly control:RecoveryControl
}):()=>boolean {
 return()=>{
  const read=deps.getRead()
  if(!read||deps.legacyHistory())return true
  const engine=deps.getEngine(),socket=deps.getSocket(),board=deps.getBoard()
  try{read.assertCurrent()}catch{return false}
  return !!engine&&!!board&&read.scope.roomId===board&&!!socket?.connected&&deps.isJoined()&&deps.getSocketBoard()===board&&deps.isReady()
   &&!deps.control.controlBusy(engine,board)&&!deps.hasPending()&&!engine.hasActiveCanonicalAuthor()
 }
}
export function createCanonicalHistoryOperationHandler(deps:{
 readonly bootstrap:ReturnType<typeof canonicalBootstrapOf>
 readonly indexedOrigin?:CanonicalIndexedSocketOrigin
 readonly getEngine:()=>PencilEngineAPI|undefined
 readonly isCurrent:(engine:PencilEngineAPI)=>boolean
 readonly canRequest:()=>boolean
 readonly capture:(()=>LocalDeliveryLane)|undefined
 readonly board:string
 readonly control:RecoveryControl
 readonly enqueue:Outbox['enqueue']
 readonly notify:()=>void
 readonly legacy:(operation:Operation)=>void
}):(operation:Operation)=>void {
 return op=>{
  const bootstrap=deps.bootstrap
  if((!bootstrap&&!deps.indexedOrigin)||op.type!=='operation_undo'&&op.type!=='operation_redo'){deps.legacy(op);return}
  const engine=deps.getEngine()
  if(!engine||!deps.isCurrent(engine)||!deps.canRequest())return
  try{
   if(!deps.capture)throw Error('Canonical history classification unavailable')
   deps.capture()
   const receipt=deps.control.beginControl(engine,deps.board,bootstrap?.read??deps.indexedOrigin!,bootstrap?.tail,op)
   void deps.enqueue(op,{deliveryLane:'canonical-control-v1'}).catch(()=>{if(deps.control.cancelControl(receipt))deps.notify()})
  }catch{if(deps.isCurrent(engine)&&deps.canRequest())deps.notify()}
 }
}

/** Adapt existing Room refs once; all ownership and history state still belong
 * to createCanonicalRecoveryControl's single Origin. */
export function createCanonicalRoomHistoryLifecycle(deps:{
 readonly engineRef:{readonly current:PencilEngineAPI|null}
 readonly boardIdRef:{readonly current:string|null}
 readonly socketRef:{readonly current:HistorySocket|null}
 readonly readRef:{readonly current:CanonicalRoomConnectionRead|undefined}
 readonly socketBoardRef:{readonly current:string|null}
 readonly joinedRef:{readonly current:boolean}
 readonly outboxRef:{readonly current:Pick<Outbox,'pendingCount'>}
 readonly pendingIdsRef:{readonly current:ReadonlySet<string>}
 readonly strokeActiveRef:{readonly current:boolean}
 readonly readyRef:{readonly current:boolean}
 readonly latestKnownSeqRef:{current:number}
 readonly resyncRef:{readonly current:(()=>void)|null}
 readonly replayGateRef:{readonly current:ReplayGate<Parameters<import('@grafetto/shared').ServerToClientEvents['operation_confirmed']>[0]>}
 readonly appliedRef:{readonly current:Set<string>}
 readonly legacyHistory:()=>boolean
 readonly onWaiting:()=>void
 readonly onJoining:()=>void
 readonly notify:()=>void
}) {
 const getEngine=()=>deps.engineRef.current,getBoard=()=>deps.boardIdRef.current,getRead=()=>deps.readRef.current,getSocket=()=>deps.socketRef.current,getSocketBoard=()=>deps.socketBoardRef.current,isJoined=()=>deps.joinedRef.current
 const hasPending=()=>deps.outboxRef.current.pendingCount!==0||deps.pendingIdsRef.current.size!==0||deps.strokeActiveRef.current
 const control=createCanonicalRoomHistoryControl({getEngine,getBoard,getRead,getSocket,getSocketBoard,isJoined,
  hasPendingLocals:hasPending,canRequest:()=>!!getSocket()?.connected&&deps.resyncRef.current!==null,resync:()=>deps.resyncRef.current?.(),onWaiting:deps.onWaiting,
  getReplayGate:()=>deps.replayGateRef.current,notify:deps.notify,onHistoryJoining:deps.onJoining,
  noteKnownSequence:sequence=>{deps.latestKnownSeqRef.current=Math.max(deps.latestKnownSeqRef.current,sequence)}})
 const canRequest=createCanonicalHistoryRequestCheck({getRead,legacyHistory:deps.legacyHistory,getEngine,getBoard,getSocket,getSocketBoard,isJoined,isReady:()=>deps.readyRef.current,hasPending,control})
 const restore=async(engine:PencilEngineAPI,read:CanonicalRoomStateRead,tail:readonly Operation[])=>{
  try{await restoreCanonicalRoomBaseline(engine,read,tail,getEngine,deps.appliedRef.current);control.restored(engine)}
  catch(error){control.failed(engine);throw error}
 }
 const confirmed=(operation:Operation,read:CanonicalRoomStateRead,engine:PencilEngineAPI)=>{
  if(getEngine()!==engine||getRead()!==read||read.scope.roomId!==getBoard())return
  control.confirmedControl(engine,read.scope.roomId,read,read.tailOperations,operation)
 }
 const confirmedIndexed=(input:CanonicalRecordedInput,origin:CanonicalIndexedSocketOrigin,engine:PencilEngineAPI)=>{
  if(getEngine()!==engine||getRead()!==origin||origin.scope.roomId!==getBoard())return false
  return control.confirmedIndexedControl(engine,origin.scope.roomId,origin,input)
 }
 return Object.freeze({control,canRequest,restore,confirmed,confirmedIndexed})
}

/** Preserve the socket's original captured lifetime and expected board. */
export const prepareCanonicalRoomStateForSocket:CanonicalRoomStatePreparer=(state,lifetime)=>{
 if(!lifetime.expectedBoardId)throw Error('Canonical requested board unavailable')
 return prepareCanonicalRoomState(state,{expectedBoardId:lifetime.expectedBoardId,isCurrent:lifetime.isCurrent})
}
