import {assertCanonicalRoomStateRead,type CanonicalRoomStateRead} from './net/canonicalRoomState'
import type {RoomStatePayload} from './restoreRoomState'
import type {CanonicalOutboxVerdicts} from './net/outboxVerdict'
import {sendCanonicalStrokeBegin,type CanonicalBeginEmitter} from './net/sendCanonicalStrokeBegin'
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
export function stageCanonicalRoomReplacement(stash:RoomStatePayload,deps:{readonly boardId:string;readonly minimumSequence:number;readonly pending:{current:RoomStatePayload|null};readonly installedRead:CanonicalRoomStateRead|undefined;readonly hasPendingLocals:()=>boolean;readonly retire:()=>void;readonly bump:()=>void}):boolean{
 const original=canonicalBootstrapOf(stash,deps.boardId,true)!
 if(deps.pending.current?.canonicalRead===original.read||deps.installedRead===original.read)return false
 if(deps.hasPendingLocals())throw Error('Canonical replacement has unresolved local work')
 if(!Number.isSafeInteger(deps.minimumSequence)||deps.minimumSequence<0||original.read.fullHistoryBase!.throughSeq<deps.minimumSequence)throw Error('Canonical replacement cut precedes accepted work')
 // No queue: replace the SAME pending slot only after every admission check.
 deps.retire();deps.pending.current=stash;deps.bump();return true
}
export function createCanonicalRoomAuthor(read:CanonicalRoomStateRead,socket:CanonicalBeginEmitter,getSocket:()=>CanonicalBeginEmitter|null,isEngineCurrent:()=>boolean):CanonicalSourceAuthorService{
 read.assertCurrent()
 const service:CanonicalSourceAuthorService={begin:(input,lifetime)=>sendCanonicalStrokeBegin(socket,input,{boardEpoch:read.scope.boardEpoch,
  authorRasterProfile:read.authorRasterProfile,responseRasterProfiles:read.scope.allowedRasterProfiles??(read.scope.rasterProfile?[read.scope.rasterProfile]:undefined),signal:lifetime.signal,
  isCurrent:()=>{try{read.assertCurrent();return getSocket()===socket&&isEngineCurrent()&&lifetime.isCurrent()}catch{return false}}})}
 return Object.freeze(service)
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

/** One control latch for the current engine, never an operation/payload queue.
 * Fault callbacks already arrive after source holds reach zero. Outbox final
 * settlement invokes drain after publishing its accepted sequence watermark. */
export function createCanonicalRecoveryControl(deps:{readonly getEngine:()=>PencilEngineAPI|null;readonly getBoard:()=>string|null;readonly hasPendingLocals:()=>boolean;readonly canRequest:()=>boolean;readonly resync:()=>void;readonly onWaiting:()=>void}){
 type Transition='joining'|'stale'|'failed'
 type Interval={retired:boolean;outcome?:Transition;barrier?:{promise:Promise<Transition>;resolve:(value:Transition)=>void}}
 type Origin={engine:PencilEngineAPI;board:string;phase:'restoring'|'ready'|'waiting'|'joining'|'failed';requested:boolean;interval:Interval}
 let origin:Origin|undefined
 const settle=(interval:Interval,result:Transition)=>{if(interval.outcome)return;interval.outcome=result;const barrier=interval.barrier;interval.barrier=undefined;barrier?.resolve(result)}
 const current=(owner:Origin)=>origin===owner&&deps.getEngine()===owner.engine&&deps.getBoard()===owner.board&&origin===owner
 const matching=(engine:PencilEngineAPI,board:string)=>{
  const owner=origin;if(!owner||owner.engine!==engine||owner.board!==board)return undefined
  if(!current(owner)){settle(owner.interval,'stale');return undefined}
  return owner
 }
 const phase=(owner:Origin):Origin['phase']=>owner.phase
 const fail=(owner:Origin,interval:Interval)=>{if(origin===owner&&owner.interval===interval)owner.phase='failed';settle(interval,'failed')}
 const drain=():boolean=>{
  const owner=origin
  if(!owner)return false
  const interval=owner.interval
  if(!current(owner)){settle(interval,'stale');return false}
  if(!owner.requested||owner.phase!=='waiting'||interval.outcome)return false
  if(owner.engine.hasActiveCanonicalAuthor()||deps.hasPendingLocals()||!deps.canRequest())return false
  if(!current(owner)||owner.interval!==interval){settle(interval,'stale');return false}
  if(owner.phase!=='waiting')return false
  owner.phase='joining'
  try{deps.resync()}catch{
   fail(owner,interval)
   if(origin===owner&&owner.interval===interval)try{deps.onWaiting()}catch{/* Original resync failure remains terminal. */}
   return false
  }
  // resync owns actual read invalidation. A provisional joining phase alone
  // cannot release the old ingress head before that synchronous call returns.
  if(!current(owner)||owner.interval!==interval){settle(interval,'stale');return false}
  if(phase(owner)!=='joining'||interval.outcome){if(phase(owner)==='failed')settle(interval,'failed');return false}
  settle(interval,'joining');return true
 }
 const request=(engine:PencilEngineAPI,board:string):void=>{
  const owner=matching(engine,board);if(!owner)return
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
 return Object.freeze({
  bind(engine:PencilEngineAPI,board:string){
   if(origin?.engine===engine&&origin.board===board)return
   if(origin)settle(origin.interval,'stale')
   origin={engine,board,phase:'restoring',requested:false,interval:{retired:false}}
  },
  detach(engine:PencilEngineAPI){if(origin?.engine===engine){const old=origin;origin=undefined;settle(old.interval,'stale')}},
  request,drain,
  /** INTERNAL: only the exact constructed-engine fault callback may attest
   * completed physical/FIFO retirement. Arbitrary preparation errors may not. */
  retired(engine:PencilEngineAPI,board:string){const owner=matching(engine,board);if(!owner)return;owner.interval.retired=true;request(engine,board)},
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
